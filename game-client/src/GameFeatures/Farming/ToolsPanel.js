import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { handleTerraform } from './Farming';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { updatePlayerSettings } from '../../settings';
import { getDerivedLevel } from '../../Utils/playerManagement';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path

// Default symbols for tiles that don't have one defined
const DEFAULT_TILE_SYMBOLS = {
  'd': '🟫',  // dirt
  'g': '🟩',  // grass
  'p': '🟨',  // pavement
  's': '⬜️',  // slate/stone
  'x': '🪨',  // cobblestone
  'w': '💧',  // water
  'l': '🔥',  // lava
  'n': '🟨',  // sand
  'o': '❄️',  // snow
  'z': '🟢',  // moss
  'c': '🧱',  // clay
  'y': '⬛️',  // dungeon
};

// Info string keys for tiles (from strings file)
const TILE_INFO_KEYS = {
  'd': 310,  // Till Land
  'g': 311,  // Plant Grass
  'p': 312,  // Lay Pavement
  's': 312,  // Lay Stone
  'x': 313,  // Lay Cobblestone
};

const ToolsPanel = ({
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
  isDeveloper,
  cursorMode,
  setCursorMode
}) => {

  const strings = useStrings();
  const [farmPlots, setFarmPlots] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [coolingDownItems, setCoolingDownItems] = useState(new Set());
  const [useWithCursor, setUseWithCursor] = useState(
    currentPlayer?.settings?.plantWithCursor ?? false
  );
  const COOLDOWN_DURATION = 500;

  // Toggle handler - persists to player settings (shared with FarmingPanel)
  const handleToggleChange = (checked) => {
    setUseWithCursor(checked);
    if (!checked) {
      setCursorMode(null);
    }
    // Persist to player settings (uses same setting as FarmingPanel)
    updatePlayerSettings({ plantWithCursor: checked }, currentPlayer, setCurrentPlayer);
  };

  // Handle selecting a terraform action for cursor mode
  const handleCursorModeSelect = (tileType, emoji) => {
    setCursorMode({
      type: 'terraform',
      tileType: tileType,
      emoji: emoji
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

      const farmPlotItems = allResourcesData.filter((resource) => resource.category === 'farmplot');
      setFarmPlots(farmPlotItems);
    } catch (error) {
      console.error('Error fetching farming panel data:', error);
    } finally {
      setIsContentLoading(false);
    }
  };

  const hasRequiredSkill = (requiredSkill) => {
    // devonly is handled separately, not as a skill check
    if (requiredSkill === 'devonly') return true;
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };

  // Check if player meets the level requirement
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => {
    if (!resourceLevel) return true; // No level requirement
    return playerLevel >= resourceLevel;
  };


  // Wrap for Terraform Actions - now uses tileType directly
  const handleTerraformWithCooldown = async (tileType) => {
    const itemKey = `terraform-${tileType}`;
    if (coolingDownItems.has(itemKey)) return;

    // Apply cooldown immediately for instant response
    setCoolingDownItems(prev => new Set(prev).add(itemKey));

    // Set timeout immediately for proper sync with CSS animation
    setTimeout(() => {
      setCoolingDownItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemKey);
        return newSet;
      });
    }, COOLDOWN_DURATION);

    await handleTerraform({
      TILE_SIZE,
      tileType,
      gridId,
      currentPlayer,
      tileTypes,
      setTileTypes,
      isDeveloper,
    });
  };


  // Helper to build className for buttons
  const getButtonClassName = (tileType) => {
    const isCoolingDown = coolingDownItems.has(`terraform-${tileType}`);
    const isSelectedForCursor = cursorMode?.type === 'terraform' && cursorMode?.tileType === tileType;
    let className = '';
    if (isCoolingDown) className += 'cooldown ';
    if (isSelectedForCursor) className += 'cursor-selected ';
    return className.trim();
  };

  // Helper to handle button clicks (cursor mode or direct action)
  const handleButtonClick = (tileType, emoji, requiredSkill, level) => {
    if (requiredSkill && requiredSkill !== 'devonly' && !hasRequiredSkill(requiredSkill)) return;
    if (level && !meetsLevelRequirement(level)) return;
    if (useWithCursor) {
      handleCursorModeSelect(tileType, emoji);
    } else {
      handleTerraformWithCooldown(tileType);
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1033" titleKey="1133" panelName="ToolsPanel">
      <div className="standard-panel">
        {/* Terraform with cursor toggle */}
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
            {strings[10187] || 'Use with cursor'}
          </label>
          <input
            type="checkbox"
            checked={useWithCursor}
            onChange={(e) => handleToggleChange(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
        </div>

        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {/* Dynamically render all tile tools from masterResources */}
            {masterResources
              ?.filter(r => r.category === 'tile')
              .map((tileResource) => {
                const tileType = tileResource.type;
                const requiredSkill = tileResource.requires || null;
                const requiredLevel = tileResource.level || null;

                // Skip devonly tiles if not developer
                if (requiredSkill === 'devonly' && !isDeveloper) {
                  return null;
                }

                const meetsSkill = hasRequiredSkill(requiredSkill);
                const meetsLevel = meetsLevelRequirement(requiredLevel);
                const isCoolingDown = coolingDownItems.has(`terraform-${tileType}`);
                const isDisabled = isCoolingDown || !meetsSkill || !meetsLevel;

                // Get symbol - use from resource or fall back to defaults
                const symbol = tileResource.symbol || DEFAULT_TILE_SYMBOLS[tileType] || '🔲';

                // Get display name from action field, capitalize first letter
                const actionName = tileResource.action || tileType;
                const displayName = actionName.charAt(0).toUpperCase() + actionName.slice(1);

                // Build details string with level and skill requirements
                const skillColor = meetsSkill ? 'green' : 'red';
                const levelColor = meetsLevel ? 'green' : 'red';
                let details = '';
                if (requiredLevel) {
                  details += `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${requiredLevel}</span>`;
                }
                if (requiredSkill && requiredSkill !== 'devonly') {
                  details += `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(requiredSkill, strings)}</span>`;
                }
                if (requiredSkill === 'devonly') {
                  details += `<span style="color: orange;">Developer Only</span>`;
                }
                details += `${strings[461]} None`;

                // Get info text from predefined keys or generate default
                const infoKey = TILE_INFO_KEYS[tileType];
                const infoText = infoKey ? strings[infoKey] : `Creates a ${displayName.toLowerCase()} tile`;

                return (
                  <ResourceButton
                    key={tileType}
                    symbol={symbol}
                    name={getLocalizedString(displayName, strings)}
                    className={getButtonClassName(tileType)}
                    style={isCoolingDown ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
                    details={details}
                    disabled={isDisabled}
                    info={infoText}
                    onClick={() => handleButtonClick(tileType, symbol, requiredSkill, requiredLevel)}
                    devOnly={requiredSkill === 'devonly'}
                  />
                );
              })}
          </>
        )}
      </div>
    </Panel>
  );
}; 

export default React.memo(ToolsPanel);