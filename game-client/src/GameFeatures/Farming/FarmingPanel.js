import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { getIngredientDetails, hasRequiredSkill as checkRequiredSkill, isVisibleToPlayer } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { handleFarmPlotPlacement } from './Farming';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { formatDuration } from '../../UI/Timers';
import { updatePlayerSettings } from '../../settings';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path

const FarmingPanel = ({
  onClose,
  TILE_SIZE,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  resources,
  setResources,
  tiles,
  tileTypes,
  setTileTypes,
  currentPlayer,
  setCurrentPlayer,
  gridId,
  masterResources,
  masterSkills,
  updateStatus,
  currentSeason,
  isDeveloper,
  cursorMode,
  setCursorMode
}) => {

  const strings = useStrings();
  const [farmPlots, setFarmPlots] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [coolingDownItems, setCoolingDownItems] = useState(new Set());
  const [plantWithCursor, setPlantWithCursor] = useState(
    currentPlayer?.settings?.plantWithCursor ?? false
  );
  const COOLDOWN_DURATION = 450;

  // Toggle handler - persists to player settings
  const handleToggleChange = (checked) => {
    setPlantWithCursor(checked);
    if (!checked) {
      setCursorMode(null);
    }
    // Persist to player settings
    updatePlayerSettings({ plantWithCursor: checked }, currentPlayer, setCurrentPlayer);
  };

  // Handle selecting a crop for cursor mode
  const handleCursorModeSelect = (item) => {
    // Find the output crop (what grows from this plot)
    const outputCrop = allResources.find((res) => res.source === item.type);
    const outputSymbol = outputCrop?.symbol || item.symbol || '🌱';
    const outputFilename = outputCrop?.filename || item.filename || null;

    setCursorMode({
      type: 'plant',
      item: item,
      emoji: outputSymbol,
      filename: outputFilename
    });
  };

 
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    //setIsContentLoading(true);
    try {
      const inventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
      setInventory(inventoryResponse.data.inventory || []);

      const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
      const allResourcesData = resourcesResponse.data;
      setAllResources(allResourcesData);

      const farmPlotItems = allResourcesData.filter((resource) => {
        // Check if resource is a farm plot
        if (resource.category !== 'farmplot') return false;
        // Filter out devonly resources unless player is a developer
        if (!isVisibleToPlayer(resource, isDeveloper)) return false;
        return true;
      });
      
      // Add isOffSeason flag to each farmplot
      const farmPlotsWithSeasonInfo = farmPlotItems.map(item => ({
        ...item,
        isOffSeason: item.season && currentSeason && item.season !== currentSeason
      }));
      
      setFarmPlots(farmPlotsWithSeasonInfo);
    } catch (error) {
      console.error('Error fetching farming panel data:', error);
    } finally {
      setIsContentLoading(false);
    }
  };

  // Local wrapper for the utility function
  const hasRequiredSkill = (requiredSkill) => checkRequiredSkill(requiredSkill, currentPlayer);


  // Wrap for Farm Plot Placement
  const handleFarmPlacementWithCooldown = async (item) => {
    const itemKey = `plot-${item.type}`;
    if (coolingDownItems.has(itemKey)) return;
    
    // Apply cooldown immediately for instant response
    setCoolingDownItems(prev => new Set(prev).add(itemKey));
    
    // Set timeout immediately (like Bank does) for proper sync
    const cooldownTimer = setTimeout(() => {
      setCoolingDownItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemKey);
        return newSet;
      });
    }, COOLDOWN_DURATION);
    
    // Attempt the placement
    const result = await handleFarmPlotPlacement({
      selectedItem: item,
      TILE_SIZE,
      resources,
      setResources,
      currentPlayer,
      setCurrentPlayer,
      inventory,
      setInventory,
      backpack,
      setBackpack,
      gridId,
      masterResources,
      masterSkills,
      updateStatus,
    });
    
    // If placement failed, immediately remove cooldown and cancel timer
    if (result !== true) {
      clearTimeout(cooldownTimer);
      setCoolingDownItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemKey);
        return newSet;
      });
    }
  };


  return (
    <Panel onClose={onClose} descriptionKey="1004" titleKey="1104" panelName="FarmingPanel">
      <div className="standard-panel">
        {/* Plant with cursor toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 12px',
          marginBottom: '6px',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderRadius: '8px'
        }}>
          <label style={{ fontFamily: 'var(--font-title-4-family)', fontSize: 'var(--font-title-4-size)', cursor: 'pointer' }}>
            {strings[10187] || 'Plant with cursor'}
          </label>
          <input
            type="checkbox"
            checked={plantWithCursor}
            onChange={(e) => handleToggleChange(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
        </div>

        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>

            {/* Farm Plot Options */}
            {farmPlots.map((item) => {
              const ingredients = getIngredientDetails(item, allResources);
              const affordable = canAfford(item, inventory, backpack, 1);
              const requirementsMet = hasRequiredSkill(item.requires);
              const isOffSeason = item.isOffSeason;

              const symbol = item.symbol || '';

              // For off-season items, show simplified information
              if (isOffSeason) {
                return (
                  <ResourceButton
                    key={item.type}
                    symbol={symbol}
                    name={getLocalizedString(item.type, strings)}
                    details="Off season"
                    info={null}
                    disabled={true}
                    onClick={() => {}}
                  />
                );
              }

              // Regular (in-season) item display
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
                (item.growtime ? `${strings[458]}${formatDuration(item.growtime)}<br>` : '') +
                `${strings[461]}<div>${formattedCosts}</div>`;

              const info =
                `${strings[820]}${
                  allResources
                    .filter((res) => res.source === item.type)
                    .map((res) => `${res.symbol || ''} ${getLocalizedString(res.type, strings)}`)
                    .join(', ') || 'None'
                }`;

              const itemKey = `plot-${item.type}`;
              const isCoolingDown = coolingDownItems.has(itemKey);
              const isSelectedForCursor = cursorMode?.type === 'plant' && cursorMode?.item?.type === item.type;

              // Build className based on state
              let buttonClassName = '';
              if (isCoolingDown) buttonClassName += 'cooldown ';
              if (isSelectedForCursor) buttonClassName += 'cursor-selected ';

              return (
                <ResourceButton
                  key={item.type}
                  symbol={symbol}
                  name={getLocalizedString(item.type, strings)}
                  resourceType={item.type}
                  className={buttonClassName.trim()}
                  style={isCoolingDown ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
                  details={details}
                  info={info}
                  disabled={isCoolingDown || !affordable || !requirementsMet}
                  onClick={() => {
                    if (!affordable || !requirementsMet) return;
                    if (plantWithCursor) {
                      // In cursor mode: select this crop for planting via clicks
                      handleCursorModeSelect(item);
                    } else {
                      // Normal mode: plant at player position immediately
                      handleFarmPlacementWithCooldown(item);
                    }
                  }}
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

export default React.memo(FarmingPanel);