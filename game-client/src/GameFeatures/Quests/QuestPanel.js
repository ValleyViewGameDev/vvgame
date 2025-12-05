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

  // Re-evaluate quest progress for "Gain skill with" quests
  const reevaluateQuestProgress = async (quests) => {
    if (!quests || quests.length === 0) return quests;
    
    let questsUpdated = false;
    const updatedQuests = quests.map(quest => {
      if (quest.completed || quest.rewardCollected) return quest;
      
      const updatedQuest = { ...quest };
      const progress = { ...quest.progress };
      let goalsCompleted = 0;
      let totalGoals = 0;
      
      // Check each goal
      for (let i = 1; i <= 3; i++) {
        const goalAction = quest[`goal${i}action`];
        const goalItem = quest[`goal${i}item`];
        const goalQty = quest[`goal${i}qty`];
        
        if (!goalAction || !goalItem || !goalQty) continue;
        totalGoals++;
        
        // Special handling for "Gain skill with" goals
        if (goalAction === "Gain skill with") {
          const playerHasSkill = currentPlayer.skills?.some(skill => skill.type === goalItem);
          const playerHasPower = currentPlayer.powers?.some(power => power.type === goalItem);
          
          if (playerHasSkill || playerHasPower) {
            // Mark this goal as completed if not already
            if (progress[`goal${i}`] < goalQty) {
              progress[`goal${i}`] = goalQty;
              questsUpdated = true;
            }
          }
        }
        
        // Check if goal is completed
        if (progress[`goal${i}`] >= goalQty) {
          goalsCompleted++;
        }
      }
      
      // Update quest completion status
      if (goalsCompleted === totalGoals && totalGoals > 0 && !updatedQuest.completed) {
        updatedQuest.completed = true;
        questsUpdated = true;
      }
      
      updatedQuest.progress = progress;
      return updatedQuest;
    });
    
    // If quests were updated, save to server
    if (questsUpdated) {
      try {
        await axios.post(`${API_BASE}/api/update-player-quests`, {
          playerId: currentPlayer.playerId,
          activeQuests: updatedQuests,
        });
      } catch (error) {
        console.error('Error updating quest progress:', error);
      }
    }
    
    return updatedQuests;
  };

  // Load active player quests
  useEffect(() => {
    if (currentPlayer?.activeQuests) {
      // Re-evaluate quest progress before displaying
      reevaluateQuestProgress(currentPlayer.activeQuests).then(updatedQuests => {
        setPlayerQuests(updatedQuests);
      });
    }
  }, [currentPlayer?.activeQuests, currentPlayer?.skills, currentPlayer?.powers, currentPlayer?.playerId]);

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
                  reward: template?.reward || '',
                  rewardqty: template?.rewardqty || 1,
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