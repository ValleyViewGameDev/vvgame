import axios from 'axios';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import FloatingTextManager from '../../UI/FloatingText';
import { updateGridResource } from '../../Utils/GridManagement';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { loadMasterResources } from '../../Utils/TuningManager';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';

const AnimalStall = ({
  onClose,
  inventory,
  setInventory,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
}) => {
  const [errorMessage, setErrorMessage] = useState('');
  const [stallDetails, setStallDetails] = useState(null);
  const [outputDetails, setOutputDetails] = useState(null);
  const { updateStatus } = useContext(StatusBarContext);

  console.log('Inside Animal Stall:', { stationType, currentStationPosition });

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const allResources = await loadMasterResources();
        const stallResource = allResources.find((res) => res.type === stationType);
        console.log('Stall Resource:', stallResource);
        setStallDetails(stallResource);

        if (!stallResource.output) {
          setOutputDetails(null);
          return;
        }
      } catch (error) {
        console.error('Error loading stall resources:', error);
        setErrorMessage('Failed to load stall resources.');
      }
    };

    fetchResources();
  }, [stationType]);

  useEffect(() => {
    const syncInventory = async () => {
      try {
        const storedInventory = JSON.parse(localStorage.getItem('inventory')) || [];
        setInventory(storedInventory);
  
        const serverResponse = await axios.get(`http://localhost:3001/api/inventory/${currentPlayer.playerId}`);
        const serverInventory = serverResponse.data.inventory || [];
        if (JSON.stringify(storedInventory) !== JSON.stringify(serverInventory)) {
          setInventory(serverInventory);
          localStorage.setItem('inventory', JSON.stringify(serverInventory));
        }
      } catch (error) {
        console.error('Error syncing inventory:', error);
      }
    };
    syncInventory();
  }, [currentPlayer]);

  


  const handleSellStation = async () => {
    if (!Array.isArray(inventory)) {
      console.error('Inventory is invalid or not an array:', inventory);
      setErrorMessage('Invalid inventory data.');
      return;
    }
  
    const updatedInventory = [...inventory];
    const ingredients = [];
    for (let i = 1; i <= 3; i++) {
      const ingredientType = stallDetails[`ingredient${i}`];
      const ingredientQty = stallDetails[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        ingredients.push({ type: ingredientType, quantity: ingredientQty });
      }
    }
  
    if (!ingredients.length) {
      console.error('No ingredients found for refund.');
      return;
    }
  
    try {
      ingredients.forEach(({ type, quantity }) => {
        const index = updatedInventory.findIndex((item) => item.type === type);
        if (index >= 0) {
          updatedInventory[index].quantity += quantity;
        } else {
          updatedInventory.push({ type, quantity });
        }
      });
  
      await axios.post('http://localhost:3001/api/update-inventory', {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
      });
  
      await updateGridResource(gridId, {
        newResource: null,
        x: currentStationPosition.x,
        y: currentStationPosition.y,
      }, setResources);
  
      setInventory(updatedInventory);
      localStorage.setItem('inventory', JSON.stringify(updatedInventory));
      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
  
      console.log(`Sold ${stationType} successfully.`);
      updateStatus(6);
      onClose();
    } catch (error) {
      console.error('Error selling the stall:', error);
      setErrorMessage('An error occurred while selling the stall.');
    }
  };
  

  return (
    <Panel onClose={onClose} descriptionKey="1011" titleKey="1111" panelName="AnimalStall" >
      <div className="standard-panel">
        <h2>
            {stallDetails?.symbol || '🛖'} {stationType}
        </h2>


        {currentPlayer.location.gtype === 'homestead' && (
          <>
            <hr />
            <button className="panel-shared-button" onClick={handleSellStation}>
              Sell for Refund
            </button>
          </>
        )}
      </div>
    </Panel>
  );
  
};

export default React.memo(AnimalStall);
