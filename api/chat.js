// api/chat.js - Vercel Serverless Function
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method === "OPTIONS") {
    // CORS preflight (if used behind proxies)
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    console.warn("[api/chat] ❌ Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const start = Date.now();

    const {
      systemPrompt,
      userMessage,
      context,
      chatHistory,
      temperature,
      maxTokens,
    } = req.body || {};

    console.log("[api/chat] ▶️ Incoming request", {
      method: req.method,
      path: req.url,
    });

    // Validate API key once early
    const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[api/chat] ❌ OpenAI API key not configured");
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    // Validate required fields
    if (!userMessage || typeof userMessage !== "string") {
      console.warn("[api/chat] ❗ Missing or invalid userMessage");
      return res.status(400).json({ error: "Missing or invalid userMessage" });
    }

    const system =
      systemPrompt && typeof systemPrompt === "string" ? systemPrompt : "";

    // Build messages array (system first)
    const messages = [];
    if (system) messages.push({ role: "system", content: system });

    // Add recent chat history (last 5)
    if (Array.isArray(chatHistory)) {
      chatHistory.slice(-5).forEach((msg) => {
        if (msg && msg.role && msg.content)
          messages.push({ role: msg.role, content: msg.content });
      });
    }

    // Add context or user message
    if (context && typeof context === "string") {
      messages.push({
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${userMessage}`,
      });
    } else {
      messages.push({ role: "user", content: userMessage });
    }

    // Prepare payload with safe limits
    const safeTemp =
      typeof temperature === "number"
        ? Math.max(0, Math.min(1, temperature))
        : 0.2;
    const safeMaxTokens =
      typeof maxTokens === "number"
        ? Math.max(16, Math.min(2048, maxTokens))
        : 1000;

    const openaiPayload = {
      model: "gpt-4.1-mini",
      messages,
      temperature: safeTemp,
      max_tokens: safeMaxTokens,
    };

    console.log("[api/chat] 🚀 Calling OpenAI API", {
      model: openaiPayload.model,
      temperature: safeTemp,
      max_tokens: safeMaxTokens,
      messagesCount: messages.length,
    });

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(openaiPayload),
      });
    } catch (netErr) {
      console.error(
        "[api/chat] ❌ Network error calling OpenAI:",
        netErr.message || netErr,
      );
      return res
        .status(502)
        .json({
          error: "Failed to contact OpenAI API",
          details: netErr.message || String(netErr),
        });
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error(
        "[api/chat] ❌ Failed to parse OpenAI response:",
        parseErr.message || parseErr,
      );
      return res
        .status(502)
        .json({ error: "Invalid response from OpenAI API" });
    }

    if (!response.ok) {
      console.error("[api/chat] ❌ OpenAI API error:", {
        status: response.status,
        body: data,
      });
      return res.status(500).json({ error: "OpenAI API error", details: data });
    }

    const content = data.choices?.[0]?.message?.content || "";
    const durationMs = Date.now() - start;

    console.log("[api/chat] ✅ OpenAI response OK", {
      model: data.model,
      durationMs,
    });

    return res
      .status(200)
      .json({
        content,
        tokensUsed: data.usage || null,
        model: data.model || null,
        durationMs,
      });
  } catch (error) {
    console.error("[api/chat] ❌ API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
