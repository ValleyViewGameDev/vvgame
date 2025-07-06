import API_BASE from '../../config';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panel';
import { QuestButton } from '../../UI/QuestButton';
import '../../UI/ResourceButton.css';
import '../../UI/QuestButton.css';
import { useStrings } from '../../UI/StringsContext';

function QuestPanel({ onClose, currentPlayer }) {
  const strings = useStrings();
  const [playerQuests, setPlayerQuests] = useState([]);
  const [questTemplates, setQuestTemplates] = useState([]);

  // Load active player quests
  useEffect(() => {
    if (currentPlayer?.activeQuests) {
      setPlayerQuests(currentPlayer.activeQuests);
    }
  }, [currentPlayer]);

  // Load all quest templates from tuning file
  useEffect(() => {
    const fetchQuestTemplates = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/quests`);
        setQuestTemplates(response.data || []);
      } catch (error) {
        console.error('Error fetching quest templates:', error);
      }
    };
    fetchQuestTemplates();
  }, []);

  return (
    <Panel onClose={onClose} descriptionKey="1006" titleKey="1106" panelName="QuestPanel">
      {(!playerQuests || playerQuests.length === 0) ? (
        <p>{strings[203]}</p>
      ) : (
        <div className="standard-panel">
          {playerQuests.map((quest, index) => {
            const template = questTemplates.find(t => t.title === quest.questId);
            const goals = [
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
            ].filter(goal => goal.action && goal.item && goal.qty);

            return (
              <QuestButton
                key={index}
                className={`resource-button ${quest.completed ? 'reward' : 'in-progress'}`}
                quest={{
                  symbol: quest.symbol,
                  title: quest.questId,
                  completed: quest.completed,
                  goals,
                  textbody: template?.textbody || '',
                }}
                state={quest.completed ? 'reward' : 'in-progress'}
                onClick={null}
              />
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export default QuestPanel;