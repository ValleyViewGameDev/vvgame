import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import '../../UI/ResourceButton.css'; 
import ResourceButton from '../../UI/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { canAfford, getIngredientDetails } from '../../Utils/ResourceHelpers';
import { updateGridResource } from '../../Utils/GridManagement';
import { refreshPlayerAfterInventoryUpdate, checkAndDeductIngredients } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import gridStateManager from '../../GridState/GridStateNPCs';


const CraftingStation = ({
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
  masterResources,
  masterSkills,
  TILE_SIZE
}) => {
  const [recipes, setRecipes] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const { updateStatus } = useContext(StatusBarContext);
  const [stationDetails, setStationDetails] = useState(null);
  const [activeTimer, setActiveTimer] = useState(false);
  const [craftedItem, setCraftedItem] = useState(null);
  const [craftingCountdown, setCraftingCountdown] = useState(null);
  const [isCrafting, setIsCrafting] = useState(false);
  const [isReadyToCollect, setIsReadyToCollect] = useState(false);

   // ✅ Check for active crafting timers
   useEffect(() => {
    if (!stationType || !currentStationPosition) return;

    console.log('🔄 Checking GlobalGridStateTilesAndResources for active crafting timers...');
    
    const station = GlobalGridStateTilesAndResources.getResources()?.find(
      (res) => res.x === currentStationPosition.x && res.y === currentStationPosition.y
    );
    console.log('📡 Fetched station from GlobalGridStateTilesAndResources:', station);

    if (station && station.craftEnd) {
        console.log(`⏳ Active crafting found: ${station.craftedItem} until ${new Date(station.craftEnd).toLocaleTimeString()}`);
        
        setCraftedItem(station.craftedItem);
        setIsCrafting(true);
        setActiveTimer(true);  // ✅ Ensure UI treats this as an active timer

        const updateCountdown = () => {
          const remainingTime = Math.max(0, Math.floor((station.craftEnd - Date.now()) / 1000));
          setCraftingCountdown(remainingTime);
          console.log(`⏳ Crafting countdown: ${remainingTime}s remaining`);

          if (remainingTime === 0) {
              console.log('✅ Crafting complete! Ready to collect.');
              setIsCrafting(false);
              setIsReadyToCollect(true);
          }
      };

        updateCountdown();
        const timer = setInterval(updateCountdown, 1000);
        return () => clearInterval(timer);
    } else {
        console.log('❌ No active crafting timer found.');
        setCraftedItem(null);
        setIsCrafting(false);
        setIsReadyToCollect(false);
        setCraftingCountdown(null);
        setActiveTimer(false);
    }
  }, [stationType, currentStationPosition, GlobalGridStateTilesAndResources.getResources(), craftingCountdown]); // ✅ Ensure state triggers re-render


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
        //const allResourcesData = await loadMasterResources();
        const filteredRecipes = masterResources.filter((resource) => resource.source === stationType);
        setRecipes(filteredRecipes);

        const stationResource = masterResources.find((resource) => resource.type === stationType);
        setStationEmoji(stationResource?.symbol || '🛖');
        setStationDetails(stationResource);

        setAllResources(masterResources || []);
      } catch (error) {
        console.error('Error loading resources:', error);
      }
    };
    fetchResources();
  }, [stationType]);


  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };


  const handleCraft = async (recipe) => {
    setErrorMessage('');
    if (!recipe) { setErrorMessage('Invalid recipe selected.'); return; }
    if (!canAfford(recipe, inventory, 1)) { updateStatus(4); return; }

    ////////////////////////////////////////////////

    const updatedInventory = [...inventory];
    const canCraft = checkAndDeductIngredients(recipe, updatedInventory, setErrorMessage);
    if (!canCraft) return;
    const craftedQty = 1;
    const craftTime = recipe.crafttime || 60; // Default to 60s if no timer exists
    const craftEnd = Date.now() + craftTime * 1000; // Calculate timestamp

    try {
      // ✅ Ensure we update only the clicked Crafting Station
      const updatedStation = {
        type: stationType,
        x: currentStationPosition.x, 
        y: currentStationPosition.y, 
        craftEnd: craftEnd,
        craftedItem: recipe.type,  // ✅ Store crafted item
      };
      console.log('handleCraft: updatedStation:  ',updatedStation);
      await updateGridResource(gridId, updatedStation, setResources, true);
      console.log('📡 Fetched station from GlobalGridStateTilesAndResources:', GlobalGridStateTilesAndResources.getResources);


      // ✅ Step 1: Ensure UI Updates Immediately
      setCraftedItem(recipe.type);
      setCraftingCountdown(Math.max(0, Math.floor((craftEnd - Date.now()) / 1000)));
      setActiveTimer(true);
      setIsCrafting(true);
      setIsReadyToCollect(false);

      console.log(`🛠️ Started crafting ${recipe.type}. Will be ready at ${craftEnd}`);

      // ✅ Step 2: Update GlobalGridStateTilesAndResources Immediately
      const updatedResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
              ? { ...res, craftEnd, craftedItem: recipe.type }
              : res
      );
      GlobalGridStateTilesAndResources.setResources(updatedResources);
      console.log("🌎 GlobalGridStateTilesAndResources updated after crafting start!");

      // ✅ Step 3: Ensure UI State Reflects GlobalGridStateTilesAndResources
      setResources(updatedResources);

    
      FloatingTextManager.addFloatingText(404, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
      console.log(`✅ ${recipe.type} will be ready at ${new Date(craftEnd).toLocaleTimeString()}`);

      } catch (error) {
        console.error(`❌ Error starting craft for ${recipe.type}:`, error);
      }

//////////////// WE SHOULD STILL GIVE CREDIT FOR THE QUEST AT THE TIME OF CRAFTING?

    // Track quest progress for "Craft" actions
    // trackQuestProgress expects: (player, action, item, quantity, setCurrentPlayer)
    await trackQuestProgress(currentPlayer, 'Craft', recipe.type, craftedQty, setCurrentPlayer);
    

//////////////// STILL IMPORTANT TO REFRESH INVENTORY BECAUSE WE SPENT ITEMS

    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
  };


  const handleCollect = async (recipe) => {

    if (!craftedItem || !recipe || craftedItem !== recipe.type) {
      console.error("❌ No valid crafted item to collect.");
      return;
    }

    try {
        // ✅ Determine storage location
        const gtype = currentPlayer.location.gtype;
        const isBackpack = ["town", "valley0", "valley1", "valley2", "valley3"].includes(gtype);

        let targetInventory = isBackpack ? backpack : inventory;
        const setTargetInventory = isBackpack ? setBackpack : setInventory;
        const inventoryType = isBackpack ? "backpack" : "inventory";
        const craftedResource = allResources.find(res => res.type === craftedItem);

        // ✅ HANDLE NPCs
        const isNPC = craftedResource?.category === 'npc';
        if (isNPC) {
          console.log(`🤖 Spawning NPC: ${craftedItem} at (${currentStationPosition.x}, ${currentStationPosition.y})`);
          gridStateManager.spawnNPC(gridId, craftedResource, { x: currentStationPosition.x, y: currentStationPosition.y });
          await trackQuestProgress(currentPlayer, 'Craft', craftedItem, 1, setCurrentPlayer);
        } 
        
        // ✅ Add collected item to inventory

        else {

          // ✅ Apply Player Buffs for Crafting Bonus
          //const masterSkills = await loadMasterSkills();
          //const masterResources = await loadMasterResources();

          const playerBuffs = inventory
              .filter((item) => {
                  const resourceDetails = masterResources.find((res) => res.type === item.type);
                  return resourceDetails?.category === "skill" || resourceDetails?.category === "upgrade";
              })
              .map((buff) => buff.type);

          const skillMultiplier = playerBuffs.reduce((multiplier, buff) => {
              const buffData = masterSkills[buff];
              const buffValue = buffData ? buffData[recipe.type] : 1;

              if (buffValue) {
                  console.log(`Buff "${buff}" applies to "${recipe.type}": Multiplier x${buffValue}`);
                  return multiplier * buffValue;
              }
              return multiplier;
          }, 1);

          console.log("Final Skill Multiplier:", skillMultiplier);
          const craftedQty = 1 * skillMultiplier;
          const updatedInventory = [...targetInventory];
          const itemIndex = updatedInventory.findIndex((item) => item.type === recipe.type);
  
          if (itemIndex >= 0) {
              updatedInventory[itemIndex].quantity += craftedQty;
          } else {
              updatedInventory.push({ type: recipe.type, quantity: craftedQty });
          }
  
          // ✅ Save updated inventory to DB
          await axios.post(`${API_BASE}/api/update-inventory`, {
              playerId: currentPlayer.playerId,
              [inventoryType]: updatedInventory,
          });
  
          console.log(`📡 ${inventoryType} updated successfully!`);
          updateStatus(`Collected ${craftedQty}x ${recipe.type}.`);

          setTargetInventory(updatedInventory);
      }

        // ✅ Remove craftEnd & craftedItem from the grid resource
        const updateResponse = await updateGridResource(
            gridId, 
            {
            type: stationType, // ✅ Keep station type
            x: currentStationPosition.x,
            y: currentStationPosition.y,
            craftEnd: null, // ✅ Remove timer
            craftedItem: null, // ✅ Remove craftedItem
            },
            setResources,
            true
        );
        if (!updateResponse?.success) {
            console.warn("⚠️ Warning: Grid resource update failed or returned unexpected response.");
        }
        console.log("🛠️ Grid resource updated:", updateResponse);

        // ✅ **Manually update GlobalGridStateTilesAndResources**

        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? (() => {
                const { craftEnd, craftedItem, ...rest } = res;
                return rest;
              })()
            : res
        );

        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        console.log("🌎 GlobalGridStateTilesAndResources updated successfully!");

        // ✅ Reset UI state
        setActiveTimer(false);
        setCraftedItem(null);
        setCraftingCountdown(null);
        console.log(`✅ ${recipe.type} collected successfully.`);

    } catch (error) {
        console.error(`❌ Error collecting ${recipe.type}:`, error);
    }
};


  const handleSellStation = async () => {
    if (!Array.isArray(inventory)) {
      console.error('Inventory is invalid or not an array:', inventory);
      setErrorMessage('Invalid inventory data.');
      return;
    }
  
    const updatedInventory = [...inventory];
    const ingredients = [];
    for (let i = 1; i <= 3; i++) {
      const ingredientType = stationDetails[`ingredient${i}`];
      const ingredientQty = stationDetails[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        ingredients.push({ type: ingredientType, quantity: ingredientQty });
      }
    }
  
    if (!ingredients.length) { console.error('No ingredients found for refund.'); return; }
  
    try {
      ingredients.forEach(({ type, quantity }) => {
        const index = updatedInventory.findIndex((item) => item.type === type);
        if (index >= 0) {
          updatedInventory[index].quantity += quantity;
        } else {
          updatedInventory.push({ type, quantity });
        }
      });
  
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
      });
  
      // REMOVING THE CRAFTING STATION FROM THE GRID

      // HERE WE NEED TO CONSTRUCT THE PAYLOAD FIRST, THEN JUST SEND THE NEW RESOURCE OBJECT
      await updateGridResource(
        gridId, 
        {
          type: null,
          x: currentStationPosition.x,
          y: currentStationPosition.y,
        }, 
        setResources,
        true
      );
  
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
    <Panel onClose={onClose} descriptionKey="1009" titleKey="1109" panelName="CraftingStation">
      <div className="standard-panel">
        <h2> {stationEmoji} {stationType} </h2>

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
              const requirementsMet = hasRequiredSkill(recipe.requires);
              const isCrafting = craftedItem === recipe.type && craftingCountdown > 0;
              const isReadyToCollect = craftedItem === recipe.type && craftingCountdown === 0;

              const formatCountdown = (seconds) => {
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
              
              return days > 0
                ? `${days}d ${hours}h ${minutes}m`
                : hours > 0
                ? `${hours}h ${minutes}m ${secs}s`
                : minutes > 0
                ? `${minutes}m ${secs}s`
                : `${secs}s`;
              };
              
              const craftTimeText = isCrafting
              ? `⏳ In progress: ${formatCountdown(craftingCountdown)}`
              : isReadyToCollect
              ? `✅ Ready!`
              : recipe.crafttime
              ? `Time: ${formatCountdown(recipe.crafttime)}`
              : `Instant`;
              
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
                className={`resource-button ${
                  isCrafting ? 'in-progress' : isReadyToCollect ? 'ready' : ''
                }`}                           
                details={`Costs: ${ingredients.join(', ') || 'None'}
                  ${recipe.requires ? `<br>Requires: ${recipe.requires}` : ''}
                  ${craftTimeText}`
                } //
                info={info} 
                disabled={!isReadyToCollect && (craftedItem !== null || !affordable || !requirementsMet)}
                onClick={() =>
                  isReadyToCollect ? handleCollect(recipe) : handleCraft(recipe)
                }
              >


              </ResourceButton>

              );
            })
          ) : <p>No recipes available.</p>}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

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

export default React.memo(CraftingStation);