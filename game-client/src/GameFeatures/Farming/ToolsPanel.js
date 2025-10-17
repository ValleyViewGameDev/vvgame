import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { handleFarmPlotPlacement, handleTerraform } from './Farming';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path

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
  isDeveloper
}) => {

  const strings = useStrings();
  const [farmPlots, setFarmPlots] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [coolingDownItems, setCoolingDownItems] = useState(new Set());
  const COOLDOWN_DURATION = 500;

 
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


  return (
    <Panel onClose={onClose} descriptionKey="1033" titleKey="1133" panelName="ToolsPanel">
      <div className="standard-panel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {/* Till Land Button */}
            <ResourceButton
              symbol="⛏️"
              name={getLocalizedString("Till Land", strings)}
              className={coolingDownItems.has('terraform-till') ? 'cooldown' : ''}
              style={coolingDownItems.has('terraform-till') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
              details={`${strings[461]} None`}
              disabled={coolingDownItems.has('terraform-till')}
              info={strings[310]}
              onClick={() => handleTerraformWithCooldown("till")}
            />

            {/* Plant Grass Button */}
            <ResourceButton
              symbol="🟩"
              name={getLocalizedString("Plant Grass", strings)}
              className={coolingDownItems.has('terraform-plantGrass') ? 'cooldown' : ''}
              style={coolingDownItems.has('terraform-plantGrass') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
              details={`${strings[461]} None<br>${strings[460]}${getLocalizedString('Grower', strings)}`}
              disabled={coolingDownItems.has('terraform-plantGrass') || !hasRequiredSkill('Grower')}
              info={strings[311]}
              onClick={() => handleTerraformWithCooldown("plantGrass")}
            />

            {/* Lay Pavement Button */}
            <ResourceButton
              symbol="🟨"
              name={getLocalizedString("Lay Pavement", strings)}
              className={coolingDownItems.has('terraform-pave') ? 'cooldown' : ''}
              style={coolingDownItems.has('terraform-pave') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
              details={`${strings[461]} None<br>${strings[460]}${getLocalizedString('Pickaxe', strings)}`}
              disabled={coolingDownItems.has('terraform-pave') || !hasRequiredSkill('Pickaxe')}
              info={strings[312]}
              onClick={() => handleTerraformWithCooldown("pave")}
            />

            {/* Lay Stone Button */}
            <ResourceButton
              symbol="⬜️"
              name={getLocalizedString("Lay Stone", strings)}
              className={coolingDownItems.has('terraform-stone') ? 'cooldown' : ''}
              style={coolingDownItems.has('terraform-stone') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
              details={`${strings[461]} None<br>${strings[460]}${getLocalizedString('Pickaxe', strings)}`}
              disabled={coolingDownItems.has('terraform-stone') || !hasRequiredSkill('Pickaxe')}
              info={strings[312]}
              onClick={() => handleTerraformWithCooldown("stone")}
            />

            {/* Create Water Button - Developer Only */}
            {isDeveloper && (
              <ResourceButton
                symbol="💧"
                name={getLocalizedString("Create Water", strings)}
                className={coolingDownItems.has('terraform-water') ? 'cooldown' : ''}
                style={coolingDownItems.has('terraform-water') ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
                details={`${strings[461]} None<br>Developer Only`}
                disabled={coolingDownItems.has('terraform-water')}
                info="Creates a water tile (Developer only)"
                onClick={() => handleTerraformWithCooldown("water")}
              />
            )}


          </>
        )}
      </div>
    </Panel>
  );
}; 

export default React.memo(ToolsPanel);