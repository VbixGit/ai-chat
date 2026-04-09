"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; })();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var _react = require("react");

var _react2 = _interopRequireDefault(_react);

var _reactMarkdown = require("react-markdown");

var _reactMarkdown2 = _interopRequireDefault(_reactMarkdown);

require("./App.css");

// Safely read environment variables in the browser. Webpack's DefinePlugin
// may not always inject `process.env` (or the app may run without it), so
// guard to avoid "process is not defined" runtime errors.
// Build-time env snapshot (values injected by webpack.DefinePlugin)
// Build-time/runtime env snapshot. Prefer runtime `window.__ENV__` injected
// by webpack (DefinePlugin). Avoid direct `process.env.*` references here
// to prevent build-time replacement producing unquoted values that break
// the browser parser when a running webpack config differs.
var BUILD_ENV = {};
try {
  if (typeof window !== "undefined" && window.__ENV__) {
    BUILD_ENV = window.__ENV__;
  } else {
    BUILD_ENV = {};
  }
} catch (e) {
  BUILD_ENV = {};
}

// Debug: report which env sources have keys (do not print secret values)
try {
  if (typeof window !== "undefined" && window.__ENV__) {
    console.log("[ENV DEBUG] window.__ENV__ keys:", Object.keys(window.__ENV__).filter(function (k) {
      return window.__ENV__[k] != null;
    }));
  } else {
    console.log("[ENV DEBUG] window.__ENV__ not present");
  }
  console.log("[ENV DEBUG] BUILD_ENV keys:", Object.keys(BUILD_ENV).filter(function (k) {
    return BUILD_ENV[k] != null && BUILD_ENV[k] !== "";
  }));
  console.log("[ENV DEBUG] OPENAI present:", !!BUILD_ENV.REACT_APP_OPENAI_API_KEY || !!(typeof window !== "undefined" && window.__ENV__ && window.__ENV__.REACT_APP_OPENAI_API_KEY));
} catch (e) {
  // ignore debug errors
}

function getEnv(name) {
  var fallback = arguments.length <= 1 || arguments[1] === undefined ? "" : arguments[1];

  // Prefer runtime-injected `window.__ENV__` (this is set by DefinePlugin
  // at build time). Then fall back to the BUILD_ENV snapshot if present.
  try {
    if (typeof window !== "undefined" && window.__ENV__ && window.__ENV__[name] != null) {
      return window.__ENV__[name];
    }
  } catch (e) {
    // ignore
  }
  if (BUILD_ENV && BUILD_ENV[name] != null) {
    return BUILD_ENV[name];
  }
  return fallback;
}

var WEAVIATE_ENDPOINT = getEnv("REACT_APP_WEAVIATE_ENDPOINT", "");
var WEAVIATE_API_KEY = getEnv("REACT_APP_WEAVIATE_API_KEY", "");
var OPENAI_API_KEY = getEnv("REACT_APP_OPENAI_API_KEY", "");
// Detect whether we can call OpenAI / Weaviate from the client
var CAN_USE_OPENAI = !!OPENAI_API_KEY && OPENAI_API_KEY.trim() !== "";
var CAN_USE_WEAVIATE = !!WEAVIATE_ENDPOINT && !!WEAVIATE_API_KEY;

function detectLanguageSimple() {
  var text = arguments.length <= 0 || arguments[0] === undefined ? "" : arguments[0];

  if (/[\u0E00-\u0E7F]/.test(text)) return "Thai";
  if (/[A-Za-z]/.test(text)) return "English";
  return "Unknown";
}

var ENABLE_TOKEN_LOGGING = true;
var ENABLE_STREAMING_EFFECT = true;
var ENABLE_PROCESSING_ANIMATION = true;

// ===== Suggested Questions (HR-based) =====
var SUGGESTED_QUESTIONS = ["นโยบายการลา", "การเบิกค่ารักษาพยาบาล", "ขั้นตอนการขออนุมัติ"];

// ===== HR Document Search JSON Schema (MANDATORY) =====
var HR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    hasRelevantDocument: {
      type: "boolean",
      description: "Whether relevant documents were found"
    },
    answer: {
      type: "string",
      description: "The answer to the employee's question in the same language as the question"
    },
    referenceDocuments: {
      type: "array",
      description: "List of relevant documents",
      items: {
        type: "object",
        properties: {
          instanceID: {
            type: "string",
            description: "The unique instance ID of the document"
          },
          documentTopic: {
            type: "string",
            description: "The topic of the document"
          },
          documentDescription: {
            type: "string",
            description: "Brief description of the document"
          }
        },
        required: ["instanceID", "documentTopic"]
      }
    }
  },
  required: ["hasRelevantDocument", "answer", "referenceDocuments"]
};

// ===== System Prompt (LLM MUST OUTPUT THAI) =====
var SYSTEM_PROMPT = "You are an HR Assistant for the organization.\nYour role: Answer employee questions about company policies, benefits, and regulations by accurately referencing HR documents.\n\n【Response Method】\n1. **Identify the language of the user's question.** You MUST answer in the SAME language as the user's question.\n   - If the user asks in English, answer in English.\n   - If the user asks in Thai, answer in Thai.\n2. Read conversation history to clearly understand the context and what the user is specifically asking.\n3. Review ONLY the provided documents - if documents are relevant to the question, use them as reference.\n4. Write specific answers citing information directly from the documents.\n5. **Do NOT summarize or shorten the information.** Provide full details as found in the documents.\n6. **Organize and explain the information** clearly, acting as an advisor explaining the policy based on the data.\n\n【Document Referencing Rules】\n- ONLY reference documents that directly answer the question.\n- If document topic/description does NOT match the question → do NOT use it.\n- If NO documents match → return hasRelevantDocument = false.\n- Be strict and precise - better to say \"no documents found\" than give wrong information.\n\n【Prohibitions】\n- Do NOT guess or provide generic answers.\n- Do NOT reference unrelated documents.\n- Do NOT add information from outside the Knowledge Base.\n- Never start with: \"พบเอกสาร\", \"จากข้อมูลใน KB\", \"อ้างอิงจากเอกสาร\".\n- Output MUST be valid JSON immediately.\n- **Do NOT mix languages.** Keep the response in the single language of the user's question.";

// ===== Weaviate Collection Configuration =====
var WEAVIATE_COLLECTION = "NocolyTripAI";
var WEAVIATE_FIELDS = "\n  instanceID\n  documentDetail\n  requesterName\n  documentDescription\n  documentTopic\n  _additional {\n    certainty\n  }\n";

// ===== Helpers =====
var safeJson = function safeJson(x) {
  try {
    return JSON.stringify(x);
  } catch (e) {
    return "[]";
  }
};

// Lightweight id generator for messages/log entries
var genId = function genId() {
  return Date.now() + "-" + Math.random().toString(36).slice(2, 9);
};

/**
 * Transform Weaviate results into cleanedKnowledgeBase format
 * Structure: { instanceID, documentDetail, requesterName, documentDescription, requesterEmail, documentTopic, certainty }
 */
var transformToCleanedKB = function transformToCleanedKB() {
  var results = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

  return results.map(function (item) {
    return {
      instanceID: item.instanceID || "",
      documentDetail: item.documentDetail || "",
      requesterName: item.requesterName || "",
      documentDescription: item.documentDescription || "",
      requesterEmail: item.requesterEmail || "",
      documentTopic: item.documentTopic || "",
      certainty: item._additional && item._additional.certainty || 0
    };
  });
};

var Typewriter = function Typewriter(_ref) {
  var text = _ref.text;
  var _ref$speed = _ref.speed;
  var speed = _ref$speed === undefined ? 10 : _ref$speed;

  var _useState = (0, _react.useState)("");

  var _useState2 = _slicedToArray(_useState, 2);

  var displayedText = _useState2[0];
  var setDisplayedText = _useState2[1];

  (0, _react.useEffect)(function () {
    var i = 0;
    var timer = setInterval(function () {
      if (i < text.length) {
        setDisplayedText(function (prev) {
          return prev + text.charAt(i);
        });
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return function () {
      return clearInterval(timer);
    };
  }, [text, speed]);

  return _react2["default"].createElement(
    _reactMarkdown2["default"],
    null,
    displayedText
  );
};

function App() {
  var _this = this;

  var _useState3 = (0, _react.useState)([]);

  var _useState32 = _slicedToArray(_useState3, 2);

  var messages = _useState32[0];
  var setMessages = _useState32[1];

  var _useState4 = (0, _react.useState)("");

  var _useState42 = _slicedToArray(_useState4, 2);

  var input = _useState42[0];
  var setInput = _useState42[1];

  var _useState5 = (0, _react.useState)(false);

  var _useState52 = _slicedToArray(_useState5, 2);

  var isTyping = _useState52[0];
  var setIsTyping = _useState52[1];

  var _useState6 = (0, _react.useState)("");

  var _useState62 = _slicedToArray(_useState6, 2);

  var processingStep = _useState62[0];
  var setProcessingStep = _useState62[1];

  var _useState7 = (0, _react.useState)(false);

  var _useState72 = _slicedToArray(_useState7, 2);

  var isDarkMode = _useState72[0];
  var setIsDarkMode = _useState72[1];

  var messagesEndRef = (0, _react.useRef)(null);

  // Conversation persistence and context monitoring

  var _useState8 = (0, _react.useState)(function () {
    try {
      var raw = localStorage.getItem("conversation_log");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  var _useState82 = _slicedToArray(_useState8, 2);

  var conversationLog = _useState82[0];
  var setConversationLog = _useState82[1];

  var _useState9 = (0, _react.useState)(null);

  var _useState92 = _slicedToArray(_useState9, 2);

  var contextWarning = _useState92[0];
  var setContextWarning = _useState92[1];

  // Token usage display toggle (default: hidden)

  var _useState10 = (0, _react.useState)(false);

  var _useState102 = _slicedToArray(_useState10, 2);

  var showTokenUsage = _useState102[0];
  var setShowTokenUsage = _useState102[1];

  (0, _react.useEffect)(function () {
    if (messagesEndRef.current && messagesEndRef.current.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  (0, _react.useEffect)(function () {
    if (isDarkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [isDarkMode]);

  // Removed Kissflow SDK integration (getKf/openInKissflow) per refactor

  // -- Conversation logging helpers --
  function buildConversationLog() {
    var messagesArray = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

    return messagesArray.map(function (m, i) {
      return {
        id: m.id || genId(),
        seq: i + 1,
        role: m.role || (m.sender === "user" ? "user" : "assistant"),
        sender: m.sender || (m.role === "user" ? "user" : "assistant"),
        message: m.text || m.message || "",
        timestamp: m.timestamp || new Date().toISOString()
      };
    });
  }

  function saveConversationLog() {
    var messagesArray = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

    var log = buildConversationLog(messagesArray);
    try {
      localStorage.setItem("conversation_log", JSON.stringify(log, null, 2));
      setConversationLog(log);
    } catch (err) {
      console.warn("Failed saving conversation log", err);
    }
  }

  function normalizeOutgoingMessage() {
    var msg = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    return {
      id: msg.id || genId(),
      sender: msg.sender || (msg.role === "user" ? "user" : "ai"),
      role: msg.role || (msg.sender === "user" ? "user" : "assistant"),
      text: msg.text || msg.message || "",
      timestamp: msg.timestamp || new Date().toISOString(),
      animate: msg.animate || false,
      knowledgeBase: msg.knowledgeBase || msg.kb || [],
      hrResponse: msg.hrResponse || null
    };
  }

  function addMessage() {
    var msg = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var nm = normalizeOutgoingMessage(msg);
    setMessages(function (prev) {
      var next = [].concat(_toConsumableArray(prev), [nm]);
      try {
        var log = buildConversationLog(next);
        localStorage.setItem("conversation_log", JSON.stringify(log, null, 2));
        setConversationLog(log);
      } catch (e) {
        console.warn("Failed to persist message", e);
      }
      return next;
    });
  }

  // Persist conversation log whenever messages change (single source of truth)
  (0, _react.useEffect)(function () {
    try {
      saveConversationLog(messages);
    } catch (e) {
      // non-fatal
    }
  }, [messages]);

  // -- Context size estimation and warning --
  var OPENAI_CONTEXT_LIMIT = parseInt(getEnv("REACT_APP_OPENAI_CONTEXT_LIMIT", "8192"), 10);

  function estimateTokensFromMessages() {
    var messagesArray = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

    var text = (messagesArray || []).map(function (m) {
      return m.text || "";
    }).join(" ");
    return Math.max(1, Math.ceil(text.length / 4));
  }

  function checkContextSizeAndWarn() {
    var messagesArray = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

    var tokens = estimateTokensFromMessages(messagesArray);
    var nearThreshold = Math.floor(OPENAI_CONTEXT_LIMIT * 0.8);
    if (tokens >= OPENAI_CONTEXT_LIMIT) {
      setContextWarning({ level: "over", tokens: tokens, limit: OPENAI_CONTEXT_LIMIT });
      console.warn("Context tokens " + tokens + " exceed limit " + OPENAI_CONTEXT_LIMIT);
    } else if (tokens >= nearThreshold) {
      setContextWarning({ level: "near", tokens: tokens, limit: OPENAI_CONTEXT_LIMIT });
      console.warn("Context tokens " + tokens + " near limit " + OPENAI_CONTEXT_LIMIT);
    } else {
      setContextWarning(null);
    }
    return tokens;
  }

  // -- Simple retrieval decision function (scalable) --
  // Decides whether to query external knowledge (Weaviate) for a question.
  function shouldRetrieveFromKnowledgeBase() {
    var question = arguments.length <= 0 || arguments[0] === undefined ? "" : arguments[0];
    var chatHistory = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];

    var q = (question || "").toLowerCase();
    var keywords = ["reimburse", "reimbursement", "expense", "claim", "travel", "trip", "allowance", "เบิก", "ค่าใช้จ่าย", "การเดินทาง", "ค่าโดยสาร", "นโยบาย", "นโยบายการ", "เบิกค่าใช้จ่าย"];
    if (keywords.some(function (k) {
      return q.includes(k);
    })) return true;
    if (q.includes("document") || q.includes("เอกสาร") || q.includes("policy")) return true;
    return false;
  }

  function copyToClipboard(text) {
    if (!navigator || !navigator.clipboard) {
      alert("Clipboard not supported in this browser");
      return;
    }
    navigator.clipboard.writeText(String(text)).then(function () {
      return alert("Copied to clipboard");
    })["catch"](function (err) {
      console.error("Copy failed", err);
      alert("Copy failed: " + (err && err.message || err));
    });
  }

  // ===== Nocoly integration helpers =====
  var NOCOLY_CONFIG = {
    endpoint: "https://www.nocoly.com/api/v3/app/worksheets/69d4b45ffa7982b82bd74399/rows",
    appKey: "0267badb903abfa0",
    sign: "YTFiMzE5ZDk4NDBmNDNmNjllOWMxYjU4MWY2YTQ5ZTQwNTU3MmMzZmM2MWZmM2JmOWYwNjYwY2U2OTk3YWJmNw=="
  };

  var NOCOLY_ALLOWED = {
    travelTypes: ["ไปราชการในราชอาณาจักร", "ไปราชการต่างประเทศชั่วคราว", "ไปราชการประจำในต่างประเทศ"],
    countryTypes: ["ประเภท ก", "ประเภท ข", "Option 3", "ประเภท ค", "ประเภท ง", "ประเภท จ"],
    reimbursementMethods: ["เหมาจ่าย", "จ่ายจริง", "Option 3"]
  };

  var NOCOLY_FIELD_MAP = [{ id: "69d4ee2dfa7982b82bd766a2", key: "purpose", type: "text" }, {
    id: "69d4ee2dfa7982b82bd766a3",
    key: "travelType",
    type: "dropdown",
    allowed: NOCOLY_ALLOWED.travelTypes
  }, {
    id: "69d4ee2dfa7982b82bd766a4",
    key: "countryType",
    type: "dropdown",
    allowed: NOCOLY_ALLOWED.countryTypes
  }, { id: "69d4ee2dfa7982b82bd766a5", key: "location", type: "text" }, { id: "69d4ee2dfa7982b82bd766a6", key: "startDate", type: "date" }, { id: "69d4ee2dfa7982b82bd766a7", key: "endDate", type: "date" }, {
    id: "69d4eff3212d613b07e64600",
    key: "reimbursementMethod",
    type: "dropdown",
    allowed: NOCOLY_ALLOWED.reimbursementMethods
  }, { id: "69d5ff17360586f58a4c374b", key: "employeeType", type: "text" }, { id: "69d5da34212d613b07e680cb", key: "totalTravel", type: "number" }, { id: "69d5da34212d613b07e680cc", key: "totalLodging", type: "number" }, { id: "69d5da34212d613b07e680cd", key: "totalClothing", type: "number" }];

  function normalizeDateString(s) {
    if (!s) return null;
    var r1 = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (r1) return r1[1] + "-" + parseInt(r1[2], 10) + "-" + parseInt(r1[3], 10);
    var r2 = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (r2) return r2[3] + "-" + parseInt(r2[2], 10) + "-" + parseInt(r2[1], 10);
    return null;
  }

  function extractDatesFromLog(log) {
    var texts = (log || []).map(function (r) {
      return r.message || r.text || "";
    }).join(" ");
    var matches = [];
    var re1 = /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g;
    var m = undefined;
    while ((m = re1.exec(texts)) && matches.length < 2) matches.push(normalizeDateString(m[1]));
    if (matches.length < 2) {
      var re2 = /(\d{1,2}[-/]\d{1,2}[-/]\d{4})/g;
      while ((m = re2.exec(texts)) && matches.length < 2) matches.push(normalizeDateString(m[1]));
    }
    return {
      startDate: matches[0] || null,
      endDate: matches[1] || matches[0] || null
    };
  }

  function findFirstMatch(log, candidates) {
    if (!log || !candidates) return null;
    var joined = candidates.map(function (c) {
      return c.toLowerCase();
    });
    for (var i = log.length - 1; i >= 0; i--) {
      var txt = (log[i].message || log[i].text || "").toLowerCase();
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = joined[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var cand = _step.value;

          if (txt.includes(cand)) return candidates[joined.indexOf(cand)];
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator["return"]) {
            _iterator["return"]();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
    return null;
  }

  function extractPurposeFromLog(log) {
    for (var i = log.length - 1; i >= 0; i--) {
      var txt = log[i].message || log[i].text || "";
      var m = txt.match(/วัตถุประสงค์[:：\s-]*(.+)/i);
      if (m && m[1]) return m[1].trim();
    }
    var userMsg = (log || []).find(function (m) {
      return m.role === "user" || m.sender === "user";
    });
    return userMsg ? (userMsg.message || userMsg.text).slice(0, 200) : "";
  }

  function extractNumbersFromLog(log) {
    var unitKeyword = arguments.length <= 1 || arguments[1] === undefined ? "บาท" : arguments[1];

    var texts = (log || []).map(function (r) {
      return r.message || r.text || "";
    }).join(" ");
    var re = new RegExp("(\\d+(?:[,\\.]\\d+)?)(?=\\s*" + unitKeyword + ")", "g");
    var m = re.exec(texts);
    if (m) return parseFloat(m[1].replace(/,/g, "")) || null;
    return null;
  }
  function extractSubmissionValues(log) {
    var dates = extractDatesFromLog(log);
    var purpose = extractPurposeFromLog(log);
    var travelType = findFirstMatch(log, NOCOLY_ALLOWED.travelTypes);
    var countryType = findFirstMatch(log, NOCOLY_ALLOWED.countryTypes);
    var reimbursementMethod = findFirstMatch(log, NOCOLY_ALLOWED.reimbursementMethods);
    var joinedText = (log || []).map(function (r) {
      return r.message || r.text || "";
    }).join(" ");
    var locationMatch = joinedText.match(/สถานที่[:：\s-]*([^\n\.]+)/i);
    var employeeTypeMatch = joinedText.match(/ข้าราชการ\s*\w*/i);
    var totalTravel = extractNumbersFromLog(log, "บาท");

    return {
      purpose: purpose || null,
      travelType: travelType || null,
      countryType: countryType || null,
      location: locationMatch ? locationMatch[1].trim() : null,
      startDate: dates.startDate,
      endDate: dates.endDate,
      reimbursementMethod: reimbursementMethod || null,
      employeeType: employeeTypeMatch ? employeeTypeMatch[0] : null,
      totalTravel: totalTravel !== null ? String(totalTravel) : null
    };
  }

  function getMissingRequiredFields(log) {
    var values = extractSubmissionValues(log || conversationLog || []);
    var required = ["purpose", "travelType", "startDate", "endDate", "totalTravel"];
    var missing = [];
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = required[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var k = _step2.value;

        if (!values[k] || String(values[k]).trim() === "") missing.push(k);
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2["return"]) {
          _iterator2["return"]();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }

    return missing;
  }

  function buildNocolyPayloadFromLog(log) {
    var payloadFields = [];
    var valueMap = extractSubmissionValues(log);

    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = NOCOLY_FIELD_MAP[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        var m = _step3.value;

        var val = valueMap[m.key];
        if (val == null || val === "") continue;
        if (m.type === "dropdown" && m.allowed && !m.allowed.includes(val)) continue;
        if (m.type === "date" && !normalizeDateString(val)) continue;
        if (m.type === "number" && Number.isNaN(Number(val))) continue;
        payloadFields.push({ id: m.id, value: String(val) });
      }
    } catch (err) {
      _didIteratorError3 = true;
      _iteratorError3 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion3 && _iterator3["return"]) {
          _iterator3["return"]();
        }
      } finally {
        if (_didIteratorError3) {
          throw _iteratorError3;
        }
      }
    }

    return { triggerWorkflow: true, fields: payloadFields };
  }

  // Small intent detector for user asking to create a record
  function userRequestedCreateRecord() {
    var text = arguments.length <= 0 || arguments[0] === undefined ? "" : arguments[0];

    var q = (text || "").toLowerCase();
    var keywords = ["create record", "create request", "submit request", "create nocoly", "create form", "create request now", "สร้างคำขอ", "สร้างคำขอใหม่", "ส่งคำขอ", "ส่งคำขอเลย", "สร้างคำขอเลย", "บันทึกคำขอ"];
    return keywords.some(function (k) {
      return q.includes(k);
    });
  }

  function detectLanguageFromConversation(log) {
    if (!log || !log.length) return "Thai";
    var lastUser = log.slice().reverse().find(function (m) {
      return (m.role || m.sender) === "user";
    });
    var sample = lastUser ? lastUser.message || lastUser.text || "" : "";
    return detectLanguageSimple(sample);
  }

  function createNocolyRecordFromConversation(log) {
    var actualLog, missing, body, myHeaders, raw, requestOptions, res, text;
    return regeneratorRuntime.async(function createNocolyRecordFromConversation$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          context$2$0.prev = 0;
          actualLog = log || conversationLog || [];
          missing = getMissingRequiredFields(actualLog);

          if (!(missing && missing.length)) {
            context$2$0.next = 5;
            break;
          }

          return context$2$0.abrupt("return", {
            success: false,
            missingFields: missing,
            error: "MISSING_FIELDS"
          });

        case 5:
          body = buildNocolyPayloadFromLog(actualLog);

          if (body.fields.length) {
            context$2$0.next = 8;
            break;
          }

          return context$2$0.abrupt("return", {
            success: false,
            error: "ไม่มีข้อมูลที่เพียงพอสำหรับสร้างคำขอ"
          });

        case 8:
          myHeaders = new Headers();

          myHeaders.append("HAP-Appkey", NOCOLY_CONFIG.appKey);
          myHeaders.append("HAP-Sign", NOCOLY_CONFIG.sign);
          myHeaders.append("Content-Type", "application/json");
          raw = JSON.stringify(body);
          requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow"
          };
          context$2$0.next = 16;
          return regeneratorRuntime.awrap(fetch(NOCOLY_CONFIG.endpoint, requestOptions));

        case 16:
          res = context$2$0.sent;
          context$2$0.next = 19;
          return regeneratorRuntime.awrap(res.text());

        case 19:
          text = context$2$0.sent;

          if (res.ok) {
            context$2$0.next = 22;
            break;
          }

          return context$2$0.abrupt("return", { success: false, status: res.status, error: text });

        case 22:
          return context$2$0.abrupt("return", { success: true, result: text });

        case 25:
          context$2$0.prev = 25;
          context$2$0.t0 = context$2$0["catch"](0);
          return context$2$0.abrupt("return", { success: false, error: context$2$0.t0.message || String(context$2$0.t0) });

        case 28:
        case "end":
          return context$2$0.stop();
      }
    }, null, this, [[0, 25]]);
  }

  function handleCreateNocolyRecord() {
    var log, result, _ret, aiMessage;

    return regeneratorRuntime.async(function handleCreateNocolyRecord$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          setProcessingStep("กำลังส่งคำขอไปยัง Nocoly...");
          setIsTyping(true);
          log = conversationLog && conversationLog.length ? conversationLog : buildConversationLog(messages);
          context$2$0.next = 5;
          return regeneratorRuntime.awrap(createNocolyRecordFromConversation(log));

        case 5:
          result = context$2$0.sent;

          setIsTyping(false);
          setProcessingStep("");

          // If some fields are missing, ask the user for them instead of attempting a create

          if (!(result && Array.isArray(result.missingFields) && result.missingFields.length)) {
            context$2$0.next = 12;
            break;
          }

          _ret = (function () {
            var lang = detectLanguageFromConversation(log) || "Thai";
            var fieldNames = {
              purpose: { Thai: "วัตถุประสงค์", English: "purpose" },
              travelType: { Thai: "ประเภทการเดินทาง", English: "travel type" },
              startDate: { Thai: "วันที่เริ่มต้น", English: "start date" },
              endDate: { Thai: "วันที่สิ้นสุด", English: "end date" },
              totalTravel: {
                Thai: "รวมค่าใช้จ่าย (บาท)",
                English: "total amount (THB)"
              }
            };

            var missingReadable = result.missingFields.map(function (k) {
              return fieldNames[k] ? fieldNames[k][lang === "Thai" ? "Thai" : "English"] : k;
            }).join(", ");

            var prompt = lang === "Thai" ? "เพื่อสร้างคำขอ กรุณาระบุข้อมูลต่อไปนี้: " + missingReadable : "To create the request please provide: " + missingReadable;

            addMessage({
              text: prompt,
              sender: "ai",
              role: "assistant",
              animate: false
            });
            return {
              v: { success: false, missingFields: result.missingFields }
            };
          })();

          if (!(typeof _ret === "object")) {
            context$2$0.next = 12;
            break;
          }

          return context$2$0.abrupt("return", _ret.v);

        case 12:
          if (!result.success) {
            context$2$0.next = 18;
            break;
          }

          aiMessage = {
            text: "สร้างคำขอเบิกเงินเรียบร้อยแล้ว กรุณาตรวจสอบในระบบอีกครั้ง",
            sender: "ai",
            role: "assistant",
            timestamp: new Date().toISOString()
          };

          addMessage(aiMessage);
          return context$2$0.abrupt("return", { success: true });

        case 18:
          aiMessage = {
            text: "ไม่สามารถสร้างคำขอได้: " + (result.error || result.status || "unknown"),
            sender: "ai",
            role: "assistant",
            timestamp: new Date().toISOString()
          };

          addMessage(aiMessage);
          return context$2$0.abrupt("return", { success: false, error: result.error });

        case 21:
        case "end":
          return context$2$0.stop();
      }
    }, null, this);
  }

  /**
   * Send message handler with short memory (session-only)
   * - Messages stored in React state only (not persistent)
   * - Full conversation history passed to LLM for context
   * - Auto-clears on page refresh or browser close
   */
  var sendMessage = function sendMessage(e) {
    var createIntent, userMessage, newHistory, aiResponse, aiResponses, normalizedAIResponses, finalHistory;
    return regeneratorRuntime.async(function sendMessage$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          e.preventDefault();

          if (input.trim()) {
            context$2$0.next = 3;
            break;
          }

          return context$2$0.abrupt("return");

        case 3:
          createIntent = userRequestedCreateRecord(input);
          userMessage = normalizeOutgoingMessage({
            text: input,
            sender: "user",
            role: "user",
            timestamp: new Date().toISOString()
          });
          newHistory = [].concat(_toConsumableArray(messages), [userMessage]);

          setMessages(newHistory);
          // persist will be handled by useEffect; mirror context check here
          setInput("");
          setIsTyping(true);

          // Check context size and warn if needed
          checkContextSizeAndWarn(newHistory);

          // Pass full conversation history for LLM context
          context$2$0.next = 12;
          return regeneratorRuntime.awrap(handleQuestion(input, newHistory));

        case 12:
          aiResponse = context$2$0.sent;
          aiResponses = Array.isArray(aiResponse) ? aiResponse : [aiResponse];
          normalizedAIResponses = aiResponses.map(function (r) {
            return normalizeOutgoingMessage(_extends({}, r, {
              sender: r.sender || "ai",
              role: r.role || "assistant",
              text: r.text || r.message || "",
              timestamp: r.timestamp || new Date().toISOString()
            }));
          });
          finalHistory = [].concat(_toConsumableArray(newHistory), _toConsumableArray(normalizedAIResponses));

          setMessages(finalHistory);
          setIsTyping(false);
          setProcessingStep("");

          // If user explicitly asked to create a record, attempt creation now

          if (!createIntent) {
            context$2$0.next = 22;
            break;
          }

          context$2$0.next = 22;
          return regeneratorRuntime.awrap(handleCreateNocolyRecord());

        case 22:
        case "end":
          return context$2$0.stop();
      }
    }, null, _this);
  };

  var selectSuggestedQuestion = function selectSuggestedQuestion(question) {
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
  function handleQuestion(question, chatHistory) {
    var totalUsage, accumulateUsage, _ref2, translatedText, detectedLanguage, translationUsage, retrievalNeeded, cleanedKB, embeddingUsage, _ref3, embedding, _embeddingUsage, weaviateResults, recentQuestions, instructionPrompt, _ref4, hrResponse, responseUsage, mainResponse, responses, tokenLogMessage, msg;

    return regeneratorRuntime.async(function handleQuestion$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          totalUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          };

          accumulateUsage = function accumulateUsage(usage) {
            if (!usage) return;
            totalUsage.prompt_tokens += usage.prompt_tokens || 0;
            totalUsage.completion_tokens += usage.completion_tokens || 0;
            totalUsage.total_tokens += usage.total_tokens || 0;
          };

          context$2$0.prev = 2;

          console.log("\n=== [HR Assistant] NEW QUERY ===");
          console.log("[1] User Question:", question);
          console.log("[1] Question Length:", question.length, "characters");

          // Step 0: Translate to English
          setProcessingStep("Translating to English...");
          console.log("[0] Translating to English...");
          context$2$0.next = 10;
          return regeneratorRuntime.awrap(translateToEnglish(question));

        case 10:
          _ref2 = context$2$0.sent;
          translatedText = _ref2.translatedText;
          detectedLanguage = _ref2.detectedLanguage;
          translationUsage = _ref2.usage;

          accumulateUsage(translationUsage);
          console.log("[0] Detected Language: " + detectedLanguage);
          console.log("[0] Translated Text:", translatedText);

          // Decide whether to retrieve external knowledge (Weaviate)
          retrievalNeeded = shouldRetrieveFromKnowledgeBase(translatedText, chatHistory);

          console.log("[1.5] Retrieval needed:", retrievalNeeded);

          cleanedKB = [];
          embeddingUsage = null;

          if (!retrievalNeeded) {
            context$2$0.next = 47;
            break;
          }

          if (ENABLE_PROCESSING_ANIMATION) setProcessingStep("Generating embedding...");
          console.log("[2] Generating embedding...");
          context$2$0.next = 26;
          return regeneratorRuntime.awrap(generateEmbeddingForCase(translatedText));

        case 26:
          _ref3 = context$2$0.sent;
          embedding = _ref3.embedding;
          _embeddingUsage = _ref3.usage;

          embeddingUsage = _embeddingUsage;
          accumulateUsage(embeddingUsage);

          if (embedding) {
            context$2$0.next = 36;
            break;
          }

          console.warn("[2] No embedding available; skipping Weaviate search.");
          cleanedKB = [];
          context$2$0.next = 45;
          break;

        case 36:
          console.log("[2] Embedding generated. Vector length:", embedding.length);

          if (ENABLE_PROCESSING_ANIMATION) setProcessingStep("Searching knowledge base...");
          console.log("[3] Searching Weaviate...");
          context$2$0.next = 41;
          return regeneratorRuntime.awrap(searchWeaviateForCases(embedding, translatedText));

        case 41:
          weaviateResults = context$2$0.sent;

          console.log("[3] Raw Weaviate results:", weaviateResults.length);

          // Step 3: Transform results into cleanedKnowledgeBase
          cleanedKB = transformToCleanedKB(weaviateResults);
          console.log("[4] Cleaned documents:", cleanedKB.length);

        case 45:
          context$2$0.next = 48;
          break;

        case 47:
          console.log("[2] Skipping knowledge retrieval per decision function");

        case 48:

          // Log document details for debugging
          if (cleanedKB.length > 0) {
            console.log("[4] Top document details:");
            cleanedKB.slice(0, 3).forEach(function (doc, i) {
              console.log("   Doc " + (i + 1) + ": \"" + doc.documentTopic + "\" (" + (doc.certainty * 100).toFixed(1) + "%)");
            });
          } else {
            console.log("[4] ⚠️  NO documents passed the relevance threshold!");
          }

          // Step 4: Build optimized instruction prompt with context awareness
          // Use recent user questions for better context understanding (faster response)
          recentQuestions = chatHistory.filter(function (m) {
            return m.sender === "user";
          }).slice(-2).map(function (m) {
            return m.text;
          }).join(" -> ");
          instructionPrompt = "【Employee Question】\n" + question + (recentQuestions ? "\n【Context from previous】: " + recentQuestions : "") + "\n\n【Available HR Documents】\n" + (cleanedKB.length > 0 ? cleanedKB.map(function (c, i) {
            return i + 1 + ". Topic: " + c.documentTopic + "\n   Description: " + c.documentDescription + "\n   Content: " + c.documentDetail + "\n   Match Confidence: " + (c.certainty * 100).toFixed(0) + "%";
          }).join("\n\n") : "No matching documents found") + "\n\n【CRITICAL Instructions】\n1. The user is asking in **" + detectedLanguage + "**. You MUST answer in **" + detectedLanguage + "**.\n2. Analyze the user's question to understand specifically what they are asking.\n3. ONLY answer using documents provided above - do NOT make up information.\n4. If documents found AND contain relevant information: hasRelevantDocument = true.\n   - **Provide a detailed explanation** based on the documents.\n   - **Do NOT summarize or abbreviate.** Use the full details from the documents to explain.\n   - **Organize the answer** logically (e.g., steps, bullet points) to help the user understand.\n   - **Answer in " + detectedLanguage + ".**\n5. If NO documents found OR documents are NOT relevant to the question: hasRelevantDocument = false, answer = \"Sorry, I couldn't find any relevant documents for your question. Please contact HR.\" (Translate this message to **" + detectedLanguage + "**).\n6. For referenceDocuments: ONLY include documents you actually used in the answer.\n7. Return ONLY valid JSON matching the schema, no additional text.";

          // Step 5: Call LLM for HR response
          if (ENABLE_PROCESSING_ANIMATION) setProcessingStep("Generating response...");
          context$2$0.next = 54;
          return regeneratorRuntime.awrap(generateHRResponse(instructionPrompt, chatHistory, cleanedKB));

        case 54:
          _ref4 = context$2$0.sent;
          hrResponse = _ref4.parsedResponse;
          responseUsage = _ref4.usage;

          accumulateUsage(responseUsage);

          // Step 6: Validate and return response - if no relevant documents, show "not found" message
          if (!hrResponse.hasRelevantDocument) {
            console.log("[6] ⚠️  No relevant documents found - returning error message");
          } else {
            console.log("[6] ✓ Response ready with", hrResponse.referenceDocuments && hrResponse.referenceDocuments.length || 0, "referenced documents");

            // Validate that referenced documents match the ones we provided
            if (hrResponse.referenceDocuments && hrResponse.referenceDocuments.length > 0) {
              console.log("[6] Referenced documents:");
              hrResponse.referenceDocuments.forEach(function (ref, i) {
                console.log("      " + (i + 1) + ". " + ref.documentTopic);
              });
            }
          }

          console.log("=== [HR Assistant] QUERY COMPLETE ===\n");

          mainResponse = {
            text: hrResponse.answer,
            sender: "ai",
            role: "assistant",
            hrResponse: hrResponse,
            knowledgeBase: cleanedKB,
            animate: true
          };
          responses = [mainResponse];

          if (ENABLE_TOKEN_LOGGING && showTokenUsage) {
            tokenLogMessage = {
              text: "**Token Usage Report:**\n\n" + "**1. Translation Step:**\n" + ("- Prompt Tokens: " + (translationUsage ? translationUsage.prompt_tokens : 0) + "\n") + ("- Completion Tokens: " + (translationUsage ? translationUsage.completion_tokens : 0) + "\n") + ("- Total: " + (translationUsage ? translationUsage.total_tokens : 0) + "\n\n") + "**2. Embedding Step:**\n" + ("- Total: " + (embeddingUsage ? embeddingUsage.total_tokens : 0) + "\n\n") + "**3. Response Generation Step:**\n" + ("- Prompt Tokens: " + (responseUsage ? responseUsage.prompt_tokens : 0) + "\n") + ("- Completion Tokens: " + (responseUsage ? responseUsage.completion_tokens : 0) + "\n") + ("- Total: " + (responseUsage ? responseUsage.total_tokens : 0) + "\n\n") + ("**Grand Total Tokens Used**: " + totalUsage.total_tokens),
              sender: "ai",
              role: "assistant",
              hrResponse: null,
              knowledgeBase: [],
              animate: true
            };

            responses.push(tokenLogMessage);
          }

          return context$2$0.abrupt("return", responses);

        case 66:
          context$2$0.prev = 66;
          context$2$0.t0 = context$2$0["catch"](2);
          msg = context$2$0.t0 instanceof Error ? context$2$0.t0.message : "Unknown error";

          console.error("[HR Assistant Error]", msg);
          return context$2$0.abrupt("return", {
            text: "เกิดข้อผิดพลาด: " + msg,
            sender: "ai",
            role: "assistant",
            hrResponse: null,
            knowledgeBase: []
          });

        case 71:
        case "end":
          return context$2$0.stop();
      }
    }, null, this, [[2, 66]]);
  }

  /**
   * Step 0: Translate user input to English and detect language
   */
  function translateToEnglish(text) {
    var detectedLanguage, response, data, content, parsed, translatedText, usage;
    return regeneratorRuntime.async(function translateToEnglish$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          if (CAN_USE_OPENAI) {
            context$2$0.next = 4;
            break;
          }

          console.warn("OpenAI API key not provided; skipping translation from client.");
          detectedLanguage = detectLanguageSimple(text);
          return context$2$0.abrupt("return", { translatedText: text, detectedLanguage: detectedLanguage, usage: null });

        case 4:
          context$2$0.prev = 4;

          console.log("   → Translating and detecting language:", text.substring(0, 50) + "...");
          context$2$0.next = 8;
          return regeneratorRuntime.awrap(fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + OPENAI_API_KEY
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [{
                role: "system",
                content: "You are a helpful translator.\n1. Detect the language of the user's text (e.g., \"Thai\", \"English\", \"Japanese\").\n2. Translate the text to English. If it is already in English, keep it as is.\n3. Return the result in this JSON format:\n{\n  \"detectedLanguage\": \"Language Name\",\n  \"translatedText\": \"English translation\"\n}"
              }, { role: "user", content: text }],
              response_format: { type: "json_object" }
            })
          }));

        case 8:
          response = context$2$0.sent;

          if (response.ok) {
            context$2$0.next = 11;
            break;
          }

          throw new Error("Translation API error: " + response.statusText);

        case 11:
          context$2$0.next = 13;
          return regeneratorRuntime.awrap(response.json());

        case 13:
          data = context$2$0.sent;
          content = data.choices[0].message.content;
          parsed = JSON.parse(content);
          translatedText = parsed.translatedText || text;
          detectedLanguage = parsed.detectedLanguage || "Unknown";
          usage = data.usage;

          console.log("   ✓ Detected: " + detectedLanguage + ", Translated: " + translatedText);
          return context$2$0.abrupt("return", { translatedText: translatedText, detectedLanguage: detectedLanguage, usage: usage });

        case 23:
          context$2$0.prev = 23;
          context$2$0.t0 = context$2$0["catch"](4);

          console.error("   ✗ Translation failed:", context$2$0.t0.message);
          // Fallback to original text if translation fails
          detectedLanguage = detectLanguageSimple(text);
          return context$2$0.abrupt("return", { translatedText: text, detectedLanguage: detectedLanguage, usage: null });

        case 28:
        case "end":
          return context$2$0.stop();
      }
    }, null, this, [[4, 23]]);
  }

  /**
   * Step 1: Generate embedding from user input using OpenAI API
   * Uses text-embedding-3-small model
   */
  function generateEmbeddingForCase(text) {
    var cleanedText, response, errorData, data, embedding, usage;
    return regeneratorRuntime.async(function generateEmbeddingForCase$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          if (CAN_USE_OPENAI) {
            context$2$0.next = 3;
            break;
          }

          console.warn("OpenAI API key not provided; skipping embedding from client.");
          return context$2$0.abrupt("return", { embedding: null, usage: null });

        case 3:
          context$2$0.prev = 3;
          cleanedText = text.trim();

          console.log("   → Creating embedding for:", cleanedText.substring(0, 50) + "...");

          context$2$0.next = 8;
          return regeneratorRuntime.awrap(fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + OPENAI_API_KEY
            },
            body: JSON.stringify({
              model: "text-embedding-3-small",
              input: cleanedText
            })
          }));

        case 8:
          response = context$2$0.sent;

          if (response.ok) {
            context$2$0.next = 15;
            break;
          }

          context$2$0.next = 12;
          return regeneratorRuntime.awrap(response.json()["catch"](function () {
            return {};
          }));

        case 12:
          errorData = context$2$0.sent;

          console.error("   ✗ Embedding API error:", errorData);
          throw new Error("Embedding API error: " + response.statusText);

        case 15:
          context$2$0.next = 17;
          return regeneratorRuntime.awrap(response.json());

        case 17:
          data = context$2$0.sent;
          embedding = data.data[0].embedding;
          usage = data.usage;

          console.log("   ✓ Embedding created successfully");
          return context$2$0.abrupt("return", { embedding: embedding, usage: usage });

        case 24:
          context$2$0.prev = 24;
          context$2$0.t0 = context$2$0["catch"](3);

          console.error("   ✗ Embedding generation failed:", context$2$0.t0.message);
          throw new Error("Embedding failed: " + context$2$0.t0.message);

        case 28:
        case "end":
          return context$2$0.stop();
      }
    }, null, this, [[3, 24]]);
  }

  /**
   * Step 2: Query Weaviate using semantic search (nearVector)
   * Returns topK=10 results, then filters by relevance threshold (0.65)
   * This ensures we get highly relevant documents only
   */
  function searchWeaviateForCases(embedding, originalQuestion) {
    var gql, _ret2;

    return regeneratorRuntime.async(function searchWeaviateForCases$(context$2$0) {
      var _this2 = this;

      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          if (!(!embedding || !Array.isArray(embedding) || embedding.length === 0)) {
            context$2$0.next = 3;
            break;
          }

          console.warn("No embedding provided; skipping Weaviate search.");
          return context$2$0.abrupt("return", []);

        case 3:
          if (CAN_USE_WEAVIATE) {
            context$2$0.next = 6;
            break;
          }

          console.warn("Weaviate configuration missing; skipping Weaviate search.");
          return context$2$0.abrupt("return", []);

        case 6:
          gql = "\n      query {\n        Get {\n          " + WEAVIATE_COLLECTION + "(\n            nearVector: {\n              vector: " + safeJson(embedding) + "\n            }\n            limit: 15\n          ) {\n            " + WEAVIATE_FIELDS + "\n          }\n        }\n      }\n    ";
          context$2$0.prev = 7;
          context$2$0.next = 10;
          return regeneratorRuntime.awrap((function callee$2$0() {
            var response, body, json, results, RELEVANCE_THRESHOLD, filteredResults, finalResults;
            return regeneratorRuntime.async(function callee$2$0$(context$3$0) {
              while (1) switch (context$3$0.prev = context$3$0.next) {
                case 0:
                  console.log("   → Querying Weaviate (limit: 15)...");

                  context$3$0.next = 3;
                  return regeneratorRuntime.awrap(fetch(WEAVIATE_ENDPOINT + "/v1/graphql", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: "Bearer " + WEAVIATE_API_KEY
                    },
                    body: JSON.stringify({ query: gql })
                  }));

                case 3:
                  response = context$3$0.sent;

                  if (response.ok) {
                    context$3$0.next = 10;
                    break;
                  }

                  context$3$0.next = 7;
                  return regeneratorRuntime.awrap(response.text());

                case 7:
                  body = context$3$0.sent;

                  console.error("   ✗ Weaviate HTTP error:", response.status, body);
                  throw new Error("Weaviate error: " + response.status);

                case 10:
                  context$3$0.next = 12;
                  return regeneratorRuntime.awrap(response.json());

                case 12:
                  json = context$3$0.sent;

                  if (!json.errors) {
                    context$3$0.next = 16;
                    break;
                  }

                  console.error("   ✗ Weaviate GraphQL errors:", json.errors);
                  throw new Error("Weaviate GraphQL errors: " + JSON.stringify(json.errors));

                case 16:
                  results = json && json.data && json.data.Get && json.data.Get[WEAVIATE_COLLECTION] || [];

                  console.log("   ✓ Retrieved", results.length, "results from Weaviate");

                  // Log all results with their certainty scores for debugging
                  if (results.length > 0) {
                    console.log("   → Certainty scores:");
                    results.forEach(function (r, i) {
                      var certainty = r._additional && r._additional.certainty || 0;
                      var topic = r.documentTopic || "No topic";
                      console.log("      " + (i + 1) + ". " + (certainty * 100).toFixed(1) + "% - \"" + topic.substring(0, 50) + "\"");
                    });
                  }

                  // Balanced threshold at 0.60 (60%) - not too strict, not too loose
                  RELEVANCE_THRESHOLD = 0.6;

                  console.log("   → Filtering by threshold: " + RELEVANCE_THRESHOLD * 100 + "%");

                  filteredResults = results.filter(function (item) {
                    return (item._additional && item._additional.certainty || 0) >= RELEVANCE_THRESHOLD;
                  });

                  console.log("   → Documents passing threshold: " + filteredResults.length);

                  // Return top 5 most relevant results after filtering
                  finalResults = filteredResults.slice(0, 5);

                  console.log("   ✓ Final selected documents: " + finalResults.length);

                  return context$3$0.abrupt("return", {
                    v: finalResults
                  });

                case 26:
                case "end":
                  return context$3$0.stop();
              }
            }, null, _this2);
          })());

        case 10:
          _ret2 = context$2$0.sent;

          if (!(typeof _ret2 === "object")) {
            context$2$0.next = 13;
            break;
          }

          return context$2$0.abrupt("return", _ret2.v);

        case 13:
          context$2$0.next = 19;
          break;

        case 15:
          context$2$0.prev = 15;
          context$2$0.t0 = context$2$0["catch"](7);

          console.error("   ✗ Weaviate search failed:", context$2$0.t0.message);
          throw new Error("Weaviate search failed: " + context$2$0.t0.message);

        case 19:
        case "end":
          return context$2$0.stop();
      }
    }, null, this, [[7, 15]]);
  }

  /**
   * Call LLM for HR response with optimized context
   * - Uses recent conversation history (last 2 exchanges) for faster response
   * - System prompt + optimized instruction + context for fluent conversation
   * - LLM MUST return JSON matching HRDocumentResponse schema
   * - ALL LLM-generated content MUST be Thai
   */
  function generateHRResponse(instructionPrompt, chatHistory) {
    var cleanedKB = arguments.length <= 2 || arguments[2] === undefined ? [] : arguments[2];
    var recentHistory, lang, answer, parsedResponse, enhancedPrompt, requestBody, response, errorText, data, jsonString, jsonMatch;
    return regeneratorRuntime.async(function generateHRResponse$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          recentHistory = (chatHistory || []).slice(-4) // Last 2 exchanges (user + assistant pairs)
          .map(function (m) {
            return {
              role: m.role,
              content: m.text
            };
          });

          if (CAN_USE_OPENAI) {
            context$2$0.next = 7;
            break;
          }

          console.warn("OpenAI API key not provided; returning local fallback response.");
          lang = detectLanguageSimple(instructionPrompt || "");
          answer = lang === "Thai" ? "ขออภัย ไม่สามารถเชื่อมต่อบริการ LLM ได้ในขณะนี้ โปรดตรวจสอบการตั้งค่า API หรือใช้พร็อกซีเซิร์ฟเวอร์" : "Sorry, I cannot reach the LLM service right now. Please check API settings or use a proxy server.";
          parsedResponse = {
            hasRelevantDocument: false,
            answer: answer,
            referenceDocuments: []
          };
          return context$2$0.abrupt("return", { parsedResponse: parsedResponse, usage: null });

        case 7:
          context$2$0.prev = 7;
          enhancedPrompt = instructionPrompt + "\n\nReturn response in this exact JSON format:\n{\n  \"hasRelevantDocument\": boolean,\n  \"answer\": \"Answer in the same language as the user's question\",\n  \"referenceDocuments\": [\n    {\n      \"instanceID\": \"id here\",\n      \"documentTopic\": \"topic here\",\n      \"documentDescription\": \"description here\"\n    }\n  ]\n}";
          requestBody = {
            model: "gpt-4o-mini",
            temperature: 0.2,
            max_tokens: 1000,
            messages: [{ role: "system", content: SYSTEM_PROMPT }].concat(_toConsumableArray(recentHistory), [{ role: "user", content: enhancedPrompt }])
          };
          context$2$0.next = 12;
          return regeneratorRuntime.awrap(fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + OPENAI_API_KEY
            },
            body: JSON.stringify(requestBody)
          }));

        case 12:
          response = context$2$0.sent;

          if (response.ok) {
            context$2$0.next = 19;
            break;
          }

          context$2$0.next = 16;
          return regeneratorRuntime.awrap(response.text());

        case 16:
          errorText = context$2$0.sent;

          console.error("[HR Assistant] API Error Response:", errorText, "Status:", response.status);
          throw new Error("LLM API error: " + response.status);

        case 19:
          context$2$0.next = 21;
          return regeneratorRuntime.awrap(response.json());

        case 21:
          data = context$2$0.sent;
          jsonString = data.choices[0].message.content;
          jsonMatch = jsonString.match(/\{[\s\S]*\}/);

          if (jsonMatch) {
            context$2$0.next = 26;
            break;
          }

          throw new Error("Could not extract JSON from LLM response");

        case 26:
          parsedResponse = JSON.parse(jsonMatch[0]);

          if (!(!parsedResponse.hasOwnProperty("hasRelevantDocument") || !parsedResponse.hasOwnProperty("answer") || !parsedResponse.hasOwnProperty("referenceDocuments"))) {
            context$2$0.next = 29;
            break;
          }

          throw new Error("LLM response missing required fields");

        case 29:

          // Ensure referenceDocuments is an array
          if (!Array.isArray(parsedResponse.referenceDocuments)) {
            parsedResponse.referenceDocuments = [];
          }

          return context$2$0.abrupt("return", { parsedResponse: parsedResponse, usage: data.usage });

        case 33:
          context$2$0.prev = 33;
          context$2$0.t0 = context$2$0["catch"](7);
          throw new Error("LLM generation failed: " + context$2$0.t0.message);

        case 36:
        case "end":
          return context$2$0.stop();
      }
    }, null, this, [[7, 33]]);
  }

  // Kissflow integration removed — replaced with local copy/inspect helpers

  // ===== UI =====
  return _react2["default"].createElement(
    "div",
    { className: "App" },
    _react2["default"].createElement(
      "div",
      { className: "chat-header" },
      _react2["default"].createElement(
        "div",
        { className: "header-title" },
        "HR AI Assistant"
      ),
      _react2["default"].createElement(
        "button",
        {
          className: "theme-toggle-btn",
          onClick: function () {
            return setIsDarkMode(!isDarkMode);
          },
          title: isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"
        },
        isDarkMode ? _react2["default"].createElement(
          "svg",
          {
            width: "20",
            height: "20",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2"
          },
          _react2["default"].createElement("circle", { cx: "12", cy: "12", r: "5" }),
          _react2["default"].createElement("line", { x1: "12", y1: "1", x2: "12", y2: "3" }),
          _react2["default"].createElement("line", { x1: "12", y1: "21", x2: "12", y2: "23" }),
          _react2["default"].createElement("line", { x1: "4.22", y1: "4.22", x2: "5.64", y2: "5.64" }),
          _react2["default"].createElement("line", { x1: "18.36", y1: "18.36", x2: "19.78", y2: "19.78" }),
          _react2["default"].createElement("line", { x1: "1", y1: "12", x2: "3", y2: "12" }),
          _react2["default"].createElement("line", { x1: "21", y1: "12", x2: "23", y2: "12" }),
          _react2["default"].createElement("line", { x1: "4.22", y1: "19.78", x2: "5.64", y2: "18.36" }),
          _react2["default"].createElement("line", { x1: "18.36", y1: "5.64", x2: "19.78", y2: "4.22" })
        ) : _react2["default"].createElement(
          "svg",
          {
            width: "20",
            height: "20",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2"
          },
          _react2["default"].createElement("path", { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" })
        )
      ),
      _react2["default"].createElement(
        "button",
        {
          type: "button",
          className: "token-toggle-btn",
          onClick: function () {
            return setShowTokenUsage(function (s) {
              return !s;
            });
          },
          title: showTokenUsage ? "ปิดการแสดงโทเค็น" : "แสดงการใช้โทเค็น",
          "aria-pressed": showTokenUsage
        },
        showTokenUsage ? "โทเค็น: เปิด" : "โทเค็น: ปิด"
      ),
      _react2["default"].createElement(
        "button",
        {
          type: "button",
          className: "nocoly-btn",
          onClick: handleCreateNocolyRecord,
          disabled: isTyping || !(conversationLog && conversationLog.length),
          title: "สร้างคำขอใน Nocoly"
        },
        "สร้างคำขอ"
      ),
      contextWarning && _react2["default"].createElement(
        "div",
        { className: "context-warning " + contextWarning.level },
        contextWarning.level === "over" ? "Context tokens " + contextWarning.tokens + " exceed limit " + contextWarning.limit + ". Consider truncating history or summarizing." : "Context tokens " + contextWarning.tokens + " nearing limit " + contextWarning.limit + ". Consider truncating history."
      )
    ),
    _react2["default"].createElement(
      "div",
      { className: "chat-container" },
      _react2["default"].createElement(
        "div",
        { className: "chat-messages" },
        messages.map(function (msg, idx) {
          return _react2["default"].createElement(
            "div",
            {
              key: msg.id || idx,
              className: "message-row " + msg.sender + "-row"
            },
            _react2["default"].createElement(
              "div",
              { className: "message-avatar" },
              msg.sender === "user" ? _react2["default"].createElement(
                "div",
                { className: "avatar user-avatar" },
                "U"
              ) : _react2["default"].createElement(
                "div",
                { className: "avatar ai-avatar" },
                "AI"
              )
            ),
            _react2["default"].createElement(
              "div",
              { className: "message-bubble " + msg.sender + "-message" },
              _react2["default"].createElement(
                "div",
                { className: "message-text" },
                msg.sender === "ai" && msg.animate && ENABLE_STREAMING_EFFECT ? _react2["default"].createElement(Typewriter, { text: msg.text }) : _react2["default"].createElement(
                  _reactMarkdown2["default"],
                  null,
                  msg.text
                )
              ),
              msg.sender === "ai" && msg.knowledgeBase && msg.knowledgeBase.length > 0 && _react2["default"].createElement(
                "div",
                { className: "refs-inline" },
                _react2["default"].createElement(
                  "div",
                  { className: "refs-inline-header" },
                  _react2["default"].createElement(
                    "strong",
                    null,
                    "Related Documents"
                  ),
                  _react2["default"].createElement(
                    "button",
                    {
                      type: "button",
                      className: "refs-open-all",
                      onClick: function () {
                        return copyToClipboard(msg.knowledgeBase.map(function (r) {
                          return r.instanceID;
                        }).join(","));
                      },
                      title: "Copy all instance IDs"
                    },
                    "Copy all (",
                    msg.knowledgeBase.length,
                    ")"
                  )
                ),
                _react2["default"].createElement(
                  "ul",
                  { className: "refs-inline-list" },
                  msg.knowledgeBase.map(function (r, i) {
                    return _react2["default"].createElement(
                      "li",
                      {
                        key: r.instanceID + "-" + i,
                        className: "refs-inline-item"
                      },
                      _react2["default"].createElement(
                        "div",
                        { className: "refs-inline-meta" },
                        _react2["default"].createElement(
                          "div",
                          { className: "refs-inline-title" },
                          "Doc ",
                          i + 1,
                          " • ",
                          r.documentTopic || "Untitled"
                        ),
                        _react2["default"].createElement(
                          "div",
                          { className: "refs-inline-sub" },
                          r.documentDescription && _react2["default"].createElement(
                            "span",
                            null,
                            r.documentDescription,
                            " •"
                          ),
                          "Certainty: ",
                          (r.certainty * 100).toFixed(1),
                          "%"
                        )
                      ),
                      _react2["default"].createElement(
                        "button",
                        {
                          type: "button",
                          className: "refs-open-one",
                          onClick: function () {
                            return copyToClipboard(r.instanceID);
                          },
                          title: "Copy instance ID"
                        },
                        "Copy"
                      )
                    );
                  })
                )
              )
            )
          );
        }),
        isTyping && _react2["default"].createElement(
          "div",
          { className: "typing-indicator-container" },
          _react2["default"].createElement(
            "div",
            { className: "typing-indicator" },
            _react2["default"].createElement("span", null),
            _react2["default"].createElement("span", null),
            _react2["default"].createElement("span", null)
          ),
          processingStep && _react2["default"].createElement(
            "div",
            { className: "processing-step fade-in" },
            processingStep
          )
        ),
        _react2["default"].createElement("div", { ref: messagesEndRef })
      ),
      _react2["default"].createElement(
        "form",
        { onSubmit: sendMessage, className: "chat-input-form" },
        _react2["default"].createElement("textarea", {
          value: input,
          onChange: function (e) {
            return setInput(e.target.value);
          },
          onKeyDown: function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(e);
            }
          },
          placeholder: "พิมพ์คำถามของคุณที่นี่... (Shift+Enter สำหรับบรรทัดใหม่)",
          disabled: isTyping,
          rows: "3",
          className: "chat-input-textarea"
        }),
        _react2["default"].createElement(
          "button",
          { type: "submit", disabled: isTyping, "aria-label": "Send" },
          _react2["default"].createElement(
            "svg",
            {
              xmlns: "http://www.w3.org/2000/svg",
              width: "24",
              height: "24",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              strokeLinecap: "round",
              strokeLinejoin: "round"
            },
            _react2["default"].createElement("line", { x1: "22", y1: "2", x2: "11", y2: "13" }),
            _react2["default"].createElement("polygon", { points: "22 2 15 22 11 13 2 9 22 2" })
          )
        )
      ),
      _react2["default"].createElement(
        "div",
        { className: "suggested-questions-wrapper" },
        _react2["default"].createElement(
          "p",
          { className: "suggested-questions-label" },
          "แนะนำคำถาม"
        )
      )
    )
  )
  // </div>
  ;
}

exports["default"] = App;
module.exports = exports["default"];

// Check for missing required fields first

// Normalize AI responses and append

// Note: handleCreateNocolyRecord will add messages itself

// If no API key available, skip remote translation and fallback

// If we don't have an OpenAI key available in the client, skip embedding

// Clean and normalize the input text for better embedding quality

// If we don't have a valid embedding or Weaviate config, skip search

// Optimize: Use only recent conversation (last 2 user messages) to reduce tokens

// If OpenAI is not configured client-side, return a helpful fallback message

// Build instruction with JSON format requirement

// Extract JSON from response (in case there's extra text)

// Validate required schema fields
/* <div className="suggested-questions-grid">
 {SUGGESTED_QUESTIONS.map((question, idx) => (
   <button
     key={idx}
     type="button"
     className="suggested-question-btn"
     onClick={() => selectSuggestedQuestion(question)}
   >
     {question}
   </button>
 ))} */
