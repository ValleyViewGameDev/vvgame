import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import '../../UI/SharedButtons.css';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford, hasRoomFor } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { gainIngredients, spendIngredients } from '../../Utils/InventoryManagement';
import { QuestGiverButton } from '../../UI/QuestButton';
import { modifyPlayerStatsInPlayer, modifyPlayerStatsInGridState } from '../../Utils/playerManagement';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import RelationshipCard from '../Relationships/RelationshipCard';
import { getRelationshipStatus, getRelationshipMultiplier } from '../Relationships/RelationshipUtils';
import '../Relationships/Relationships.css';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { checkDeveloperStatus } from '../../Utils/appUtils';
import questCache from '../../Utils/QuestCache';
import { calculateDistance, getDerivedRange } from '../../Utils/worldHelpers';
import { earnTrophy } from '../Trophies/TrophyUtils';

const NPCPanel = ({
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
  masterTraders,
  masterTrophies,
  zoomLevel,
  setZoomLevel,
  centerCameraOnPlayer,
}) => {
  const strings = useStrings();
  const [questList, setQuestList] = useState([]);
  const [healRecipes, setHealRecipes] = useState([]);
  const [tradeRecipes, setTradeRecipes] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [canQuest, setCanQuest] = useState(false);
  const [questThreshold, setQuestThreshold] = useState(0);
  const [canTrade, setCanTrade] = useState(false);
  const [tradeThreshold, setTradeThreshold] = useState(0);
  const [isDeveloper, setIsDeveloper] = useState(false);


  // Ensure npcData has default values
  if (!npcData) {
    console.warn("NPCPanel was opened with missing npcData.");
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
    
    // Check if player can trade based on relationship
    if (npcData && npcData.action === 'trade') {
      const tradeInteraction = masterInteractions.find(interaction => 
        interaction.interaction === 'Trade' || interaction.interaction === 'trade'
      );
      
      if (tradeInteraction) {
        setTradeThreshold(tradeInteraction.relscoremin || 0);
        
        // Get current relationship status
        const relationship = getRelationshipStatus(currentPlayer, npcData.type);
        const currentScore = relationship?.relscore || 0;
        
        setCanTrade(currentScore >= tradeInteraction.relscoremin);
      } else {
        // If no trade threshold defined, allow trading
        setCanTrade(true);
      }
    }
  }, [masterInteractions, npcData, currentPlayer]);

  // Handle quests or healing logic
  useEffect(() => {
    if (!npcData || !npcData.type) return;

    if (npcData.action === 'quest') {
      // Add a small delay to debounce rapid changes
      const timeoutId = setTimeout(() => {
        fetchQuests();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    } else if (npcData.action === 'heal') {
      const filteredRecipes = masterResources.filter((resource) => resource.type === npcData.type);
      setHealRecipes(filteredRecipes);
    } else if (npcData.action === 'trade') {
      // Find this trader in masterTraders
      const trader = masterTraders?.find(t => t.trader === npcData.type);
      
      if (trader && trader.trades) {
        // Transform trader.trades into the format expected by the rest of the component
        const filteredRecipes = trader.trades.map(trade => {
          // Get the symbol from masterResources
          const resourceDef = masterResources.find(r => r.type === trade.gives.type);
          
          return {
            type: trade.gives.type,
            symbol: resourceDef?.symbol || '?',
            tradeqty: trade.gives.quantity,
            ingredient1: trade.requires[0]?.type,
            ingredient1qty: trade.requires[0]?.quantity,
            ingredient2: trade.requires[1]?.type,
            ingredient2qty: trade.requires[1]?.quantity,
            ingredient3: trade.requires[2]?.type,
            ingredient3qty: trade.requires[2]?.quantity,
            ingredient4: trade.requires[3]?.type,
            ingredient4qty: trade.requires[3]?.quantity,
            requires: trade.requiresSkill,
            source: npcData.type,
            gemcost: resourceDef?.gemcost || null
          };
        });
        
        setTradeRecipes(filteredRecipes);
      } else {
        // Fallback to old method if masterTraders is not available
        const filteredRecipes = masterResources.filter((resource) => resource.source === npcData.type);
        setTradeRecipes(filteredRecipes);
      }
    }
  }, [npcData, currentPlayer?.activeQuests, currentPlayer?.completedQuests, currentPlayer?.ftuestep, masterResources, masterTraders]);

  
  ////////////////////////////////////////////////////////////
  ////////////////////// Fetch QUESTS for QUEST NPCs
  const fetchQuests = async () => {
    try {
      // Use cached quests instead of direct API call
      const allQuests = await questCache.getQuests();

      // Use new quest filtering logic
      let npcQuests = allQuests
        .filter((quest) => quest.giver === npcData.type)
        .filter((quest) => {
          const activeQuest = currentPlayer.activeQuests.find(q => q.questId === quest.title);
          const isInCompleted = currentPlayer.completedQuests.some(q => q.questId === quest.title);        
          if (activeQuest) {
            const shouldShow = activeQuest.completed && !activeQuest.rewardCollected;
            return shouldShow;
          }          
          const shouldShow = (quest.repeatable === true || quest.repeatable === 'true') || !isInCompleted;
          return shouldShow;
        });

      // Filter by relationship requirements
      const relationship = currentPlayer.relationships?.find(rel => rel.name === npcData.type);
      npcQuests = npcQuests.filter((quest) => {
        // Check if quest has relationship requirements
        if (quest.rel || quest.relscore) {
          // If no relationship exists with this NPC, exclude the quest
          if (!relationship) return false;
          // Check relationship status requirement
          if (quest.rel && relationship[quest.rel] !== true) { return false; }
          // Check relationship score requirement
          if (quest.relscore && (relationship.relscore || 0) < quest.relscore) { return false; }
        }
        return true;
      });

      // Filter by FTUE step only if player is a first-time user
      if (currentPlayer.firsttimeuser === true) {
        // Apply FTUE filtering to the already-filtered npcQuests, not the original response.data
        npcQuests = npcQuests.filter((quest) => {
          // For first-time users:
          // 1. Quest must have ftuestep defined (not null, undefined, or empty string)
          // 2. Quest ftuestep must be <= current player ftuestep
          const hasFtuestep = quest.ftuestep != null && 
                             quest.ftuestep !== undefined && 
                             quest.ftuestep !== '' && 
                             quest.ftuestep !== 0;
          
          if (!hasFtuestep) {
            return false;
          } else if (quest.ftuestep > (currentPlayer.ftuestep || 0)) {
            return false;
          } else {
            return true;
          }
        });
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
        // No need to invalidate cache when accepting quests
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
      // Get relationship-based multiplier from RelationshipMatrix data
      const { multiplier, bonusMessage } = getRelationshipMultiplier(npcData.type, currentPlayer, strings);
      const rewardQuantity = Math.floor((quest.rewardqty || 1) * multiplier);
      
      // Ensure inventory and backpack are valid arrays
      const safeInventory = Array.isArray(inventory) ? inventory : [];
      const safeBackpack = Array.isArray(backpack) ? backpack : [];
      
      const success = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: quest.reward,
        quantity: rewardQuantity,
        inventory: safeInventory,
        backpack: safeBackpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
      });
      if (!success) return;

      // Award trophies for specific quest rewards
      try {
        if (quest.reward === "Prospero's Orb") {
          console.log(`🏆 Awarding Prospero's Orb trophy for collecting ${rewardQuantity} orb(s)`);
          
          // Award the Count-type trophy for each orb collected
          for (let i = 0; i < rewardQuantity; i++) {
            await earnTrophy(currentPlayer.playerId, "Prospero's Orb", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          }
          
          console.log(`✅ Successfully awarded ${rewardQuantity} Prospero's Orb trophy instance(s)`);
        }
        
        // TODO: Add other quest reward trophies here as needed
        // Example:
        // if (quest.reward === "Some Other Special Item") {
        //   await earnTrophy(currentPlayer.playerId, "Some Other Trophy", 1, currentPlayer, masterTrophies, setCurrentPlayer);
        // }
        
      } catch (error) {
        console.error('❌ Error awarding quest reward trophy:', error);
        // Don't fail the quest completion if trophy awarding fails
      }

      // Track quest progress for "Collect" type quests (use multiplied quantity)
      await trackQuestProgress(currentPlayer, 'Collect', quest.reward, rewardQuantity, setCurrentPlayer);

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
      });
      // Don't call refreshPlayerAfterInventoryUpdate here - gainIngredients already updated the state
      // and calling refresh would overwrite the local updates with potentially stale server data
      // Update player with quest progress but preserve the inventory that was just updated
      setCurrentPlayer(prev => ({
        ...prev,
        completedQuests: updatedPlayer.completedQuests,
        activeQuests: updatedActiveQuests,
      }));
      setQuestList((prevList) => prevList.filter((q) => q.title !== quest.title));
      
      // Show quest complete message with bonus if applicable
      if (bonusMessage) {
        updateStatus(`Action item complete! Received ${rewardQuantity} ${getLocalizedString(quest.reward, strings)}. ${bonusMessage}`);
      } else {
        updateStatus(201);
      }

    } catch (error) {
      console.error('Error collecting quest reward:', error);
      alert('Failed to collect quest reward.');
    }
  };


const handleGemPurchase = async (modifiedRecipe, actionType) => {
    // This is called by the gem button with a recipe modified to include gems
    // Route to the appropriate handler based on action type
    if (actionType === 'heal') {
      return handleHeal(modifiedRecipe);
    } else if (actionType === 'trade') {
      return handleTrade(modifiedRecipe);
    }
  };

const handleHeal = async (recipe) => {
    setErrorMessage('');

    if (!recipe) {
      setErrorMessage('Invalid healing recipe selected.');
      return;
    }
    // Fetch current HP and Max HP from playersInGridManager
    const gridId = currentPlayer?.location?.g;
    const playerId = currentPlayer._id?.toString();
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
    const spendResult = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });
    if (!spendResult) return;
    
    // Refresh player to update money display
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

    const healAmount = npcData.qtycollected;
    const statToMod = 'hp';
    const amountToMod = Math.min(healAmount, maxHp - currentHp);  // Ensure it doesn't exceed max HP

    try {
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

  const handleTrade = async (recipe) => {
    setErrorMessage('');
    if (!recipe) {
      setErrorMessage('Invalid recipe selected.');
      return;
    }

    let quantityToGive = recipe.tradeqty || 1;
    
    // Get relationship-based multiplier from RelationshipMatrix data
    const { multiplier, bonusMessage } = getRelationshipMultiplier(npcData.type, currentPlayer, strings);
    quantityToGive = Math.floor(quantityToGive * multiplier);
    
    // Check if we have room for the trade reward BEFORE spending ingredients
    const hasRoom = hasRoomFor({
      resource: recipe.type,
      quantity: quantityToGive,
      currentPlayer,
      inventory: inventory,  // Use current prop
      backpack: backpack,    // Use current prop
      masterResources
    });
    
    // Create safe copies after the capacity check
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];
    
    if (!hasRoom) {
      const isHomestead = currentPlayer?.location?.gtype === 'homestead';
      const isMoney = recipe.type === "Money";
      const isGem = recipe.type === "Gem";
      
      if (!isMoney && !isGem && !isHomestead) {
        // Check if player has backpack skill
        const hasBackpackSkill = currentPlayer?.skills?.some((item) => item.type === 'Backpack' && item.quantity > 0);
        if (!hasBackpackSkill) {
          updateStatus(19); // Missing backpack
        } else {
          updateStatus(21); // Backpack full
        }
      } else {
        updateStatus(20); // Warehouse full
      }
      return;
    }

    const spendResult = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });

    if (!spendResult || (spendResult.success !== undefined && !spendResult.success)) {
      setErrorMessage('Not enough ingredients.');
      return;
    }
    
    // Use the updated inventory and backpack from spendIngredients
    const gained = await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: recipe.type,
      quantity: quantityToGive,
      inventory: spendResult.updatedInventory,  // Use the updated inventory
      backpack: spendResult.updatedBackpack,   // Use the updated backpack
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
      masterResources,
    });
    
    if (!gained) {
      setErrorMessage('Failed to complete trade.');
      return;
    }

    // Track quest progress for trading (using 'Collect' action to match quest system)
    await trackQuestProgress(currentPlayer, 'Collect', recipe.type, quantityToGive, setCurrentPlayer);
    
    // Build ingredient list for status message
    const ingredientList = [];
    for (let i = 1; i <= 4; i++) {
      const ingredientType = recipe[`ingredient${i}`];
      const ingredientQty = recipe[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        ingredientList.push(`${ingredientQty} ${ingredientType}`);
      }
    }
    const ingredientString = ingredientList.join(', ');
    
    // Show success message with bonus if applicable
    updateStatus(`Exchanged ${ingredientString} for ${quantityToGive} ${getLocalizedString(recipe.type, strings)}.${bonusMessage}`);
  };

  const handleSellNPC = async () => {
    if (!npcData || !npcData.id) {
      console.error('Cannot sell NPC: Missing NPC data or ID');
      return;
    }

    try {
      const gridId = currentPlayer.location.g;
      await NPCsInGridManager.removeNPC(gridId, npcData.id);
      updateStatus(`${getLocalizedString(npcData.type, strings)} has been removed from the grid.`);
      onClose(); // Close the panel after selling
    } catch (error) {
      console.error('Error selling NPC:', error);
      updateStatus(`❌ Failed to remove ${getLocalizedString(npcData.type, strings)}.`);
    }
  };


  return (
    <Panel onClose={onClose} descriptionKey="1013" title={`${npcData.symbol} ${getLocalizedString(npcData.type, strings)}`} panelName="NPCPanel">

{/* //////////////////// QUESTS //////////////////////// */}

      {npcData.action === 'quest' && (
        <div className="quest-options">
          
          {/* Relationship Card - only show if NPC doesn't have output='noRel' */}
          {(() => {
            const npcResource = masterResources.find(r => r.type === npcData.type && r.category === 'npc');
            const shouldHideRelationship = npcResource?.output === 'noRel';
            
            if (shouldHideRelationship) {
              return null;
            }
            
            return (
              <RelationshipCard
            currentPlayer={currentPlayer}
            setCurrentPlayer={setCurrentPlayer}
            targetName={npcData.type}
            targetType="npc"
            targetEmoji={npcData.symbol}
            showActions={true}
            compact={false}
            masterInteractions={masterInteractions}
            updateStatus={updateStatus}
            masterResources={masterResources}
            playerPosition={(() => {
              const gridId = currentPlayer?.location?.g;
              const playerId = currentPlayer._id?.toString();
              const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
              return playerInGridState?.position || null;
            })()}
            targetPosition={(() => {
              const gridId = currentPlayer?.location?.g;
              const npcInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
              return npcInGrid?.position || null;
            })()}
            TILE_SIZE={TILE_SIZE}
            checkDistance={() => {
              // Get player position
              const gridId = currentPlayer?.location?.g;
              const playerId = currentPlayer._id?.toString();
              const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
              if (!playerInGridState?.position) return false;
              
              // Get NPC position
              const npcInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
              if (!npcInGrid?.position) return false;
              
              // Calculate distance
              const distance = calculateDistance(playerInGridState.position, npcInGrid.position);
              const playerRange = getDerivedRange(currentPlayer, masterResources);
              
              return distance <= playerRange;
            }}
            onInteractionClick={() => {
              return new Promise((resolve) => {
                const wasZoomedOut = zoomLevel !== 'closer';
                
                // Zoom to closer if not already
                if (wasZoomedOut) {
                  setZoomLevel('closer');
                  // Wait for zoom animation and re-render to complete
                  setTimeout(() => {
                    // Center camera on player after zoom
                    const gridId = currentPlayer?.location?.g;
                    const playerId = currentPlayer._id?.toString();
                    const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
                    if (playerInGridState?.position) {
                      // Use a larger tile size for closer zoom (typically 50)
                      const closerTileSize = masterResources?.find(r => r.type === 'globalTuning')?.closerZoom || 50;
                      centerCameraOnPlayer(playerInGridState.position, closerTileSize);
                    }
                    // Give additional time for camera centering
                    setTimeout(resolve, 300);
                  }, 100);
                } else {
                  // Already zoomed in, just center camera
                  const gridId = currentPlayer?.location?.g;
                  const playerId = currentPlayer._id?.toString();
                  const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
                  if (playerInGridState?.position) {
                    // Already at closer zoom, use current TILE_SIZE
                    centerCameraOnPlayer(playerInGridState.position, TILE_SIZE);
                  }
                  resolve();
                }
              });
            }}
            onRelationshipChange={(interaction, success) => {
              // Additional handling if needed after interaction completes
            }}
          />
            );
          })()}
          
          {/* Show message if quest interaction is not available due to relationship */}
          {!canQuest && (
            <div style={{ 
              padding: '10px', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '5px', 
              marginTop: '10px',
              textAlign: 'center',
              fontStyle: 'italic',
              color: '#666'
            }}>
              {strings[625]}
            </div>
          )}
          
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
                  <h2>{strings[511]} <br />{playerInGridState.hp} / {playerInGridState.maxhp}</h2>
                </>
              );
            } else {
              return <h4>{strings[512]}</h4>;
            }
          })()}
<br />
          {healRecipes.map((recipe) => {
            const ingredients = getIngredientDetails(recipe, masterResources);
            const affordable = canAfford(recipe, inventory, 1);
            const healAmount = recipe.qtycollected; // Healing value

            return (
              <ResourceButton
                key={recipe.type}
                symbol={recipe.symbol}
                name={getLocalizedString(recipe.type, strings)}
                details={`${strings[463]} ❤️‍🩹 +${healAmount}<br>${strings[461]} ${ingredients.join(', ') || 'None'}`}
                disabled={!affordable}
                onClick={() => handleHeal(recipe)}
                // Gem purchase props
                gemCost={recipe.gemcost || null}
                onGemPurchase={(recipe.gemcost && !affordable) ? (modifiedRecipe) => handleGemPurchase(modifiedRecipe, 'heal') : null}
                resource={recipe}
                inventory={inventory}
                backpack={backpack}
                masterResources={masterResources}
                currentPlayer={currentPlayer}
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

{/* //////////////////// TRADING //////////////////////// */}

      {npcData.action === 'trade' && (
        <div className="trade-options">
          
          {/* Relationship Card - only show if NPC doesn't have output='noRel' */}
          {(() => {
            const npcResource = masterResources.find(r => r.type === npcData.type && r.category === 'npc');
            const shouldHideRelationship = npcResource?.output === 'noRel';
            
            if (shouldHideRelationship) {
              return null;
            }
            
            return (
              <RelationshipCard
            currentPlayer={currentPlayer}
            setCurrentPlayer={setCurrentPlayer}
            targetName={npcData.type}
            targetType="npc"
            targetEmoji={npcData.symbol}
            showActions={true}
            compact={false}
            masterInteractions={masterInteractions}
            updateStatus={updateStatus}
            masterResources={masterResources}
            playerPosition={(() => {
              const gridId = currentPlayer?.location?.g;
              const playerId = currentPlayer._id?.toString();
              const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
              return playerInGridState?.position || null;
            })()}
            targetPosition={(() => {
              const gridId = currentPlayer?.location?.g;
              const npcInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
              return npcInGrid?.position || null;
            })()}
            TILE_SIZE={TILE_SIZE}
            checkDistance={() => {
              // Get player position
              const gridId = currentPlayer?.location?.g;
              const playerId = currentPlayer._id?.toString();
              const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
              if (!playerInGridState?.position) return false;
              
              // Get NPC position
              const npcInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
              if (!npcInGrid?.position) return false;
              
              // Calculate distance
              const distance = calculateDistance(playerInGridState.position, npcInGrid.position);
              const playerRange = getDerivedRange(currentPlayer, masterResources);
              
              return distance <= playerRange;
            }}
            onInteractionClick={() => {
              return new Promise((resolve) => {
                const wasZoomedOut = zoomLevel !== 'closer';
                
                // Zoom to closer if not already
                if (wasZoomedOut) {
                  setZoomLevel('closer');
                  // Wait for zoom animation and re-render to complete
                  setTimeout(() => {
                    // Center camera on player after zoom
                    const gridId = currentPlayer?.location?.g;
                    const playerId = currentPlayer._id?.toString();
                    const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
                    if (playerInGridState?.position) {
                      // Use a larger tile size for closer zoom (typically 50)
                      const closerTileSize = masterResources?.find(r => r.type === 'globalTuning')?.closerZoom || 50;
                      centerCameraOnPlayer(playerInGridState.position, closerTileSize);
                    }
                    // Give additional time for camera centering
                    setTimeout(resolve, 300);
                  }, 100);
                } else {
                  // Already zoomed in, just center camera
                  const gridId = currentPlayer?.location?.g;
                  const playerId = currentPlayer._id?.toString();
                  const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
                  if (playerInGridState?.position) {
                    // Already at closer zoom, use current TILE_SIZE
                    centerCameraOnPlayer(playerInGridState.position, TILE_SIZE);
                  }
                  resolve();
                }
              });
            }}
            onRelationshipChange={(interaction, success) => {
              // Additional handling if needed after interaction completes
            }}
          />
            );
          })()}
          
          {/* Show message if trade interaction is not available due to relationship */}
          {!canTrade && (
            <div style={{ 
              padding: '10px', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '5px', 
              marginTop: '10px',
              textAlign: 'center',
              fontStyle: 'italic',
              color: '#666'
            }}>
              {strings[626]}
            </div>
          )}
          
          {canTrade && (
            <>
              <h3>{strings[420]}</h3>
              {tradeRecipes.length > 0 ? (
                tradeRecipes.map((recipe) => {
                  const affordable = canAfford(recipe, inventory, backpack, 1);
                  const quantityToGive = recipe.tradeqty || 1;

                  // Format costs with color per ingredient (matching CraftingStation.js style)
                  const formattedCosts = [1, 2, 3, 4].map((i) => {
                    const type = recipe[`ingredient${i}`];
                    const qty = recipe[`ingredient${i}qty`];
                    if (!type || !qty) return '';
                    
                    const inventoryQty = inventory?.find(item => item.type === type)?.quantity || 0;
                    const backpackQty = backpack?.find(item => item.type === type)?.quantity || 0;
                    const playerQty = inventoryQty + backpackQty;
                    const color = playerQty >= qty ? 'green' : 'red';
                    const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                    return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
                  }).join('');

                  return (
                    <ResourceButton
                      key={recipe.type}
                      symbol={recipe.symbol}
                      name={getLocalizedString(recipe.type, strings)}
                      details={`${strings[461]}<div>${formattedCosts}</div>`}
                      disabled={!affordable}
                      onClick={() => handleTrade(recipe)}
                      // Gem purchase props
                      gemCost={recipe.gemcost || null}
                      onGemPurchase={(recipe.gemcost && !affordable) ? (modifiedRecipe) => handleGemPurchase(modifiedRecipe, 'trade') : null}
                      resource={recipe}
                      inventory={inventory}
                      backpack={backpack}
                      masterResources={masterResources}
                      currentPlayer={currentPlayer}
                    />
                  );
                })
              ) : (
                <p>{strings[423]}</p>
              )}
              
              {/* Trader story text */}
              {(() => {
                const storyStringMap = {
                  Iago: 1201,
                  Juliet: 1202,
                  Falstaff: 1203,
                  Apothecary: 1204,
                  Gertrude: 1205,
                  Leontes: 1206,
                  Caliban: 1207,
                };
                
                if (storyStringMap[npcData.type]) {
                  return (
                    <div className="trader-story">
                      <p>{strings[storyStringMap[npcData.type]]}</p>
                    </div>
                  );
                }
                return null;
              })()}
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

    </Panel>
  );
};

export default React.memo(NPCPanel);
