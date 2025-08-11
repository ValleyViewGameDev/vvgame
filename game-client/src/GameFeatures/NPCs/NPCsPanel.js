import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import '../../UI/SharedButtons.css';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { gainIngredients, spendIngredients } from '../../Utils/InventoryManagement';
import { QuestGiverButton } from '../../UI/QuestButton';
import { modifyPlayerStatsInPlayer, modifyPlayerStatsInGridState } from '../../Utils/playerManagement';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import RelationshipCard from '../Relationships/RelationshipCard';
import { getRelationshipStatus } from '../Relationships/RelationshipUtils';
import '../Relationships/Relationships.css';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { checkDeveloperStatus } from '../../Utils/appUtils';

const QuestGiverPanel = ({
  onClose,
  npcData,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  TILE_SIZE,
  updateStatus,
  masterResources,
  masterInteractions,
}) => {
  const strings = useStrings();
  const [questList, setQuestList] = useState([]);
  const [healRecipes, setHealRecipes] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [canQuest, setCanQuest] = useState(false);
  const [questThreshold, setQuestThreshold] = useState(0);
  const [isDeveloper, setIsDeveloper] = useState(false);

  console.log('made it to QuestGiverPanel/Healer; npcData = ', npcData);

  // Ensure npcData has default values
  if (!npcData) {
    console.warn("QuestGiverPanel was opened with missing npcData.");
    npcData = { type: "Unknown NPC", symbol: "❓" }; // Provide default fallback values
  }

  // Check developer status
  useEffect(() => {
    const checkStatus = async () => {
      if (currentPlayer?.username) {
        const devStatus = await checkDeveloperStatus(currentPlayer.username);
        setIsDeveloper(devStatus);
      }
    };
    checkStatus();
  }, [currentPlayer]);

  // Check if player can quest based on relationship
  useEffect(() => {
    if (masterInteractions && npcData && npcData.action === 'quest') {
      // Find the quest interaction threshold
      const questInteraction = masterInteractions.find(interaction => 
        interaction.interaction === 'Quest' || interaction.interaction === 'quest'
      );
      
      if (questInteraction) {
        setQuestThreshold(questInteraction.relscoremin || 0);
        
        // Get current relationship status
        const relationship = getRelationshipStatus(currentPlayer, npcData.type);
        const currentScore = relationship?.relscore || 0;
        
        setCanQuest(currentScore >= questInteraction.relscoremin);
      } else {
        // If no quest threshold defined, allow questing
        setCanQuest(true);
      }
    }
  }, [masterInteractions, npcData, currentPlayer]);

  // Handle quests or healing logic
  useEffect(() => {
    if (!npcData || !npcData.type) return;

    if (npcData.action === 'quest') {
      fetchQuests();
    } else if (npcData.action === 'heal') {
      const filteredRecipes = masterResources.filter((resource) => resource.type === npcData.type);
      setHealRecipes(filteredRecipes);
    }
  }, [npcData, currentPlayer]);

  
  ////////////////////////////////////////////////////////////
  ////////////////////// Fetch QUESTS for QUEST NPCs
  const fetchQuests = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/quests`);

      // Use new quest filtering logic
      let npcQuests = response.data
        .filter((quest) => quest.giver === npcData.type)
        .filter((quest) => {
          const activeQuest = currentPlayer.activeQuests.find(q => q.questId === quest.title);
          if (activeQuest) {
            return activeQuest.completed && !activeQuest.rewardCollected;
          }
          return quest.repeatable || !currentPlayer.completedQuests.some(q => q.questId === quest.title);
        });

      // Debug logging
      console.log(`📋 Before FTUE filter - quests available: ${npcQuests.length}`);
      console.log(`👤 Player FTUE status - firsttimeuser: ${currentPlayer.firsttimeuser}, ftuestep: ${currentPlayer.ftuestep}`);
      
      // Filter by FTUE step only if player is a first-time user
      if (currentPlayer.firsttimeuser === true && currentPlayer.ftuestep != null) {
        console.log(`🎓 Filtering quests by FTUE step: ${currentPlayer.ftuestep}`);
        npcQuests = npcQuests.filter((quest) => {
          // Only show quests that have an ftuestep and it's less than or equal to current step
          return quest.ftuestep != null && quest.ftuestep <= currentPlayer.ftuestep;
        });
        console.log(`📋 After FTUE filter - quests remaining: ${npcQuests.length}`);
      }

      setQuestList(npcQuests);
    } catch (error) {
      console.error('Error fetching quests:', error);
    }
  };

  const handleAcceptQuest = async (questTitle) => {
    if (!questTitle) return;
    // Find the accepted quest in questList
    const acceptedQuest = questList.find(q => q.title === questTitle);
    if (!acceptedQuest) {
        console.error(`Quest "${questTitle}" not found in available quests.`);
        return;
    }
    // Prepare progress tracking for skill-based goals
    let initialProgress = { goal1: 0, goal2: 0, goal3: 0 }; // Explicitly initialize
    let goalsCompleted = 0;
    let totalGoals = 0;

    for (let i = 1; i <= 3; i++) {
      const goalAction = acceptedQuest[`goal${i}action`];
      const goalItem = acceptedQuest[`goal${i}item`];
      const goalQty = acceptedQuest[`goal${i}qty`];

      if (!goalAction || !goalItem || !goalQty) continue; // Skip undefined goals
      totalGoals++; // Count valid goals

      if (goalAction === "Gain skill with") {
          // Check if player already has the required skill
          const playerHasSkill = currentPlayer.skills?.some(skill => skill.type === goalItem);
          if (playerHasSkill) {
              initialProgress[`goal${i}`] = 1; // Pre-mark as completed
              goalsCompleted++;
          } else {
              initialProgress[`goal${i}`] = 0; // Start at 0
          }
      } else {
          initialProgress[`goal${i}`] = 0; // Default progress for other goals
      }
    }
    // If all goals are completed before even accepting, mark the quest as completed
    const isQuestCompleted = totalGoals > 0 && goalsCompleted === totalGoals;
    console.log('initialProgress = ',initialProgress);

    try {
      const response = await axios.post(`${API_BASE}/api/add-player-quest`, {
        playerId: currentPlayer.playerId,
        questId: questTitle,
        startTime: Date.now(),
        progress: initialProgress, // Send pre-computed progress
        completed: isQuestCompleted, // If all goals are done, mark it completed
      });

      if (response.data.success) {
        setCurrentPlayer(response.data.player); // Update player after quest is added
        updateStatus(202);
        console.log(`✅ Quest "${questTitle}" added with initial progress:`, initialProgress);
      } else {
        setStatusMessage(`Failed to accept quest: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Error accepting quest:', error);
      setStatusMessage('Error accepting quest. Check console.');
    }
  };

const handleGetReward = async (quest) => {
    try {
      const success = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: quest.reward,
        quantity: quest.rewardqty,
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
      });
      if (!success) return;

      // Track quest progress for "Collect" type quests
      await trackQuestProgress(currentPlayer, 'Collect', quest.reward, quest.rewardqty, setCurrentPlayer);

      let updatedCompletedQuests = currentPlayer.completedQuests.map((q) =>
        q.questId === quest.title ? { ...q, rewardCollected: true } : q
      );
      const alreadyCompleted = updatedCompletedQuests.some(q => q.questId === quest.title);
      if (!alreadyCompleted) {
        updatedCompletedQuests.push({
          questId: quest.title,
          rewardCollected: true,
          timestamp: Date.now(),
        });
      }

      // Remove the quest from activeQuests
      const updatedActiveQuests = currentPlayer.activeQuests.filter(q => q.questId !== quest.title);

      const updatedPlayer = {
        ...currentPlayer,
        completedQuests: updatedCompletedQuests,
        activeQuests: updatedActiveQuests,
      };
      await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: {
          completedQuests: updatedPlayer.completedQuests,
          activeQuests: updatedActiveQuests,
        },
      }).then((result) => {
        console.log("📬 Server responded with:", result.data);
      });
      setCurrentPlayer({
        ...currentPlayer,
        completedQuests: updatedPlayer.completedQuests,
        activeQuests: updatedActiveQuests,
      });
      setQuestList((prevList) => prevList.filter((q) => q.title !== quest.title));
      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
      updateStatus(201);

    } catch (error) {
      console.error('Error collecting quest reward:', error);
      alert('Failed to collect quest reward.');
    }
  };


const handleHeal = async (recipe) => {
    setErrorMessage('');
    console.log('made it to handleHeal');

    if (!recipe) {
      setErrorMessage('Invalid healing recipe selected.');
      return;
    }
    // Fetch current HP and Max HP from playersInGridManager
    const gridId = currentPlayer?.location?.g;
    const playerId = currentPlayer._id?.toString();
    // Additional console logs for debug
    console.log('gridId =', gridId);
    console.log('playerId =', playerId);
    console.log('playersInGridManager.getPlayersInGrid(gridId) =', playersInGridManager.getPlayersInGrid(gridId));
    const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
    if (!playerInGridState) {
      console.error(`Player ${currentPlayer.username} not found in NPCsInGrid.`);
      return;
    }
    const currentHp = playerInGridState.hp;
    const maxHp = playerInGridState.maxhp;
  
    // Healing logic with NPCsInGrid HP
    if (npcData.output === 'hp') {
      if (currentHp >= maxHp) {
        updateStatus(401);  // Player is already at full HP
        return;
      }
    }
    const success = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });
    if (!success) return;
    
    // Refresh player to update money display
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

    const healAmount = npcData.qtycollected;
    const statToMod = 'hp';
    const amountToMod = Math.min(healAmount, maxHp - currentHp);  // Ensure it doesn't exceed max HP
    
    console.log('About to mofidy stats;  amountToMod = ',amountToMod,'; statToMod = ',statToMod);

    try {
      console.log('calling modifyPlayerStats with: statToMod: ',statToMod,'; amountToMod: ',amountToMod,'; currentPlayer._id= ',currentPlayer._id,'; gridId: ',gridId);
      await modifyPlayerStatsInGridState(statToMod, amountToMod, currentPlayer._id, gridId);
      setCurrentPlayer((prev) => ({
        ...prev,
        hp: Math.min(prev.maxhp, prev.hp + amountToMod),
      }));  
      updateStatus(`${strings[405]}${amountToMod}.`);

    } catch (error) {
      console.error('Error applying healing:', error);
    }

  };

  const handleSellNPC = async () => {
    if (!npcData || !npcData.id) {
      console.error('Cannot sell NPC: Missing NPC data or ID');
      return;
    }

    try {
      const gridId = currentPlayer.location.g;
      await NPCsInGridManager.removeNPC(gridId, npcData.id);
      updateStatus(`${npcData.type} has been removed from the grid.`);
      onClose(); // Close the panel after selling
    } catch (error) {
      console.error('Error selling NPC:', error);
      updateStatus(`❌ Failed to remove ${npcData.type}.`);
    }
  };


  return (
    <Panel onClose={onClose} descriptionKey="1013" titleKey="1113" panelName="QuestGiverPanel">

{/* //////////////////// QUESTS //////////////////////// */}

      {npcData.action === 'quest' && (
        <div className="quest-options">
          <h2>{npcData.symbol} {npcData.type}</h2>
          
          {/* Relationship Card */}
          <RelationshipCard
            currentPlayer={currentPlayer}
            setCurrentPlayer={setCurrentPlayer}
            targetName={npcData.type}
            targetType="npc"
            showActions={true}
            compact={false}
            masterInteractions={masterInteractions}
            updateStatus={updateStatus}
            onRelationshipChange={(interaction, success) => {
              // Additional handling if needed after interaction completes
            }}
          />
          
          {canQuest && (
            <>
              {questList.length > 0 ? (
                <h3>{strings[204]}</h3>
              ) : (
                <h3>{strings[205]}</h3>
              )}
              {questList.map((quest) => {
            const isRewardable = currentPlayer.activeQuests.some(
              (q) => q.questId === quest.title && q.completed && !q.rewardCollected
            );

            const state = isRewardable ? 'reward' : 'accept';
            const onClick = state === 'reward'
              ? () => handleGetReward(quest)
              : () => handleAcceptQuest(quest.title);

            return (
              <QuestGiverButton
                key={quest.title}
                quest={{
                  symbol: quest.symbol,
                  title: quest.title,
                  textbody: quest.textbody,
                  goals: [
                    { action: quest.goal1action, item: quest.goal1item, qty: quest.goal1qty },
                    { action: quest.goal2action, item: quest.goal2item, qty: quest.goal2qty },
                    { action: quest.goal3action, item: quest.goal3item, qty: quest.goal3qty },
                  ],
                  reward: quest.reward,
                  rewardqty: quest.rewardqty,
                }}
                state={state}
                onClick={onClick}
              />
            );
              })}
            </>
          )}
          
          {/* Developer option to sell NPC */}
          {isDeveloper && (
              <div className="standard-buttons">
              <button 
                className="btn-danger" 
                onClick={handleSellNPC}
                style={{ width: '100%', padding: '10px' }}
              >
                {strings[490]}
              </button>
            </div>
          )}
        </div>
      )}


{/* //////////////////// HEALING //////////////////////// */}

      {npcData.action === 'heal' && healRecipes.length > 0 && (
        <div className="heal-options">
<br />
          {/* Fetch and display player's HP from playersInGridManager */}
          {(() => {
            const gridId = currentPlayer?.location?.g;
            const playerId = currentPlayer._id?.toString();
            const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
<br />
            if (playerInGridState) {
              return (
                <>
                  <h2>❤️‍🩹 Health: <br />{playerInGridState.hp} / {playerInGridState.maxhp}</h2>
                </>
              );
            } else {
              return <h4>Health Unavailable</h4>;
            }
          })()}
<br />
          <h3>This NPC can heal you:</h3>
          {healRecipes.map((recipe) => {
            const ingredients = getIngredientDetails(recipe, masterResources);
            const affordable = canAfford(recipe, inventory, 1);
            const healAmount = recipe.qtycollected; // Healing value

            return (
              <ResourceButton
                key={recipe.type}
                symbol={recipe.symbol}
                name={recipe.type}
                details={`Costs: ${ingredients.join(', ') || 'None'}<br>Heals: ❤️‍🩹 +${healAmount}`}
                disabled={!affordable}
                onClick={() => handleHeal(recipe)}
              />
            );
          })}
          {errorMessage && <p className="error-message">{errorMessage}</p>}
          
          {/* Developer option to sell NPC */}
          {isDeveloper && (
              <div className="standard-buttons">
              <button 
                className="btn-danger" 
                onClick={handleSellNPC}
                style={{ width: '100%', padding: '10px' }}
              >
                {strings[490]}
              </button>
            </div>
          )}
        </div>
      )}

    </Panel>
  );
};

export default React.memo(QuestGiverPanel);
