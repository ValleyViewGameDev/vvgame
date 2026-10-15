import API_BASE from '../../config';
import axios from 'axios';
import React, { useState, useEffect, useContext, useRef } from 'react';
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
import SaleBurst from '../../UI/SaleBurst';
import { gameConfirm } from '../../UI/Modals/GameDialog';

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
  // Rows in motion (docs/ui-conventions.md §8, cards that leave a list): { [key]: { id, type } },
  // type 'pop' (collected: burst + sparkles) or 'leave' (deleted: a quick shrink and fade).
  // A collected message pops away with the sparkle burst on the tap, then its row collapses so the
  // messages below slide up; the server's list is applied only after that, so nothing jumps.
  const [mailFx, setMailFx] = useState({});
  const rowAnims = useRef({});   // key -> the row's collapse Animation (cancelled if the collect fails)
  const collecting = useRef(0);  // collects in flight: the player's message list waits for them
  // a row's identity: template + timestamp, plus its occurrence among identical copies (two copies
  // of one message sent in the same millisecond must still be two rows)
  const msgKey = (m, list = visibleMessages) => {
    const base = `${m?.messageId}-${m?.timestamp}`;
    const at = list.indexOf(m);
    const dup = at > 0 ? list.slice(0, at).filter((x) => `${x?.messageId}-${x?.timestamp}` === base).length : 0;
    return `${base}-${dup}`;
  };

  useEffect(() => {
    if (Array.isArray(currentPlayer?.messages) && collecting.current === 0) {
      setVisibleMessages(currentPlayer.messages);
    }
  }, [currentPlayer?.messages]);

  // the row shrinks to nothing (its spacing too) so the rows below glide up into the gap
  const collapseRow = (key) => new Promise((resolve) => {
    const el = document.querySelector(`[data-mail-key="${CSS.escape(key)}"]`);
    if (!el || typeof el.animate !== 'function') { resolve(); return; }
    const cs = getComputedStyle(el);
    const anim = el.animate(
      [
        { height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginBottom: cs.marginBottom },
        { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginBottom: '0px' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
    );
    rowAnims.current[key] = anim;
    anim.onfinish = () => resolve();
  });
 
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
    try { navigator.vibrate?.(35); } catch (_) { /* no haptics here */ }

    // On the tap: the row pops away under the burst, then collapses (house rule: the server runs
    // in parallel; a failure brings the row back)
    const key = msgKey(visibleMessages[messageIndex]);
    setMailFx((prev) => ({ ...prev, [key]: { id: Date.now() + Math.random(), type: 'pop' } }));
    collecting.current += 1;
    const rowGone = new Promise((resolve) => setTimeout(() => collapseRow(key).then(resolve), 300));
    const restoreRow = () => {
      collecting.current = Math.max(0, collecting.current - 1);
      rowAnims.current[key]?.cancel();
      delete rowAnims.current[key];
      setMailFx((prev) => { const next = { ...prev }; delete next[key]; return next; });
    };
    let done = false;

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
        await rowGone;   // let the row finish leaving before the list changes under it
        done = true;
        collecting.current -= 1;
        delete rowAnims.current[key];
        setMailFx((prev) => { const next = { ...prev }; delete next[key]; return next; });

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
      else { restoreRow(); }
    } catch (error) {
      console.error('Error in protected mailbox collection:', error);
      if (!done) restoreRow();
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
  // On the confirm: the row shrinks away and its slot collapses (rows below glide up) while the
  // server call runs; the new list is applied once both are done, and a failure brings it back
  const deleteMessage = async (playerId, messageIndex) => {
    const key = msgKey(visibleMessages[messageIndex]);
    setMailFx((prev) => ({ ...prev, [key]: { id: Date.now() + Math.random(), type: 'leave' } }));
    collecting.current += 1;
    const rowGone = new Promise((resolve) => setTimeout(() => collapseRow(key).then(resolve), 220));
    try {
      const updatedMessages = [...visibleMessages];
      updatedMessages.splice(messageIndex, 1); // Remove the one at this index only
    
      await axios.post(`${API_BASE}/api/update-player-messages`, {
        playerId,
        messages: updatedMessages,
      });

      await rowGone;
      collecting.current = Math.max(0, collecting.current - 1);
      delete rowAnims.current[key];
      setMailFx((prev) => { const next = { ...prev }; delete next[key]; return next; });
      setVisibleMessages(updatedMessages);
      setCurrentPlayer((prev) => ({
        ...prev,
        messages: updatedMessages,
      }));
  
      updateStatus(1607);
    } catch (error) {
      console.error("❌ Error deleting message:", error);
      collecting.current = Math.max(0, collecting.current - 1);
      rowAnims.current[key]?.cancel();
      delete rowAnims.current[key];
      setMailFx((prev) => { const next = { ...prev }; delete next[key]; return next; });
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
            // the slot collapses (rows below glide up); the message inside pops; the burst sits beside it
            <div key={msgKey(msg)} className="mailbox-slot" data-mail-key={msgKey(msg)}>
            {mailFx[msgKey(msg)]?.type === 'pop' && <SaleBurst key={mailFx[msgKey(msg)].id} />}
            <div className={`mailbox-message ${mailFx[msgKey(msg)] ? `card-fx-${mailFx[msgKey(msg)].type}` : ''}`} data-mail-index={visibleMessages.length - 1 - index}>
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
                    onClick={async () => {
                      const ok = await gameConfirm({ message: strings[2032] || 'Delete this message?', confirmLabel: strings[2033] || 'Delete', danger: true });
                      if (ok) deleteMessage(currentPlayer.playerId, visibleMessages.length - 1 - index); // rows are newest-first
                    }}
                  >
                    🗑️
                  </button>
                </div>
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