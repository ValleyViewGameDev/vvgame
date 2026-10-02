import React, { useState, useEffect, useRef } from 'react';
import socket, { emitChatMessage, socketListenForChatMessages } from '../../socketManager';
import { updateBadge } from '../../Utils/appUtils';
import './Chat.css';
import API_BASE from '../../config';

const Chat = ({ currentGridId, currentSettlementId, currentFrontierId, currentPlayer, onClose }) => {

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const endRef = useRef(null);
  const playerId = currentPlayer?._id || 'unknown'; // Fallback if currentPlayer is not available

  useEffect(() => {
    console.log("🟨 Chat component mounted with frontierId:", currentFrontierId);

    // ✅ Join the settlement + frontier chat rooms (no grid-scoped chat)
    if (socket && socket.connected && currentFrontierId) {
      console.log("📡 Joining chat rooms from Chat.js");
      socket.emit('join-chat-rooms', {
        settlementId: currentSettlementId || null,
        frontierId: currentFrontierId,
      });
    } else {
      console.warn("⚠️ Socket not connected or no frontierId when Chat mounted.");
    }

    // ✅ Clear chat badge on open
    if (currentPlayer) {
      updateBadge(currentPlayer, () => {}, 'chat', false ?? true);
    }
  }, [currentFrontierId, currentSettlementId]);

  useEffect(() => {
    // Single subscriber for receive-chat-message; cleanup removes this exact handler.
    const handleChatMessage = (msg) => {
      // Only show frontier messages
      if (msg.scope !== 'frontier') return;

      if (!msg.username && currentPlayer?.username) {
        msg.username = currentPlayer.username;
      }
      console.log("📨 Received chat message via socket:", msg);
      setMessages(prev => [...prev, msg]);
    };

    const cleanup = socketListenForChatMessages(handleChatMessage);
    return () => { cleanup?.(); };
  }, [currentPlayer?.username]);


useEffect(() => {
  const fetchMessages = async () => {
    if (!currentFrontierId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/chat/frontier/${currentFrontierId}`);
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error("Failed to fetch chat history:", err);
    }
  };

  fetchMessages();
}, [currentFrontierId]);


  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  const handleSend = (e) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !currentFrontierId) return;

    console.log("📨 Sending chat message:", trimmed);

    emitChatMessage({
      playerId,
      username: currentPlayer?.username || 'unknown',
      message: trimmed,
      scope: 'frontier',
      scopeId: currentFrontierId
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
      <h3>💬 Chat</h3>
      <button className="chat-close-button" onClick={onClose}>✖</button>
    </div>

    <div className="chat-panel">
        <div className="chat-messages">
        {messages.map((msg, i) => (
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
            placeholder="Message everyone..."
        />
        <button type="button" onClick={handleSend}>Send</button>
        </div>

    </div>
    </div>
  );
};

export default Chat;