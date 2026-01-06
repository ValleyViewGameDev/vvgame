import API_BASE from '../../config'; 
import React, { useState, useEffect } from 'react';
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
import { updatePlayerSettings } from '../../settings';

const PetsPanel = ({
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
  const handleCursorModeSelect = (item) => {
    setCursorMode({
      type: 'build',
      item: item.type,
      emoji: item.symbol || '🐒',
      buildOptions: buyOptions,
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
            if (resource.source !== 'Zoo') return false;

            // Check passability based on location
            if (!isDeveloper && !isHomestead) return false;

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

  const handleGemPurchase = async (modifiedRecipe) => {
    // This is called by the gem button with a recipe modified to include gems
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

  return (
    <Panel onClose={closePanel} descriptionKey="1039" titleKey="1139" panelName="PetsPanel">
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

        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {buyOptions.map((item) => {
              const ingredients = getIngredientDetails(item, allResources);
              const affordable = canAfford(item, inventory);
              const requirementsMet = hasRequiredSkill(item.requires);
              const isDisabled = !affordable || !requirementsMet;
              const isSelectedForCursor = cursorMode?.type === 'build' && cursorMode?.item === item.type;

              // Build className based on state
              let buttonClassName = '';
              if (isSelectedForCursor) buttonClassName += 'cursor-selected ';

              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = item[`ingredient${i}`];
                const qty = item[`ingredient${i}qty`];
                if (!type || !qty) return '';

                const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
                const backpackQty = backpack?.find(item => item.type === type)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = allResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = requirementsMet ? 'green' : 'red';
              const details =
                (item.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(item.requires, strings)}</span><br>` : '') +
                `${strings[461]}<div>${formattedCosts}</div>`;

              return (
                <ResourceButton
                  key={item.type}
                  symbol={item.symbol}
                  name={getLocalizedString(item.type, strings)}
                  details={details}
                  hideInfo={true}
                  disabled={isDisabled}
                  className={buttonClassName}
                  onClick={() => {
                    if (isDisabled) return;
                    if (placeWithCursor) {
                      // In cursor mode: select this item for placing via clicks
                      handleCursorModeSelect(item);
                    } else {
                      // Normal mode: place at player position immediately
                      handleConstruction({
                        TILE_SIZE,
                        selectedItem: item.type,
                        buildOptions: buyOptions,
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
                    }
                  }}
                  onGemPurchase={(item.gemcost && isDisabled) ? handleGemPurchase : null}
                  resource={item}
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

export default React.memo(PetsPanel);