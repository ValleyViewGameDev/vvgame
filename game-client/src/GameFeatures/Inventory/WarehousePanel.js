import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { canAfford, isCurrency } from '../../Utils/InventoryManagement';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import { deriveWarehouseAndBackpackCapacity } from '../../Utils/InventoryManagement';
// import { handlePurchase } from '../../Store/Store'; // COMMENTED OUT - Gold Pass
// import GoldPassBenefitsModal from '../../UI/Modals/GoldPassBenefitsModal'; // COMMENTED OUT - Gold Pass
import './WarehousePanel.css';

const WarehousePanel = ({
  onClose,
  setInventory,
  currentPlayer,
  setCurrentPlayer,
  masterResources,
  globalTuning,
  masterWarehouse,
  updateStatus,
}) => {
  const strings = useStrings();
  const inventory = currentPlayer?.inventory || [];
  const [currentLevel, setCurrentLevel] = useState(0);
  const [nextLevel, setNextLevel] = useState(null);
  const [needsLevelMigration, setNeedsLevelMigration] = useState(false);
  // const [showBenefitsModal, setShowBenefitsModal] = useState(false); // COMMENTED OUT - Gold Pass

  // Calculate current warehouse level and handle backward compatibility
  useEffect(() => {
    if (!masterWarehouse || masterWarehouse.length === 0) return;
    
    // Use the stored level if available
    if (currentPlayer?.warehouseLevel !== undefined) {
      setCurrentLevel(currentPlayer.warehouseLevel);
      setNeedsLevelMigration(false);
    } else {
      // For backward compatibility, start at level 0
      setCurrentLevel(0);
      setNeedsLevelMigration(true);
      
      // Auto-migrate the level to the player document
      if (currentPlayer?.playerId) {
        migrateLevelToPlayer(0);
      }
    }
    
    // Get next level data
    const level = currentPlayer?.warehouseLevel ?? currentLevel;
    if (level < masterWarehouse.length - 1) {
      setNextLevel(masterWarehouse[level + 1]);
    } else {
      setNextLevel(null);
    }
  }, [currentPlayer?.warehouseCapacity, currentPlayer?.warehouseLevel, masterWarehouse]);

  // Function to migrate level to player document
  const migrateLevelToPlayer = async (level) => {
    try {
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: {
          warehouseLevel: level
        }
      });

      if (response.data.success) {
        // Update local state
        setCurrentPlayer({
          ...currentPlayer,
          warehouseLevel: level
        });
        setNeedsLevelMigration(false);
        console.log('Successfully migrated warehouse level to player document');
      }
    } catch (error) {
      console.error('Error migrating warehouse level:', error);
    }
  };

  const handleGemPurchase = async (modifiedRecipe) => {
    // This is called by the gem button with a recipe modified to include gems
    return handleUpgrade(modifiedRecipe);
  };

  const handleUpgrade = async (customRecipe = null) => {
    if (!nextLevel) return;

    const recipeToUse = customRecipe || nextLevel;

    // Build ingredients array
    const ingredients = [];
    
    // Add all 5 potential ingredients (including gems if present)
    for (let i = 1; i <= 5; i++) {
      const ingredientType = recipeToUse[`ingredient${i}`];
      const ingredientQty = recipeToUse[`ingredient${i}qty`];
      
      if (ingredientType && ingredientQty) {
        ingredients.push({
          type: ingredientType,
          quantity: ingredientQty
        });
      }
    }
    
    console.log('Warehouse upgrade - Recipe to use:', recipeToUse);
    console.log('Warehouse upgrade - Ingredients array:', ingredients);

    // Check if player can afford (now handled by spendIngredients)
    if (!customRecipe && !canAfford(nextLevel, inventory, null, 1)) {
      updateStatus(16); // Cannot afford message
      return;
    }

    try {
      // Spend ingredients using the proper async function
      const spendSuccess = await spendIngredients({
        playerId: currentPlayer.playerId,
        recipe: recipeToUse,
        inventory,
        backpack: [],
        setInventory,
        setBackpack: () => {}, // Not using backpack for warehouse upgrades
        setCurrentPlayer,
        updateStatus,
      });

      if (!spendSuccess) {
        console.warn('Failed to spend ingredients.');
        return;
      }
      
      // Calculate new capacity and level
      const newCapacity = (currentPlayer.warehouseCapacity || 1000) + nextLevel.add;
      const newLevel = nextLevel.Level;
      
      // Update player's warehouse capacity AND level
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: {
          warehouseCapacity: newCapacity,
          warehouseLevel: newLevel
        }
      });

      if (response.data.success) {
        // Update local state
        setCurrentPlayer({
          ...currentPlayer,
          warehouseCapacity: newCapacity,
          warehouseLevel: newLevel
        });

        updateStatus(`${strings[197] || "Warehouse upgraded"}`);
      }
    } catch (error) {
      console.error('Error upgrading warehouse:', error);
      updateStatus('Failed to upgrade warehouse');
    }
  };

  // Get current capacity info
  const finalCapacities = deriveWarehouseAndBackpackCapacity(currentPlayer, masterResources, globalTuning);
  
  // Get Gold bonus from globalTuning prop
  const warehouseGoldBonus = globalTuning?.warehouseCapacityGold || 100000;
  
  // Calculate total quantity in warehouse (excluding currencies)
  const calculateTotalQuantity = (inventory) => {
    if (!inventory || !Array.isArray(inventory)) return 0;
    return inventory
      .filter((item) => item && !isCurrency(item.type))
      .reduce((total, item) => total + (item.quantity || 0), 0);
  };
  
  const currentUsage = calculateTotalQuantity(inventory);

  return (
    <Panel 
      onClose={onClose} 
      titleKey="181" // "Warehouse"
      panelName="WarehousePanel"
    >
      <div className="standard-panel">
        <div className="warehouse-capacity-display">
          <h3>
            {strings[183]} {currentUsage} / {" "}
            <span style={currentPlayer?.accountStatus === "Gold" ? {color: "#B8860B"} : {}}>
              {finalCapacities.warehouse}
            </span>
          </h3>
          {currentPlayer?.accountStatus === "Gold" && (
            <p style={{fontSize: "14px", color: "#666", margin: "5px 0"}}>
              (+{warehouseGoldBonus.toLocaleString()} {strings[89] || "additional capacity for Gold Pass"})
            </p>
          )}
        </div>



        {nextLevel ? (
          <>
            <div className="skills-options">
              <ResourceButton
                symbol="📦"
                name={strings[2024] || "Upgrade Warehouse"}
                details={(() => {
                  // Build details string similar to CraftingStation
                  const ingredients = [];
                  for (let i = 1; i <= 5; i++) {
                    const type = nextLevel[`ingredient${i}`];
                    const qty = nextLevel[`ingredient${i}qty`];
                    if (!type || !qty) continue;
                    
                    const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
                    const playerQty = inventoryQty;
                    const color = playerQty >= qty ? 'green' : 'red';
                    const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                    ingredients.push(`<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`);
                  }
                  return `${strings[461] || "Requires:"}<div>${ingredients.join('')}</div>`;
                })()}
                info={`+${nextLevel.add} ${strings[2021] || "capacity"}`}
                disabled={!canAfford(nextLevel, inventory, null, 1)}
                onClick={() => handleUpgrade()}
                // Don't pass gemCost prop - instead ensure resource has gemcost property
                onGemPurchase={!canAfford(nextLevel, inventory, null, 1) ? handleGemPurchase : null}
                resource={{...nextLevel, gemcost: 1}} // Add gemcost property to enable gem button
                inventory={inventory}
                backpack={[]}
                masterResources={masterResources}
                currentPlayer={currentPlayer}
              />
            </div>
            <p className="upgrade-info">
              {strings[196] || "Add"} {nextLevel.add} {strings[198] || "to warehouse capacity"}
            </p>
          </>
        ) : (
          <div className="max-level">
            <p>{strings[88] || "Your warehouse is at maximum capacity."}</p>
          </div>
        )}

        {/* Gold Pass promotion for non-Gold users - COMMENTED OUT
        {currentPlayer?.accountStatus !== 'Gold' && (
          <>
            <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '20px 0' }}>
              <button
                className="btn-basic btn-gold"
                onClick={() => handlePurchase(1, currentPlayer, updateStatus)}
              >
                {strings[9061]}
              </button>
            </div>
            <div className="gold-pass-info" style={{ textAlign: 'center', marginBottom: '20px', fontSize: '14px', color: '#666' }}>
              {strings[199]}
            </div>
          </>
        )}
        */}

        {/* Link to view Gold Pass benefits - COMMENTED OUT
        <div style={{ textAlign: 'center', marginTop: '10px' }}>
          <button
            onClick={() => setShowBenefitsModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#B8860B',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {strings[10131] || "Gold Pass Benefits"}
          </button>
        </div>
        */}

      </div>

      {/* Gold Pass Benefits Modal - COMMENTED OUT
      <GoldPassBenefitsModal
        isOpen={showBenefitsModal}
        onClose={() => setShowBenefitsModal(false)}
      />
      */}
    </Panel>
  );
};

export default WarehousePanel;