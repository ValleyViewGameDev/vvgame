import React, { useState } from 'react';
import { questDisplayTitle } from '../../GameFeatures/Quests/questTitles';
import './QuestButton.css';
import { useStrings } from '../StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import XpStar from '../Icons/XpStar';

// A goal's words on a card: the item's display name (the Farm Hand is Audrey), and "Hire" for a farm
// worker, whose goal is a Craft at the Farm House underneath
const isHire = (goal, masterResources) => {
  const def = masterResources?.find((r) => r.type === goal.item);
  return goal.action === 'Craft' && def?.category === 'npc' && def?.source === 'Farm House';
};
const goalText = (goal, strings, masterResources) =>
  `${isHire(goal, masterResources) ? (strings[17018] || 'Hire') : goal.action} ${getLocalizedString(goal.item, strings)}`;

// Normalize emoji by removing variation selectors (U+FE0F) for consistent matching
const normalizeEmoji = (emoji) => {
  if (!emoji) return emoji;
  return emoji.replace(/\uFE0F/g, '');
};

// Helper to find SVG filename for a symbol from masterResources
const getSvgFilenameForSymbol = (symbol, masterResources) => {
  if (!symbol || !masterResources || !Array.isArray(masterResources)) return null;
  const normalizedSymbol = normalizeEmoji(symbol);
  const resource = masterResources.find(r =>
    r.symbol && normalizeEmoji(r.symbol) === normalizedSymbol && (r.iconFile || r.filename)
  );
  return resource?.iconFile || resource?.filename || null;
};

// The card's picture: the quest giver's head crop, found by the giver's NAME (owner 2026-11-10: a
// quest's own emoji can differ from its giver's row, as Mistress Quickly's did, and the card then
// printed the emoji). Without a giver, the resource whose symbol the quest carries; else the glyph.
const SymbolDisplay = ({ symbol, giver, masterResources, size = 32 }) => {
  const giverRow = giver && Array.isArray(masterResources) ? masterResources.find((r) => r.type === giver && r.category === 'npc') : null;
  const svgFilename = giverRow?.iconFile || giverRow?.filename || getSvgFilenameForSymbol(symbol, masterResources);
  if (svgFilename) {
    return (
      <img
        src={`/assets/resources/${svgFilename}`}
        alt=""
        draggable="false"
        style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain' }}
      />
    );
  }
  return symbol;
};

// A To Do list card (QuestPanel): status in the top-right (✅ when done, "In Progress" while
// not), the title tight under the icon, then one line per task, "Collect Wheat: 3/10"
// (green once done), and a bold "Reward:".
const QuestButton = ({ quest, state, onClick, masterResources, xpReward }) => {
  const strings = useStrings();
  const { symbol, giver, title, completed, goals = [], reward, rewardqty } = quest;

  return (
    <div
      className={`quest-item quest-card ${state}`}
      onClick={onClick}
    >
      <div className="quest-header">
        <span className="quest-symbol"><SymbolDisplay symbol={symbol} giver={giver} masterResources={masterResources} size={28} /></span>
        {state === 'reward'
          ? <span className="quest-checkmark">✅</span>
          : <span className="quest-status">{strings[207]}</span>}
      </div>
      <h2 className="quest-title">{questDisplayTitle(title)}</h2>
      {completed && <p className="quest-return-hint text-hint">{strings[206]}</p>}
      <div className="quest-tasks">
        {goals.map((goal, index) =>
          goal.action && goal.item && goal.qty ? (
            <p key={index} className={`quest-task${goal.progress >= goal.qty ? ' quest-task--done' : ''}`}>
              {/* the task's state at its left, the same art as the Quest button's badge: done, or still to do */}
              <img className="quest-task-icon" alt="" src={`/assets/overlays/${goal.progress >= goal.qty ? 'checkmark' : 'question'}.svg`} />
              <span>{goalText(goal, strings, masterResources)}: {goal.progress}/{goal.qty}</span>
            </p>
          ) : null
        )}
      </div>
      {reward && rewardqty && (
        <p><strong>{strings[98002] || 'Reward:'}</strong> {rewardqty} {getLocalizedString(reward, strings)}</p>
      )}
      {xpReward > 0 && <p className="quest-xp"><XpStar /> +{xpReward} XP</p>}
    </div>
  );
};

const QuestGiverButton = ({
  quest,
  state,
  onClick,
  xpReward,
  level,
  meetsLevelRequirement = true,
  noClickSfx = false,
  masterResources,
  // Transaction mode props
  isTransactionMode = false,
  transactionKey,
  onTransactionAction,
  // `pending`: the card waits on the server (a quest just accepted, already done, before the server
  // has it): shown working and not tappable for that moment (NPCsPanel.js)
  pending = false,
}) => {
  const strings = useStrings();
  const { symbol, giver, title, reward, rewardqty, goals = [] } = quest;
  const buttonText = state === 'reward' ? strings[208] : strings[209];
  const isDisabled = !meetsLevelRequirement;

  // Transaction mode state
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionId, setTransactionId] = useState(() => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  const busy = isProcessing || pending;
  const handleClick = async (e) => {
    if (isDisabled || busy) return;

    if (isTransactionMode && onTransactionAction && transactionKey) {
      // Transaction mode - prevent multiple clicks
      e.preventDefault();
      e.stopPropagation();

      console.log(`🔒 [QUEST_BUTTON] Setting processing state for ${transactionKey}`);
      setIsProcessing(true);
      try {
        await onTransactionAction(transactionId, transactionKey);
        console.log(`✅ [QUEST_BUTTON] Transaction completed for ${transactionKey}`);
        // Generate a new transactionId for the next transaction
        setTransactionId(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      } catch (error) {
        console.error(`❌ [QUEST_BUTTON] Transaction failed for ${transactionKey}:`, error);
      } finally {
        setIsProcessing(false);
      }
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <div
      className={`quest-item quest-card ${state}${isDisabled ? ' disabled' : ''}${busy ? ' processing' : ''}`}
      data-quest-card={quest?.title}
      onClick={handleClick}
      style={{
        opacity: (isDisabled || busy) ? 0.6 : 1,
        cursor: (isDisabled || busy) ? 'not-allowed' : 'pointer',
        position: 'relative'
      }}
    >
      <div className="quest-header">
        <span className="quest-symbol"><SymbolDisplay symbol={symbol} giver={giver} masterResources={masterResources} size={28} /></span>
        <span className="quest-header-right">
          {level && (
            <span className={`quest-status quest-level ${meetsLevelRequirement ? 'ok' : 'short'}`}>
              {strings[10149] || 'Level'} {level}
            </span>
          )}
          {state === 'reward' && <span className="quest-checkmark">✅</span>}
        </span>
      </div>
      <h2 className="quest-title">{questDisplayTitle(title)}</h2>
      <div className="quest-goals">
        {goals.map((goal, index) =>
          goal.action && goal.item && goal.qty ? (
            <p key={index}>{goalText(goal, strings, masterResources)}{isHire(goal, masterResources) && goal.qty === 1 ? '' : ` x${goal.qty}`}</p>
          ) : null
        )}
      </div>
      <p><strong>{strings[98002] || 'Reward:'}</strong> {rewardqty} {getLocalizedString(reward, strings)}</p>
      {/* the XP it pays, offered or ready (owner 2026-11-07: XP shows on every quest card) */}
      {xpReward > 0 && <p className="quest-xp"><XpStar /> +{xpReward} XP</p>}
      <button
        className={`quest-giver-button${busy ? ' processing' : ''}`}
        data-no-click-sfx={noClickSfx ? 'true' : undefined}
        disabled={isDisabled || busy}
      >
        {busy ? '⏳' : buttonText}
      </button>
    </div>
  );
};

export { QuestButton, QuestGiverButton };