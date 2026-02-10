import React, { useState } from 'react';
import './QuestButton.css';
import { useStrings } from '../StringsContext';

const QuestButton = ({ quest, state, onClick }) => {
  const strings = useStrings();
  const { symbol, title, completed, goals = [], reward, rewardqty } = quest;

  return (
    <div
      className={`quest-item ${state}`}
      onClick={onClick}
    >
      <div className="quest-header">
        <h2>{symbol}</h2>
        {state === 'reward' && <span className="quest-checkmark">✅</span>}
      </div>
      <h2>{title}</h2>
      <h4>{completed ? strings[206] : strings[207]}</h4>
      {goals.map((goal, index) =>
        goal.action && goal.item && goal.qty ? (
          <p key={index}>
            {goal.action} {goal.item} x{goal.qty}: {goal.progress} of {goal.qty}
          </p>
        ) : null
      )}
      {reward && rewardqty && (
        <p>Reward: {rewardqty} {reward}</p>
      )}
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
  // Transaction mode props
  isTransactionMode = false,
  transactionKey,
  onTransactionAction
}) => {
  const strings = useStrings();
  const { symbol, title, reward, rewardqty, goals = [] } = quest;
  const buttonText = state === 'reward' ? strings[208] : strings[209];
  const isDisabled = !meetsLevelRequirement;

  // Transaction mode state
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionId, setTransactionId] = useState(() => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  const handleClick = async (e) => {
    if (isDisabled || isProcessing) return;

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
      className={`quest-item ${state}${isDisabled ? ' disabled' : ''}${isProcessing ? ' processing' : ''}`}
      onClick={handleClick}
      style={{
        opacity: (isDisabled || isProcessing) ? 0.6 : 1,
        cursor: (isDisabled || isProcessing) ? 'not-allowed' : 'pointer',
        position: 'relative'
      }}
    >
      <div className="quest-header">
        <h2>{symbol}</h2>
        {state === 'reward' && <span className="quest-checkmark">✅</span>}
      </div>
      <h2>{title}</h2>
      {level && (
        <p style={{ color: meetsLevelRequirement ? 'green' : 'red', margin: '2px 0', fontWeight: 'bold' }}>
          {strings[10149] || 'Level'} {level}
        </p>
      )}
      <div className="quest-goals">
        {goals.map((goal, index) =>
          goal.action && goal.item && goal.qty ? (
            <p key={index}>{goal.action} {goal.item} x{goal.qty}</p>
          ) : null
        )}
      </div>
      <p>Reward: {rewardqty} {reward}</p>
      {xpReward && state === 'reward' && (
        <p style={{ color: '#4CAF50', marginTop: '5px' }}>🔷 +{xpReward} XP</p>
      )}
      <button
        className={`quest-giver-button${isProcessing ? ' processing' : ''}`}
        data-no-click-sfx={noClickSfx ? 'true' : undefined}
        disabled={isDisabled || isProcessing}
      >
        {isProcessing ? '⏳' : buttonText}
      </button>
    </div>
  );
};

export { QuestButton, QuestGiverButton };