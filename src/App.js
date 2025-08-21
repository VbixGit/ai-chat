import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from 'react-markdown';
import "./App.css";

const WEAVIATE_ENDPOINT = process.env.REACT_APP_WEAVIATE_ENDPOINT;
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (input.trim() === "") return;

    const userMessage = { text: input, sender: "user", role: "user" };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsTyping(true);

    const aiResponse = await fetchAIResponse(input, newMessages.slice(0, -1)); // Pass chat history
    setMessages((prevMessages) => [...prevMessages, aiResponse]);
    setIsTyping(false);
  };

  const fetchAIResponse = async (question, chatHistory) => {
    try {
      console.log(`Step 1: Get text from user: "${question}"`);
      const classification = await classifyQuestion(question, chatHistory);
      
      if (!classification) {
        return {
          text: "I'm sorry, I'm having trouble understanding your request. Could you please rephrase it as a question about company policies or about finding a candidate from a resume?",
          sender: "ai",
          role: "assistant"
        };
      }

      const embedding = await generateQuestionEmbedding(question);
      const docs = await searchWeaviate(embedding, classification);
      console.log(`Step 6: Using all ${docs.length} documents from Weaviate.`);

      if (docs.length === 0) {
        return {
          text: "I couldn't find any information matching your question. Please try rephrasing it.",
          sender: "ai",
          role: "assistant",
        };
      }

      const context = docs
        .map(
          (d, i) =>
            `Document #${i + 1}:\n- Description: ${
              d.description
            }\n- Content: ${d.content}\n- Source: ${d.source}\n- Requester: ${
              d.requesterName
            } <${d.requesterEmail}>\n- PDF File ID: ${
              d.pdfFileId
            }\n- Instance ID: ${d.instanceID}\n- Chunk Index: ${
              d.chunkIndex
            }\n- Chunk Count: ${d.chunkCount}\n- Chunk ID: ${
              d.chunkId
            }\n- Relevance Score (distance): ${d._additional.distance}`
        )
        .join("\n\n---\n\n");

      const answer = await generateAnswer(context, question, chatHistory);

      return {
        text: answer,
        sender: "ai",
        role: "assistant"
      };
    } catch (err) {
      console.error("Error in askQuestion:", err);
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred.";
      return {
        text: `There was an error connecting to the knowledge base: ${errorMessage}`,
        sender: "ai",
        role: "assistant",
      };
    }
  };

  async function classifyQuestion(question, chatHistory) {
    console.log("Step 2.1: Classifying question...");
    const systemPrompt = `You are an expert at classifying user questions. Your task is to categorize the user's intent into one of two categories: "Policy" or "Resume".

- "Policy" questions are about company rules, benefits, procedures, and general information. Examples: "How do I claim dental expenses?", "What is the vacation policy?".
- "Resume" questions are about finding candidates with specific skills or experience. Examples: "Find me a software engineer with Python experience", "Who has accounting skills?".

Analyze the chat history for context, but prioritize the most recent user question. Respond with only the word "Policy" or "Resume".`;
    
    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role,
      content: msg.text
    }));

    const messages = [
      { role: "system", content: systemPrompt },
      ...formattedHistory,
      { role: "user", content: `Question: ${question}` },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        messages: messages,
      }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
        throw new Error("Invalid response from OpenAI API: No choices found.");
    }
    let classification = data.choices[0].message.content.trim();
    
    if (classification !== "Policy" && classification !== "Resume") {
      console.warn(
        `Unexpected classification result: "${classification}". Returning null.`
      );
      return null;
    }

    console.log(`Step 2.2: Classified question as "${classification}"`);
    return classification;
  }

  async function generateQuestionEmbedding(question) {
    console.log("Step 2: Embedding text using OpenAI...");
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: question,
      }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    if (!data.data || data.data.length === 0) {
        throw new Error("Invalid response from OpenAI API: No embedding data found.");
    }

    const embedding = data.data[0].embedding;
    console.log(
      `Step 3: Embedding data: {*embedding data of length ${embedding.length}*}`
    );
    return embedding;
  }

  async function searchWeaviate(vector, classification) {
    console.log(
      `Step 4: Searching Weaviate with the embedding vector for classification: ${classification}...`
    );
    const className =
      classification === "Policy" ? "TestPolicyUpload" : "ApplicantCV";
    const topK = 5;

    const query = `
      query {
        Get {
          ${className}(
            nearVector: { vector: ${JSON.stringify(vector)} }
            limit: ${topK}
          ) {
            description
            instanceID
            requesterName
            requesterEmail
            pdfFileId
            content
            chunkIndex
            chunkCount
            source
            chunkId
            _additional { distance }
          }
        }
      }
    `;

    const response = await fetch(`${WEAVIATE_ENDPOINT}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.REACT_APP_WEAVIATE_API_KEY}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Weaviate API error: ${response.status} ${response.statusText} - ${errorData}`);
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(`Weaviate search failed: ${JSON.stringify(result.errors)}`);
    }

    const documents = result.data.Get[className] || [];
    console.log(`Step 5: Found ${documents.length} documents in Weaviate`);
    return documents;
  }

  async function generateAnswer(context, question, chatHistory) {
    console.log("Step 7: Generating answer with context using OpenAI...");
    const systemPrompt = `You are a helpful AI assistant. Your task is to answer the user's question based on the provided context and chat history. 
    Synthesize the information from the documents to provide a comprehensive and natural-sounding answer. 
    If the information is not in the context, say that you couldn't find the information. Do not make up information. 
    Maintain a conversational and friendly tone. 
    Format your answers using Markdown for readability (bold, italics, lists, etc.).
    If the user's question is a follow-up to a previous question, use the chat history to understand the context of the conversation.`;
    const userPrompt = `Question: ${question}\n\nContext:\n${context}`;

    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role,
      content: msg.text
    }));

    const messages = [
      { role: "system", content: systemPrompt },
      ...formattedHistory,
      { role: "user", content: userPrompt },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        messages: messages,
      }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
        throw new Error("Invalid response from OpenAI API: No choices found.");
    }
    const answer = data.choices[0].message.content.trim();
    console.log(`Step 8: Generated answer: "${answer}"`);
    return answer;
  }

  return (
    <div className="App">
      <div className="chat-header">AI Assistant</div>
      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-bubble ${msg.sender}-message`}>
              <div className="message-text">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={sendMessage} className="chat-input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isTyping}
          />
          <button type="submit" disabled={isTyping}>
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
      </div>
    </div>
  );
}

export default App;
