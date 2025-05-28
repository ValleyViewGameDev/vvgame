import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import '../../UI/ResourceButton.css';
import ResourceButton from '../../UI/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { canAfford, getIngredientDetails } from '../../Utils/ResourceHelpers';
import { refreshPlayerAfterInventoryUpdate, checkAndDeductIngredients, checkInventoryCapacity } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { loadMasterResources, loadMasterSkills } from '../../Utils/TuningManager';
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
  TILE_SIZE
}) => {
  const [recipes, setRecipes] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const { updateStatus } = useContext(StatusBarContext);
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

  // Fetch recipes and resources
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const allResourcesData = await loadMasterResources();
        const filteredRecipes = allResourcesData.filter((resource) => resource.source === stationType);
        setRecipes(filteredRecipes);

        const stationResource = allResourcesData.find((resource) => resource.type === stationType);
        setStationEmoji(stationResource?.symbol || '🛖');
        setStationDetails(stationResource);

        setAllResources(allResourcesData || []);
      } catch (error) {
        console.error('Error loading resources:', error);
      }
    };
    fetchResources();
  }, [stationType]);



  const handleTrade = async (recipe) => {
    setErrorMessage('');
    if (!recipe) { setErrorMessage('Invalid recipe selected.'); return; }
    // Ensure inventory and backpack are arrays
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];
    if (!canAfford(recipe, [...safeInventory, ...safeBackpack], 1)) { updateStatus(4); return; }


    // ✅ Combine inventories for deduction
    const combinedInventory = [...safeInventory.map(item => ({ ...item })), ...safeBackpack.map(item => ({ ...item }))];
    const success = checkAndDeductIngredients(recipe, combinedInventory, setErrorMessage);
    if (!success) return;

    // ✅ Re-split combinedInventory into inventory and backpack based on original contents
    const updatedInventory = [];
    const updatedBackpack = [];

    combinedInventory.forEach(item => {
      const inOriginalInventory = safeInventory.find(orig => orig.type === item.type);
      if (inOriginalInventory) {
        updatedInventory.push(item);
      } else {
        updatedBackpack.push(item);
      }
    });

    // ✅ Determine where to store the new item
    const gtype = currentPlayer.location.gtype;
    const isBackpack = ["town", "valley0", "valley1", "valley2", "valley3"].includes(gtype);
    const targetInventory = isBackpack ? updatedBackpack : updatedInventory;
    const setTargetInventory = isBackpack ? setBackpack : setInventory;
    const inventoryType = isBackpack ? "backpack" : "inventory";

    // ✅ Capacity check using checkInventoryCapacity
    const hasCapacity = checkInventoryCapacity(
      currentPlayer,
      updatedInventory,
      updatedBackpack,
      recipe.type,
      1
    );

    if (!hasCapacity) {
      setErrorMessage('🎒 Not enough space to carry that item.');
      return;
    }

    // --- Normalized stacking logic (mirrored from CraftingStation) ---
    const updatedTargetInventory = [...targetInventory];
    const itemIndex = updatedTargetInventory.findIndex((item) => item.type === recipe.type);
    if (itemIndex >= 0) {
      updatedTargetInventory[itemIndex].quantity += 1;
    } else {
      updatedTargetInventory.push({ type: recipe.type, quantity: 1 });
    }

    // Place the updated inventory back into the correct slot
    if (isBackpack) {
      // Overwrite updatedBackpack
      for (let i = 0; i < updatedTargetInventory.length; i++) updatedBackpack[i] = updatedTargetInventory[i];
      updatedBackpack.length = updatedTargetInventory.length;
    } else {
      for (let i = 0; i < updatedTargetInventory.length; i++) updatedInventory[i] = updatedTargetInventory[i];
      updatedInventory.length = updatedTargetInventory.length;
    }

    // Ensure state is set before posting to API
    setTargetInventory(updatedTargetInventory);

    const payload = {
      playerId: currentPlayer.playerId,
      inventory: updatedInventory,
      backpack: updatedBackpack,
    };
    console.log("📤 Sending inventory update with payload:", payload);

    // ✅ Save both inventories to DB
    await axios.post(`${API_BASE}/api/update-inventory`, payload);
    console.log(`📡 Inventories updated successfully!`);

    // ✅ Set both inventories in state (redundant for setTargetInventory, but keeps both up-to-date)
    setInventory(updatedInventory);
    setBackpack(updatedBackpack);

    // ✅ Track quest progress and refresh player
    await trackQuestProgress(currentPlayer, 'Trade', recipe.type, 1, setCurrentPlayer);
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

    console.log('recipe = ', recipe);
    updateStatus(`✅ Exchanged ${recipe.ingredient1} for ${recipe.type}.`);
  };

   

  return (
    <Panel onClose={onClose} descriptionKey="1016" titleKey="1116" panelName="TradingStation">
      <div className="standard-panel">
        <h2> {stationEmoji} {stationType} </h2>
        <h3>{strings[420]}</h3>
        
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const ingredients = getIngredientDetails(recipe, allResources || []);
              const affordable = canAfford(recipe, inventory, 1);
              const info = (
                <div className="info-content">
                  <div>
                    <strong>{strings[421]}</strong>{' '}
                    {allResources
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