import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import '../../UI/ResourceButton.css';
import ResourceButton from '../../UI/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate, gainIngredients, spendIngredients } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { loadMasterSkills } from '../../Utils/TuningManager';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import strings from '../../UI/strings';

const TradingStation = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
  TILE_SIZE,
  updateStatus,
  masterResources,
}) => {
  const [recipes, setRecipes] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const [stationDetails, setStationDetails] = useState(null);

  // Sync inventory with local storage and server
  useEffect(() => {
    const syncInventory = async () => {
      try {
        const storedInventory = JSON.parse(localStorage.getItem('inventory')) || [];
        setInventory(storedInventory);

        const serverResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
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

  useEffect(() => {
    try {
      const filteredRecipes = masterResources.filter((resource) => resource.source === stationType);
      setRecipes(filteredRecipes);

      const stationResource = masterResources.find((resource) => resource.type === stationType);
      setStationEmoji(stationResource?.symbol || '🛖');
      setStationDetails(stationResource);
    } catch (error) {
      console.error('Error loading resources:', error);
    }
  }, [stationType, masterResources]);

  const handleTrade = async (recipe) => {
    setErrorMessage('');
    if (!recipe) {
      setErrorMessage('Invalid recipe selected.');
      return;
    }

    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];

    const spent = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });

    if (!spent) {
      setErrorMessage('Not enough ingredients.');
      return;
    }

    const gained = await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: recipe.type,
      quantity: 1,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
      masterResources,
    });

    if (!gained) {
      setErrorMessage('Not enough space to carry that item.');
      return;
    }

    await trackQuestProgress(currentPlayer, 'Trade', recipe.type, 1, setCurrentPlayer);

    updateStatus(`✅ Exchanged ${recipe.ingredient1qty || 1} ${recipe.ingredient1} for 1 ${recipe.type}.`);
  };

  return (
    <Panel onClose={onClose} descriptionKey="1016" titleKey="1116" panelName="TradingStation">
      <div className="standard-panel">
        <h2> {stationEmoji} {stationType} </h2>
        <h3>{strings[420]}</h3>
        
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const ingredients = getIngredientDetails(recipe, masterResources || []);
              const affordable = canAfford(recipe, inventory, 1);
              const info = (
                <div className="info-content">
                  <div>
                    <strong>{strings[421]}</strong>{' '}
                    {masterResources
                      .filter((res) =>
                        [res.ingredient1, res.ingredient2, res.ingredient3, res.ingredient4].includes(recipe.type)
                      )
                      .map((res) => `${res.symbol || ''} ${res.type}`)
                      .join(', ') || 'None'}
                  </div>
                  <div><strong>{strings[422]}</strong> 💰 {recipe.minprice || 'n/a'}</div>
                </div>
              );
              
              return (
                <ResourceButton
                key={recipe.type}
                symbol={recipe.symbol}
                name={recipe.type}
                className="resource-button"
                details={`in exchange for ${ingredients.join(', ') || 'None'}${recipe.requires ? `<br>Requires: ${recipe.requires}` : ''}`}
                info={info} 
                disabled={!affordable}
                onClick={() => handleTrade(recipe)} // ✅ Now instantly trades
                >
                </ResourceButton>
              );
            })
          ) : <p>{strings[423]}</p>}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

      </div>
    </Panel>
  );
};

export default React.memo(TradingStation);