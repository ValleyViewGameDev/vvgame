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
import { formatDuration } from '../../UI/Timers';
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
  currentSeason
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

      const farmPlotItems = allResourcesData.filter((resource) => {
        // Check if resource is a farm plot
        if (resource.category !== 'farmplot') return false;
        
        // Check seasonal restriction
        if (resource.season && currentSeason && resource.season !== currentSeason) {
          return false;
        }
        
        return true;
      });
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
    <Panel onClose={onClose} descriptionKey="1004" titleKey="1104" panelName="FarmingPanel">
      <div className="standard-panel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>

            {/* Farm Plot Options */}
            {farmPlots.map((item) => {
              const ingredients = getIngredientDetails(item, allResources);
              const affordable = canAfford(item, inventory, 1);
              const requirementsMet = hasRequiredSkill(item.requires);

              const symbol = item.symbol || '';

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
                `${strings[461]}<div>${formattedCosts}</div>` +
                (item.growtime ? `<br>${strings[458]}${formatDuration(item.growtime)}` : '') +
                (item.requires ? `<br><span style="color: ${skillColor};">${strings[460]}${getLocalizedString(item.requires, strings)}</span>` : '');

              const info =
                `Makes: ${
                  allResources
                    .filter((res) => res.source === item.type)
                    .map((res) => `${res.symbol || ''} ${getLocalizedString(res.type, strings)}`)
                    .join(', ') || 'None'
                }`;

              return (
                <ResourceButton
                  key={item.type}
                  symbol={symbol}
                  name={getLocalizedString(item.type, strings)}
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
          </>
        )}
      </div>
    </Panel>
  );
}; 

export default React.memo(FarmingPanel);