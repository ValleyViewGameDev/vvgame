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
import { getLocalizedString } from '../../Utils/stringLookup';

const BuyDecoPanel = ({
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
          (resource) => resource.source === 'Deco' && (isDeveloper || isHomestead || resource.passable !== false)
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

  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };

  return ( 
    <Panel onClose={closePanel} descriptionKey="1031" titleKey="1131" panelName="BuyDecoPanel">
      <div className="standard-panel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {buyOptions.map((item) => {
              const ingredients = getIngredientDetails(item, allResources);
              const affordable = canAfford(item, inventory);
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
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = requirementsMet ? 'green' : 'red';
              const details =
                `${strings[461]}<div>${formattedCosts}</div>` +
                (item.requires ? `<br><span style="color: ${skillColor};">${strings[460]}${getLocalizedString(item.requires, strings)}</span>` : '');

              return (
                <ResourceButton
                  key={item.type}
                  symbol={item.symbol}
                  name={getLocalizedString(item.type, strings)}
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
                />
              );
            })}
          </>
        )}
      </div>
    </Panel>
  );
};

export default React.memo(BuyDecoPanel);