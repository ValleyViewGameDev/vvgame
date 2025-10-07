import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import '../../UI/ResourceButton.css';
import ResourceButton from '../../UI/ResourceButton';
import { canAfford } from '../../Utils/InventoryManagement';
import { spendIngredients, gainIngredients, refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { useStrings } from '../../UI/StringsContext';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/TransactionButton';
import '../../UI/SharedButtons.css';
import { earnTrophy } from '../Trophies/TrophyUtils';
import { showNotification } from '../../UI/Notifications/Notifications';
import './ScrollStation.css'; // Import for shared station panel styles

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
  masterTrophies,
  isDeveloper,
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

    const filteredRecipes = masterResources.filter((resource) =>
      resource.source === stationType &&
      (!currentPlayer.powers || !currentPlayer.powers.some(p => p.type === resource.type))
    );
    setRecipes(filteredRecipes);

    const stationResource = masterResources.find((resource) => resource.type === stationType);
    setStationEmoji(stationResource?.symbol || '🛖');
    setStationDetails(stationResource);
  }, [stationType, fetchTrigger, masterResources]);


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
          title: strings[7001] || 'Tip',
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
      earnTrophy(currentPlayer.playerId, 'Mariner', 1, currentPlayer, masterTrophies);
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
            recipes.map((recipe) => {
              const affordable = canAfford(recipe, inventory, backpack, 1);
              const meetsRequirement = hasRequirement(recipe.requires);
              
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

              const skillColor = meetsRequirement ? 'green' : 'red';

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
                (recipe.requires ? `<span style="color: ${skillColor};">Requires: ${recipe.requires}</span><br>` : '') +
                `Costs:<div>${formattedCosts}</div>`;

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
                  disabled={!affordable || !meetsRequirement}
                  onClick={() => handlePurchase(recipe)}
                  // Gem purchase props
                  gemCost={recipe.gemcost || null}
                  onGemPurchase={(recipe.gemcost && (!affordable || !meetsRequirement)) ? handleGemPurchase : null}
                  resource={recipe}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources}
                  currentPlayer={currentPlayer}
                >
                </ResourceButton>
              );
            })
          ) : <p>{strings[423]}</p>}

          {errorMessage && <p className="error-message">{errorMessage}</p>}
        </div>
        
        {(currentPlayer.location.gtype === 'homestead' || isDeveloper) && (
          <div className="station-panel-footer">
            <div className="standard-buttons">
              <TransactionButton 
                className="btn-danger" 
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