import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { handleConstruction } from '../BuildAndBuy';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { usePanelContext } from '../../UI/PanelContext';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import { useStrings } from '../../UI/StringsContext';

const BuildPanel = ({
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
  masterResources, // Added for quest tracking
  masterSkills, // Uncomment if needed for skill checks
  updateStatus,
}) => {
  const { closePanel } = usePanelContext(); // Use closePanel from context
  const [buildOptions, setBuildOptions] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const strings = useStrings();

  // Fetch inventory and build options when the panel initializes
  useEffect(() => {
    const fetchData = async () => {
      setIsContentLoading(true);
      try {
        // Fetch inventory
        const inventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setInventory(inventoryResponse.data.inventory || []);
        // Fetch all resources and filter for build options
        const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
        const allResourcesData = resourcesResponse.data;
        setAllResources(allResourcesData);
        // ✅ Filter build options based on the player's location
        const validBuildOptions = allResourcesData.filter(resource => 
          resource.source === 'Build' || 
          (resource.source === 'BuildTown' && currentPlayer.location.gtype === 'town' && currentPlayer.role === 'Mayor')
        );
        setBuildOptions(validBuildOptions); 
      } catch (error) {
        console.error('Error fetching build panel data:', error);
      } finally {
        setIsContentLoading(false);
      }
    };

    fetchData();
  }, [currentPlayer]);

  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };


  
  return (
    <Panel onClose={closePanel} descriptionKey="1002" titleKey="1102" panelName="BuildPanel">
      <div className="standard-panel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {buildOptions.map((item) => {
              const ingredients = getIngredientDetails(item, allResources);
              const affordable = canAfford(item, inventory, backpack);
              const requirementsMet = hasRequiredSkill(item.requires);

              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = item[`ingredient${i}`];
                const qty = item[`ingredient${i}qty`];
                if (!type || !qty) return '';

                const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
                const backpackQty = backpack?.find(item => item.type === type)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = allResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = requirementsMet ? 'green' : 'red';
              const details =
                `Costs:<div>${formattedCosts}</div>` +
                (item.requires ? `<br><span style="color: ${skillColor};">Requires: ${item.requires}</span>` : '');

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
                  disabled={!affordable || !requirementsMet}
                  onClick={() =>
                    affordable &&
                    requirementsMet &&
                    handleConstruction({
                      TILE_SIZE,
                      selectedItem: item.type,
                      buildOptions,
                      inventory,
                      setInventory,
                      backpack,
                      setBackpack, 
                      resources,
                      setResources,
                      setErrorMessage: console.error, // Replace with real error handling if needed
                      currentPlayer,
                      setCurrentPlayer,
                      gridId,
                      updateStatus,
                    })
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

export default React.memo(BuildPanel);