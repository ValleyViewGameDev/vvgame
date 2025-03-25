import React from 'react';
import './ResourceButton.css'; // Assuming shared styles are stored here
import './QuestButton.css'; // Assuming shared styles are stored here

// Button for displaying player quests in QuestPanel
const QuestButton = ({ quest, state, onClick }) => {
  const { symbol, title, completed, goals = [] } = quest; // Default goals to an empty array

  return (
    <div className={`resource-button ${state}`} onClick={onClick}>
      <h3>{symbol} {title}</h3>
      <h4>{completed ? 'Return to collect your reward.' : 'In Progress'}</h4>

      {/* Safely map over goals */}
      {goals.map((goal, index) => (
        goal.action && goal.item && goal.qty ? (
          <p key={index}>
            {goal.action} {goal.item} x{goal.qty}: {goal.progress} of {goal.qty}
          </p>
        ) : null
      ))}
    </div>
  );
};


// Button for interacting with NPC quests in QuestGiverPanel
const QuestGiverButton = ({ quest, state, onClick }) => {
  const { symbol, title, textbody, reward, rewardqty, goals = [] } = quest;

  // Determine button text based on state
  const buttonText = state === 'reward' ? 'Get Reward' : 'Accept Quest';

  return (
    <div className={`resource-button ${state}`} onClick={onClick}>
      <h3>{symbol} {title}</h3>
      <p>{textbody}</p> 
      {/* Display the goals */}
      <div className="quest-goals">
        {goals.map((goal, index) => (
          goal.action && goal.item && goal.qty ? (
            <p key={index}>
              {goal.action} {goal.item} x{goal.qty}
            </p>
          ) : null
        ))}
      </div>

      <p>Reward: {rewardqty} {reward}</p>

      <button className="quest-giver-button">{buttonText}</button>
    </div>
  );
};

// Export components
export { QuestButton, QuestGiverButton };