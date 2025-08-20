import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
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
    if (input.trim() === '') return;

    const userMessage = { text: input, sender: 'user', role: 'user' };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    const aiResponse = await fetchAIResponse(input, newMessages.slice(0, -1)); // Pass chat history
    setMessages((prevMessages) => [...prevMessages, aiResponse]);
    setIsTyping(false);
  };

  const fetchAIResponse = async (query, chatHistory) => {
    try {
      const response = await fetch('http://localhost:8080/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: query, chatHistory }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      return {
        text: data.answer,
        sender: 'ai',
        role: 'assistant',
        citations: data.citations,
      };
    } catch (error) {
      console.error("Error fetching from backend:", error);
      return {
        text: "There was an error connecting to the knowledge base. Please try again later.",
        sender: 'ai',
        role: 'assistant',
      };
    }
  };

  return (
    <div className="App">
      <div className="chat-header">AI Assistant</div>
      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-bubble ${msg.sender}-message`}>
              <div className="message-text">{msg.text}</div>
              {msg.citations && msg.citations.length > 0 && (
                <div className="citations">
                  <strong>Sources:</strong>
                  <ul>
                    {msg.citations.map((citation) => (
                      <li key={citation.index}>
                        <a href={citation.source} target="_blank" rel="noopener noreferrer">
                          {citation.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
