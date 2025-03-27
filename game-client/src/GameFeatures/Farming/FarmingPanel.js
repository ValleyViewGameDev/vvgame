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
}) => {

  console.log('Farming Panel: currentPlayer: ',currentPlayer);

  const { closePanel } = usePanelContext();
  const [farmPlots, setFarmPlots] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [inventory, setInventory] = useState([]);
  const { updateStatus } = useContext(StatusBarContext);
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
  const COOLDOWN_DURATION = 1200;

  const getCurrentTileTypes = () => {
    return [...tiles.map((row) => [...row])]; // Deep copy to avoid mutability issues
  };
 
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
    TILE_SIZE,
    setTileTypes,
    getCurrentTileTypes,
    gridId,
    currentPlayer,
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
    tiles,
    tileTypes,
    setTileTypes,
    currentPlayer,
    setCurrentPlayer,
    inventory,
    setInventory,
    gridId,
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
            info="Makes: Dirt"
            onClick={() => handleTerraformWithCooldown("till")}
          />

          {/* Plant Grass Button */}
          <ResourceButton
            symbol="🟩"
            name="Plant Grass"
            details="Costs: None<br>Requires: Grower"
            disabled={isActionCoolingDown || !hasRequiredSkill('Grower')}
            info="Makes: Grass"
            onClick={() => handleTerraformWithCooldown("plantGrass")}
          />


          {/* Farm Plot Options */}
          {farmPlots.map((item) => {
            const ingredients = getIngredientDetails(item, allResources);
            const affordable = canAfford(item, inventory, 1);
            const requirementsMet = hasRequiredSkill(item.requires);

            const details = `
              Costs: ${ingredients.join(', ') || 'None'}
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