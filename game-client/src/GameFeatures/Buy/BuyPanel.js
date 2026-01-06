import API_BASE from '../../config'; 
import React, { useState, useEffect, useMemo } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { handleConstruction, handleConstructionWithGems } from '../BuildAndBuy';
import { getIngredientDetails, hasRequiredSkill as checkRequiredSkill, isVisibleToPlayer } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { usePanelContext } from '../../UI/Panels/PanelContext';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { getDerivedLevel } from '../../Utils/playerManagement';

const BuyPanel = ({
  TILE_SIZE,
  resources,
  setResources,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  gridId,
  masterResources,
  masterSkills,
  updateStatus,
  isDeveloper,
  currentSeason,
  NPCsInGrid,
  globalTuning,
  masterXPLevels,
}) => {
  const { closePanel } = usePanelContext();
  const [buyOptions, setBuyOptions] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const strings = useStrings();

  useEffect(() => {
    const fetchData = async () => {
//      setIsContentLoading(true);
      try { 
        const inventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setInventory(inventoryResponse.data.inventory || []);
        const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
        const allResourcesData = resourcesResponse.data;
        setAllResources(allResourcesData);
        const isHomestead = currentPlayer?.location?.gtype === 'homestead';
        const purchasableItems = allResourcesData.filter(
          (resource) => {
            // Filter out devonly resources unless player is a developer
            if (!isVisibleToPlayer(resource, isDeveloper)) return false;

            // Check if resource is a buy item
            if (resource.source !== 'Buy') return false;

            // Check passability based on location
            if (!isDeveloper && !isHomestead && resource.passable === false) return false;

            // Check seasonal restriction
            if (resource.season && currentSeason && resource.season !== currentSeason) {
              return false;
            }

            return true;
          }
        );
        setBuyOptions(purchasableItems);
      } catch (error) {
        console.error('Error fetching buy panel data:', error);
      } finally {
        setIsContentLoading(false);
      }
    }; 

    fetchData();
  }, [currentPlayer]);

  // Local wrapper for the utility function
  const hasRequiredSkill = (requiredSkill) => checkRequiredSkill(requiredSkill, currentPlayer);

  // Check if player meets the level requirement for a resource
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => {
    if (!resourceLevel) return true; // No level requirement
    return playerLevel >= resourceLevel;
  };

  const handleGemPurchase = async (modifiedRecipe) => {
    // This is called by the gem button with a recipe modified to include gems
    return handleConstructionWithGems({
      TILE_SIZE,
      selectedItem: modifiedRecipe.type,
      buildOptions: buyOptions,
      inventory,
      setInventory,
      backpack,
      setBackpack,
      resources,
      setResources,
      currentPlayer,
      setCurrentPlayer,
      gridId,
      updateStatus,
      modifiedRecipe, // Pass the gem-modified recipe
    });
  };

  // Count current farm animals on the grid
  const countFarmAnimals = () => {
    if (!NPCsInGrid?.[gridId]?.npcs) return 0;
    return Object.values(NPCsInGrid[gridId].npcs).filter(npc => npc.action === 'graze').length;
  };
  
  const maxFarmAnimals = globalTuning?.maxFarmAnimals || 10; // Default to 10 if not set
  const currentFarmAnimals = countFarmAnimals();

  return ( 
    <Panel onClose={closePanel} descriptionKey="1003" titleKey="1103" panelName="BuyPanel">
      <div className="standard-panel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {buyOptions.map((item) => {
              const ingredients = getIngredientDetails(item, allResources);
              const affordable = canAfford(item, inventory);
              const meetsSkillRequirement = hasRequiredSkill(item.requires);
              const meetsLevel = meetsLevelRequirement(item.level);
              const requirementsMet = meetsSkillRequirement && meetsLevel;

              // Check if this is a farm animal and if we've hit the limit
              const isFarmAnimal = item.passable && item.action === 'graze';
              const farmAnimalLimitReached = isFarmAnimal && currentFarmAnimals >= maxFarmAnimals;
              const isDisabled = !affordable || !requirementsMet || farmAnimalLimitReached;

              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = item[`ingredient${i}`];
                const qty = item[`ingredient${i}qty`];
                if (!type || !qty) return '';

                const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
                const backpackQty = backpack?.find(bpItem => bpItem.type === type)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = allResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = meetsSkillRequirement ? 'green' : 'red';
              const levelColor = meetsLevel ? 'green' : 'red';
              const details =
                (farmAnimalLimitReached ? `<span style="color: red;">${strings[407]} (${maxFarmAnimals})</span>` : '') +
                (item.level ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${item.level}</span>` : '') +
                (item.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(item.requires, strings)}</span>` : '') +
                `${strings[461]}<div>${formattedCosts}</div>`;

              // Create info tooltip content
              const info = (
                <div className="info-content">
                  <div>{strings[820]}{item.output ? `${allResources.find(r => r.type === item.output)?.symbol || ''} ${getLocalizedString(item.output, strings)}` : 'Nothing'}</div>
                  <div>{strings[821]}{item.qtycollected || 1}</div>
                </div>
              );

              return (
                <ResourceButton
                  key={item.type}
                  symbol={item.symbol}
                  name={getLocalizedString(item.type, strings)}
                  details={details}
                  info={info}
                  disabled={isDisabled}
                  onClick={() =>
                    affordable &&
                    requirementsMet &&
                    !farmAnimalLimitReached &&
                    handleConstruction({
                      TILE_SIZE,
                      selectedItem: item.type,
                      buildOptions: buyOptions,
                      inventory,
                      setInventory,
                      backpack,
                      setBackpack,
                      resources,
                      setResources,
                      setErrorMessage: console.error,
                      currentPlayer,
                      setCurrentPlayer,
                      gridId,
                      updateStatus,
                    })
                  }
                  onGemPurchase={(item.gemcost && (!affordable || !requirementsMet) && !farmAnimalLimitReached) ? handleGemPurchase : null}
                  meetsLevelRequirement={meetsLevel}
                  resource={item}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources || allResources}
                  currentPlayer={currentPlayer}
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

export default React.memo(BuyPanel);