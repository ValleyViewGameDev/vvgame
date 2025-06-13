import React, { useState, useEffect, useRef } from 'react';
import socket from '../../socketManager';
import { emitChatMessage } from '../../socketManager';
import './Chat.css';

const TABS = ['Grid', 'Settlement', 'Frontier'];

const Chat = ({ currentGridId, currentSettlementId, currentFrontierId, currentPlayer }) => {

  const [activeTab, setActiveTab] = useState('Grid');
  const [messages, setMessages] = useState({ Grid: [], Settlement: [], Frontier: [] });
  const [inputText, setInputText] = useState('');
  const endRef = useRef(null);
  const playerId = currentPlayer?._id || 'unknown'; // Fallback if currentPlayer is not available

  useEffect(() => {
    if (!socket) return;

    socket.on('receive-chat-message', (msg) => {
        setMessages(prev => {
          const key = msg.scope === 'grid' ? 'Grid' : msg.scope === 'settlement' ? 'Settlement' : 'Frontier';
          return {
            ...prev,
            [key]: [...prev[key], msg],
          };
        });
    });

    return () => {
        socket.off('receive-chat-message');
    };
    }, [socket]);


useEffect(() => {
  const fetchMessages = async () => {
    const scope = activeTab.toLowerCase();
    const scopeId =
      scope === 'grid' ? currentGridId :
      scope === 'settlement' ? currentSettlementId :
      currentFrontierId;

    if (!scopeId) return;

    try {
      const res = await fetch(`/api/chat/${scope}/${scopeId}`);
      const data = await res.json();
      setMessages(prev => ({
        ...prev,
        [activeTab]: data,
      }));
    } catch (err) {
      console.error("Failed to fetch chat history:", err);
    }
  };

  fetchMessages();
}, [activeTab, currentGridId, currentSettlementId, currentFrontierId]);


  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  const handleSend = (e) => {
    console.log("📨 Form submitted");
    e.preventDefault();
    console.log("📨 Sending chat message:", inputText)  ;
    if (!inputText.trim()) return;
    const newMessage = {
      id: Date.now(),
      sender: currentPlayer?.username || playerId,
      text: inputText.trim(),
    };
    setMessages(prev => ({
      ...prev,
      [activeTab]: [...prev[activeTab], newMessage],
    }));
    setInputText('');
    // TODO: emit message via socket to server here
    const scope = activeTab.toLowerCase();
    const scopeId =
      scope === 'grid' ? currentGridId :
      scope === 'settlement' ? currentSettlementId :
      currentFrontierId;

    console.log("📨 Sending chat message:", {
        text: inputText.trim(),
        scope: activeTab.toLowerCase(),
        scopeId: currentGridId || currentSettlementId || currentFrontierId,
    });

    emitChatMessage({
      playerId,
      username: currentPlayer?.username || 'unknown',
      message: inputText.trim(),
      scope,
      scopeId,
    });

  };

  const handleKeyPress = (e) => {
    console.log("📨 Key pressed:", e.key);
    if (e.key === 'Enter') handleSend();
  };

return (
    <div className="chat-panel">
        <h2>Chat - {activeTab}</h2>
      <div className="chat-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={tab === activeTab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="chat-messages">
        {messages[activeTab].map(msg => (
          <div key={msg.id} className="chat-message">
            <strong>{msg.sender}</strong>: {msg.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

<div className="chat-input">
  <input
    type="text"
    value={inputText}
    onChange={e => setInputText(e.target.value)}
    onKeyDown={handleKeyPress}
    placeholder={`Message ${activeTab}...`}
  />
  <button type="button" onClick={handleSend}>Send</button>
</div>

    </div>
  );
};

export default Chat;