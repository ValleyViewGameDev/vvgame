import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import { StatusBarContext } from '../../UI/StatusBar';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { usePanelContext } from '../../UI/PanelContext';
import { canAfford, getIngredientDetails } from '../../Utils/ResourceHelpers';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { handleFarmPlotPlacement, handleTerraform } from './Farming';
import strings from '../../UI/strings';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
 
const FarmingPanel = ({
  TILE_SIZE,
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
}) => {

  const { closePanel } = usePanelContext();
  const [farmPlots, setFarmPlots] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [inventory, setInventory] = useState([]);
  const { updateStatus } = useContext(StatusBarContext);
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
  const COOLDOWN_DURATION = 1200;

 
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
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
    }
  };

  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };


// Wrap for Terraform Actions
const handleTerraformWithCooldown = async (actionType) => {
  if (isActionCoolingDown) return;
  setIsActionCoolingDown(true);
  setTimeout(() => setIsActionCoolingDown(false), COOLDOWN_DURATION);

  await handleTerraform({
    actionType,
    gridId,
    currentPlayer,
    setTileTypes,
  });
};

// Wrap for Farm Plot Placement
const handleFarmPlacementWithCooldown = async (item) => {
  if (isActionCoolingDown) return;
  setIsActionCoolingDown(true);
  setTimeout(() => setIsActionCoolingDown(false), COOLDOWN_DURATION);

  await handleFarmPlotPlacement({
    selectedItem: item,
    TILE_SIZE,
    resources,
    setResources,
    currentPlayer,
    inventory,
    setInventory,
    gridId,
    masterResources,
    masterSkills,
  });
};


  return (
    <Panel onClose={closePanel} descriptionKey="1004" titleKey="1104" panelName="FarmingPanel">
      <div className="standard-panel">
 
           {/* Till Land Button */}
           <ResourceButton
            symbol="⛏️"
            name="Till Land"
            details="Costs: None<br>Requires: Pickaxe"
            disabled={isActionCoolingDown || !hasRequiredSkill('Pickaxe')}
            info={strings[310]}
            onClick={() => handleTerraformWithCooldown("till")}
          />

          {/* Plant Grass Button */}
          <ResourceButton
            symbol="🟩"
            name="Plant Grass"
            details="Costs: None<br>Requires: Grower"
            disabled={isActionCoolingDown || !hasRequiredSkill('Grower')}
            info={strings[311]}
            onClick={() => handleTerraformWithCooldown("plantGrass")}
          />

          {/* Plant Grass Button */}
          <ResourceButton
            symbol="🟨"
            name="Lay Pavement"
            details="Costs: None"
            disabled={isActionCoolingDown}
            info={strings[312]}
            onClick={() => handleTerraformWithCooldown("pave")}
          />

          {/* Farm Plot Options */}
          {farmPlots.map((item) => {
            const ingredients = getIngredientDetails(item, allResources);
            const affordable = canAfford(item, inventory, 1);
            const requirementsMet = hasRequiredSkill(item.requires);

            const formatCountdown = (seconds) => {
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
              
              return days > 0
                ? `${days}d ${hours}h ${minutes}m`
                : hours > 0
                ? `${hours}h ${minutes}m ${secs}s`
                : minutes > 0
                ? `${minutes}m ${secs}s`
                : `${secs}s`;
              };

            const details = `
              Costs: ${ingredients.join(', ') || 'None'}
              ${item.growtime ? `<br>Time: ${formatCountdown(item.growtime)}` : ''}
              ${item.requires ? `<br>Requires: ${item.requires}` : ''}
            `;

            const info = `
              Makes: ${
                allResources
                  .filter((res) => res.source === item.type)
                  .map((res) => `${res.symbol || ''} ${res.type}`)
                  .join(', ') || 'None'
              }
            `;

            return (
              <ResourceButton
                key={item.type}
                symbol={item.symbol}
                name={item.type}
                details={details}
                info={info}
                disabled={isActionCoolingDown || !affordable || !requirementsMet}
                onClick={() =>
                  affordable &&
                  requirementsMet &&
                  handleFarmPlacementWithCooldown(item)
                }
              />
            );
          })}
        </div>
    </Panel>
  );
}; 

export default React.memo(FarmingPanel);