import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import { useUILock } from '../../UI/UILockContext';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { handleFarmPlotPlacement, handleTerraform } from './Farming';
import { useStrings } from '../../UI/StringsContext';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
  
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
}) => {

  const { setUILocked } = useUILock();
  const strings = useStrings();
  const [farmPlots, setFarmPlots] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
  const COOLDOWN_DURATION = 800;

 
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
    setUILocked(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
      setUILocked(false);
    }, COOLDOWN_DURATION);

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
    setUILocked(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
      setUILocked(false);
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
    <Panel onClose={onClose} descriptionKey="1004" titleKey="1104" panelName="FarmingPanel">
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
              const hours = Math.floor((seconds % 86400) / 3600);
              const minutes = Math.floor((seconds % 3600) / 60);
              const secs = Math.floor(seconds % 60);
              return days > 0
                ? `${days}d ${hours}h ${minutes}m`
                : hours > 0
                ? `${hours}h ${minutes}m ${secs}s`
                : minutes > 0
                ? `${minutes}m ${secs}s`
                : `${secs}s`;
            };

            const symbol = item.symbol || '';

            const formattedCosts = [1, 2, 3, 4].map((i) => {
              const type = item[`ingredient${i}`];
              const qty = item[`ingredient${i}qty`];
              if (!type || !qty) return '';

              const playerQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
              const color = playerQty >= qty ? 'green' : 'red';
              const symbol = allResources.find(r => r.type === type)?.symbol || '';
              return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
            }).join('');

            const skillColor = requirementsMet ? 'green' : 'red';

            const details =
              `Costs:<div>${formattedCosts}</div>` +
              (item.growtime ? `<br>Time: ${formatCountdown(item.growtime)}` : '') +
              (item.requires ? `<br><span style="color: ${skillColor};">Requires: ${item.requires}</span>` : '');

            const info =
              `Makes: ${
                allResources
                  .filter((res) => res.source === item.type)
                  .map((res) => `${res.symbol || ''} ${res.type}`)
                  .join(', ') || 'None'
              }`;

            return (
              <ResourceButton
                key={item.type}
                symbol={symbol}
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