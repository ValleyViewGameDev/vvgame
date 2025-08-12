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
  updateStatus
}) => {

  const strings = useStrings();
  const [farmPlots, setFarmPlots] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
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
    if (isActionCoolingDown) return;
    setIsActionCoolingDown(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
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

  // Wrap for Farm Plot Placement
  const handleFarmPlacementWithCooldown = async (item) => {
    if (isActionCoolingDown) return;
    setIsActionCoolingDown(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
    }, COOLDOWN_DURATION);

    await handleFarmPlotPlacement({
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
  };


  return (
    <Panel onClose={onClose} descriptionKey="1133" titleKey="1033" panelName="ToolsPanel">
      <div className="standard-panel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {/* Till Land Button */}
            <ResourceButton
              symbol="⛏️"
              name="Till Land"
              details="Costs: None"
              disabled={isActionCoolingDown}
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

            {/* Lay Pavement Button */}
            <ResourceButton
              symbol="🟨"
              name="Lay Pavement"
              details="Costs: None<br>Requires: Pickaxe"
              disabled={isActionCoolingDown || !hasRequiredSkill('Pickaxe')}
              info={strings[312]}
              onClick={() => handleTerraformWithCooldown("pave")}
            />


          </>
        )}
      </div>
    </Panel>
  );
}; 

export default React.memo(ToolsPanel);