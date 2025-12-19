import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import '../../UI/Buttons/ResourceButton.css';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { canAfford, hasRoomFor } from '../../Utils/InventoryManagement';
import { spendIngredients, gainIngredients, refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { useStrings } from '../../UI/StringsContext';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import '../../UI/Buttons/SharedButtons.css';
import { earnTrophy } from '../Trophies/TrophyUtils';
import { showNotification } from '../../UI/Notifications/Notifications';
import './ScrollStation.css'; // Import for shared station panel styles
import { getDerivedLevel } from '../../Utils/playerManagement';

const ShopStation = ({
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
  TILE_SIZE,
  updateStatus,
  masterResources,
  masterTraders,
  masterTrophies,
  isDeveloper,
  globalTuning,
  masterXPLevels,
}) => {
  const strings = useStrings();
  const [recipes, setRecipes] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const [stationDetails, setStationDetails] = useState(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const hasRequirement = (requirement) => {
    return (
      !requirement ||
      currentPlayer.skills?.some(skill => skill.type === requirement) ||
      currentPlayer.powers?.some(power => power.type === requirement)
    );
  };

  // Check if player meets the level requirement for a resource
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => {
    if (!resourceLevel) return true; // No level requirement
    return playerLevel >= resourceLevel;
  };

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

  useEffect(() => {
    if (!masterResources || !stationType) return;

    // First check if this shop has trades defined in masterTraders
    const traderOffers = masterTraders?.filter(t => t.trader === stationType);

    if (traderOffers && traderOffers.length > 0) {
      // Transform each trader offer into the recipe format expected by the component
      const filteredRecipes = traderOffers.map(offer => {
        const resourceDef = masterResources.find(r => r.type === offer.gives);

        const recipe = {
          type: offer.gives,
          symbol: resourceDef?.symbol || '?',
          qtycollected: offer.givesqty || 1,
          source: stationType,
          gemcost: resourceDef?.gemcost || null,
          index: offer.index,
          repeat: offer.repeat,
          level: resourceDef?.level,
          requires: resourceDef?.requires,
          category: resourceDef?.category
        };

        // Collect all requires fields into ingredient format
        let ingredientCount = 1;
        for (let i = 1; i <= 7; i++) {
          const requiresField = `requires${i}`;
          const requiresQtyField = `requires${i}qty`;

          if (offer[requiresField]) {
            recipe[`ingredient${ingredientCount}`] = offer[requiresField];
            recipe[`ingredient${ingredientCount}qty`] = offer[requiresQtyField] || 1;
            ingredientCount++;
          }
        }

        return recipe;
      });

      // Filter out powers the player already has
      const finalRecipes = filteredRecipes.filter(recipe =>
        recipe.category !== 'power' ||
        !currentPlayer.powers?.some(p => p.type === recipe.type)
      );

      setRecipes(finalRecipes);
    } else {
      // Fallback to old method using masterResources.source
      const filteredRecipes = masterResources.filter((resource) =>
        resource.source === stationType &&
        (!currentPlayer.powers || !currentPlayer.powers.some(p => p.type === resource.type))
      );
      setRecipes(filteredRecipes);
    }

    const stationResource = masterResources.find((resource) => resource.type === stationType);
    setStationEmoji(stationResource?.symbol || '🛖');
    setStationDetails(stationResource);
  }, [stationType, fetchTrigger, masterResources, masterTraders, currentPlayer.powers]);


  const handleGemPurchase = async (modifiedRecipe) => {
    // This is called by the gem button with a recipe modified to include gems
    return handlePurchase(modifiedRecipe);
  };

  const handlePurchase = async (recipe) => {
    setErrorMessage('');
    if (!recipe) {
      setErrorMessage('Invalid recipe selected.');
      return;
    }

    // For non-power items, check if there's room before spending money
    if (recipe.category !== "power") {
      const quantity = recipe.qtycollected || 1;
      const hasRoom = hasRoomFor({
        resource: recipe.type,
        quantity: quantity,
        currentPlayer,
        inventory: inventory,
        backpack: backpack,
        masterResources,
        globalTuning
      });
      
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

    // Refresh player to update money display after any purchase
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

    const tradedQty = 1;

    if (recipe.category === "power") {
      const updatedPowers = [...(currentPlayer.powers || [])];
      const powerIndex = updatedPowers.findIndex(p => p.type === recipe.type);
      if (powerIndex >= 0) {
        updatedPowers[powerIndex].quantity += tradedQty;
      } else {
        updatedPowers.push({ type: recipe.type, quantity: tradedQty });
      }
      await axios.post(`${API_BASE}/api/update-powers`, {
        playerId: currentPlayer.playerId,
        powers: updatedPowers,
      });
      setCurrentPlayer(prev => ({
        ...prev,
        powers: updatedPowers,
      }));
      // Helper functions to categorize powers
      const isWeapon = (resource) => resource.passable === true && typeof resource.damage === 'number' && resource.damage > 0;
      const isArmor = (resource) => resource.passable === true && typeof resource.armorclass === 'number' && resource.armorclass > 0;
      const isMagicEnhancement = (resource) => !isWeapon(resource) && !isArmor(resource);
      
      // Only update combat stats for magic enhancements (not weapons/armor)
      if (isMagicEnhancement(recipe)) {
        const gridPlayer = playersInGridManager.getAllPCs(gridId)?.[currentPlayer.playerId];
        if (gridPlayer) {
          const combatAttributes = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
          const statUpdates = {};
          
          // Check for combat attributes on this power
          combatAttributes.forEach(attr => {
            if (typeof recipe[attr] === 'number') {
              const oldValue = gridPlayer[attr] || 0;
              const newValue = oldValue + recipe[attr];
              statUpdates[attr] = newValue;
              console.log(`🧠 Updated ${attr} for player ${currentPlayer.playerId}: ${oldValue} -> ${newValue}`);
            }
          });
          
          // Update all modified stats at once
          if (Object.keys(statUpdates).length > 0) {
            await playersInGridManager.updatePC(gridId, currentPlayer.playerId, statUpdates);
          }
        }
      } else {
        // Weapons and armor don't update combat stats until equipped
        console.log(`${recipe.type} added to inventory - equip in Combat Panel to apply stats`);
        
        // Send notification for newly purchased equipment
        showNotification('Message', {
          title: strings[7004] || 'Note:',
          message: strings[7017] || 'Equip in Combat Panel to use'
        });
      }
    }
    else {
      const gainSuccess = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: recipe.type,
        quantity: recipe.qtycollected || 1,
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
        globalTuning,
      });

      if (!gainSuccess) {
        console.warn(`Failed to gain ${recipe.type}`);
        return;
      }
    }

    await trackQuestProgress(currentPlayer, 'Buy', recipe.type, tradedQty, setCurrentPlayer);

    updateStatus(`${strings[80]} ${recipe.type}.`);
    
    // Award Mariner trophy if purchased a Boat
    if (recipe.type === 'Boat' && currentPlayer?.playerId) {
      earnTrophy(currentPlayer.playerId, 'Mariner', 1, currentPlayer, masterTrophies, setCurrentPlayer);
    }

    // Award King's Crown trophy if purchased King's Crown
    if (recipe.type === "King's Crown" && currentPlayer?.playerId) {
      earnTrophy(currentPlayer.playerId, "King's Crown", 1, currentPlayer, masterTrophies, setCurrentPlayer);
    }

    // Award Trident trophy if purchased Trident
    if (recipe.type === "Trident" && currentPlayer?.playerId) {
      earnTrophy(currentPlayer.playerId, "Trident", 1, currentPlayer, masterTrophies, setCurrentPlayer);
    }

    setFetchTrigger(prev => prev + 1);
  };

  const handleSellStation = async () => {
    try {
      const success = await handleProtectedSelling({
        currentPlayer,
        stationType,
        currentStationPosition,
        gridId,
        setResources,
        setInventory,
        setCurrentPlayer,
        updateStatus,
        onClose,
        devOnly: true,
      });
      
      if (success) {
        onClose();
      }
    } catch (error) {
      console.error('Error selling station:', error);
      updateStatus('Failed to sell station');
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1025" title={`${stationEmoji} ${stationType}`} panelName="ShopStation">
      <div className="station-panel-container">
        <div className="station-panel-content">
          {/* ✅ Conditional TENT text for the Store */}
          {stationType === "Store" && (
            <p style={{ fontWeight: "bold", color: "#4CAF50" }}>
              {strings["410"]}
            </p>
          )}
          {recipes?.length > 0 ? (
            (() => {
              // Filter out non-repeatable items the player already has
              const filteredRecipes = recipes.filter((recipe) => {
                if (recipe.repeat === false) {
                  const hasInInventory = inventory?.some(item => item.type === recipe.type);
                  const hasInBackpack = backpack?.some(item => item.type === recipe.type);
                  if (hasInInventory || hasInBackpack) {
                    return false;
                  }
                }
                return true;
              });

              // If all trades were filtered out, show a message
              if (filteredRecipes.length === 0) {
                return <p>{strings[423]}</p>;
              }

              return filteredRecipes.map((recipe) => {
              const affordable = canAfford(recipe, inventory, backpack, 1);
              const meetsSkillRequirement = hasRequirement(recipe.requires);
              const meetsLevel = meetsLevelRequirement(recipe.level);
              const requirementsMet = meetsSkillRequirement && meetsLevel;

              // Handle multiple combat attributes for powers
              let outputSummary = null;
              if (recipe.category === 'power') {
                const combatAttributes = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
                const effects = [];
                
                combatAttributes.forEach(attr => {
                  if (typeof recipe[attr] === 'number') {
                    const label = strings[attr] || attr;
                    effects.push(`${recipe[attr] > 0 ? '+' : ''}${recipe[attr]} ${label}`);
                  }
                });
                
                
                if (effects.length > 0) {
                  outputSummary = <span style={{ color: 'blue' }}>{effects.join(', ')}</span>;
                }
              }

              // Format costs in UI standard style
              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = recipe[`ingredient${i}`];
                const qty = recipe[`ingredient${i}qty`];
                if (!type || !qty) return '';
                const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
                const backpackQty = backpack?.find(item => item.type === type)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = meetsSkillRequirement ? 'green' : 'red';
              const levelColor = meetsLevel ? 'green' : 'red';

              // Build details string with multiple combat attributes for powers
              let effectsHtml = '';
              if (recipe.category === 'power') {
                const combatAttributes = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
                const effects = [];
                
                combatAttributes.forEach(attr => {
                  if (typeof recipe[attr] === 'number') {
                    const label = strings[attr] || attr;
                    effects.push(`${recipe[attr] > 0 ? '+' : ''}${recipe[attr]} ${label}`);
                  }
                });
                
                
                if (effects.length > 0) {
                  effectsHtml = `<span style="color: blue;">${effects.join(', ')}</span><br>`;
                }
              }

              const details =
                effectsHtml +
                (recipe.level ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${recipe.level}</span>` : '') +
                (recipe.requires ? `<span style="color: ${skillColor};">${strings[460] || 'Requires:'} ${recipe.requires}</span>` : '') +
                `${strings[461] || 'Costs:'}<div>${formattedCosts}</div>`;

              let infoContent = null;
              
              // Special tooltip content for Tent and Boat at General Store
              if (stationType === "Store" || stationType === "General Store") {
                if (recipe.type === "Tent") {
                  infoContent = <div>{strings[81]}</div>; // "Pitching a tent in Town or the Valley prevents you from being attacked."
                } else if (recipe.type === "Boat") {
                  infoContent = <div>{strings[82]}</div>; // "A boat will allow you to travel by water."
                }
              }
              
              // For other items (like powers), show combat attributes
              if (!infoContent && outputSummary) {
                infoContent = (
                  <div style={{ marginBottom: '4px' }}>
                    <strong>{outputSummary}</strong>
                  </div>
                );
              }
              
              const info = infoContent ? (
                <div className="info-content">
                  {infoContent}
                </div>
              ) : null;
              
              return (
                <ResourceButton
                  key={recipe.type}
                  symbol={recipe.symbol}
                  name={recipe.type}
                  className="resource-button"
                  details={details}
                  info={info}
                  disabled={!affordable || !requirementsMet}
                  onClick={() => handlePurchase(recipe)}
                  // Gem purchase props - don't pass gemCost to allow dynamic calculation
                  gemCost={null}
                  onGemPurchase={(recipe.gemcost && (!affordable || !requirementsMet)) ? handleGemPurchase : null}
                  meetsLevelRequirement={meetsLevel}
                  resource={recipe}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources}
                  currentPlayer={currentPlayer}
                >
                </ResourceButton>
              );
            });
            })()
          ) : <p>{strings[423]}</p>}

          {errorMessage && <p className="error-message">{errorMessage}</p>}
        </div>
        
        {isDeveloper && (
          <div className="station-panel-footer">
            <div className="shared-buttons">
              <TransactionButton
                className="btn-basic btn-danger"
                onAction={handleSellStation}
                transactionKey={`sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
              >
                {strings[490]}
              </TransactionButton>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default React.memo(ShopStation);