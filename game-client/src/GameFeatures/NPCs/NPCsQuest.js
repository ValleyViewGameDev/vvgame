import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { canAfford, getIngredientDetails } from '../../Utils/ResourceHelpers';
import { checkAndDeductIngredients, refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { usePanelContext } from '../../UI/PanelContext';
import { QuestGiverButton } from '../../UI/QuestButton';
import { loadMasterResources } from '../../Utils/TuningManager';
import { modifyPlayerStatsInPlayer, modifyPlayerStatsInGridState } from '../../Utils/playerManagement';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';

const QuestGiverPanel = ({
  onClose,
  npcData,
  inventory,
  setInventory,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  TILE_SIZE
}) => {
  const { updateStatus } = useContext(StatusBarContext);
  const { closePanel } = usePanelContext();
  const [questList, setQuestList] = useState([]);
  const [healRecipes, setHealRecipes] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  console.log('made it to QuestGiverPanel/Healer; npcData = ', npcData);

  // Ensure npcData has default values
  if (!npcData) {
    console.warn("QuestGiverPanel was opened with missing npcData.");
    npcData = { type: "Unknown NPC", symbol: "❓" }; // Provide default fallback values
  }

  // Handle quests or healing logic
  useEffect(() => {
    if (!npcData || !npcData.type) return;

    if (npcData.action === 'quest') {
      fetchQuests();
    } else if (npcData.action === 'heal') {
      fetchHealRecipes();
    }
  }, [npcData]);

  
  const fetchQuests = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/quests`);
      const activeQuestIds = currentPlayer.activeQuests
        .filter((quest) => !quest.completed || quest.rewardCollected)
        .map((quest) => quest.questId);
  
      const completedQuestIds = currentPlayer.completedQuests.map((quest) => quest.questId);
  
      // Filter quests:
      // - Exclude quests that are currently active/in-progress
      // - Exclude quests with repeatable = false if they have been completed once
      const npcQuests = response.data
        .filter((quest) => quest.giver === npcData.type)
        .filter((quest) => !activeQuestIds.includes(quest.title))
        .filter((quest) => quest.repeatable || !completedQuestIds.includes(quest.title));  // Filter based on repeatability
  
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
        closePanel(); 
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
      const isMoney = quest.reward === "Money";
      const isBackpackLocation = ["town", "valley0", "valley1", "valley2", "valley3"].includes(currentPlayer.location.gtype);

      let targetInventory = isMoney ? currentPlayer.inventory : isBackpackLocation ? currentPlayer.backpack : currentPlayer.inventory;
      let maxCapacity = isMoney ? Infinity : isBackpackLocation ? currentPlayer.backpackCapacity : currentPlayer.warehouseCapacity;

      // ✅ Check inventory capacity only if it's NOT Money
      if (!isMoney) {
        const currentCapacity = targetInventory
          .filter((item) => item.type !== 'Money')
          .reduce((sum, item) => sum + item.quantity, 0);

        if (currentCapacity + quest.rewardqty > maxCapacity) {
          const statusUpdate = isBackpackLocation ? 21 : 20; // 21 = Backpack Full, 20 = Warehouse Full
          console.warn(`Cannot collect quest reward: Exceeds capacity in ${isBackpackLocation ? "backpack" : "warehouse"}.`);
          updateStatus(statusUpdate);
          return;
        }
      }
  
      // Proceed to collect the reward
      const response = await axios.post(`${API_BASE}/api/complete-quest`, {
        playerId: currentPlayer.playerId,
        questId: quest.title,
        reward: {
          type: quest.reward,
          quantity: quest.rewardqty,
        },
      });
   
      if (response.data?.success) {
        // Add quest to completedQuests in local state and on the server
        const updatedPlayer = {
          ...currentPlayer,
          completedQuests: [
            ...currentPlayer.completedQuests,
            { questId: quest.title, timestamp: Date.now() },  // Add completed quest entry
          ],
        };

        // ✅ Update inventory locally
        const updatedInventory = [...targetInventory];
        const itemIndex = updatedInventory.findIndex(item => item.type === quest.reward);
        if (itemIndex >= 0) {
          updatedInventory[itemIndex].quantity += quest.rewardqty;
        } else {
          updatedInventory.push({ type: quest.reward, quantity: quest.rewardqty });
        }
  
        // Save to server
        await axios.post(`${API_BASE}/api/update-profile`, {
          playerId: currentPlayer.playerId,
          updates: {
            completedQuests: updatedPlayer.completedQuests,
          },
        });
  
        // ✅ Ensure UI updates properly
        setCurrentPlayer(updatedPlayer);
        if (isMoney) {
          setInventory(updatedInventory); // ✅ Money goes to inventory
        } else if (isBackpackLocation) {
          setBackpack(updatedInventory); // ✅ Backpack items in town
        } else {
          setInventory(updatedInventory); // ✅ Default: Warehouse
        }
        
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        updateStatus(201); // Notify success
        closePanel();  // Close the panel after successfully accepting the quest
        FloatingTextManager.addFloatingText(
          `+${quest.rewardqty} ${quest.reward}`,
          window.innerWidth / 12,
          window.innerHeight / 4,
          TILE_SIZE,
        );
      }
    } catch (error) {
      console.error('Error collecting quest reward:', error);
      alert('Failed to collect quest reward.');
    }
  };

  const fetchHealRecipes = async () => {
    try {
      const allResourcesData = await loadMasterResources();
      const filteredRecipes = allResourcesData.filter((resource) => resource.type === npcData.type);
      console.log('filteredRecipes:', filteredRecipes);
      setHealRecipes(filteredRecipes);
      setAllResources(allResourcesData);
    } catch (error) {
      console.error('Error fetching heal recipes:', error);
    }
  };

const handleHeal = async (recipe) => {
    setErrorMessage('');
    console.log('made it to handleHeal');

    if (!recipe) {
      setErrorMessage('Invalid healing recipe selected.');
      return;
    }
    if (!canAfford(recipe, inventory, 1)) {
      setErrorMessage('Not enough resources to heal.');
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
    const updatedInventory = [...inventory];
    if (!checkAndDeductIngredients(recipe, updatedInventory, setErrorMessage)) {
      return;
    }

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
    
      FloatingTextManager.addFloatingText(`+${amountToMod} HP`, -100, 115, TILE_SIZE);
    } catch (error) {
      console.error('Error applying healing:', error);
    }

    setInventory(updatedInventory);
    localStorage.setItem('inventory', JSON.stringify(updatedInventory));

    try {
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
      });
      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    } catch (error) {
      console.error('Error updating server after healing:', error);
    }
  };


  return (
    <Panel onClose={onClose} descriptionKey="1013" titleKey="1113" panelName="QuestGiverPanel">

      {npcData.action === 'quest' && (
        <div className="quest-options">
          <h2>{npcData.symbol} {npcData.type}</h2>
          {questList.length > 0 ? (
            <h3>is offering these Quests:</h3>
          ) : (
            <h3>has no quests for you at this time.</h3>
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
        </div>
      )}

      {npcData.action === 'heal' && healRecipes.length > 0 && (
        <div className="heal-options">
          <h2>❤️‍🩹 Healing</h2>

          {/* Fetch and display player's HP from playersInGridManager */}
          {(() => {
            const gridId = currentPlayer?.location?.g;
            const playerId = currentPlayer._id?.toString();
            const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];

            if (playerInGridState) {
              return (
                <>
                  <h4>Current HP: {playerInGridState.hp}</h4>
                  <h4>Max HP: {playerInGridState.maxhp}</h4>
                </>
              );
            } else {
              return <h4>HP Data Unavailable</h4>;
            }
          })()}

          <h3>This NPC can heal you:</h3>
          {healRecipes.map((recipe) => {
            const ingredients = getIngredientDetails(recipe, allResources);
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
        </div>
      )}

    </Panel>
  );
};

export default React.memo(QuestGiverPanel);
