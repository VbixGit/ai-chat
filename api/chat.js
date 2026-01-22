// api/chat.js - Vercel Serverless Function
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    console.log("[api/chat] ❌ Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      systemPrompt,
      userMessage,
      context,
      chatHistory,
      temperature,
      maxTokens,
    } = req.body;

    console.log(
      "[api/chat] ▶️ Incoming request body:",
      JSON.stringify(req.body, null, 2),
    );

    // Get API key from environment variables
    const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
    if (!apiKey) {
      console.error(
        "[api/chat] ❌ OpenAI API key not configured (process.env.REACT_APP_OPENAI_API_KEY is missing)",
      );
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }
    console.log(
      "[api/chat] ✅ OpenAI API key loaded (length:",
      apiKey.length,
      ")",
    );

    // Build messages array
    const messages = [{ role: "system", content: systemPrompt }];

    // Add recent chat history
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.slice(-5).forEach((msg, idx) => {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
        console.log(`[api/chat] 🕑 Chat history [${idx}]:`, msg);
      });
    }

    // Add context if available
    if (context) {
      messages.push({
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${userMessage}`,
      });
      console.log("[api/chat] 📄 Context provided:", context);
    } else {
      messages.push({
        role: "user",
        content: userMessage,
      });
      console.log("[api/chat] 📝 User message only:", userMessage);
    }

    // Log the final messages array
    console.log(
      "[api/chat] 📨 Final messages array:",
      JSON.stringify(messages, null, 2),
    );

    // Call OpenAI API
    const openaiPayload = {
      model: "gpt-4.1-mini",
      messages,
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 1000,
    };
    console.log(
      "[api/chat] 🚀 Calling OpenAI API with payload:",
      JSON.stringify(openaiPayload, null, 2),
    );

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openaiPayload),
    });

    if (!response.ok) {
      let error = {};
      try {
        error = await response.json();
      } catch (e) {
        error = { error: { message: response.statusText } };
      }
      console.error("[api/chat] ❌ OpenAI API error:", error);
      throw new Error(
        `OpenAI API error: ${error.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    console.log(
      "[api/chat] ✅ OpenAI API response:",
      JSON.stringify(data, null, 2),
    );

    res.status(200).json({
      content,
      tokensUsed: data.usage,
      model: data.model,
    });
  } catch (error) {
    console.error("[api/chat] ❌ API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
