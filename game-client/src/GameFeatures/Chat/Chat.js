import React, { useState, useEffect, useRef } from 'react';
import socket from '../../socketManager';
import { emitChatMessage } from '../../socketManager';
import './Chat.css';
import API_BASE from '../../config';

const TABS = ['Grid', 'Settlement', 'Frontier'];

const Chat = ({ currentGridId, currentSettlementId, currentFrontierId, currentPlayer, onClose }) => {

  const [activeTab, setActiveTab] = useState('Grid');
  const [messages, setMessages] = useState({ Grid: [], Settlement: [], Frontier: [] });
  const [inputText, setInputText] = useState('');
  const endRef = useRef(null);
  const playerId = currentPlayer?._id || 'unknown'; // Fallback if currentPlayer is not available

  useEffect(() => {
    console.log("🟨 Chat component mounted with props:", currentGridId, currentSettlementId, currentFrontierId);

    // ✅ Delay room join until component is mounted
    if (socket && socket.connected) {
        console.log("📡 Joining chat rooms from Chat.js");
        socket.emit('join-chat-rooms', {
        gridId: currentGridId,
        settlementId: currentSettlementId,
        frontierId: currentFrontierId,
        });
    } else {
        console.warn("⚠️ Socket not connected when Chat mounted.");
    }

    // ... your socket.on('receive-chat-message') goes here
    }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('receive-chat-message', (msg) => {
      if (msg.emitterId === socket.id) {
        console.log("📭 Ignoring self-echoed message");
        return;
      }        
      if (!msg.username && currentPlayer?.username) {
          msg.username = currentPlayer.username;
        }
        console.log("📨 Received chat message via socket:", msg); // 🔍
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
      const res = await fetch(`${API_BASE}/api/chat/${scope}/${scopeId}`);
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
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const scope = activeTab.toLowerCase();
    const scopeId =
      scope === 'grid' ? currentGridId :
      scope === 'settlement' ? currentSettlementId :
      currentFrontierId;

    console.log("📨 Sending chat message:", trimmed);

    emitChatMessage({
      playerId,
      username: currentPlayer?.username || 'unknown',
      message: trimmed, // ✅ use the captured value
      scope,
      scopeId,
    });

    setMessages(prev => {
  const key = activeTab;
  return {
    ...prev,
    [key]: [
      ...prev[key],
      {
        id: Date.now(), // fake ID
        playerId,
        username: currentPlayer?.username || 'unknown',
        message: trimmed,
        scope,
        scopeId,
        timestamp: new Date(),
        emitterId: socket.id,
      },
    ],
  };
});

    setInputText(''); // ✅ clear input after emitting
  };

  const handleKeyPress = (e) => {
    console.log("📨 Key pressed:", e.key);
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevents default Enter behavior in input
      handleSend(e); // Pass the actual event to handleSend
    }
  };

return (
    <div className="chat-container">

    <div className="chat-panel-header">
      <h2>Chat ({activeTab})</h2>
      <button className="chat-close-button" onClick={onClose}>✖</button>
    </div>

    <div className="chat-panel">
      
        <div className="chat-tabs">
            {TABS.map(tab => (
            <button
                key={tab}
                className={`chat-tab ${tab === activeTab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
            >
                {tab}
            </button>
            ))}
        </div>

        <div className="chat-messages">
        {messages[activeTab].map((msg, i) => (
            <div key={msg.id || i} className="chat-message">
              <strong>{msg.username || '???'}</strong>: {msg.message || '[empty]'}
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
    </div>
  );
};

export default Chat;