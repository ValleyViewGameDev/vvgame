import API_BASE from '../../config';
import { loadMasterResources } from '../../Utils/TuningManager';
import { isTouchPrimary } from '../../Utils/inputMode';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { getIngredientDetails, hasRequiredSkill as checkRequiredSkill, isVisibleToPlayer, growsInRegion, cropCapReached } from '../../Utils/ResourceHelpers';
import { canAfford, getPlayerQuantity } from '../../Utils/InventoryManagement';
import { handleFarmPlotPlacement } from './Farming';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { formatDuration } from '../../UI/Timers';
import { updatePlayerSettings } from '../../settings';
import { getDerivedLevel } from '../../Utils/playerManagement';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
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
  masterXPLevels,
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
    isTouchPrimary() || (currentPlayer?.settings?.plantWithCursor ?? false) // phones always place with the cursor (the toggle is hidden)
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
      // the inventory refresh runs alongside; the panel never waits on it
      axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`)
        .then((r) => setInventory(r.data.inventory || []))
        .catch((e) => console.error('Error refreshing inventory:', e));

      const allResourcesData = await loadMasterResources(); // cached at boot: no round trip
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

  // Check if player meets the level requirement
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => {
    if (!resourceLevel) return true; // No level requirement
    return playerLevel >= resourceLevel;
  };


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
      strings,
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
        {/* Plant with cursor toggle (not on phones) */}
        {!isTouchPrimary() && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '8px',
            marginBottom: '10px',
            padding: '5px 0'
          }}>
            <label className="cursor-toggle-label">
              {strings[10187] || 'Plant with cursor'}
            </label>
            <input
              type="checkbox"
              checked={plantWithCursor}
              onChange={(e) => handleToggleChange(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </div>
        )}

        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>

            {/* Farm Plot Options */}
            {farmPlots.map((item) => {
              const ingredients = getIngredientDetails(item, allResources);
              const affordable = canAfford(item, inventory, backpack, 1);
              const meetsSkillRequirement = hasRequiredSkill(item.requires);
              const meetsLevel = meetsLevelRequirement(item.level);
              // A region-locked crop (resources.json growregion) is planted only on a grid of its region
              const meetsRegion = growsInRegion(item, currentPlayer?.location?.region || null);
              const requirementsMet = meetsSkillRequirement && meetsLevel && meetsRegion;
              // The per-crop cap (resources.json maxpergrid), as the Buy panel's farm-animal cap
              const cropLimitReached = cropCapReached(item, resources);
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

                const playerQty = getPlayerQuantity(type, inventory, backpack); // backpack + warehouse
                const color = playerQty >= qty ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                const symbol = allResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = meetsSkillRequirement ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
              const levelColor = meetsLevel ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
              const regionColor = meetsRegion ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
              const regionLine = item.growregion
                ? `<span style="color: ${regionColor};">${String(strings[17022] || 'Only grows in {region}').replace('{region}', getLocalizedString(item.growregion, strings))}</span>`
                : '';

              const details =
                (cropLimitReached ? `<span style="color: var(--color-text-negative);">${strings[17023] || 'Maximum reached of this crop type'} (${item.maxpergrid})</span>` : '') +
                (item.level ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${item.level}</span>` : '') +
                regionLine +
                (item.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(item.requires, strings)}</span>` : '') +
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
                  disabled={isCoolingDown || !affordable || !requirementsMet || cropLimitReached}
                  onClick={async () => {
                    if (!affordable || !requirementsMet || cropLimitReached) return;
                    // FTUE planting beat: the card arms cursor planting (whatever the toggle says) and
                    // the step advances; App closes the panel and points at a dirt tile to plant on.
                    if (currentPlayer?.firsttimeuser) {
                      const before = currentPlayer.ftuestep || 0;
                      const after = await tryAdvanceFTUEByTrigger('ClickedWheatPlotCard', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
                      if (after > before) { handleCursorModeSelect(item); return; }
                    }
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