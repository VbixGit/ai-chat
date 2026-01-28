/**
 * OPENAI SERVICE MODULE
 * Centralize all OpenAI API interactions
 *
 * DECISION: REFACTOR from App.js inline calls
 * Moved to service for reusability and testability
 */

import { OPENAI_CONFIG } from "../../config/env";

export async function generateChatCompletion(request) {
  const {
    systemPrompt,
    userMessage,
    context = "",
    chatHistory = [],
    temperature = OPENAI_CONFIG.temperature,
    maxTokens = OPENAI_CONFIG.maxTokens,
  } = request;

  try {
    console.log("🤖 Calling chat API...");

    // Build messages array
    const messages = [{ role: "system", content: systemPrompt }];

    // Add recent chat history
    chatHistory.slice(-5).forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    // Add context if available
    if (context) {
      messages.push({
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${userMessage}`,
      });
    } else {
      messages.push({
        role: "user",
        content: userMessage,
      });
    }

    // Call OpenAI API directly
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.chatModel,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `OpenAI API error: ${error.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const tokensUsed = data.usage?.total_tokens || 0;
    const model = data.model;

    console.log("✅ API response received");

    return {
      content,
      tokensUsed,
      model,
    };
  } catch (error) {
    console.error("❌ API call failed:", error);
    throw error;
  }
}

export async function generateEmbedding(request) {
  const { text, model = OPENAI_CONFIG.embeddingModel } = request;

  console.log(
    "🔑 OpenAI API Key status:",
    OPENAI_CONFIG.apiKey ? "SET" : "NOT SET"
  );

  if (!OPENAI_CONFIG.apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  if (!text || text.trim().length === 0) {
    throw new Error("Text required for embedding");
  }

  try {
    console.log(`📊 Generating embedding with ${model}...`);

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `OpenAI API error: ${error.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding || [];

    console.log("✅ Embedding generated");

    return {
      embedding,
      model,
      tokensUsed: data.usage?.total_tokens || 0,
    };
  } catch (error) {
    console.error("❌ Embedding generation failed:", error);
    throw error;
  }
}

export async function translateToThai(text) {
  if (!text || text.trim() === "") return text;

  try {
    console.log("🌐 Translating to Thai...");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.chatModel,
        messages: [
          {
            role: "system",
            content:
              "You are a professional translator. Translate the following text to Thai. Only return the translated text, no explanations.",
          },
          { role: "user", content: text },
        ],
        temperature: 0,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.statusText}`);
    }

    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content || text;

    console.log("✅ Translation completed");

    return translated;
  } catch (error) {
    console.error("❌ Translation failed:", error);
    return text;
  }
}

export async function translateToEnglish(text) {
  if (!text || text.trim() === "") return text;

  try {
    console.log("🌐 Translating to English...");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.chatModel,
        messages: [
          {
            role: "system",
            content:
              "You are a professional translator. Translate the following text to English. Only return the translated text, no explanations.",
          },
          { role: "user", content: text },
        ],
        temperature: 0,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.statusText}`);
    }

    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content || text;

    console.log("✅ Translation to English completed");

    return translated;
  } catch (error) {
    console.error("❌ Translation failed:", error);
    return text;
  }
}
