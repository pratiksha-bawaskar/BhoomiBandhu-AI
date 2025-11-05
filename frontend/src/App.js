import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import axios from 'axios';
import { Leaf, Send, Mic, Share2, Globe, Trash2, MessageCircle, Sprout, Sun } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [language, setLanguage] = useState('english');
  const [sessionId, setSessionId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quickTips, setQuickTips] = useState([]);
  const [presetQuestions, setPresetQuestions] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Initialize session ID on mount
  useEffect(() => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    loadQuickTips();
    loadPresetQuestions();
    initializeSpeechRecognition();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load quick tips and preset questions when language changes
  useEffect(() => {
    loadQuickTips();
    loadPresetQuestions();
  }, [language]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadQuickTips = async () => {
    try {
      const response = await axios.get(`${API}/quick-tips?language=${language}`);
      setQuickTips(response.data);
    } catch (error) {
      console.error('Error loading quick tips:', error);
    }
  };

  const loadPresetQuestions = async () => {
    try {
      const response = await axios.get(`${API}/preset-questions?language=${language}`);
      setPresetQuestions(response.data);
    } catch (error) {
      console.error('Error loading preset questions:', error);
    }
  };

  const initializeSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = language === 'hindi' ? 'hi-IN' : 'en-IN';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  };

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Voice input is not supported in your browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.lang = language === 'hindi' ? 'hi-IN' : 'en-IN';
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const sendMessage = async (messageText = null) => {
    const textToSend = messageText || inputMessage;
    if (!textToSend.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API}/chat`, {
        session_id: sessionId,
        message: textToSend,
        language: language
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.data.response,
        timestamp: response.data.timestamp
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: language === 'hindi' 
          ? 'क्षमा करें, कुछ गलत हो गया। कृपया पुनः प्रयास करें।'
          : 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePresetQuestion = (question) => {
    sendMessage(question);
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'english' ? 'hindi' : 'english');
  };

  const clearChat = async () => {
    if (window.confirm(language === 'hindi' ? 'क्या आप चैट साफ करना चाहते हैं?' : 'Are you sure you want to clear the chat?')) {
      try {
        await axios.delete(`${API}/chat/session/${sessionId}`);
        setMessages([]);
        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionId(newSessionId);
      } catch (error) {
        console.error('Error clearing chat:', error);
      }
    }
  };

  const shareLastMessage = () => {
    if (messages.length === 0) return;
    
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMessage) return;

    const text = `BhoomiBandhu says:\n\n${lastAssistantMessage.content}\n\nShared from BhoomiBandhu - Your Farming Assistant`;
    
    if (navigator.share) {
      navigator.share({
        title: 'BhoomiBandhu Response',
        text: text
      }).catch(err => console.log('Error sharing:', err));
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(text).then(() => {
        alert(language === 'hindi' ? 'क्लिपबोर्ड में कॉपी किया गया!' : 'Copied to clipboard!');
      });
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="app-container" data-testid="bhoomi-bandhu-app">
      {/* Header */}
      <header className="app-header" data-testid="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-icon">
              <Leaf size={28} />
            </div>
            <div>
              <h1 className="app-title">BhoomiBandhu</h1>
              <p className="app-subtitle">
                {language === 'hindi' ? 'आपका खेती सहायक' : 'Your Farming Assistant'}
              </p>
            </div>
          </div>
          <div className="header-actions">
            <button 
              onClick={toggleLanguage} 
              className="icon-btn"
              title={language === 'hindi' ? 'Switch to English' : 'हिंदी में बदलें'}
              data-testid="language-toggle-btn"
            >
              <Globe size={20} />
              <span className="btn-text">{language === 'hindi' ? 'En' : 'हि'}</span>
            </button>
            <button 
              onClick={() => setShowTips(!showTips)} 
              className="icon-btn"
              title={language === 'hindi' ? 'त्वरित सुझाव' : 'Quick Tips'}
              data-testid="quick-tips-toggle-btn"
            >
              <Sun size={20} />
            </button>
            <button 
              onClick={clearChat} 
              className="icon-btn"
              title={language === 'hindi' ? 'चैट साफ करें' : 'Clear Chat'}
              data-testid="clear-chat-btn"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </header>

      <div className="main-content">
        {/* Quick Tips Sidebar */}
        {showTips && (
          <aside className="tips-sidebar" data-testid="quick-tips-sidebar">
            <div className="tips-header">
              <Sprout size={20} />
              <h3>{language === 'hindi' ? 'त्वरित सुझाव' : 'Quick Tips'}</h3>
            </div>
            <div className="tips-list">
              {quickTips.map(tip => (
                <div key={tip.id} className="tip-card" data-testid={`tip-${tip.id}`}>
                  <h4>{tip.title}</h4>
                  <p>{tip.description}</p>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Chat Area */}
        <main className="chat-area">
          {/* Welcome Message */}
          {messages.length === 0 && (
            <div className="welcome-section" data-testid="welcome-section">
              <div className="welcome-icon">
                <Leaf size={64} />
              </div>
              <h2>{language === 'hindi' ? 'नमस्ते किसान भाई!' : 'Namaste, Farmer Friend!'}</h2>
              <p>
                {language === 'hindi' 
                  ? 'मैं भूमिबंधु हूं, आपका विश्वसनीय खेती सहायक। खेती, फसल, सरकारी योजनाओं के बारे में पूछें।'
                  : "I'm BhoomiBandhu, your trusted farming assistant. Ask me about farming, crops, government schemes, and more."}
              </p>
              
              {/* Preset Questions */}
              <div className="preset-questions" data-testid="preset-questions">
                <h3>{language === 'hindi' ? 'लोकप्रिय सवाल:' : 'Popular Questions:'}</h3>
                <div className="questions-grid">
                  {presetQuestions.map(q => (
                    <button
                      key={q.id}
                      onClick={() => handlePresetQuestion(q.question)}
                      className="preset-btn"
                      data-testid={`preset-question-${q.id}`}
                    >
                      <MessageCircle size={16} />
                      <span>{q.question}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="messages-container" data-testid="messages-container">
            {messages.map((message, index) => (
              <div 
                key={index} 
                className={`message ${message.role}`}
                data-testid={`message-${message.role}-${index}`}
              >
                <div className="message-content">
                  {message.role === 'assistant' && (
                    <div className="message-icon">
                      <Leaf size={20} />
                    </div>
                  )}
                  <div className="message-bubble">
                    <p>{message.content}</p>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant" data-testid="loading-indicator">
                <div className="message-content">
                  <div className="message-icon">
                    <Leaf size={20} />
                  </div>
                  <div className="message-bubble loading">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="input-area" data-testid="chat-input-area">
            <div className="input-container">
              <button
                onClick={toggleVoiceInput}
                className={`voice-btn ${isListening ? 'listening' : ''}`}
                title={language === 'hindi' ? 'बोलकर टाइप करें' : 'Voice Input'}
                data-testid="voice-input-btn"
              >
                <Mic size={20} />
              </button>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={language === 'hindi' ? 'अपना सवाल यहाँ लिखें...' : 'Type your question here...'}
                disabled={isLoading}
                className="message-input"
                data-testid="message-input"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!inputMessage.trim() || isLoading}
                className="send-btn"
                title={language === 'hindi' ? 'भेजें' : 'Send'}
                data-testid="send-message-btn"
              >
                <Send size={20} />
              </button>
              {messages.length > 0 && (
                <button
                  onClick={shareLastMessage}
                  className="share-btn"
                  title={language === 'hindi' ? 'शेयर करें' : 'Share'}
                  data-testid="share-message-btn"
                >
                  <Share2 size={20} />
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
