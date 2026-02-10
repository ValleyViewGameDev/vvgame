import API_BASE from '../../config';
import React, { useState, useEffect, useMemo } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { handleConstruction, handleConstructionWithGems } from '../BuildAndBuy';
import { getIngredientDetails, hasRequiredSkill as checkRequiredSkill, isVisibleToPlayer } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { usePanelContext } from '../../UI/Panels/PanelContext';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { getDerivedLevel } from '../../Utils/playerManagement';
import { updatePlayerSettings } from '../../settings';

// Farm Animals Progress Bar Component
const FarmAnimalsProgressBar = ({ currentFarmAnimals, maxFarmAnimals }) => {
  const percentage = Math.min((currentFarmAnimals / maxFarmAnimals) * 100, 100);
  const isFull = currentFarmAnimals >= maxFarmAnimals;

  return (
    <div style={{
      marginBottom: '15px',
      padding: '0 2px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        {/* Progress bar */}
        <div style={{
          flex: 1,
          height: '8px',
          backgroundColor: '#a5a1a1',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${percentage}%`,
            backgroundColor: isFull ? '#e57373' : '#5acb60',
            transition: 'width 0.3s ease'
          }} />
        </div>

        {/* Count display */}
        <span style={{
          fontSize: '12px',
          fontWeight: 'bold',
          color: isFull ? '#e57373' : '#5acb60',
          minWidth: '40px',
          textAlign: 'right'
        }}>
          {currentFarmAnimals}/{maxFarmAnimals}
        </span>
      </div>
    </div>
  );
};

const BuyPanel = ({
  TILE_SIZE,
  resources,
  setResources,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  gridId,
  masterResources,
  masterSkills,
  updateStatus,
  isDeveloper,
  currentSeason,
  NPCsInGrid,
  globalTuning,
  masterXPLevels,
  cursorMode,
  setCursorMode,
}) => {
  const { closePanel } = usePanelContext();
  const [buyOptions, setBuyOptions] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const strings = useStrings();
  const [placeWithCursor, setPlaceWithCursor] = useState(
    currentPlayer?.settings?.plantWithCursor ?? false
  );
  // Track which item is currently being processed (for cursor mode lock)
  const [processingItem, setProcessingItem] = useState(null);

  // Toggle handler - persists to player settings
  const handleToggleChange = (checked) => {
    setPlaceWithCursor(checked);
    if (!checked) {
      setCursorMode(null);
    }
    // Persist to player settings (uses same setting as farming panel)
    updatePlayerSettings({ plantWithCursor: checked }, currentPlayer, setCurrentPlayer);
  };

  // Handle selecting an item for cursor mode
  // Note: item passed here is already the effectiveItem with scaled costs for display
  const handleCursorModeSelect = (effectiveItem) => {
    // Build effective options with scaled costs for this item (for initial display)
    const effectiveBuildOptions = buyOptions.map(opt =>
      opt.type === effectiveItem.type ? effectiveItem : opt
    );
    // Capture the original (unscaled) item for fresh cost calculation
    const originalItem = buyOptions.find(opt => opt.type === effectiveItem.type);

    setCursorMode({
      type: 'build',
      item: effectiveItem.type,
      emoji: effectiveItem.symbol || '🐮',
      filename: effectiveItem.filename || null,
      size: effectiveItem.size || 1,
      buildOptions: effectiveBuildOptions,
      // Spam-click protection for cursor mode
      isProcessing: false,
      setProcessing: (processing) => {
        setProcessingItem(processing ? effectiveItem.type : null);
        // Update cursorMode's isProcessing flag
        setCursorMode(prev => prev ? { ...prev, isProcessing: processing } : null);
      },
      // Callback to get fresh scaled costs before each purchase
      // This reads fresh from NPCsInGrid at execution time to get current animal count
      getEffectiveBuildOptions: () => {
        // Count animals fresh from NPCsInGrid at time of click
        const freshAnimalCount = NPCsInGrid?.[gridId]?.npcs
          ? Object.values(NPCsInGrid[gridId].npcs).filter(npc => npc.action === 'graze').length
          : 0;
        const inflation = globalTuning?.farmAnimalInflation || 0.1;

        // Calculate fresh effective item with current animal count
        const freshEffectiveItem = originalItem ? (() => {
          if (!originalItem.passable || originalItem.action !== 'graze') return originalItem;
          const scaledItem = { ...originalItem };
          for (let i = 1; i <= 4; i++) {
            const ingredientKey = `ingredient${i}`;
            const qtyKey = `ingredient${i}qty`;
            if (scaledItem[ingredientKey] === 'Money' && scaledItem[qtyKey]) {
              if (freshAnimalCount === 0) {
                // No scaling needed
              } else {
                const multiplier = Math.pow(1 + inflation, freshAnimalCount);
                const scaledCost = scaledItem[qtyKey] * multiplier;
                scaledItem[qtyKey] = Math.ceil(scaledCost / 50) * 50;
              }
            }
          }
          return scaledItem;
        })() : effectiveItem;

        return buyOptions.map(opt =>
          opt.type === effectiveItem.type ? freshEffectiveItem : opt
        );
      },
    });
  };

  useEffect(() => {
    const fetchData = async () => {
//      setIsContentLoading(true);
      try { 
        const inventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setInventory(inventoryResponse.data.inventory || []);
        const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
        const allResourcesData = resourcesResponse.data;
        setAllResources(allResourcesData);
        const isHomestead = currentPlayer?.location?.gtype === 'homestead';
        const purchasableItems = allResourcesData.filter(
          (resource) => {
            // Filter out devonly resources unless player is a developer
            if (!isVisibleToPlayer(resource, isDeveloper)) return false;

            // Check if resource is a buy item
            if (resource.source !== 'Buy') return false;

            // Check passability based on location
            if (!isDeveloper && !isHomestead && resource.passable === false) return false;

            // Check seasonal restriction
            if (resource.season && currentSeason && resource.season !== currentSeason) {
              return false;
            }

            return true;
          }
        );
        setBuyOptions(purchasableItems);
      } catch (error) {
        console.error('Error fetching buy panel data:', error);
      } finally {
        setIsContentLoading(false);
      }
    }; 

    fetchData();
  }, [currentPlayer]);

  // Local wrapper for the utility function
  const hasRequiredSkill = (requiredSkill) => checkRequiredSkill(requiredSkill, currentPlayer);

  // Check if player meets the level requirement for a resource
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => {
    if (!resourceLevel) return true; // No level requirement
    return playerLevel >= resourceLevel;
  };

  // Handle direct purchase (non-cursor mode) with spam-click protection
  const handleDirectPurchase = async (transactionId, transactionKey, item) => {
    console.log(`🔒 [BUY_PANEL] Starting protected purchase for ${item.type}`);
    // Count animals fresh from NPCsInGrid at time of purchase
    const freshAnimalCount = NPCsInGrid?.[gridId]?.npcs
      ? Object.values(NPCsInGrid[gridId].npcs).filter(npc => npc.action === 'graze').length
      : 0;
    // Get fresh effective item with current scaled costs using fresh count
    const effectiveItem = getEffectiveItem(item, freshAnimalCount);
    const effectiveBuildOptions = buyOptions.map(opt =>
      opt.type === item.type ? effectiveItem : opt
    );
    await handleConstruction({
      TILE_SIZE,
      selectedItem: item.type,
      buildOptions: effectiveBuildOptions,
      inventory,
      setInventory,
      backpack,
      setBackpack,
      resources,
      setResources,
      setErrorMessage: console.error,
      currentPlayer,
      setCurrentPlayer,
      gridId,
      updateStatus,
    });
    console.log(`✅ [BUY_PANEL] Purchase completed for ${item.type}`);
  };

  const handleGemPurchase = async (modifiedRecipe) => {
    // If placeWithCursor is enabled, put the gem-modified item into cursor mode
    if (placeWithCursor) {
      const item = buyOptions.find(opt => opt.type === modifiedRecipe.type) || modifiedRecipe;
      setCursorMode({
        type: 'build',
        item: modifiedRecipe.type,
        emoji: item.symbol || '🐮',
        filename: item.filename || null,
        size: item.size || 1,
        buildOptions: buyOptions,
        modifiedRecipe: modifiedRecipe, // Include the gem-modified recipe for cursor placement
        // Spam-click protection for cursor mode
        isProcessing: false,
        setProcessing: (processing) => {
          setProcessingItem(processing ? modifiedRecipe.type : null);
          setCursorMode(prev => prev ? { ...prev, isProcessing: processing } : null);
        },
      });
      return;
    }
    // Normal mode: buy at player position immediately with gems
    return handleConstructionWithGems({
      TILE_SIZE,
      selectedItem: modifiedRecipe.type,
      buildOptions: buyOptions,
      inventory,
      setInventory,
      backpack,
      setBackpack,
      resources,
      setResources,
      currentPlayer,
      setCurrentPlayer,
      gridId,
      updateStatus,
      modifiedRecipe, // Pass the gem-modified recipe
    });
  };

  // Count current farm animals on the grid
  // This function reads fresh from NPCsInGrid each time it's called
  const countFarmAnimals = () => {
    if (!NPCsInGrid?.[gridId]?.npcs) return 0;
    return Object.values(NPCsInGrid[gridId].npcs).filter(npc => npc.action === 'graze').length;
  };

  const maxFarmAnimals = globalTuning?.maxFarmAnimals || 10; // Default to 10 if not set
  const currentFarmAnimals = countFarmAnimals();
  const farmAnimalInflation = globalTuning?.farmAnimalInflation || 0.1; // Default 10% increase per animal

  // Calculate scaled Money cost for farm animals based on existing animals on grid
  // Takes animalCount as parameter to avoid stale closure issues
  const getScaledMoneyCost = (baseCost, animalCount) => {
    if (animalCount === 0) return baseCost;
    // Each existing animal compounds the cost by farmAnimalInflation (e.g., 10%)
    // Example with 10%: 0 animals = 500, 1 = 550, 2 = 605 → 650, 3 = 665 → 700
    const multiplier = Math.pow(1 + farmAnimalInflation, animalCount);
    const scaledCost = baseCost * multiplier;
    // Round up to nearest 50
    return Math.ceil(scaledCost / 50) * 50;
  };

  // Get the effective item with scaled Money cost for farm animals
  // Takes optional animalCount parameter - if not provided, uses current count
  const getEffectiveItem = (item, animalCount = currentFarmAnimals) => {
    // Only apply scaling to farm animals (graze action)
    if (!item.passable || item.action !== 'graze') return item;

    // Create a copy with scaled Money costs
    const scaledItem = { ...item };
    for (let i = 1; i <= 4; i++) {
      const ingredientKey = `ingredient${i}`;
      const qtyKey = `ingredient${i}qty`;
      if (scaledItem[ingredientKey] === 'Money' && scaledItem[qtyKey]) {
        scaledItem[qtyKey] = getScaledMoneyCost(scaledItem[qtyKey], animalCount);
      }
    }
    return scaledItem;
  };

  return (
    <Panel onClose={closePanel} descriptionKey="1003" titleKey="1103" panelName="BuyPanel">
      <div className="standard-panel">
        {/* Place with cursor toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '8px',
          marginBottom: '10px',
          padding: '5px 0'
        }}>
          <label style={{ fontFamily: 'var(--font-title-4-family)', fontSize: 'var(--font-title-4-size)', cursor: 'pointer' }}>
            {strings[10187] || 'Place with cursor'}
          </label>
          <input
            type="checkbox"
            checked={placeWithCursor}
            onChange={(e) => handleToggleChange(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
        </div>

        {/* Farm Animals Progress Bar */}
        <FarmAnimalsProgressBar
          currentFarmAnimals={currentFarmAnimals}
          maxFarmAnimals={maxFarmAnimals}
        />

        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {buyOptions.map((item) => {
              // Get effective item with scaled costs for farm animals
              const effectiveItem = getEffectiveItem(item);
              const ingredients = getIngredientDetails(effectiveItem, allResources);
              const affordable = canAfford(effectiveItem, inventory);
              const meetsSkillRequirement = hasRequiredSkill(item.requires);
              const meetsLevel = meetsLevelRequirement(item.level);
              const requirementsMet = meetsSkillRequirement && meetsLevel;

              // Check if this is a farm animal and if we've hit the limit
              const isFarmAnimal = item.passable && item.action === 'graze';
              const farmAnimalLimitReached = isFarmAnimal && currentFarmAnimals >= maxFarmAnimals;
              const isDisabled = !affordable || !requirementsMet || farmAnimalLimitReached;
              const isSelectedForCursor = cursorMode?.type === 'build' && cursorMode?.item === item.type;

              // Build className based on state
              let buttonClassName = '';
              if (isSelectedForCursor) buttonClassName += 'cursor-selected ';

              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = effectiveItem[`ingredient${i}`];
                const qty = effectiveItem[`ingredient${i}qty`];
                if (!type || !qty) return '';

                const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
                const backpackQty = backpack?.find(bpItem => bpItem.type === type)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = allResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = meetsSkillRequirement ? 'green' : 'red';
              const levelColor = meetsLevel ? 'green' : 'red';
              const details =
                (farmAnimalLimitReached ? `<span style="color: red;">${strings[407]} (${maxFarmAnimals})</span>` : '') +
                (item.level ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${item.level}</span>` : '') +
                (item.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(item.requires, strings)}</span>` : '') +
                `${strings[461]}<div>${formattedCosts}</div>`;

              // Create info tooltip content
              const info = (
                <div className="info-content">
                  <div>{strings[820]}{item.output ? `${allResources.find(r => r.type === item.output)?.symbol || ''} ${getLocalizedString(item.output, strings)}` : 'Nothing'}</div>
                  <div>{strings[821]}{item.qtycollected || 1}</div>
                </div>
              );

              // Check if this item is currently processing in cursor mode
              const isCursorProcessing = processingItem === item.type;

              return (
                <ResourceButton
                  key={item.type}
                  symbol={item.symbol}
                  name={getLocalizedString(item.type, strings)}
                  details={details}
                  info={info}
                  disabled={isDisabled}
                  className={buttonClassName}
                  onClick={placeWithCursor ? () => {
                    // In cursor mode: select this item for placing via clicks
                    if (!isDisabled && !isCursorProcessing) {
                      handleCursorModeSelect(effectiveItem);
                    }
                  } : undefined}
                  // Transaction mode for direct purchases (non-cursor mode)
                  isTransactionMode={!placeWithCursor}
                  transactionKey={`buy-${item.type}-${gridId}`}
                  onTransactionAction={!placeWithCursor ? (txId, txKey) => handleDirectPurchase(txId, txKey, item) : undefined}
                  // External processing state for cursor mode (shows yellow + hourglass)
                  externalProcessing={isCursorProcessing}
                  onGemPurchase={(item.gemcost && (!affordable || !requirementsMet) && !farmAnimalLimitReached) ? handleGemPurchase : null}
                  meetsLevelRequirement={meetsLevel}
                  resource={effectiveItem}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources || allResources}
                  currentPlayer={currentPlayer}
                  devOnly={item.requires === 'devonly'}
                />
              );
            })}
          </>
        )}
      </div>
    </Panel>
  );
};

export default React.memo(BuyPanel);