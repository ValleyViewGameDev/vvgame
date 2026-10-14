import API_BASE from '../../config';
import axios from 'axios';
import React, { useState, useEffect, useContext } from 'react';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import Modal from '../../UI/Modals/Modal';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import '../../UI/Buttons/SharedButtons.css';
import './Mailbox.css';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { loadMasterResources } from '../../Utils/TuningManager';
import { updateBadge } from '../../Utils/appUtils';
import { useStrings } from '../../UI/StringsContext';
import soundManager from '../../Sound/SoundManager';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
import FloatingTextManager from '../../UI/FloatingText';

function Mailbox({ 
  onClose, 
  inventory,
  setInventory, 
  backpack, 
  setBackpack,
  currentPlayer, 
  setCurrentPlayer, 
  resources,
  updateStatus,
  masterResources,
}) {
  const strings = useStrings();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markedReadIds, setMarkedReadIds] = useState([]);
  const gridId = currentPlayer?.location?.g;
  const [visibleMessages, setVisibleMessages] = useState(currentPlayer?.messages || []);

  useEffect(() => {
    if (Array.isArray(currentPlayer?.messages)) {
      setVisibleMessages(currentPlayer.messages);
    }
  }, [currentPlayer?.messages]);
 
  useEffect(() => {
  const fetchTemplatesAndMessages = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/messages`);
      const templates = await response.json();
      setTemplates(templates);
      updateBadge(currentPlayer, () => {}, 'mailbox', false); // 🧼 Clear badge
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
      setVisibleMessages(freshMessages);

    } catch (err) {
      console.error("❌ Error fetching or updating mailbox data:", err);
    }
  };
  fetchTemplatesAndMessages();
}, []);


  // Where a collected reward flies (UI/FlyToTarget.js): Money to the money counter, Gems to the gem
  // counter, XP to the Level bar, any other resource you can hold (a doober) to Inventory; skills,
  // powers and the like just rise and fade
  const flyTargetFor = (item) => {
    if (item === 'Money') return 'money';
    if (item === 'Gem') return 'gems';
    if (item === 'XP') return 'xp';
    const def = (masterResources || resources || []).find((r) => r.type === item);
    return def?.category === 'doober' ? 'inventory' : null;
  };

  // On the tap (house rule: never wait for the server to react): each reward pops up over the
  // message's reward line, one after another, and flies into its header counter
  const showCollectFloats = (messageIndex) => {
    const msg = visibleMessages[messageIndex];
    const template = templates.find((t) => t.id === msg?.messageId);
    const rewards = (msg?.rewards?.length ? msg.rewards : template?.rewards) || [];
    const anchor = document.querySelector(`[data-mail-index="${messageIndex}"] .reward-summary`)
      || document.querySelector(`[data-mail-index="${messageIndex}"]`);
    if (!anchor || !rewards.length) return;
    const r = anchor.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    rewards.forEach((reward, i) => {
      setTimeout(() => {
        FloatingTextManager.addFloatingTextAt(
          `+${Number(reward.qty || 0).toLocaleString()} ${getSymbol(reward.item) || reward.item}`,
          cx + ((i % 3) - 1) * 26, cy - 6 + Math.floor(i / 3) * 22,
          { flyTo: flyTargetFor(reward.item) }
        );
      }, i * 180);
    });
  };

  // Protected function to collect mailbox rewards using transaction system
  const handleCollect = async (transactionId, transactionKey, messageIndex) => {
    console.log(`🔒 [PROTECTED MAILBOX] Starting protected collection for message ${messageIndex}`);
    showCollectFloats(messageIndex);
    soundManager.playSFX('collect_money');

    try {
      const response = await axios.post(`${API_BASE}/api/mailbox/collect-rewards`, {
        playerId: currentPlayer.playerId,
        messageIndex,
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        // Update local state with server response
        const { messages, inventory, backpack, skills, powers, relocations, xp, collectedItems } = response.data;

        // Update all player data from server response
        setCurrentPlayer(prev => ({
          ...prev,
          messages: messages || prev.messages,
          inventory: inventory || prev.inventory,
          backpack: backpack || prev.backpack,
          skills: skills || prev.skills,
          powers: powers || prev.powers,
          relocations: relocations !== undefined ? relocations : prev.relocations,
          xp: xp !== undefined ? xp : prev.xp
        }));

        // Update local state
        if (inventory) setInventory(inventory);
        if (backpack) setBackpack(backpack);
        setVisibleMessages(messages || []);

        // Handle quest progress tracking for skills
        if (skills && collectedItems) {
          for (const item of collectedItems) {
            const match = item.match(/(\d+)\s+(.+)/);
            if (match) {
              const [, qty, skillType] = match;
              if (skills.some(s => s.type === skillType)) {
                await trackQuestProgress(currentPlayer, 'Acquire', skillType, parseInt(qty), setCurrentPlayer);
              }
            }
          }
        }

        // Refresh player data to ensure consistency
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        updateStatus(`Collected rewards: ${collectedItems.join(', ')}`);
        // FTUE: the welcome gift collected is the beat before the avatar picker (tuning/FTUEsteps.json)
        tryAdvanceFTUEByTrigger('CollectedMail', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
        // That was the last message: close rather than show the empty state
        if (!(messages || []).length) handleClose();
      }
    } catch (error) {
      console.error('Error in protected mailbox collection:', error);
      if (error.response?.status === 429) {
        updateStatus(471);
      } else {
        updateStatus('❌ Failed to collect rewards');
      }
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
      <Modal onClose={onClose} title={strings[1606]} message="No messages available." />
    );
  }

  // messageIndex is the index in the STORED order (visibleMessages), not the on-screen order:
  // the list renders newest first, so callers un-reverse the row index the way handleCollect does.
  const deleteMessage = async (playerId, messageIndex) => {
    try {
      const updatedMessages = [...visibleMessages];
      updatedMessages.splice(messageIndex, 1); // Remove the one at this index only
    
      await axios.post(`${API_BASE}/api/update-player-messages`, {
        playerId,
        messages: updatedMessages,
      });
  
      setVisibleMessages(updatedMessages);
      setCurrentPlayer((prev) => ({
        ...prev,
        messages: updatedMessages,
      }));
  
      updateStatus(1607);
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
    <Modal onClose={handleClose} title={strings[1606]} className="mailbox-modal">
      {loading && visibleMessages.length === 0 ? (
        <p>{strings[1601]}</p>
      ) : visibleMessages.length === 0 ? (
        <p>{strings[1602]}</p>
      ) : (
        [...visibleMessages].reverse().map((msg, index) => {
          const template = templates.find((t) => t.id === msg.messageId);

          if (!template) {
            console.warn(`📭 No template found for messageId: ${msg.messageId}`);
            return null;
          }

          const rewards = (msg.rewards && msg.rewards.length > 0)
            ? msg.rewards
            : template.rewards;

          return (
            <div key={index} className="mailbox-message" data-mail-index={visibleMessages.length - 1 - index}>
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
                  {strings[1603]}: {new Date(msg.timestamp).toLocaleString()}
                </p>
              </div>

              {/* Right side: reward line + buttons */}
              <div className="message-actions">
                {rewards?.length > 0 && renderRewards(rewards)}

                <div className="shared-buttons" style={{ display: 'flex', gap: '8px' }}>
                  {rewards?.length > 0 && (
                    <TransactionButton
                      className="btn-basic btn-success btn-modal-small"
                      transactionKey={`mailbox-collect-${msg.messageId}-${visibleMessages.length - 1 - index}`}
                      onAction={(transactionId, transactionKey) => handleCollect(transactionId, transactionKey, visibleMessages.length - 1 - index)}
                    >
                      {strings[1604]} 
                    </TransactionButton>
                  )}
                  <button
                    className="btn-basic btn-neutral btn-modal-small"
                    style={{ width: '40px', backgroundColor: 'var(--color-btn-active)' }}
                    title="Delete"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this message?")) {
                        deleteMessage(currentPlayer.playerId, visibleMessages.length - 1 - index); // rows are newest-first
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
      <p>{strings[1605]}</p>
    </Modal>
  );
}

export default Mailbox;