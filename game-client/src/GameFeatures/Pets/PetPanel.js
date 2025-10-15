import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { spendIngredients, gainIngredients, canAfford } from '../../Utils/InventoryManagement';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import TransactionButton from '../../UI/TransactionButton';
import { formatCountdown } from '../../UI/Timers';
import { showNotification } from '../../UI/Notifications/Notifications';
import { earnTrophy } from '../Trophies/TrophyUtils';
import { selectWeightedRandomItem, getDropQuantity } from '../../Utils/DropRates';
import '../../UI/SharedButtons.css';
import '../../UI/ResourceButton.css'; 
import './PetPanel.css';

// Helper function to get a random reward from pets source with rarity weighting
const getRandomPetReward = (masterResources, petLevel = 1) => {
  // Get all resources with source === 'pets'
  const petRewards = masterResources.filter(res => res.source === 'pets');
  
  if (petRewards.length === 0) {
    console.warn('No pet rewards found in masterResources');
    return null;
  }
  
  // Use the shared drop rate utility with pet level multiplier
  // Higher level pets have better drop rates (level 2 = 2x rates, level 5 = 5x rates)
  const selectedReward = selectWeightedRandomItem(petRewards, petLevel);
  
  if (!selectedReward) {
    return null;
  }
  
  // Determine quantity based on rarity using shared utility
  const quantity = getDropQuantity(selectedReward.scrollchance || 'common');
  
  return {
    type: selectedReward.type,
    quantity,
    rarity: selectedReward.scrollchance || 'common'
  };
};

const PetPanel = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  petResource, // The specific pet resource that was clicked
  currentPetPosition,
  gridId,
  masterResources,
  masterSkills,
  masterTrophies,
  TILE_SIZE,
  isDeveloper,
}) => {
  const strings = useStrings();
  const { updateStatus } = useContext(StatusBarContext);
  const [activeTimer, setActiveTimer] = useState(false);
  const [rewardItem, setRewardItem] = useState(null);
  const [feedingCountdown, setFeedingCountdown] = useState(null);
  const [isFeeding, setIsFeeding] = useState(false);
  const [isReadyToCollect, setIsReadyToCollect] = useState(false);
  const [revealedRewardQty, setRevealedRewardQty] = useState(1);
  const [revealedRewardRarity, setRevealedRewardRarity] = useState('common');
  const [isCollecting, setIsCollecting] = useState(false);
  const [canAffordFeeding, setCanAffordFeeding] = useState(false);

  // Get pet details from the resource
  const petName = petResource?.type || 'Pet';
  const petSymbol = petResource?.symbol || '=';
  const feedIngredient = petResource?.output || 'Milk'; // What the pet needs to be fed
  const feedQuantity = petResource?.qtycollected || 1; // How much of the ingredient is needed
  const feedingTime = petResource?.crafttime || 60; // How long the pet takes to find rewards

  // Check if we can afford to feed the pet
  useEffect(() => {
    const checkAffordability = () => {
      const affordable = canAfford(
        { ingredient1: feedIngredient, ingredient1qty: feedQuantity },
        [...(inventory || []), ...(backpack || [])]
      );
      setCanAffordFeeding(affordable);
    };
    
    checkAffordability();
  }, [inventory, backpack, feedIngredient, feedQuantity]);

  // Check for active feeding timer or ready rewards
  useEffect(() => {
    if (!petResource || !currentPetPosition) return;

    const checkPetState = () => {
      const pet = GlobalGridStateTilesAndResources.getResources()?.find(
        (res) => res.x === currentPetPosition.x && res.y === currentPetPosition.y
      );
      
      if (pet && pet.craftEnd && pet.craftedItem) {
        // Check if this is a revealed reward (craftEnd in the past)
        const now = Date.now();
        const isRevealed = pet.craftEnd < now;
        
        setRewardItem(pet.craftedItem);
        setRevealedRewardQty(pet.qty || 1);
        setRevealedRewardRarity(pet.rarity || 'common');
        
        if (isRevealed) {
          setIsFeeding(false);
          setIsReadyToCollect(true);
          setFeedingCountdown(0);
          setActiveTimer(false);
        } else {
          // Pet is still searching for rewards
          setIsFeeding(true);
          setActiveTimer(true);
          
          const remainingTime = Math.max(0, Math.floor((pet.craftEnd - now) / 1000));
          setFeedingCountdown(remainingTime);
          
          if (remainingTime === 0) {
            setIsFeeding(false);
            setIsReadyToCollect(true);
          }
        }
      } else {
        // Only reset if we actually had something before
        if (rewardItem || isFeeding || isReadyToCollect) {
          setRewardItem(null);
          setIsFeeding(false);
          setIsReadyToCollect(false);
          setFeedingCountdown(null);
          setActiveTimer(false);
          setRevealedRewardQty(1);
          setRevealedRewardRarity('common');
        }
      }
    };

    // Initial check
    checkPetState();

    // Set up interval to check for updates
    const timer = setInterval(checkPetState, 1000);
    return () => clearInterval(timer);
  }, [petResource, currentPetPosition, rewardItem, isFeeding, isReadyToCollect]);

  // Handle feeding the pet
  const handleFeedPet = async (transactionId, transactionKey) => {
    if (!canAffordFeeding) {
      updateStatus(`You need ${feedQuantity}x ${getLocalizedString(feedIngredient, strings)} to feed ${getLocalizedString(petName, strings)}`);
      return;
    }

    try {
      // First, spend the feed ingredients
      const spentSuccess = await spendIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        recipe: { ingredient1: feedIngredient, ingredient1qty: feedQuantity },
        inventory: currentPlayer.inventory,
        backpack: currentPlayer.backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
      });

      if (!spentSuccess) {
        updateStatus(`Failed to feed ${getLocalizedString(petName, strings)}`);
        return;
      }

      // Generate random reward using pet's level for better drop rates
      const petLevel = petResource?.level || 1; // Default to level 1 if not specified
      const reward = getRandomPetReward(masterResources, petLevel);
      
      if (!reward) {
        console.error('Failed to generate pet reward');
        updateStatus('Something went wrong while feeding the pet');
        return;
      }

      // Start the feeding timer using standard craft API
      const response = await axios.post(`${API_BASE}/api/crafting/start-craft`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentPetPosition.x,
        stationY: currentPetPosition.y,
        recipe: {
          type: reward.type,
          crafttime: feedingTime,
          // No ingredients since we already spent them
        },
        qty: reward.quantity,
        rarity: reward.rarity, // Store rarity for display
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        // Update local state with server response
        const { craftEnd, craftedItem, inventory, backpack } = response.data;
        
        // Update inventory from server response if provided
        if (inventory) {
          setInventory(inventory);
          setCurrentPlayer(prev => ({ ...prev, inventory }));
        }
        if (backpack) {
          setBackpack(backpack);
          setCurrentPlayer(prev => ({ ...prev, backpack }));
        }

        // Update pet resource in global state with qty and rarity
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentPetPosition.x && res.y === currentPetPosition.y
            ? { ...res, craftEnd, craftedItem, qty: reward.quantity, rarity: reward.rarity }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Update UI state
        setRewardItem(craftedItem);
        setRevealedRewardQty(reward.quantity);
        setRevealedRewardRarity(reward.rarity);
        setFeedingCountdown(Math.max(0, Math.floor((craftEnd - Date.now()) / 1000)));
        setActiveTimer(true);
        setIsFeeding(true);
        setIsReadyToCollect(false);

        // Refresh player data to ensure consistency
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        // Update status
        const feedMessage = `Fed ${getLocalizedString(petName, strings)} ${feedQuantity}x ${getLocalizedString(feedIngredient, strings)}`;
        FloatingTextManager.addFloatingText(feedMessage, currentPetPosition.x, currentPetPosition.y, TILE_SIZE);
        updateStatus(`${getLocalizedString(petName, strings)}${strings[8014] || ' is searching for treasures...'}`);

        // Track quest progress for feeding pets
        await trackQuestProgress(currentPlayer, 'Feed', petName, 1, setCurrentPlayer);
      }
    } catch (error) {
      console.error('Error in pet feeding process:', error);
      updateStatus(`Failed to feed ${getLocalizedString(petName, strings)}`);
    }
  };

  // Handle collection of pet rewards
  const handleCollectReward = async (transactionId, transactionKey) => {
    if (!rewardItem || isCollecting) {
      console.error("L No reward to collect or already collecting.");
      return;
    }

    setIsCollecting(true);
    
    try {
      const response = await axios.post(`${API_BASE}/api/crafting/collect-item`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentPetPosition.x,
        stationY: currentPetPosition.y,
        craftedItem: rewardItem,
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        const { collectedItem, isNPC } = response.data;
        const collectedQty = revealedRewardQty || 1;

        // Find the reward item in master resources to check its category
        const rewardResource = masterResources.find(res => res.type === collectedItem);
        
        const gained = await gainIngredients({
            playerId: currentPlayer.playerId,
            currentPlayer,
            resource: collectedItem,
            quantity: collectedQty,
            inventory: currentPlayer.inventory,
            backpack: currentPlayer.backpack,
            setInventory,
            setBackpack,
            setCurrentPlayer,
            updateStatus,
            masterResources,
        });

        if (!gained) {
            console.error('L Failed to add pet reward to inventory.');
            setIsCollecting(false);
            return;
        }
        
        FloatingTextManager.addFloatingText(`+${collectedQty} ${getLocalizedString(collectedItem, strings)}`, currentPetPosition.x, currentPetPosition.y, TILE_SIZE);

        // Track quest progress
        await trackQuestProgress(currentPlayer, 'Collect', collectedItem, collectedQty, setCurrentPlayer);

        // Clear pet state
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentPetPosition.x && res.y === currentPetPosition.y
            ? { ...res, craftEnd: undefined, craftedItem: undefined, qty: 1, rarity: undefined }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Reset UI state
        setActiveTimer(false);
        setRewardItem(null);
        setFeedingCountdown(null);
        setIsReadyToCollect(false);
        setRevealedRewardQty(1);
        setRevealedRewardRarity('common');

        // Update status - only if we're not dealing with already owned skills/powers
        if (!(rewardResource && (rewardResource.category === 'skill' || rewardResource.category === 'power' || rewardResource.category === 'upgrade') && 
            (rewardResource.category === 'skill' 
              ? currentPlayer.skills?.some(skill => skill.type === collectedItem)
              : currentPlayer.powers?.some(power => power.type === collectedItem)))) {
          updateStatus(`${getLocalizedString(petName, strings)} found ${collectedQty}x ${getLocalizedString(collectedItem, strings)}!`);
        }

        // Refresh player data
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        // Clear collecting state after a brief delay
        setTimeout(() => {
          setIsCollecting(false);
        }, 100);
      } else {
        setIsCollecting(false);
      }
    } catch (error) {
      console.error('Error collecting pet reward:', error);
      updateStatus('L Failed to collect reward');
      setIsCollecting(false);
    }
  };

  return (
    <Panel onClose={onClose} title={getLocalizedString(petName, strings)} panelName="PetPanel">
      <div className="pet-panel-container">
        <div className="pet-panel-content">

          {/* Pet display */}
          <div className="pet-display">{petSymbol}</div>

          {/* Pet info */}
          <div className="pet-info">

            <p className="pet-status">
              {isFeeding ? (
                `${getLocalizedString(petName, strings)}${strings[8014] || ' is searching for treasures...'}`
              ) : isReadyToCollect ? (
                `${getLocalizedString(petName, strings)}${strings[8016] || ' has found something!'}`
              ) : (
                <>
                  {strings[8010] || 'This pet is hungry.'}<br/>
                  {strings[8011] || 'Feed'} {feedQuantity}x {getLocalizedString(feedIngredient, strings)}{strings[8012] || ' to send it searching.'}
                </>
              )}
            </p>
          </div>

          {/* Show feeding/collection state */}
          {rewardItem && (isFeeding || isReadyToCollect) ? (
            // Show animated pet searching or reward collection interface
            isFeeding ? (
              // Animated pet searching
              <div className="pet-searching">
                <div className="pet-searching-countdown">{formatCountdown(Date.now() + feedingCountdown * 1000, Date.now())}</div>
              </div>
            ) : (
              // Use standard ResourceButton for collect state
              (() => {
                const rewardResource = masterResources.find(r => r.type === rewardItem);
                
                return (
                  <ResourceButton
                    symbol={rewardResource?.symbol || '📦'}
                    name={`${getLocalizedString(rewardItem, strings)}${revealedRewardQty > 1 ? ` (${revealedRewardQty})` : ''}`}
                    className={`resource-button pet-collect-button scroll-collect-button rarity-${revealedRewardRarity} ${isCollecting ? 'collecting' : 'ready'}`}
                    disabled={!isReadyToCollect || isCollecting}
                    isTransactionMode={isReadyToCollect && !isCollecting}
                    transactionKey={isReadyToCollect ? `pet-collect-${rewardItem}-${currentPetPosition.x}-${currentPetPosition.y}` : undefined}
                    onTransactionAction={isReadyToCollect ? handleCollectReward : undefined}
                  />
                );
              })()
            )
          ) : !isCollecting ? (
            // Show feed pet button when not feeding and not collecting
            <ResourceButton
              name={`${strings[8011] || 'Feed'} ${getLocalizedString(petName, strings)}`}
              className="resource-button"
              details={`${strings[461] || 'Requires'} ${feedQuantity}x ${getLocalizedString(feedIngredient, strings)}`}
              ingredientDetails={getIngredientDetails(
                { ingredient1: feedIngredient, ingredient1qty: feedQuantity },
                masterResources
              )}
              disabled={!canAffordFeeding}
              isValid={canAffordFeeding}
              isTransactionMode={canAffordFeeding}
              transactionKey={canAffordFeeding ? `pet-feed-${petName}-${currentPetPosition.x}-${currentPetPosition.y}` : undefined}
              onTransactionAction={canAffordFeeding ? handleFeedPet : undefined}
            />
          ) : null}

        </div>
      </div>
    </Panel>
  );
};

export default React.memo(PetPanel);