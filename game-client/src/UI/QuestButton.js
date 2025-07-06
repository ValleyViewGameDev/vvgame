import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom'; // ✅ Add this
import './ResourceButton.css';
import './QuestButton.css';
import { useStrings } from './StringsContext';

const QuestButton = ({ quest, state, onClick }) => {
  const strings = useStrings();
  const { symbol, title, completed, goals = [], textbody } = quest;
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 100);
  };

  return (
    <div
      className={`quest-item ${state}`}
      onClick={onClick}
      style={{ position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <h2>{symbol}</h2>
      <h3>{title}</h3>
      <h4>{completed ? strings[206] : strings[207]}</h4>
      {goals.map((goal, index) =>
        goal.action && goal.item && goal.qty ? (
          <p key={index}>
            {goal.action} {goal.item} x{goal.qty}: {goal.progress} of {goal.qty}
          </p>
        ) : null
      )}
      {isHovered && textbody && (
        <div style={{ marginTop: '8px' }}>
          <div className="quest-info-expanded">
            {textbody}
          </div>
        </div>
      )}
    </div>
  );
};

const QuestGiverButton = ({ quest, state, onClick }) => {
  const strings = useStrings();
  const { symbol, title, textbody, reward, rewardqty, goals = [] } = quest;
  const buttonText = state === 'reward' ? strings[208] : strings[209];
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);

  return (
    <div
      className={`quest-item ${state}`}
      onClick={onClick}
      style={{ position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <h2>{symbol}</h2>
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
      {isHovered && textbody && (
        <div style={{ marginTop: '8px' }}>
          <div className="quest-info-expanded">
            {textbody}
          </div>
        </div>
      )}
    </div>
  );
};

export { QuestButton, QuestGiverButton };