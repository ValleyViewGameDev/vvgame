import API_BASE from '../../config';
import React, { useState, useEffect, useMemo } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { handleConstruction, handleConstructionWithGems } from '../BuildAndBuy';
import { getIngredientDetails, hasRequiredSkill as checkRequiredSkill, isVisibleToPlayer } from '../../Utils/ResourceHelpers';
import { canAfford, getPlayerQuantity } from '../../Utils/InventoryManagement';
import { usePanelContext } from '../../UI/Panels/PanelContext';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { getDerivedLevel } from '../../Utils/playerManagement';
import { updatePlayerSettings } from '../../settings';
import { withScaledAnimalCost } from '../FarmAnimals/animalPricing';

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
          fontSize: 'var(--text-xs)',
          fontWeight: 'bold',
          color: isFull ? 'var(--color-text-negative)' : 'var(--color-text-positive)',
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
        // Price from the grid's animals at the moment of the click (per type: animalPricing.js)
        const freshEffectiveItem = originalItem
          ? withScaledAnimalCost(originalItem, NPCsInGrid?.[gridId]?.npcs, globalTuning?.farmAnimalInflation)
          : effectiveItem;

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
    // Price from the grid's animals at the moment of purchase
    const effectiveItem = getEffectiveItem(item);
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

  // Farm animals cost more for each animal of the same type already on the grid (animalPricing.js).
  // Reads NPCsInGrid at call time, so a purchase always prices from the current herd.
  const getEffectiveItem = (item) =>
    withScaledAnimalCost(item, NPCsInGrid?.[gridId]?.npcs, globalTuning?.farmAnimalInflation);

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
          <label className="cursor-toggle-label">
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

                const playerQty = getPlayerQuantity(type, inventory, backpack); // backpack + warehouse
                const color = playerQty >= qty ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                const symbol = allResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = meetsSkillRequirement ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
              const levelColor = meetsLevel ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
              const details =
                (farmAnimalLimitReached ? `<span style="color: var(--color-text-negative);">${strings[407]} (${maxFarmAnimals})</span>` : '') +
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