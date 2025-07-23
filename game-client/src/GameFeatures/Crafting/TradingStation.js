import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import './TradingStation.css';
import '../../UI/ResourceButton.css';
import ResourceButton from '../../UI/ResourceButton';
import { canAfford } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate, gainIngredients, spendIngredients } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';

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
  const strings = useStrings();
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

  const storyStringMap = {
    Iago: 1201,
    Juliet: 1202,
    Falstaff: 1203,
    Apothecary: 1204,
    Gertrude: 1205,
    Leontes: 1206,
    Caliban: 1207,
  };

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

    await trackQuestProgress(currentPlayer, 'Collect', recipe.type, 1, setCurrentPlayer);

    updateStatus(`✅ Exchanged ${recipe.ingredient1qty || 1} ${recipe.ingredient1} for 1 ${recipe.type}.`);
  };

  return (
    <Panel onClose={onClose} descriptionKey="1016" titleKey="1116" panelName="TradingStation">
      <div className="standard-panel">
        <h2> {stationEmoji} {stationType} </h2>
        <h3>{strings[420]}</h3>
        
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const affordable = canAfford(recipe, inventory, backpack, 1);
              const meetsRequirement = recipe.requires
                ? currentPlayer?.skills?.some(skill => skill.type === recipe.requires)
                : true;
 

              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = recipe[`ingredient${i}`];
                const qty = recipe[`ingredient${i}qty`];
                if (!type || !qty) return '';
                const playerQty = (inventory.find((item) => item.type === type)?.quantity || 0) +
                                  (backpack.find((item) => item.type === type)?.quantity || 0);
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = meetsRequirement ? 'green' : 'red';
              const skillReq = recipe.requires ? `<br><span style="color: ${skillColor};">Requires: ${recipe.requires}</span>` : '';

              const details = `For:<div>${formattedCosts}</div>${skillReq}`;

              const info = (
                <div className="info-content">
                  <div><strong>{strings[422]}</strong> 💰 {recipe.minprice || 'n/a'}</div>
                </div>
              );

              return (
                <ResourceButton
                  key={recipe.type}
                  symbol={recipe.symbol}
                  name={recipe.type}
                  className="resource-button"
                  details={details}
                  info={info}
                  disabled={!affordable || !meetsRequirement}
                  onClick={() => handleTrade(recipe)}
                />
              );
            })
          ) : <p>{strings[423]}</p>}

          {storyStringMap[stationType] && (
            <div className="trader-story">
              <p>{strings[storyStringMap[stationType]]}</p>
            </div>
          )}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

      </div>
    </Panel>
  );
};

export default React.memo(TradingStation);