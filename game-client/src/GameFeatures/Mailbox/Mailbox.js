import API_BASE from '../../config';
import axios from 'axios';
import React, { useState, useEffect, useContext } from 'react';
import { StatusBarContext } from '../../UI/StatusBar';
import Modal from '../../UI/Modal';
import './Mailbox.css';

function Mailbox({ onClose, currentPlayer, setCurrentPlayer, resources }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const { updateStatus } = useContext(StatusBarContext);
  const [markedReadIds, setMarkedReadIds] = useState([]);

  console.log('currentPlayer = ',currentPlayer);
  
  useEffect(() => {
  const fetchTemplatesAndMessages = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/messages`);
      const templates = await response.json();
      setTemplates(templates);
      setLoading(false);

      const res = await axios.get(`${API_BASE}/api/player/${currentPlayer.playerId}`);
      const freshMessages = res.data.messages || [];

      const unreadMessages = freshMessages.filter(msg => !msg.read);

      if (unreadMessages.length > 0) {
        const updatedMessages = freshMessages.map(msg =>
          !msg.read ? { ...msg, read: true } : msg
        );

        // Save only to the DB — don't update local state yet
        await axios.post(`${API_BASE}/api/update-player-messages`, {
          playerId: currentPlayer.playerId,
          messages: updatedMessages,
        });

        // Track which ones we updated
        setMarkedReadIds(unreadMessages.map(msg => msg.messageId));
      }

      // Still show original messages (not visually marked as read yet)
      setCurrentPlayer(prev => ({ ...prev, messages: freshMessages }));

    } catch (err) {
      console.error("❌ Error fetching or updating mailbox data:", err);
    }
  };

  fetchTemplatesAndMessages();
}, []);


  const handleCollect = async (message) => {
    try {
      const template = templates.find((t) => t.id === message.messageId);
      const rewards = message.rewards?.length > 0 ? message.rewards : template.rewards;
      const updatedInventory = [...currentPlayer.inventory];

      // Apply rewards
      rewards.forEach(({ item, qty }) => {
        const index = updatedInventory.findIndex((inv) => inv.type === item);
        if (index !== -1) {
          updatedInventory[index].quantity += qty;
        } else {
          updatedInventory.push({ type: item, quantity: qty });
        }
      });

      // Update server-side inventory
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
      });

      // Remove the message from the player's messages array
      const updatedMessages = currentPlayer.messages.filter((m) => m !== message);
      await axios.post(`${API_BASE}/api/update-player-messages`, {
        playerId: currentPlayer.playerId,
        messages: updatedMessages,
      });

      // Update client-side state
      setCurrentPlayer((prev) => ({
        ...prev,
        inventory: updatedInventory,
        messages: updatedMessages,
      }));

      updateStatus(`✅ Collected rewards from "${template.title}"`);
    } catch (err) {
      console.error("❌ Error collecting rewards:", err);
      updateStatus("❌ Failed to collect rewards.");
    }
  };

  const getSymbol = (type) => {
    return resources.find(r => r.type === type)?.symbol || "";
  };


const renderRewards = (rewards) => {
  if (!rewards || rewards.length === 0) return null;
  return (
    <div className="reward-summary">
      {rewards.map((r, idx) => (
        <span key={idx} className="reward-item">
          {getSymbol(r.item)} {r.qty} {r.item}
        </span>
      ))}
    </div>
  );
};

  // Prevent error if player or messages are not loaded
  if (!currentPlayer || !Array.isArray(currentPlayer.messages)) {
    return (
      <Modal onClose={onClose} title="📬 Mailbox" message="No messages available." />
    );
  }

  const deleteMessage = async (playerId, messageIndex) => {
    try {
      const updatedMessages = [...currentPlayer.messages];
      updatedMessages.splice(messageIndex, 1); // Remove the one at this index only
    
      await axios.post(`${API_BASE}/api/update-player-messages`, {
        playerId,
        messages: updatedMessages,
      });
  
      setCurrentPlayer((prev) => ({
        ...prev,
        messages: updatedMessages,
      }));
  
      updateStatus("🗑️ Message deleted.");
    } catch (error) {
      console.error("❌ Error deleting message:", error);
      updateStatus("❌ Failed to delete message.");
    }
  };

  const handleClose = () => {
    console.log("📭 Closing mailbox");
    setMarkedReadIds([]); // clear visual state
    onClose();            // call parent-provided close
  };


  return (
    <Modal onClose={handleClose} title="📬 Mailbox" className="mailbox-modal">
      {loading ? (
        <p>Loading messages...</p>
      ) : currentPlayer.messages.length === 0 ? (
        <p>Your mailbox is empty.</p>
      ) : (
        currentPlayer.messages.map((msg, index) => {
          const template = templates.find((t) => t.id === msg.messageId);

          if (!template) {
            console.warn(`📭 No template found for messageId: ${msg.messageId}`);
            return null;
          }

          const rewards = (msg.rewards && msg.rewards.length > 0)
            ? msg.rewards
            : template.rewards;

          return (
            <div key={index} className="mailbox-message">
              {/* Left side: message content */}
              <div className="message-left">
                <h3>
                  {template.title}
                  {(!msg.read || markedReadIds.includes(msg.messageId)) && (
                    <span className="unread-tag">🆕</span>
                  )}
                </h3>
                <p className="message-body">{template.body}</p>
                <p className="mailbox-timestamp">
                  Received: {new Date(msg.timestamp).toLocaleString()}
                </p>
              </div>

              {/* Right side: reward line + buttons */}
              <div className="message-actions">
                {rewards?.length > 0 && renderRewards(rewards)}

                <div className="button-row">
                  {rewards?.length > 0 && (
                    <button className="collect-btn" onClick={() => handleCollect(msg)}>
                      Collect
                    </button>
                  )}
                  <button
                    className="delete-btn"
                    title="Delete"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this message?")) {
                        deleteMessage(currentPlayer.playerId, index);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </Modal>
  );
}

export default Mailbox;