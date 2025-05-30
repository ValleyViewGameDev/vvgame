import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom'; // ✅ Add this
import './ResourceButton.css';
import './QuestButton.css';
import strings from './strings.json'; // ✅ Import strings

const QuestButton = ({ quest, state, onClick }) => {
  const { symbol, title, completed, goals = [], textbody } = quest;
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const infoButtonRef = useRef(null);

  const updateTooltipPosition = (event) => {
    setTooltipPosition({
      top: event.clientY + window.scrollY + 10,
      left: event.clientX + window.scrollX + 15,
    });
  };

  return (
    <div
      className={`quest-item ${state}`}
      onClick={onClick}
      style={{ position: 'relative' }}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <h3>{symbol} {title}</h3>
      <h4>{completed ? strings[206] : strings[207] }</h4>
      {goals.map((goal, index) =>
        goal.action && goal.item && goal.qty ? (
          <p key={index}>{goal.action} {goal.item} x{goal.qty}: {goal.progress} of {goal.qty}</p>
        ) : null
      )}
      <div
        className="quest-info-button"
        ref={infoButtonRef}
        onMouseEnter={(e) => {
          setShowTooltip(true);
          updateTooltipPosition(e);
        }}
        onMouseMove={updateTooltipPosition}
      >
        ℹ️
      </div>

      {/* ✅ Tooltip rendered into document.body to avoid clipping */}
      {showTooltip && textbody && ReactDOM.createPortal(
        <div
          className="quest-info-tooltip"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            position: 'absolute',
          }}
        >
          {textbody}
        </div>,
        document.body
      )}
    </div>
  );
};

const QuestGiverButton = ({ quest, state, onClick }) => {
  const { symbol, title, textbody, reward, rewardqty, goals = [] } = quest;
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const infoButtonRef = useRef(null);
  const buttonText = state === 'reward' ? strings[208] : strings[209];

  const updateTooltipPosition = (event) => {
    setTooltipPosition({
      top: event.clientY + window.scrollY + 10,
      left: event.clientX + window.scrollX + 15,
    });
  };

  return (
    <div
      className={`quest-item ${state}`}
      onClick={onClick}
      style={{ position: 'relative' }}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <h3>{symbol} {title}</h3>
      <div className="quest-goals">
        {goals.map((goal, index) =>
          goal.action && goal.item && goal.qty ? (
            <p key={index}>{goal.action} {goal.item} x{goal.qty}</p>
          ) : null
        )}
      </div>
      <p>Reward: {rewardqty} {reward}</p>
      <button className="quest-giver-button">{buttonText}</button>
      <div
        className="quest-info-button"
        ref={infoButtonRef}
        onMouseEnter={(e) => {
          setShowTooltip(true);
          updateTooltipPosition(e);
        }}
        onMouseMove={updateTooltipPosition}
      >
        ℹ️
      </div>
      {showTooltip && textbody && ReactDOM.createPortal(
        <div
          className="quest-info-tooltip"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            position: 'absolute',
          }}
        >
          {textbody}
        </div>,
        document.body
      )}
    </div>
  );
};

export { QuestButton, QuestGiverButton };