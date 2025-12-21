import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { handleTerraform } from './Farming';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { updatePlayerSettings } from '../../settings';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path

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
  const handleCursorModeSelect = (actionType, emoji) => {
    setCursorMode({
      type: 'terraform',
      actionType: actionType,
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
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };


  // Wrap for Terraform Actions
  const handleTerraformWithCooldown = async (actionType) => {
    const itemKey = `terraform-${actionType}`;
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
      actionType,
      gridId,
      currentPlayer,
      tileTypes,
      setTileTypes,
    });
  };


  // Helper to build className for buttons
  const getButtonClassName = (actionType) => {
    const isCoolingDown = coolingDownItems.has(`terraform-${actionType}`);
    const isSelectedForCursor = cursorMode?.type === 'terraform' && cursorMode?.actionType === actionType;
    let className = '';
    if (isCoolingDown) className += 'cooldown ';
    if (isSelectedForCursor) className += 'cursor-selected ';
    return className.trim();
  };

  // Helper to handle button clicks (cursor mode or direct action)
  const handleButtonClick = (actionType, emoji, requiredSkill) => {
    if (requiredSkill && !hasRequiredSkill(requiredSkill)) return;
    if (useWithCursor) {
      handleCursorModeSelect(actionType, emoji);
    } else {
      handleTerraformWithCooldown(actionType);
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
            {/* Till Land Button */}
            <ResourceButton
              symbol="⛏️"
              name={getLocalizedString("Till Land", strings)}
              className={getButtonClassName('till')}
              style={coolingDownItems.has('terraform-till') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
              details={`${strings[461]} None`}
              disabled={coolingDownItems.has('terraform-till')}
              info={strings[310]}
              onClick={() => handleButtonClick("till", "⛏️", null)}
            />

            {/* Plant Grass Button */}
            <ResourceButton
              symbol="🟩"
              name={getLocalizedString("Plant Grass", strings)}
              className={getButtonClassName('plantGrass')}
              style={coolingDownItems.has('terraform-plantGrass') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
              details={`${strings[461]} None<br>${strings[460]}${getLocalizedString('Grower', strings)}`}
              disabled={coolingDownItems.has('terraform-plantGrass') || !hasRequiredSkill('Grower')}
              info={strings[311]}
              onClick={() => handleButtonClick("plantGrass", "🟩", 'Grower')}
            />

            {/* Lay Pavement Button */}
            <ResourceButton
              symbol="🟨"
              name={getLocalizedString("Lay Pavement", strings)}
              className={getButtonClassName('pave')}
              style={coolingDownItems.has('terraform-pave') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
              details={`${strings[461]} None<br>${strings[460]}${getLocalizedString('Pickaxe', strings)}`}
              disabled={coolingDownItems.has('terraform-pave') || !hasRequiredSkill('Pickaxe')}
              info={strings[312]}
              onClick={() => handleButtonClick("pave", "🟨", 'Pickaxe')}
            />

            {/* Lay Stone Button */}
            <ResourceButton
              symbol="⬜️"
              name={getLocalizedString("Lay Stone", strings)}
              className={getButtonClassName('stone')}
              style={coolingDownItems.has('terraform-stone') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
              details={`${strings[461]} None<br>${strings[460]}${getLocalizedString('Pickaxe', strings)}`}
              disabled={coolingDownItems.has('terraform-stone') || !hasRequiredSkill('Pickaxe')}
              info={strings[312]}
              onClick={() => handleButtonClick("stone", "⬜️", 'Pickaxe')}
            />

            {/* Lay Cobble Button */}
            <ResourceButton
              symbol="⬜️"
              name={getLocalizedString("Lay Cobblestone", strings)}
              className={getButtonClassName('cobblestone')}
              style={coolingDownItems.has('terraform-cobblestone') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
              details={`${strings[461]} None<br>${strings[460]}${getLocalizedString('Pickaxe', strings)}`}
              disabled={coolingDownItems.has('terraform-cobblestone') || !hasRequiredSkill('Pickaxe')}
              info={strings[313]}
              onClick={() => handleButtonClick("cobblestone", "⬜️", 'Pickaxe')}
            />

            {/* Create Water Button - Developer Only */}
            {isDeveloper && (
              <ResourceButton
                symbol="💧"
                name={getLocalizedString("Create Water", strings)}
                className={getButtonClassName('water')}
                style={coolingDownItems.has('terraform-water') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
                details={`${strings[461]} None<br>Developer Only`}
                disabled={coolingDownItems.has('terraform-water')}
                info="Creates a water tile (Developer only)"
                onClick={() => handleButtonClick("water", "💧", null)}
              />
            )}


          </>
        )}
      </div>
    </Panel>
  );
}; 

export default React.memo(ToolsPanel);