import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

// Safely read environment variables in the browser. Webpack's DefinePlugin
// may not always inject `process.env` (or the app may run without it), so
// guard to avoid "process is not defined" runtime errors.
function getEnv(name, fallback = "") {
  try {
    if (
      typeof process !== "undefined" &&
      process &&
      process.env &&
      process.env[name] != null
    ) {
      return process.env[name];
    }
  } catch (e) {
    // ignore
  }
  if (
    typeof window !== "undefined" &&
    window.__ENV__ &&
    window.__ENV__[name] != null
  ) {
    return window.__ENV__[name];
  }
  return fallback;
}

const WEAVIATE_ENDPOINT = getEnv("REACT_APP_WEAVIATE_ENDPOINT", "");
const WEAVIATE_API_KEY = getEnv("REACT_APP_WEAVIATE_API_KEY", "");
const OPENAI_API_KEY = getEnv("REACT_APP_OPENAI_API_KEY", "");

const ENABLE_TOKEN_LOGGING = true;
const ENABLE_STREAMING_EFFECT = true;
const ENABLE_PROCESSING_ANIMATION = true;

// ===== Suggested Questions (HR-based) =====
const SUGGESTED_QUESTIONS = [
  "นโยบายการลา",
  "การเบิกค่ารักษาพยาบาล",
  "ขั้นตอนการขออนุมัติ",
];

// ===== HR Document Search JSON Schema (MANDATORY) =====
const HR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    hasRelevantDocument: {
      type: "boolean",
      description: "Whether relevant documents were found",
    },
    answer: {
      type: "string",
      description:
        "The answer to the employee's question in the same language as the question",
    },
    referenceDocuments: {
      type: "array",
      description: "List of relevant documents",
      items: {
        type: "object",
        properties: {
          instanceID: {
            type: "string",
            description: "The unique instance ID of the document",
          },
          documentTopic: {
            type: "string",
            description: "The topic of the document",
          },
          documentDescription: {
            type: "string",
            description: "Brief description of the document",
          },
        },
        required: ["instanceID", "documentTopic"],
      },
    },
  },
  required: ["hasRelevantDocument", "answer", "referenceDocuments"],
};

// ===== System Prompt (LLM MUST OUTPUT THAI) =====
const SYSTEM_PROMPT = `You are an HR Assistant for the organization.
Your role: Answer employee questions about company policies, benefits, and regulations by accurately referencing HR documents.

【Response Method】
1. **Identify the language of the user's question.** You MUST answer in the SAME language as the user's question.
   - If the user asks in English, answer in English.
   - If the user asks in Thai, answer in Thai.
2. Read conversation history to clearly understand the context and what the user is specifically asking.
3. Review ONLY the provided documents - if documents are relevant to the question, use them as reference.
4. Write specific answers citing information directly from the documents.
5. **Do NOT summarize or shorten the information.** Provide full details as found in the documents.
6. **Organize and explain the information** clearly, acting as an advisor explaining the policy based on the data.

【Document Referencing Rules】
- ONLY reference documents that directly answer the question.
- If document topic/description does NOT match the question → do NOT use it.
- If NO documents match → return hasRelevantDocument = false.
- Be strict and precise - better to say "no documents found" than give wrong information.

【Prohibitions】
- Do NOT guess or provide generic answers.
- Do NOT reference unrelated documents.
- Do NOT add information from outside the Knowledge Base.
- Never start with: "พบเอกสาร", "จากข้อมูลใน KB", "อ้างอิงจากเอกสาร".
- Output MUST be valid JSON immediately.
- **Do NOT mix languages.** Keep the response in the single language of the user's question.`;

// ===== Weaviate Collection Configuration =====
// Use NocolyTripAI as the source for travel reimbursement knowledge
const WEAVIATE_COLLECTION = "NocolyTripAI";
const WEAVIATE_FIELDS = `
  instanceID
  documentDetail
  requesterName
  documentDescription
  documentTopic
  _additional {
    certainty
  }
`;
// WARNING: This app now makes direct requests to Weaviate from the browser.
// That requires the Weaviate endpoint to allow CORS and will expose the
// `REACT_APP_WEAVIATE_API_KEY` and `REACT_APP_OPENAI_API_KEY` in the client.
// This is intentional per project constraint (frontend-only).

// ===== Helpers =====
const safeJson = (x) => {
  try {
    return JSON.stringify(x);
  } catch {
    return "[]";
  }
};

/**
 * Transform Weaviate results into cleanedKnowledgeBase format
 * Structure: { instanceID, documentDetail, requesterName, documentDescription, requesterEmail, documentTopic, certainty }
 */
const transformToCleanedKB = (results = []) => {
  return results.map((item) => ({
    instanceID: item.instanceID || "",
    documentDetail: item.documentDetail || "",
    requesterName: item.requesterName || "",
    documentDescription: item.documentDescription || "",
    requesterEmail: item.requesterEmail || "",
    documentTopic: item.documentTopic || "",
    certainty: item._additional?.certainty || 0,
  }));
};

const Typewriter = ({ text, speed = 10 }) => {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayedText((prev) => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return <ReactMarkdown>{displayedText}</ReactMarkdown>;
};

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const messagesEndRef = useRef(null);

  // Conversation persistence and context monitoring
  const [conversationLog, setConversationLog] = useState(() => {
    try {
      const raw = localStorage.getItem("conversation_log");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });
  const [contextWarning, setContextWarning] = useState(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [isDarkMode]);

  // Removed Kissflow SDK integration (getKf/openInKissflow) per refactor

  // -- Conversation logging helpers --
  function buildConversationLog(messagesArray = []) {
    return messagesArray.map((m, i) => ({
      seq: i + 1,
      role: m.role || (m.sender === "user" ? "user" : "assistant"),
      message: m.text,
      timestamp: m.timestamp || new Date().toISOString(),
    }));
  }

  function saveConversationLog(messagesArray = []) {
    const log = buildConversationLog(messagesArray);
    try {
      localStorage.setItem("conversation_log", JSON.stringify(log, null, 2));
      setConversationLog(log);
    } catch (err) {
      console.warn("Failed saving conversation log", err);
    }
  }

  // -- Context size estimation and warning --
  const OPENAI_CONTEXT_LIMIT = parseInt(
    getEnv("REACT_APP_OPENAI_CONTEXT_LIMIT", "8192"),
    10,
  );

  function estimateTokensFromMessages(messagesArray = []) {
    const text = (messagesArray || []).map((m) => m.text || "").join(" ");
    return Math.max(1, Math.ceil(text.length / 4));
  }

  function checkContextSizeAndWarn(messagesArray = []) {
    const tokens = estimateTokensFromMessages(messagesArray);
    const nearThreshold = Math.floor(OPENAI_CONTEXT_LIMIT * 0.8);
    if (tokens >= OPENAI_CONTEXT_LIMIT) {
      setContextWarning({ level: "over", tokens, limit: OPENAI_CONTEXT_LIMIT });
      console.warn(
        `Context tokens ${tokens} exceed limit ${OPENAI_CONTEXT_LIMIT}`,
      );
    } else if (tokens >= nearThreshold) {
      setContextWarning({ level: "near", tokens, limit: OPENAI_CONTEXT_LIMIT });
      console.warn(
        `Context tokens ${tokens} near limit ${OPENAI_CONTEXT_LIMIT}`,
      );
    } else {
      setContextWarning(null);
    }
    return tokens;
  }

  // -- Simple retrieval decision function (scalable) --
  // Decides whether to query external knowledge (Weaviate) for a question.
  function shouldRetrieveFromKnowledgeBase(question = "", chatHistory = []) {
    const q = (question || "").toLowerCase();
    const keywords = [
      "reimburse",
      "reimbursement",
      "expense",
      "claim",
      "travel",
      "trip",
      "allowance",
      "เบิก",
      "ค่าใช้จ่าย",
      "การเดินทาง",
      "ค่าโดยสาร",
      "นโยบาย",
      "นโยบายการ",
      "เบิกค่าใช้จ่าย",
    ];
    if (keywords.some((k) => q.includes(k))) return true;
    if (q.includes("document") || q.includes("เอกสาร") || q.includes("policy"))
      return true;
    return false;
  }

  function copyToClipboard(text) {
    if (!navigator?.clipboard) {
      alert("Clipboard not supported in this browser");
      return;
    }
    navigator.clipboard
      .writeText(String(text))
      .then(() => alert("Copied to clipboard"))
      .catch((err) => {
        console.error("Copy failed", err);
        alert("Copy failed: " + (err?.message || err));
      });
  }

  // --- Configurable token reporting (state-controlled, no UI control) ---
  const [tokenLoggingEnabled, setTokenLoggingEnabled] =
    useState(ENABLE_TOKEN_LOGGING);

  // Programmatic toggle for token usage reporting (call from code/tests)
  function setTokenUsageReport(enabled) {
    setTokenLoggingEnabled(Boolean(enabled));
  }

  // Analyze accumulated chat log JSON and attempt to extract trip-related fields
  function analyzeChatLog(messagesArray = []) {
    const text = (messagesArray || []).map((m) => m.text || "").join("\n");
    const lower = text.toLowerCase();

    // Extract dates (support yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy)
    const ymd = /\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/g;
    const dmy = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/g;
    const dates = [];
    let m;
    while ((m = ymd.exec(text)) !== null) {
      dates.push(`${m[1]}-${parseInt(m[2], 10)}-${parseInt(m[3], 10)}`);
    }
    while ((m = dmy.exec(text)) !== null) {
      dates.push(`${m[3]}-${parseInt(m[2], 10)}-${parseInt(m[1], 10)}`);
    }

    let startDate = null;
    let endDate = null;
    if (dates.length >= 2) {
      startDate = dates[0];
      endDate = dates[1];
    } else if (dates.length === 1) {
      startDate = dates[0];
    }

    // Heuristics for other fields
    const travelType =
      lower.includes("ไปราชการในราชอาณาจักร") || lower.includes("ในราชอาณาจักร")
        ? "ไปราชการในราชอาณาจักร"
        : lower.includes("ไปราชการต่างประเทศ") || lower.includes("ต่างประเทศ")
          ? "ไปราชการต่างประเทศชั่วคราว"
          : lower.includes("ไปราชการประจำ")
            ? "ไปราชการประจำในต่างประเทศ"
            : null;

    const reimbursementType = lower.includes("เหมาจ่าย")
      ? "เหมาจ่าย"
      : lower.includes("จ่ายจริง")
        ? "จ่ายจริง"
        : null;

    // Country / category type detection (only accept explicit mentions)
    const allowedCountryCandidates = [
      "ประเภท ก",
      "ประเภท ข",
      "Option 3",
      "ประเภท ค",
      "ประเภท ง",
      "ประเภท จ",
    ];
    let countryType = null;
    for (const c of allowedCountryCandidates) {
      if (text.includes(c) || lower.includes(c.toLowerCase())) {
        countryType = c;
        break;
      }
    }

    // Destination and purpose
    let destination = null;
    const destMatch = text.match(/สถานที่(?:ไปราชการ)?[:：\s]*([^\n,\.]+)/i);
    if (destMatch) destination = destMatch[1].trim();
    else {
      const m2 = text.match(/ไป(?:ที่)?\s+([^\n,\.]+)/i);
      if (m2) destination = m2[1].trim();
    }

    let purpose = null;
    const pMatch = text.match(/วัตถุประสงค์(?:การเดินทาง)?[:：\s]*([^\n]+)/i);
    if (pMatch) purpose = pMatch[1].trim();
    else {
      const p2 = text.match(/เพื่อ\s+([^\n,\.]+)/i);
      if (p2) purpose = p2[1].trim();
    }

    // Numeric amounts (capture numbers followed by 'บาท')
    const bahtRegex = /([0-9,]+(?:\.[0-9]+)?)\s*บาท/gi;
    const foundAmounts = [];
    while ((m = bahtRegex.exec(text)) !== null) {
      foundAmounts.push(parseFloat(m[1].replace(/,/g, "")));
    }

    const amounts = {};
    if (foundAmounts.length === 1) amounts.travelTotal = foundAmounts[0];
    else if (foundAmounts.length >= 3) {
      amounts.travelTotal = foundAmounts[0];
      amounts.accommodationTotal = foundAmounts[1];
      amounts.clothingTotal = foundAmounts[2];
    }

    const extraFieldMatch = text.match(/ข้าราชการ\s*([ก-ฮA-Za-z0-9]+)/i);
    const extraField = extraFieldMatch
      ? `ข้าราชการ ${extraFieldMatch[1]}`
      : null;

    const extracted = {
      purpose,
      travelType,
      countryType,
      destination,
      startDate,
      endDate,
      reimbursementType,
      ...amounts,
      extraField,
    };

    const required = ["purpose", "startDate", "endDate", "destination"];
    const missing = required.filter((k) => !extracted[k]);

    return {
      extracted,
      missing,
      isComplete: missing.length === 0,
      rawText: text,
    };
  }

  // Map extracted trip data into Nocoly writable fields and validate values
  function mapToNocolyFields(extracted = {}) {
    const fields = [];

    const allowedTravelTypes = [
      "ไปราชการในราชอาณาจักร",
      "ไปราชการต่างประเทศชั่วคราว",
      "ไปราชการประจำในต่างประเทศ",
    ];
    const allowedCountryTypes = [
      "ประเภท ก",
      "ประเภท ข",
      "Option 3",
      "ประเภท ค",
      "ประเภท ง",
      "ประเภท จ",
    ];
    const allowedReimbursement = ["เหมาจ่าย", "จ่ายจริง", "Option 3"];

    function normalizeDate(d) {
      if (!d) return null;
      // Accept already normalized 'YYYY-M-D'
      const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
      const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
      const dmydash = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
      let m;
      if (ymd.test(d)) return d;
      if ((m = d.match(dmy)))
        return `${m[3]}-${parseInt(m[2], 10)}-${parseInt(m[1], 10)}`;
      if ((m = d.match(dmydash)))
        return `${m[3]}-${parseInt(m[2], 10)}-${parseInt(m[1], 10)}`;
      return null;
    }

    if (extracted.purpose) {
      fields.push({
        id: "69d4ee2dfa7982b82bd766a2",
        value: String(extracted.purpose),
      });
    }

    if (
      extracted.travelType &&
      allowedTravelTypes.includes(extracted.travelType)
    ) {
      fields.push({
        id: "69d4ee2dfa7982b82bd766a3",
        value: extracted.travelType,
      });
    }

    if (
      extracted.countryType &&
      allowedCountryTypes.includes(extracted.countryType)
    ) {
      fields.push({
        id: "69d4ee2dfa7982b82bd766a4",
        value: extracted.countryType,
      });
    }

    if (extracted.destination) {
      fields.push({
        id: "69d4ee2dfa7982b82bd766a5",
        value: String(extracted.destination),
      });
    }

    const s = normalizeDate(extracted.startDate);
    const e = normalizeDate(extracted.endDate);
    if (s) fields.push({ id: "69d4ee2dfa7982b82bd766a6", value: s });
    if (e) fields.push({ id: "69d4ee2dfa7982b82bd766a7", value: e });

    if (
      extracted.reimbursementType &&
      allowedReimbursement.includes(extracted.reimbursementType)
    ) {
      fields.push({
        id: "69d4eff3212d613b07e64600",
        value: extracted.reimbursementType,
      });
    }

    if (extracted.extraField) {
      fields.push({
        id: "69d5ff17360586f58a4c374b",
        value: extracted.extraField,
      });
    }

    if (typeof extracted.travelTotal === "number") {
      fields.push({
        id: "69d5da34212d613b07e680cb",
        value: extracted.travelTotal,
      });
    }
    if (typeof extracted.accommodationTotal === "number") {
      fields.push({
        id: "69d5da34212d613b07e680cc",
        value: extracted.accommodationTotal,
      });
    }
    if (typeof extracted.clothingTotal === "number") {
      fields.push({
        id: "69d5da34212d613b07e680cd",
        value: extracted.clothingTotal,
      });
    }

    return fields;
  }

  // Decide if user's intent is to create a Nocoly record
  function shouldCreateRecord(
    question = "",
    chatHistory = [],
    analysis = null,
  ) {
    const q = (question || "").toLowerCase();
    const keywords = [
      "สร้าง",
      "สร้างคำขอ",
      "สร้างรายการ",
      "ส่ง",
      "ยื่น",
      "บันทึก",
      "submit",
      "create",
      "create request",
      "new record",
    ];
    if (keywords.some((k) => q.includes(k))) return true;

    // If analysis indicates complete data and user asks about 'proceed' or 'next'
    if (analysis && analysis.isComplete) {
      const proceedKeywords = ["ต่อไป", "ดำเนินการ", "proceed", "submit"];
      if (proceedKeywords.some((k) => q.includes(k))) return true;
    }

    return false;
  }

  // Create a new record in Nocoly using the provided fields array
  async function createNocolyRecord(fields = []) {
    try {
      if (!Array.isArray(fields) || fields.length === 0) {
        throw new Error("No writable fields provided for Nocoly payload");
      }

      setProcessingStep("Submitting request to Nocoly...");

      const myHeaders = new Headers();
      myHeaders.append("HAP-Appkey", "0267badb903abfa0");
      myHeaders.append(
        "HAP-Sign",
        "YTFiMzE5ZDk4NDBmNDNmNjllOWMxYjU4MWY2YTQ5ZTQwNTU3MmMzZmM2MWZmM2JmOWYwNjYwY2U2OTk3YWJmNw==",
      );
      myHeaders.append("Content-Type", "application/json");

      const raw = JSON.stringify({ triggerWorkflow: true, fields });

      const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow",
      };

      const url =
        "https://www.nocoly.com/api/v3/app/worksheets/69d4b45ffa7982b82bd74399/rows";

      const resp = await fetch(url, requestOptions);
      const text = await resp.text();
      if (!resp.ok) {
        console.error("Nocoly API error", resp.status, text);
        return { success: false, error: `HTTP ${resp.status}: ${text}` };
      }

      return { success: true, result: text };
    } catch (err) {
      console.error("createNocolyRecord failed:", err.message || err);
      return { success: false, error: err.message || String(err) };
    } finally {
      setProcessingStep("");
    }
  }

  /**
   * Send message handler with short memory (session-only)
   * - Messages stored in React state only (not persistent)
   * - Full conversation history passed to LLM for context
   * - Auto-clears on page refresh or browser close
   */
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = {
      text: input,
      sender: "user",
      role: "user",
      timestamp: new Date().toISOString(),
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    saveConversationLog(newHistory);
    setInput("");
    setIsTyping(true);

    // Check context size and warn if needed
    checkContextSizeAndWarn(newHistory);

    // Pass full conversation history for LLM context
    const aiResponse = await handleQuestion(input, newHistory);
    const aiResponses = Array.isArray(aiResponse) ? aiResponse : [aiResponse];

    const finalHistory = [
      ...newHistory,
      ...aiResponses.map((r) => ({
        ...r,
        timestamp: r.timestamp || new Date().toISOString(),
      })),
    ];

    setMessages(finalHistory);
    saveConversationLog(finalHistory);
    setIsTyping(false);
    setProcessingStep("");
  };

  const selectSuggestedQuestion = (question) => {
    setInput(question);
  };

  /**
   * Main HR Document Search Flow with Conversation Context:
   * - Takes full conversation history for LLM reasoning
   * - LLM can understand context from previous messages
   * - Step 0: Translate user question to English (for better embedding)
   * - Step 1: Generate embedding vector from translated input
   * - Step 2: Query Weaviate with nearVector search (topK=5)
   * - Step 3: Transform results into cleanedKnowledgeBase
   * - Step 4: Build instruction prompt with document info
   * - Step 5: Call LLM with systemPrompt & instructionPrompt & full history
   * - Step 6: Return structured HRDocumentResponse (JSON schema)
   */
  async function handleQuestion(question, chatHistory) {
    let totalUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const accumulateUsage = (usage) => {
      if (!usage) return;
      totalUsage.prompt_tokens += usage.prompt_tokens || 0;
      totalUsage.completion_tokens += usage.completion_tokens || 0;
      totalUsage.total_tokens += usage.total_tokens || 0;
    };

    try {
      console.log("\n=== [HR Assistant] NEW QUERY ===");
      console.log("[1] User Question:", question);
      console.log("[1] Question Length:", question.length, "characters");

      // Step 0: Translate to English
      setProcessingStep("Translating to English...");
      console.log("[0] Translating to English...");
      const {
        translatedText,
        detectedLanguage,
        usage: translationUsage,
      } = await translateToEnglish(question);
      accumulateUsage(translationUsage);
      console.log(`[0] Detected Language: ${detectedLanguage}`);
      console.log("[0] Translated Text:", translatedText);

      // Decide whether to retrieve external knowledge (Weaviate)
      const retrievalNeeded = shouldRetrieveFromKnowledgeBase(
        translatedText,
        chatHistory,
      );
      console.log("[1.5] Retrieval needed:", retrievalNeeded);

      let cleanedKB = [];
      let embeddingUsage = null;

      if (retrievalNeeded) {
        if (ENABLE_PROCESSING_ANIMATION)
          setProcessingStep("Generating embedding...");
        console.log("[2] Generating embedding...");
        const { embedding, usage: _embeddingUsage } =
          await generateEmbeddingForCase(translatedText);
        embeddingUsage = _embeddingUsage;
        accumulateUsage(embeddingUsage);
        console.log(
          "[2] Embedding generated. Vector length:",
          embedding.length,
        );

        if (ENABLE_PROCESSING_ANIMATION)
          setProcessingStep("Searching knowledge base...");
        console.log("[3] Searching Weaviate...");
        const weaviateResults = await searchWeaviateForCases(
          embedding,
          translatedText,
        );
        console.log("[3] Raw Weaviate results:", weaviateResults.length);

        // Step 3: Transform results into cleanedKnowledgeBase
        cleanedKB = transformToCleanedKB(weaviateResults);
        console.log("[4] Cleaned documents:", cleanedKB.length);
      } else {
        console.log("[2] Skipping knowledge retrieval per decision function");
      }

      // Log document details for debugging
      if (cleanedKB.length > 0) {
        console.log("[4] Top document details:");
        cleanedKB.slice(0, 3).forEach((doc, i) => {
          console.log(
            `   Doc ${i + 1}: "${doc.documentTopic}" (${(
              doc.certainty * 100
            ).toFixed(1)}%)`,
          );
        });
      } else {
        console.log("[4] ⚠️  NO documents passed the relevance threshold!");
      }

      // Analyze the accumulated chat log JSON for trip extraction and intent
      const analysis = analyzeChatLog(chatHistory);
      console.log("[ANALYSIS] Extracted trip data:", analysis);

      // If user intends to create a Nocoly record, handle that flow first
      const wantsCreate = shouldCreateRecord(question, chatHistory, analysis);
      if (wantsCreate) {
        console.log("[FLOW] Create record intent detected");
        if (!analysis.isComplete) {
          // Ask for missing information
          const missingList = analysis.missing.join(", ");
          const isThai = String(detectedLanguage || "")
            .toLowerCase()
            .includes("thai");
          const askText = isThai
            ? `ยังขาดข้อมูล: ${missingList}. กรุณาให้ข้อมูลเพิ่มเติม.`
            : `Missing fields: ${missingList}. Please provide them.`;

          return [
            {
              text: askText,
              sender: "ai",
              role: "assistant",
              timestamp: new Date().toISOString(),
              animate: true,
            },
          ];
        }

        // Map extracted values to Nocoly writable fields
        setProcessingStep("Preparing Nocoly payload...");
        const nocolyFields = mapToNocolyFields(analysis.extracted);
        if (!nocolyFields || nocolyFields.length === 0) {
          return [
            {
              text: "ไม่พบข้อมูลที่สามารถแมปเป็นฟิลด์คำขอได้ โปรดระบุรายละเอียดเพิ่มเติม",
              sender: "ai",
              role: "assistant",
              timestamp: new Date().toISOString(),
              animate: true,
            },
          ];
        }

        setProcessingStep("Submitting to Nocoly...");
        const createResult = await createNocolyRecord(nocolyFields);
        if (createResult.success) {
          const confirmText = `The request form has been created successfully. Please check the system again.`;
          return [
            {
              text: confirmText,
              sender: "ai",
              role: "assistant",
              timestamp: new Date().toISOString(),
              animate: true,
            },
          ];
        }

        return [
          {
            text: `Failed to create request: ${createResult.error || "Unknown error"}`,
            sender: "ai",
            role: "assistant",
            timestamp: new Date().toISOString(),
            animate: true,
          },
        ];
      }

      // Step 4: Build optimized instruction prompt with context awareness
      // Use recent user questions for better context understanding (faster response)
      const recentQuestions = chatHistory
        .filter((m) => m.sender === "user")
        .slice(-2)
        .map((m) => m.text)
        .join(" -> ");

      const instructionPrompt = `【Employee Question】
${question}${
        recentQuestions ? `\n【Context from previous】: ${recentQuestions}` : ""
      }

【Available HR Documents】
${
  cleanedKB.length > 0
    ? cleanedKB
        .map(
          (c, i) =>
            `${i + 1}. Topic: ${c.documentTopic}\n   Description: ${
              c.documentDescription
            }\n   Content: ${c.documentDetail}\n   Match Confidence: ${(
              c.certainty * 100
            ).toFixed(0)}%`,
        )
        .join("\n\n")
    : "No matching documents found"
}

【CRITICAL Instructions】
1. The user is asking in **${detectedLanguage}**. You MUST answer in **${detectedLanguage}**.
2. Analyze the user's question to understand specifically what they are asking.
3. ONLY answer using documents provided above - do NOT make up information.
4. If documents found AND contain relevant information: hasRelevantDocument = true.
   - **Provide a detailed explanation** based on the documents.
   - **Do NOT summarize or abbreviate.** Use the full details from the documents to explain.
   - **Organize the answer** logically (e.g., steps, bullet points) to help the user understand.
   - **Answer in ${detectedLanguage}.**
5. If NO documents found OR documents are NOT relevant to the question: hasRelevantDocument = false, answer = "Sorry, I couldn't find any relevant documents for your question. Please contact HR." (Translate this message to **${detectedLanguage}**).
6. For referenceDocuments: ONLY include documents you actually used in the answer.
7. Return ONLY valid JSON matching the schema, no additional text.`;

      // Step 5: Call LLM for HR response
      if (ENABLE_PROCESSING_ANIMATION)
        setProcessingStep("Generating response...");
      const { parsedResponse: hrResponse, usage: responseUsage } =
        await generateHRResponse(instructionPrompt, chatHistory, cleanedKB);
      accumulateUsage(responseUsage);

      // Step 6: Validate and return response - if no relevant documents, show "not found" message
      if (!hrResponse.hasRelevantDocument) {
        console.log(
          "[6] ⚠️  No relevant documents found - returning error message",
        );
      } else {
        console.log(
          "[6] ✓ Response ready with",
          hrResponse.referenceDocuments?.length || 0,
          "referenced documents",
        );

        // Validate that referenced documents match the ones we provided
        if (
          hrResponse.referenceDocuments &&
          hrResponse.referenceDocuments.length > 0
        ) {
          console.log("[6] Referenced documents:");
          hrResponse.referenceDocuments.forEach((ref, i) => {
            console.log(`      ${i + 1}. ${ref.documentTopic}`);
          });
        }
      }

      console.log("=== [HR Assistant] QUERY COMPLETE ===\n");

      const mainResponse = {
        text: hrResponse.answer,
        sender: "ai",
        role: "assistant",
        hrResponse: hrResponse,
        knowledgeBase: cleanedKB,
        animate: true,
      };

      const responses = [mainResponse];

      if (tokenLoggingEnabled) {
        const tokenLogMessage = {
          text:
            `**Token Usage Report:**\n\n` +
            `**1. Translation Step:**\n` +
            `- Prompt Tokens: ${
              translationUsage ? translationUsage.prompt_tokens : 0
            }\n` +
            `- Completion Tokens: ${
              translationUsage ? translationUsage.completion_tokens : 0
            }\n` +
            `- Total: ${
              translationUsage ? translationUsage.total_tokens : 0
            }\n\n` +
            `**2. Embedding Step:**\n` +
            `- Total: ${embeddingUsage ? embeddingUsage.total_tokens : 0}\n\n` +
            `**3. Response Generation Step:**\n` +
            `- Prompt Tokens: ${
              responseUsage ? responseUsage.prompt_tokens : 0
            }\n` +
            `- Completion Tokens: ${
              responseUsage ? responseUsage.completion_tokens : 0
            }\n` +
            `- Total: ${responseUsage ? responseUsage.total_tokens : 0}\n\n` +
            `**Grand Total Tokens Used**: ${totalUsage.total_tokens}`,
          sender: "ai",
          role: "assistant",
          hrResponse: null,
          knowledgeBase: [],
          animate: true,
        };
        responses.push(tokenLogMessage);
      }

      return responses;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[HR Assistant Error]", msg);
      return {
        text: `เกิดข้อผิดพลาด: ${msg}`,
        sender: "ai",
        role: "assistant",
        hrResponse: null,
        knowledgeBase: [],
      };
    }
  }

  /**
   * Step 0: Translate user input to English and detect language
   */
  async function translateToEnglish(text) {
    try {
      console.log(
        "   → Translating and detecting language:",
        text.substring(0, 50) + "...",
      );
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a helpful translator.
1. Detect the language of the user's text (e.g., "Thai", "English", "Japanese").
2. Translate the text to English. If it is already in English, keep it as is.
3. Return the result in this JSON format:
{
  "detectedLanguage": "Language Name",
  "translatedText": "English translation"
}`,
              },
              { role: "user", content: text },
            ],
            response_format: { type: "json_object" },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Translation API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);

      const translatedText = parsed.translatedText || text;
      const detectedLanguage = parsed.detectedLanguage || "Unknown";
      const usage = data.usage;

      console.log(
        `   ✓ Detected: ${detectedLanguage}, Translated: ${translatedText}`,
      );
      return { translatedText, detectedLanguage, usage };
    } catch (err) {
      console.error("   ✗ Translation failed:", err.message);
      // Fallback to original text if translation fails
      return { translatedText: text, detectedLanguage: "Unknown", usage: null };
    }
  }

  /**
   * Step 1: Generate embedding from user input using OpenAI API
   * Uses text-embedding-3-small model
   */
  async function generateEmbeddingForCase(text) {
    try {
      // Clean and normalize the input text for better embedding quality
      const cleanedText = text.trim();

      console.log(
        "   → Creating embedding for:",
        cleanedText.substring(0, 50) + "...",
      );

      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: cleanedText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("   ✗ Embedding API error:", errorData);
        throw new Error(`Embedding API error: ${response.statusText}`);
      }

      const data = await response.json();
      const embedding = data.data[0].embedding;
      const usage = data.usage;
      console.log("   ✓ Embedding created successfully");
      return { embedding, usage };
    } catch (err) {
      console.error("   ✗ Embedding generation failed:", err.message);
      throw new Error(`Embedding failed: ${err.message}`);
    }
  }

  /**
   * Step 2: Query Weaviate using semantic search (nearVector)
   * Returns topK=10 results, then filters by relevance threshold (0.65)
   * This ensures we get highly relevant documents only
   */
  async function searchWeaviateForCases(embedding, originalQuestion) {
    const gql = `
      query {
        Get {
          ${WEAVIATE_COLLECTION}(
            nearVector: {
              vector: ${safeJson(embedding)}
            }
            limit: 15
          ) {
            ${WEAVIATE_FIELDS}
          }
        }
      }
    `;

    try {
      // Always call the same-origin proxy path — the browser never contacts
      // weaviate.vbix.net directly, so CORS is never triggered.
      // Local dev : webpack-dev-server proxy forwards to Weaviate server-side.
      // Vercel    : api/weaviate.js serverless function forwards server-side.
      const url = "/api/weaviate";
      console.log("   → Querying Weaviate via proxy:", url);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: gql }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("   ✗ Weaviate HTTP error:", response.status, body);
        throw new Error(`Weaviate error: ${response.status}`);
      }

      const json = await response.json();
      if (json.errors) {
        console.error("   ✗ Weaviate GraphQL errors:", json.errors);
        throw new Error(
          `Weaviate GraphQL errors: ${JSON.stringify(json.errors)}`,
        );
      }

      let results = json?.data?.Get?.[WEAVIATE_COLLECTION] || [];
      console.log("   ✓ Retrieved", results.length, "results from Weaviate");

      // Log all results with their certainty scores for debugging
      if (results.length > 0) {
        console.log("   → Certainty scores:");
        results.forEach((r, i) => {
          const certainty = r._additional?.certainty || 0;
          const topic = r.documentTopic || "No topic";
          console.log(
            `      ${i + 1}. ${(certainty * 100).toFixed(1)}% - "${topic.substring(0, 50)}"`,
          );
        });
      }

      // Balanced threshold at 0.60 (60%) - not too strict, not too loose
      const RELEVANCE_THRESHOLD = 0.6;
      console.log(`   → Filtering by threshold: ${RELEVANCE_THRESHOLD * 100}%`);

      const filteredResults = results.filter(
        (item) => (item._additional?.certainty || 0) >= RELEVANCE_THRESHOLD,
      );

      console.log(
        `   → Documents passing threshold: ${filteredResults.length}`,
      );

      // Return top 5 most relevant results after filtering
      const finalResults = filteredResults.slice(0, 5);
      console.log(`   ✓ Final selected documents: ${finalResults.length}`);

      return finalResults;
    } catch (err) {
      console.error("   ✗ Weaviate search failed:", err.message || err);
      throw new Error(`Weaviate search failed: ${err.message || String(err)}`);
    }
  }

  /**
   * Call LLM for HR response with optimized context
   * - Uses recent conversation history (last 2 exchanges) for faster response
   * - System prompt + optimized instruction + context for fluent conversation
   * - LLM MUST return JSON matching HRDocumentResponse schema
   * - ALL LLM-generated content MUST be Thai
   */
  async function generateHRResponse(
    instructionPrompt,
    chatHistory,
    cleanedKB = [],
  ) {
    // Optimize: Use only recent conversation (last 2 user messages) to reduce tokens
    const recentHistory = (chatHistory || [])
      .slice(-4) // Last 2 exchanges (user + assistant pairs)
      .map((m) => ({
        role: m.role,
        content: m.text,
      }));

    try {
      // Build instruction with JSON format requirement
      const enhancedPrompt =
        instructionPrompt +
        `

Return response in this exact JSON format:
{
  "hasRelevantDocument": boolean,
  "answer": "Answer in the same language as the user's question",
  "referenceDocuments": [
    {
      "instanceID": "id here",
      "documentTopic": "topic here",
      "documentDescription": "description here"
    }
  ]
}`;

      const requestBody = {
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 1000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...recentHistory,
          { role: "user", content: enhancedPrompt },
        ],
      };

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "[HR Assistant] API Error Response:",
          errorText,
          "Status:",
          response.status,
        );
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const jsonString = data.choices[0].message.content;

      // Extract JSON from response (in case there's extra text)
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Could not extract JSON from LLM response");
      }

      const parsedResponse = JSON.parse(jsonMatch[0]);

      // Validate required schema fields
      if (
        !parsedResponse.hasOwnProperty("hasRelevantDocument") ||
        !parsedResponse.hasOwnProperty("answer") ||
        !parsedResponse.hasOwnProperty("referenceDocuments")
      ) {
        throw new Error("LLM response missing required fields");
      }

      // Ensure referenceDocuments is an array
      if (!Array.isArray(parsedResponse.referenceDocuments)) {
        parsedResponse.referenceDocuments = [];
      }

      return { parsedResponse, usage: data.usage };
    } catch (err) {
      throw new Error(`LLM generation failed: ${err.message}`);
    }
  }

  // Kissflow integration removed — replaced with local copy/inspect helpers

  // ===== UI =====
  return (
    <div className="App">
      <div className="chat-header">
        <div className="header-title">HR AI Assistant</div>
        <button
          className="theme-toggle-btn"
          onClick={() => setIsDarkMode(!isDarkMode)}
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDarkMode ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>
        {contextWarning && (
          <div className={`context-warning ${contextWarning.level}`}>
            {contextWarning.level === "over"
              ? `Context tokens ${contextWarning.tokens} exceed limit ${contextWarning.limit}. Consider truncating history or summarizing.`
              : `Context tokens ${contextWarning.tokens} nearing limit ${contextWarning.limit}. Consider truncating history.`}
          </div>
        )}
      </div>

      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message-row ${msg.sender}-row`}>
              <div className="message-avatar">
                {msg.sender === "user" ? (
                  <div className="avatar user-avatar">U</div>
                ) : (
                  <div className="avatar ai-avatar">AI</div>
                )}
              </div>
              <div className={`message-bubble ${msg.sender}-message`}>
                <div className="message-text">
                  {msg.sender === "ai" &&
                  msg.animate &&
                  ENABLE_STREAMING_EFFECT ? (
                    <Typewriter text={msg.text} />
                  ) : (
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  )}
                </div>

                {msg.sender === "ai" &&
                  msg.knowledgeBase &&
                  msg.knowledgeBase.length > 0 && (
                    <div className="refs-inline">
                      <div className="refs-inline-header">
                        <strong>Related Documents</strong>
                        <button
                          type="button"
                          className="refs-open-all"
                          onClick={() =>
                            copyToClipboard(
                              msg.knowledgeBase
                                .map((r) => r.instanceID)
                                .join(","),
                            )
                          }
                          title="Copy all instance IDs"
                        >
                          Copy all ({msg.knowledgeBase.length})
                        </button>
                      </div>

                      <ul className="refs-inline-list">
                        {msg.knowledgeBase.map((r, i) => (
                          <li
                            key={`${r.instanceID}-${i}`}
                            className="refs-inline-item"
                          >
                            <div className="refs-inline-meta">
                              <div className="refs-inline-title">
                                Doc {i + 1} • {r.documentTopic || "Untitled"}
                              </div>
                              <div className="refs-inline-sub">
                                {r.documentDescription && (
                                  <>{r.documentDescription} •</>
                                )}
                                Certainty: {(r.certainty * 100).toFixed(1)}%
                              </div>
                            </div>
                            <button
                              type="button"
                              className="refs-open-one"
                              onClick={() => copyToClipboard(r.instanceID)}
                              title="Copy instance ID"
                            >
                              Copy
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="typing-indicator-container">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
              {processingStep && (
                <div className="processing-step fade-in">{processingStep}</div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className="chat-input-form">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e);
              }
            }}
            placeholder="พิมพ์คำถามของคุณที่นี่... (Shift+Enter สำหรับบรรทัดใหม่)"
            disabled={isTyping}
            rows="3"
            className="chat-input-textarea"
          />
          <button type="submit" disabled={isTyping} aria-label="Send">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>

        <div className="suggested-questions-wrapper">
          <p className="suggested-questions-label">แนะนำคำถาม</p>
          {/* <div className="suggested-questions-grid">
            {SUGGESTED_QUESTIONS.map((question, idx) => (
              <button
                key={idx}
                type="button"
                className="suggested-question-btn"
                onClick={() => selectSuggestedQuestion(question)}
              >
                {question}
              </button>
            ))} */}
        </div>
      </div>
    </div>
    // </div>
  );
}

export default App;
