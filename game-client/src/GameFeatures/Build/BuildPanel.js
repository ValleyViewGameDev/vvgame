import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { handleConstruction } from '../BuildAndBuy';
import { canAfford, getIngredientDetails } from '../../Utils/ResourceHelpers';
import { usePanelContext } from '../../UI/PanelContext';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path

const BuildPanel = ({
  TILE_SIZE,
  resources,
  setResources,
  tiles,
  currentPlayer,
  setCurrentPlayer,
  gridId,
  setIsMoving,
  updateStatus,
  masterResources, // Added for quest tracking
  masterSkills, // Uncomment if needed for skill checks
}) => {
  const { closePanel } = usePanelContext(); // Use closePanel from context
  const [buildOptions, setBuildOptions] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [inventory, setInventory] = useState([]);

  // Fetch inventory and build options when the panel initializes
  useEffect(() => {
    const fetchData = async () => {
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
      {buildOptions.map((item) => {
          const ingredients = getIngredientDetails(item, allResources);
          const affordable = canAfford(item, inventory);
          const requirementsMet = hasRequiredSkill(item.requires);

          const details = `
            Costs: ${ingredients.join(', ') || 'None'}
            ${item.requires ? `<br>Requires: ${item.requires}` : ''}
          `;

          // Dynamically create "info" content for the toaster
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
                  tiles,
                  resources,
                  setResources,
                  setErrorMessage: console.error, // Replace with real error handling if needed
                  currentPlayer,
                  gridId,
                  updateStatus,
                  setCurrentPlayer,
                  source: 'build',
                  setIsMoving,
                  masterResources,
                  masterSkills,
                })
              }
            />
          );
        })}
    </div>   
    </Panel>
  );
};

export default React.memo(BuildPanel);