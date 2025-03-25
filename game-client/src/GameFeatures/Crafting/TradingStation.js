import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import ResourceButton from '../../UI/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { canAfford, getIngredientDetails } from '../../Utils/ResourceHelpers';
import { refreshPlayerAfterInventoryUpdate, checkAndDeductIngredients } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { loadMasterResources, loadMasterSkills } from '../../Utils/TuningManager';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import GlobalGridState from '../../GridState/GlobalGridState';

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


  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };


  const handleTrade = async (recipe) => {
    setErrorMessage('');
    if (!recipe) { setErrorMessage('Invalid recipe selected.'); return; }
    if (!canAfford(recipe, inventory, 1)) { updateStatus(4); return; }

    const updatedInventory = [...inventory];
    const success = checkAndDeductIngredients(recipe, updatedInventory, setErrorMessage);
    if (!success) return;

    // ✅ Determine storage location
    const gtype = currentPlayer.location.gtype;
    const isBackpack = ["town", "valley1", "valley2", "valley3"].includes(gtype);
    let targetInventory = isBackpack ? backpack : inventory;
    const setTargetInventory = isBackpack ? setBackpack : setInventory;
    const inventoryType = isBackpack ? "backpack" : "inventory";

    // ✅ Add traded item directly to inventory
    const tradedQty = 1;  
    const updatedTargetInventory = [...targetInventory];
    const itemIndex = updatedTargetInventory.findIndex(item => item.type === recipe.type);

    if (itemIndex >= 0) {
        updatedTargetInventory[itemIndex].quantity += tradedQty;
    } else {
        updatedTargetInventory.push({ type: recipe.type, quantity: tradedQty });
    }
    // ✅ Save updated inventory to DB
    await axios.post("http://localhost:3001/api/update-inventory", {
        playerId: currentPlayer.playerId,
        [inventoryType]: updatedTargetInventory,
    });
    console.log(`📡 ${inventoryType} updated successfully!`);
    setTargetInventory(updatedTargetInventory);

    // ✅ Floating text feedback
    FloatingTextManager.addFloatingText(`+1 ${recipe.type}`, currentPlayer.location.x * 32 + 16, currentPlayer.location.y * 32 + 16);
    // ✅ Track quest progress
    await trackQuestProgress(currentPlayer, 'Trade', recipe.type, tradedQty, setCurrentPlayer);
    // ✅ Refresh inventory
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

    updateStatus(`✅ Traded for ${recipe.type}.`);
  };


  return (
    <Panel onClose={onClose} descriptionKey="1016" titleKey="1116" panelName="TradingStation">
      <div className="standard-panel">
        <h2> {stationEmoji} {stationType} </h2>
        <h3>is offering theses items:</h3>
        {/* ✅ Conditional text for Store-type stations */}
        {stationType === "Store" && (
          <p style={{ fontWeight: "bold", color: "#4CAF50" }}>
            🏕️ To use a purchased tent, click on your own player icon.
          </p>
        )}
        
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const ingredients = getIngredientDetails(recipe, allResources || []);
              const affordable = canAfford(recipe, inventory, 1);
              const info = (
                <div className="info-content">
                  <div>
                    <strong>Used In:</strong>{' '}
                    {allResources
                      .filter((res) =>
                        [res.ingredient1, res.ingredient2, res.ingredient3, res.ingredient4].includes(recipe.type)
                      )
                      .map((res) => `${res.symbol || ''} ${res.type}`)
                      .join(', ') || 'None'}
                  </div>
                  <div><strong>Base Value:</strong> 💰 {recipe.minprice || 'n/a'}</div>
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
          ) : <p>No trades available.</p>}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

      </div>
    </Panel>
  );
};

export default React.memo(TradingStation);