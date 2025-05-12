import API_BASE from '../../config'; 
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { handleConstruction } from '../BuildAndBuy';
import { canAfford, getIngredientDetails } from '../../Utils/ResourceHelpers';
import { usePanelContext } from '../../UI/PanelContext';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path

const BuyPanel = ({
  TILE_SIZE,
  playerPosition,
  resources,
  tiles,
  currentPlayer,
  setCurrentPlayer,
  gridId,
  setIsMoving,
  updateStatus,
  masterResources, 
  masterSkills, 
}) => {
  const { closePanel } = usePanelContext();
  const [buyOptions, setBuyOptions] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [inventory, setInventory] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const inventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setInventory(inventoryResponse.data.inventory || []);

        const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
        const allResourcesData = resourcesResponse.data;
        setAllResources(allResourcesData);

        const purchasableItems = allResourcesData.filter(
          (resource) => resource.source === 'Buy'
        );
        setBuyOptions(purchasableItems);
      } catch (error) {
        console.error('Error fetching buy panel data:', error);
      }
    }; 

    fetchData();
  }, [currentPlayer]);

  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };

  return ( 
    <Panel onClose={closePanel} descriptionKey="1003" titleKey="1103" panelName="BuyPanel">
      <div className="standard-panel">
          {buyOptions.map((item) => {
            const ingredients = getIngredientDetails(item, allResources);
            const affordable = canAfford(item, inventory);
            const requirementsMet = hasRequiredSkill(item.requires);

            const details = `
              Costs: ${ingredients.join(', ') || 'None'}
              ${item.requires ? `<br>Requires: ${item.requires}` : ''}
            `;

            return (
              <ResourceButton
                key={item.type}
                symbol={item.symbol}
                name={item.type}
                details={details}
                disabled={!affordable || !requirementsMet}
                onClick={() =>
                  affordable &&
                  requirementsMet &&
                  handleConstruction({
                    TILE_SIZE,
                    selectedItem: item.type,
                    buildOptions: buyOptions,
                    inventory,
                    setInventory,
                    playerPosition,
                    resources,
                    setErrorMessage: console.error,
                    currentPlayer,
                    setCurrentPlayer,
                    gridId,
                    setIsMoving,
                  })
                }
              />
            );
          })}
        </div>
    </Panel>
  );
};

export default React.memo(BuyPanel);