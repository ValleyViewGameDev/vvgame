import API_BASE from '../../config';
import axios from 'axios';
import React, { useState, useEffect, useContext } from 'react';
import { StatusBarContext } from '../../UI/StatusBar';
import Modal from '../../UI/Modal';
import '../../UI/SharedButtons.css';
import './Mailbox.css';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { loadMasterResources } from '../../Utils/TuningManager';
import { updateBadge } from '../../Utils/appUtils';
import { useStrings } from '../../UI/StringsContext';

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
}) {
  const strings = useStrings();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markedReadIds, setMarkedReadIds] = useState([]);
  const gridId = currentPlayer?.location?.g;
  const [masterResources, setMasterResources] = useState([]);
  const [visibleMessages, setVisibleMessages] = useState(currentPlayer?.messages || []);

  useEffect(() => {
    const fetchMasterResources = async () => {
      const all = await loadMasterResources();
      setMasterResources(all);
    };
    fetchMasterResources();
  }, []);

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


  const handleCollect = async (message) => {
    try {
      const template = templates.find((t) => t.id === message.messageId);
      const rewards = message.rewards?.length > 0 ? message.rewards : template.rewards;

      console.log("🎁 Rewards from message:", rewards);

      // Categorize rewards
      const tents = [];
      const relocations = [];
      const skills = [];
      const powers = [];
      const doobers = [];
      const others = [];

      rewards.forEach(({ item, qty }) => {
        // Find resource metadata, or fallback for special items
        const resourceMeta = resources.find(r => r.type === item) || {};
        // Fallback category for Relocation and others
        const category = resourceMeta.category || (item === 'Relocation' ? 'relocations' : 'other');
        console.log("resourceMeta = ", resourceMeta);
        console.log("Category = ", category);

        switch (category) {
          case 'skill':
          case 'upgrade':
            skills.push({ item, qty });
            break;
          case 'power':
            powers.push({ item, qty });
            break;
          case 'doober':
          case 'special':
            doobers.push({ item, qty });
            break;
          case 'tents':
            tents.push({ item, qty });
            break;
          case 'relocations':
            relocations.push({ item, qty });
            break;
          default:
            others.push({ item, qty });
        }
      });

      // Handle non-special rewards (others), including Tents as special case
      tents.forEach(({ item, qty }) => {
        if (item === "Tent") {
          const index = backpack.findIndex(b => b.type === item);
          if (index !== -1) {
            backpack[index].quantity += qty;
          } else {
            backpack.push({ type: item, quantity: qty });
          }
          return;
        }
        const index = inventory.findIndex(i => i.type === item);
        if (index !== -1) {
          inventory[index].quantity += qty;
        } else {
          inventory.push({ type: item, quantity: qty });
        }
      });

      relocations.forEach(({ item, qty }) => {
        if (item === "Relocation") {
          console.log("Item is Relocation.");
          const currentQty = currentPlayer.relocations || 0;
          const newQty = currentQty + qty;
          console.log("currentQty = ",currentQty,"; newQty = ",newQty);
          axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { relocations: newQty },
          });
          setCurrentPlayer(prev => ({ ...prev, relocations: newQty }));
        }
      });

      // Update inventory and backpack
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory,
        backpack,
      });


      // Handle doobers: add directly to inventory
      const updatedInventory = [...inventory];
      doobers.forEach(({ item, qty }) => {
        const index = updatedInventory.findIndex((inv) => inv.type === item);
        if (index !== -1) {
          updatedInventory[index].quantity += qty;
        } else {
          updatedInventory.push({ type: item, quantity: qty });
        }
      });
      if (doobers.length > 0) {
        await axios.post(`${API_BASE}/api/update-inventory`, {
          playerId: currentPlayer.playerId,
          inventory: updatedInventory,
        });
        setInventory(updatedInventory);
      }

      // Handle skills
      const existingSkills = currentPlayer.skills || [];
      let newSkills = [...existingSkills];

      for (const skillReward of skills) {
        const skillType = skillReward.item;
        const qtyToAdd = skillReward.qty;
        const alreadyHasSkill = existingSkills.some(s => s.type === skillType);
        if (alreadyHasSkill) {
          console.log(`⏭️ Player already has skill: ${skillType}, skipping.`);
          continue;
        }
        newSkills.push({ type: skillType, quantity: qtyToAdd });
        await trackQuestProgress(currentPlayer, 'Gain skill with', skillType, qtyToAdd, setCurrentPlayer);
      }
      if (newSkills.length > existingSkills.length) {
        await axios.post(`${API_BASE}/api/update-skills`, {
          playerId: currentPlayer.playerId,
          skills: newSkills,
        });
        setCurrentPlayer(prev => ({ ...prev, skills: newSkills }));
      }

      // Handle powers
      for (const powerReward of powers) {
        const powerType = powerReward.item;
        console.log(`💥 Processing power reward: ${powerType}`);

        const qtyToAdd = powerReward.qty;
        const alreadyHasPower = currentPlayer.powers?.some(p => p.type === powerType);
        console.log(`🔎 alreadyHasPower = ${alreadyHasPower}`);

        // 🔍 Look up from masterResources instead of template
        const powerData = masterResources.find(r => r.type === powerType);

        if (!powerData) { console.warn(`⚠️ No master resource entry found for power: ${powerType}`); continue; }
        if (alreadyHasPower) { console.log(`⏭️ Player already has power: ${powerType}, skipping.`); continue; }
        
        let updatedPowers = currentPlayer.powers ? [...currentPlayer.powers] : [];
        updatedPowers.push({ type: powerType, quantity: qtyToAdd });
        await axios.post(`${API_BASE}/api/update-powers`, {
          playerId: currentPlayer.playerId,
          powers: updatedPowers,
        });
        setCurrentPlayer(prev => ({ ...prev, powers: updatedPowers }));

        const gridPlayerNew = playersInGridManager.getAllPCs(gridId)?.[currentPlayer.playerId];
        if (gridPlayerNew && powerData.output && typeof powerData.qtycollected === 'number') {
          const oldValue = gridPlayerNew[powerData.output] || 0;
          const newValue = oldValue + powerData.qtycollected;
          await playersInGridManager.updatePC(gridId, currentPlayer.playerId, {
            [powerData.output]: newValue
          });
        }
        await trackQuestProgress(currentPlayer, 'Gain skill with', powerType, qtyToAdd, setCurrentPlayer);
      }

      // Remove the message from the player's messages array
      const updatedMessages = currentPlayer.messages.filter((m) => m !== message);
      await axios.post(`${API_BASE}/api/update-player-messages`, {
        playerId: currentPlayer.playerId,
        messages: updatedMessages,
      });

      // Update client-side state
      setCurrentPlayer((prev) => ({
        ...prev,
        messages: updatedMessages,
      }));

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

      // Debug: Final PC state in grid after rewards
      const updated = await playersInGridManager.getAllPCs(gridId)?.[currentPlayer.playerId];
      const skillCheck = currentPlayer.skills?.map(s => s.type).join(', ') || 'none';
      const powerCheck = currentPlayer.powers?.map(p => p.type).join(', ') || 'none';
      // Debug: Raw PCs in grid after update
      const rawGridPCs = playersInGridManager.getAllPCs(gridId);
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
      <Modal onClose={onClose} title={strings[1606]} message="No messages available." />
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
                  {strings[1603]}: {new Date(msg.timestamp).toLocaleString()}
                </p>
              </div>

              {/* Right side: reward line + buttons */}
              <div className="message-actions">
                {rewards?.length > 0 && renderRewards(rewards)}

                <div className="standard-buttons">
                  {rewards?.length > 0 && (
                    <button className="btn-success" onClick={() => handleCollect(msg)}>
                      {strings[1604]}
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
      <p>{strings[1605]}</p>
    </Modal>
  );
}

export default Mailbox;