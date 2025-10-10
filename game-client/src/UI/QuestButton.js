import React from 'react';
import './ResourceButton.css';
import './QuestButton.css';
import { useStrings } from './StringsContext';

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
      <h3>{title}</h3>
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

const QuestGiverButton = ({ quest, state, onClick }) => {
  const strings = useStrings();
  const { symbol, title, reward, rewardqty, goals = [] } = quest;
  const buttonText = state === 'reward' ? strings[208] : strings[209];
  return (
    <div
      className={`quest-item ${state}`}
      onClick={onClick}
    >
      <div className="quest-header">
        <h2>{symbol}</h2>
        {state === 'reward' && <span className="quest-checkmark">✅</span>}
      </div>
      <h3>{title}</h3>
      <div className="quest-goals">
        {goals.map((goal, index) =>
          goal.action && goal.item && goal.qty ? (
            <p key={index}>{goal.action} {goal.item} x{goal.qty}</p>
          ) : null
        )}
      </div>
      <p>Reward: {rewardqty} {reward}</p>
      <button className="quest-giver-button">{buttonText}</button>
    </div>
  );
};

export { QuestButton, QuestGiverButton };