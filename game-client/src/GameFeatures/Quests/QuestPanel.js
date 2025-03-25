import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panel';
import { QuestButton } from '../../UI/QuestButton'; // Import the reusable QuestButton
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path

function QuestPanel({ onClose, currentPlayer }) {
  const [playerQuests, setPlayerQuests] = useState([]);

  useEffect(() => {
    if (currentPlayer?.activeQuests) {
      setPlayerQuests(currentPlayer.activeQuests);
    }
  }, [currentPlayer]);

  return (
    <Panel onClose={onClose} descriptionKey="1006" titleKey="1106" panelName="QuestPanel">

      {(!playerQuests || playerQuests.length === 0) && (
        <p>No active quests at the moment.</p>
      )}
       <div className="standard-panel">

      {playerQuests.map((quest, index) => (
        <QuestButton
          key={index}
          className={`resource-button ${quest.completed ? 'reward' : 'in-progress'}`} // ✅ Ensure correct class
          quest={{
            symbol: quest.symbol,
            title: quest.questId,
            completed: quest.completed,
            goals: [
              {
                action: quest.goal1action,
                item: quest.goal1item,
                qty: quest.goal1qty,
                progress: quest.progress?.goal1 || 0,
              },
              {
                action: quest.goal2action,
                item: quest.goal2item,
                qty: quest.goal2qty,
                progress: quest.progress?.goal2 || 0,
              },
              {
                action: quest.goal3action,
                item: quest.goal3item,
                qty: quest.goal3qty,
                progress: quest.progress?.goal3 || 0,
              },
            ],
          }}
          state={quest.completed ? 'reward' : 'in-progress'}
          onClick={null} // No interaction required in QuestPanel
        />
      ))}
    </div>

</Panel>
  );
}

export default QuestPanel;