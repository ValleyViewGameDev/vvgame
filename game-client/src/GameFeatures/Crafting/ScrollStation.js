import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import '../../UI/Buttons/ResourceButton.css';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import '../../UI/Buttons/SharedButtons.css';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { getRandomScrollReveal, getRevealDisplayString, canAffordReveal } from './ScrollReveal';
import { gainSkillOrPower } from '../../Utils/SkillPowerManagement';
import { showNotification } from '../../UI/Notifications/Notifications';
import { earnTrophy } from '../Trophies/TrophyUtils';
import './ScrollStation.css';

const ScrollStation = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
  masterResources,
  masterSkills,
  masterTrophies,
  TILE_SIZE,
  isDeveloper,
  globalTuning,
}) => {
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const strings = useStrings();
  const [allResources, setAllResources] = useState([]);
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const { updateStatus } = useContext(StatusBarContext);
  const [stationDetails, setStationDetails] = useState(null);
  const [activeTimer, setActiveTimer] = useState(false);
  const [craftedItem, setCraftedItem] = useState(null);
  const [craftingCountdown, setCraftingCountdown] = useState(null);
  const [isCrafting, setIsCrafting] = useState(false);
  const [isReadyToCollect, setIsReadyToCollect] = useState(false);
  const [scrollCount, setScrollCount] = useState(0);
  const [revealedItemQty, setRevealedItemQty] = useState(1);
  const [isCollecting, setIsCollecting] = useState(false);

   // ✅ Check for active crafting timers or revealed items
   // Updated to support slots-based crafting (uses slot 0 for scroll reveals)
   useEffect(() => {
    if (!stationType || !currentStationPosition) return;

    const checkStation = () => {
      const station = GlobalGridStateTilesAndResources.getResources()?.find(
        (res) => res.x === currentStationPosition.x && res.y === currentStationPosition.y
      );

      // Check for crafting data - support both slots array (new) and legacy fields
      let craftEndValue = null;
      let craftedItemValue = null;
      let qty = 1;

      if (station) {
        // Check slots array first (new format)
        if (station.slots && station.slots[0] && station.slots[0].craftedItem) {
          craftEndValue = station.slots[0].craftEnd;
          craftedItemValue = station.slots[0].craftedItem;
          qty = station.slots[0].qty || 1;
        }
        // Fallback to legacy fields
        else if (station.craftEnd && station.craftedItem) {
          craftEndValue = station.craftEnd;
          craftedItemValue = station.craftedItem;
          qty = station.qty || 1;
        }
      }

      if (craftEndValue && craftedItemValue) {
          // Check if this is a revealed item (craftEnd in the past)
          const now = Date.now();
          const isRevealed = craftEndValue < now;

          setCraftedItem(craftedItemValue);
          setRevealedItemQty(qty);

          if (isRevealed) {
              setIsCrafting(false);
              setIsReadyToCollect(true);
              setCraftingCountdown(0);
              setActiveTimer(false);
          } else {
              // Normal crafting timer
              setIsCrafting(true);
              setActiveTimer(true);

              const remainingTime = Math.max(0, Math.floor((craftEndValue - now) / 1000));
              setCraftingCountdown(remainingTime);

              if (remainingTime === 0) {
                  setIsCrafting(false);
                  setIsReadyToCollect(true);
              }
          }
      } else {
          // Only reset if we actually had something before
          if (craftedItem || isCrafting || isReadyToCollect) {
            setCraftedItem(null);
            setIsCrafting(false);
            setIsReadyToCollect(false);
            setCraftingCountdown(null);
            setActiveTimer(false);
            setRevealedItemQty(1);
          }
      }
    };

    // Initial check
    checkStation();

    // Set up interval to check for updates
    const timer = setInterval(checkStation, 1000);
    return () => clearInterval(timer);
  }, [stationType, currentStationPosition, craftedItem, isCrafting, isReadyToCollect]); // Include state to ensure fresh closures


  // Sync inventory with local storage and server
  useEffect(() => {
    const syncInventory = async () => {
      try {
        const storedInventory = JSON.parse(localStorage.getItem('inventory')) || [];
        setInventory(storedInventory);

        const serverResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        const serverInventory = serverResponse.data.inventory || [];
        if (JSON.stringify(storedInventory) !== JSON.stringify(serverInventory)) {
          setInventory(serverInventory);
          localStorage.setItem('inventory', JSON.stringify(serverInventory));
        }
      } catch (error) {
        console.error('Error syncing inventory:', error);
      }
    };
    syncInventory();
  }, [currentPlayer]);

  // Calculate scroll count from inventory and backpack
  useEffect(() => {
    const allItems = [...(inventory || []), ...(backpack || [])];
    const scrolls = allItems.find(item => item.type === 'Scroll');
    setScrollCount(scrolls?.quantity || 0);
  }, [inventory, backpack]);

  // Fetch station details and resources
  // Note: ScrollStation doesn't display recipes - scroll reveals are random
  useEffect(() => {
    try {
      const stationResource = masterResources.find((resource) => resource.type === stationType);
      setStationEmoji(stationResource?.symbol || '🛖');
      setStationDetails(stationResource);
      setAllResources(masterResources || []);
    } catch (error) {
      console.error('Error processing masterResources:', error);
    }
  }, [stationType, masterResources]);

  const handleSellStation = async (transactionId, transactionKey) => {
    await handleProtectedSelling({
      currentPlayer,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      setResources,
      stationType,
      currentStationPosition,
      gridId,
      TILE_SIZE,
      updateStatus,
      onClose,
      devOnly: !isHomestead, // Only verify developer status when NOT on homestead
    });
  };
  
  // Generate skill bonus message
  const getSkillBonusMessage = () => {
    // Find all skills that apply to this station
    const applicableSkills = Object.entries(masterSkills || {})
      .filter(([skillName, stations]) => {
        return stations && typeof stations === 'object' && stations[stationType] > 1;
      })
      .map(([skillName, stations]) => ({
        skillName,
        multiplier: stations[stationType],
        hasSkill: currentPlayer.skills?.some(item => item.type === skillName)
      }));
    
    if (applicableSkills.length === 0) return null;
    
    // Separate owned and unowned skills
    const ownedSkills = applicableSkills.filter(skill => skill.hasSkill);
    const unownedSkills = applicableSkills.filter(skill => !skill.hasSkill);
    
    // Calculate combined multiplier for owned skills
    const combinedMultiplier = ownedSkills.reduce((total, skill) => total * skill.multiplier, 1);
    
    let messages = [];
    
    // Message for owned skills
    if (ownedSkills.length > 0) {
      if (ownedSkills.length === 1) {
        // Single skill: "Your [skill] Skill increases the base output of this station by [X]."
        messages.push(`${strings[805]}${getLocalizedString(ownedSkills[0].skillName, strings)}${strings[806]}${ownedSkills[0].multiplier}x.`);
      } else {
        // Multiple skills: list them with their multipliers and show combined effect
        const skillsList = ownedSkills
          .map(skill => `${getLocalizedString(skill.skillName, strings)} (${skill.multiplier}x)`)
          .join(' & ');
        messages.push(`Your ${skillsList} skills combine to increase output by ${combinedMultiplier}x.`);
      }
    }
    
    // Message for unowned skills
    if (unownedSkills.length > 0) {
      unownedSkills.forEach(skill => {
        const skillResource = allResources.find(res => res.type === skill.skillName);
        const skillSource = skillResource?.source || 'Skill Shop';
        // "Acquire the [skill] Skill at the [source] to increase the output of this station by [X]x."
        messages.push(`${strings[801]}${getLocalizedString(skill.skillName, strings)}${strings[802]}${getLocalizedString(skillSource, strings)}${strings[803]}${skill.multiplier}x.`);
      });
    }
    
    return messages.join(' ');
  };

  const skillMessage = getSkillBonusMessage();


  // Handle reveal scroll - spend scroll and start crafting random item
  const handleRevealScroll = async (transactionId, transactionKey) => {
    
    if (scrollCount === 0) {
      updateStatus(strings[820] || 'You need at least 1 scroll to reveal');
      return;
    }

    try {
      // First, spend the scroll
      const spentSuccess = await spendIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        recipe: { ingredient1: 'Scroll', ingredient1qty: 1 },
        inventory: currentPlayer.inventory,  
        backpack: currentPlayer.backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
      });

      if (!spentSuccess) {
        updateStatus(strings[820] || 'Failed to spend scroll');
        return;
      }

      // Generate random reward
      const reward = getRandomScrollReveal(masterResources);
      const rewardDisplay = getRevealDisplayString(reward, masterResources);
      
      // Get the Reveal Scroll resource to get crafttime
      const revealScrollResource = masterResources.find(r => r.type === 'Reveal Scroll');
      const craftTime = revealScrollResource?.crafttime || 30; // Default 30 seconds

      // Now start crafting the revealed item using standard craft API
      const response = await axios.post(`${API_BASE}/api/crafting/start-craft`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
        recipe: {
          type: reward.type,
          crafttime: craftTime,
          // No ingredients since we already spent the scroll
        },
        qty: reward.quantity,
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

        // Update station resource in global state using slots format
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res => {
          if (res.x === currentStationPosition.x && res.y === currentStationPosition.y) {
            const newSlots = res.slots ? [...res.slots] : [];
            newSlots[0] = { craftEnd, craftedItem, qty: reward.quantity };
            return { ...res, slots: newSlots };
          }
          return res;
        });
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Update UI state
        setCraftedItem(craftedItem);
        setRevealedItemQty(reward.quantity);
        setCraftingCountdown(Math.max(0, Math.floor((craftEnd - Date.now()) / 1000)));
        setActiveTimer(true);
        setIsCrafting(true);
        setIsReadyToCollect(false);

        // Refresh player data to ensure consistency
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        // Update status
        FloatingTextManager.addFloatingText(strings[829], currentStationPosition.x, currentStationPosition.y, TILE_SIZE);

        // Track quest progress for scroll spending
        await trackQuestProgress(currentPlayer, 'Spend', 'Scroll', 1, setCurrentPlayer);

      }
    } catch (error) {
      console.error('Error in scroll reveal process:', error);
      updateStatus(strings[830]);
    }
  };

  // Handle collection of revealed items (reuse standard collect logic)
  const handleCollectReveal = async (transactionId, transactionKey) => {
    
    if (!craftedItem || isCollecting) { 
      console.error("❌ No revealed item to collect or already collecting."); 
      return; 
    }

    setIsCollecting(true);
    
    try {
      const response = await axios.post(`${API_BASE}/api/crafting/collect-item`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
        craftedItem,
        slotIndex: 0, // Ancient Temple always uses slot 0
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        const { collectedItem, isNPC } = response.data;
        const collectedQty = revealedItemQty || 1;

        // Find the revealed item in master resources to check its category
        const revealedResource = allResources.find(res => res.type === collectedItem);
        
        // Handle collection based on item category
        if (isNPC) {
          // Spawn NPC
          const craftedResource = allResources.find(res => res.type === collectedItem);
          if (craftedResource) {
            NPCsInGridManager.spawnNPC(gridId, craftedResource, { x: currentStationPosition.x, y: currentStationPosition.y });
          }
          FloatingTextManager.addFloatingText(`+${collectedQty} ${getLocalizedString(collectedItem, strings)}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
        } else if (revealedResource && (revealedResource.category === 'skill' || revealedResource.category === 'power')) {
          // Check if player already has this skill/power
          const alreadyOwned = revealedResource.category === 'skill' 
            ? currentPlayer.skills?.some(skill => skill.type === collectedItem)
            : currentPlayer.powers?.some(power => power.type === collectedItem);
          
          if (alreadyOwned) {
            // Player already has this item - show special message
            updateStatus(strings[828] || 'You already have this');
            
            // Still create floating text to show what was attempted
            const displayName = getLocalizedString(collectedItem, strings);
            const categoryEmoji = revealedResource.category === 'skill' ? '💪' : 
                                revealedResource.category === 'power' ? '⚡' : '🔧';
            FloatingTextManager.addFloatingText(`${categoryEmoji} ${displayName} (Already Owned)`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
          } else {
            // Handle skills, powers, and upgrades
            const success = await gainSkillOrPower({
              item: revealedResource,
              currentPlayer,
              setCurrentPlayer,
              updateStatus,
              strings,
              gridId,
              quantity: collectedQty
            });
            
            if (!success) {
              console.error('❌ Failed to add skill/power to player.');
              setIsCollecting(false);
              return;
            }
            
            // Create floating text
            const displayName = getLocalizedString(collectedItem, strings);
            const categoryEmoji = revealedResource.category === 'skill' ? '💪' : 
                                revealedResource.category === 'power' ? '⚡' : '🔧';
            FloatingTextManager.addFloatingText(`${categoryEmoji} ${displayName}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
            
            // Handle combat stats updates for powers (mimic ShopStation logic)
            if (revealedResource.category === 'power') {
              // Helper functions to categorize powers
              const isWeapon = (resource) => resource.passable === true && typeof resource.damage === 'number' && resource.damage > 0;
              const isArmor = (resource) => resource.passable === true && typeof resource.armorclass === 'number' && resource.armorclass > 0;
              const isMagicEnhancement = (resource) => !isWeapon(resource) && !isArmor(resource);
              
              if (isMagicEnhancement(revealedResource)) {
                // Update combat stats for magic enhancements
                const gridPlayer = playersInGridManager.getAllPCs(gridId)?.[currentPlayer._id];
                if (gridPlayer) {
                  const combatAttributes = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
                  const statUpdates = {};
                  
                  // Check for combat attributes on this power
                  combatAttributes.forEach(attr => {
                    if (typeof revealedResource[attr] === 'number') {
                      const oldValue = gridPlayer[attr] || 0;
                      const newValue = oldValue + revealedResource[attr];
                      statUpdates[attr] = newValue;
                      console.log(`🧠 Updated ${attr} for player ${currentPlayer._id}: ${oldValue} -> ${newValue}`);
                    }
                  });
                  
                  // Update all modified stats at once
                  if (Object.keys(statUpdates).length > 0) {
                    await playersInGridManager.updatePC(gridId, currentPlayer._id, statUpdates);
                  }
                }
              } else {
                // Weapons and armor require equipping - send notification
                showNotification('Message', {
                  title: strings[7001] || 'Tip',
                  message: strings[7017] || 'Equip in Combat Panel to use'
                });
              }
            }
          }
        } else {
          // Handle regular doobers - add to inventory
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
            globalTuning,
          });

          if (!gained) {
            console.error('❌ Failed to add revealed item to inventory.');
            setIsCollecting(false);
            return;
          }
          
          FloatingTextManager.addFloatingText(`+${collectedQty} ${getLocalizedString(collectedItem, strings)}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
        }

        // Track quest progress
        await trackQuestProgress(currentPlayer, 'Collect', collectedItem, collectedQty, setCurrentPlayer);

        // Clear station state using slots format
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res => {
          if (res.x === currentStationPosition.x && res.y === currentStationPosition.y) {
            const newSlots = res.slots ? [...res.slots] : [];
            newSlots[0] = { craftEnd: null, craftedItem: null, qty: 1 };
            return { ...res, slots: newSlots };
          }
          return res;
        });
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Reset UI state
        setActiveTimer(false);
        setCraftedItem(null);
        setCraftingCountdown(null);
        setIsReadyToCollect(false);
        setRevealedItemQty(1);

        // Update status - only if we're not dealing with already owned skills/powers
        if (!(revealedResource && (revealedResource.category === 'skill' || revealedResource.category === 'power') &&
            (revealedResource.category === 'skill'
              ? currentPlayer.skills?.some(skill => skill.type === collectedItem)
              : currentPlayer.powers?.some(power => power.type === collectedItem)))) {
          updateStatus(`${strings[469] || 'Collected'} ${collectedQty}x ${getLocalizedString(collectedItem, strings)}`);
        }

        // Refresh player data
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        // Award Scroll Revealer trophy for successful scroll reveals
        if (currentPlayer?.playerId) {
          earnTrophy(currentPlayer.playerId, 'Scroll Revealer', 1, currentPlayer, masterTrophies, setCurrentPlayer);
        }

        // Clear collecting state after a brief delay
        setTimeout(() => {
          setIsCollecting(false);
        }, 100);
      } else {
        setIsCollecting(false);
      }
    } catch (error) {
      console.error('Error collecting revealed item:', error);
      updateStatus('❌ Failed to collect item');
      setIsCollecting(false);
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1036" title={strings[1136] || 'Ancient Temple'} panelName="ScrollStation">
      <div className="station-panel-container">
        <div className="station-panel-content">

        {/* Scroll count display */}

        <div style={{
          padding: '10px',
          textAlign: 'center',
          fontSize: '16px',
          fontWeight: 'bold',
         }}>
          {strings[825]}: <br></br>{scrollCount} 📜 {scrollCount > 1 ? strings[826] : strings[827]}
        </div>


        {skillMessage && (
          <div style={{
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: 'var(--color-bg-light)',
            borderRadius: '5px',
            fontStyle: 'italic'
          }}>
            {skillMessage}
          </div>
        )}

        {/* Show crafting item if active, otherwise show Reveal Scroll button */}

        {craftedItem && (isCrafting || isReadyToCollect) ? (
          // Show animated scroll reveal or dramatic collect interface
          isCrafting ? (
            // Animated scroll emoji during crafting
            <div className="scroll-reveal-animation">
              <div className="scroll-emoji">📜</div>
              <div className="scroll-revealing-text">Revealing Scroll...</div>
              <div className="scroll-countdown-text">{formatCountdown(Date.now() + craftingCountdown * 1000, Date.now())}</div>
            </div>
          ) : (
            // Use standard ResourceButton for collect state
            (() => {
              const revealedResource = masterResources.find(r => r.type === craftedItem);
              const rarity = revealedResource?.scrollchance || 'common';
              const rarityText = typeof rarity === 'string' ? rarity.toUpperCase() : 'COMMON';
              
              return (
                <ResourceButton
                  symbol={revealedResource?.symbol || '📦'}
                  name={`\n${getLocalizedString(craftedItem, strings)}${revealedItemQty > 1 ? ` (${revealedItemQty})` : ''}`}
                  className={`resource-button scroll-collect-button rarity-${typeof rarity === 'string' ? rarity : 'common'} ${isCollecting ? 'collecting' : 'ready'}`}
                  details={rarityText} 
                  disabled={!isReadyToCollect || isCollecting}
                  isTransactionMode={isReadyToCollect && !isCollecting}
                  transactionKey={isReadyToCollect ? `scroll-collect-${craftedItem}-${currentStationPosition.x}-${currentStationPosition.y}` : undefined}
                  onTransactionAction={isReadyToCollect ? handleCollectReveal : undefined}
                />
              );
            })()
          )
        ) : scrollCount > 0 && !isCollecting ? (
          // Show reveal scroll button when not crafting and not collecting
          <ResourceButton
            name={strings[831]}
            className="resource-button"
            details={`${strings[461]} 1x 📜 ${strings[827]}`}
            disabled={false}
            isTransactionMode={true}
            transactionKey={`scroll-reveal-${currentStationPosition.x}-${currentStationPosition.y}`}
            onTransactionAction={handleRevealScroll}
          />
        ) : null}
        
        {/* Show message when no scrolls */}
        {scrollCount === 0 && !craftedItem && (
          <p style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
            {strings[832]}
          </p>
        )}

        </div>
        
        {(currentPlayer.location.gtype === 'homestead' || isDeveloper) && (
          <div className="station-panel-footer">
            <div className="shared-buttons">
              <TransactionButton 
                className="btn-basic btn-danger" 
                onAction={handleSellStation}
                transactionKey={`sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
              >
                {strings[425]}
              </TransactionButton>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default React.memo(ScrollStation);