import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import '../../UI/Buttons/ResourceButton.css';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import ResourceIcon, { resourceIconHtml } from '../../UI/Icons/ResourceIcon';
import FloatingTextManager from '../../UI/FloatingText';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { calculateGemSpeedupCost } from '../../Economy/EconomyUtils';
import { canAfford, getPlayerQuantity } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { createCollectEffect } from '../../VFX/VFX';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import '../../UI/Buttons/SharedButtons.css';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { getDerivedLevel } from '../../Utils/playerManagement';
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import { showNotification } from '../../UI/Notifications/Notifications';
import { canCollect, reportRefusal } from '../../Utils/noRoom';

const FarmHouse = ({
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
  masterTrophies,
  masterXPLevels,
  TILE_SIZE,
  isDeveloper,
  globalTuning,
}) => {
  const strings = useStrings();
  const [recipes, setRecipes] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const { updateStatus } = useContext(StatusBarContext);
  const [stationDetails, setStationDetails] = useState(null);
  const [activeTimer, setActiveTimer] = useState(false);
  const [craftedItem, setCraftedItem] = useState(null);
  const [craftingCountdown, setCraftingCountdown] = useState(null);
  const [isCrafting, setIsCrafting] = useState(false);
  const [isReadyToCollect, setIsReadyToCollect] = useState(false);
  const [npcRefreshKey, setNpcRefreshKey] = useState(0);

   // ✅ Check for active crafting timers
   // Supports both legacy format (station.craftEnd) and new slots format (station.slots[0].craftEnd)
   useEffect(() => {
    if (!stationType || !currentStationPosition) return;

    const station = GlobalGridStateTilesAndResources.getResources()?.find(
      (res) => res.x === currentStationPosition.x && res.y === currentStationPosition.y
    );

    // Support both legacy format and new slots format
    const slot = station?.slots?.[0];
    const craftEnd = slot?.craftEnd || station?.craftEnd;
    const craftedItemValue = slot?.craftedItem || station?.craftedItem;

    if (station && craftEnd) {
        console.log(`⏳ Active crafting found: ${craftedItemValue} until ${new Date(craftEnd).toLocaleTimeString()}`);

        setCraftedItem(craftedItemValue);
        setIsCrafting(true);
        setActiveTimer(true);  // ✅ Ensure UI treats this as an active timer

        const updateCountdown = () => {
          const remainingTime = Math.max(0, Math.floor((craftEnd - Date.now()) / 1000));
          setCraftingCountdown(remainingTime);

          if (remainingTime === 0) {
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


  // Sync inventory with the server
  useEffect(() => {
    const syncInventory = async () => {
      try {
        // The server copy only: a localStorage snapshot was set first here, and a stale one (written the
        // last time one of these panels opened, by any account on this browser) flashed old items into
        // the inventory, e.g. replaying a Quest for Hope find (HopeFound.js) for an artifact no longer held
        const serverResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setInventory(serverResponse.data.inventory || []);
      } catch (error) {
        console.error('Error syncing inventory:', error);
      }
    };
    syncInventory();
  }, [currentPlayer]);

  // Fetch recipes and resources (refactored: use masterResources directly)
  useEffect(() => {
    try {
      let filteredRecipes = masterResources.filter((resource) => resource.source === stationType);

      // Filter out non-repeatable resources that already exist on the grid
      const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
      if (npcsInGrid) {
        // Get all NPC types currently on the grid
        // NPCs are stored directly under NPCsInGrid with their ID as the key
        const existingNPCTypes = Object.values(npcsInGrid)
          .filter(npc => npc && npc.type) // Filter out any null/undefined entries
          .map(npc => npc.type);
        
        console.log('Existing NPC types on grid:', existingNPCTypes);
        
        // Filter out non-repeatable recipes that already exist
        filteredRecipes = filteredRecipes.filter(recipe => {
          // If it's not repeatable and already exists, filter it out
          if (recipe.repeatable === false && existingNPCTypes.includes(recipe.type)) {
            console.log(`Filtering out non-repeatable ${recipe.type} - already exists on grid`);
            return false;
          }
          return true;
        });
      }
      
      // Level-lock order: the lowest unlock level first (no level = level 1), so the list reads as
      // what the player has now, then what opens next; recipes on the same level keep their
      // resources.json order (Array.prototype.sort is stable)
      filteredRecipes = [...filteredRecipes].sort((a, b) => (Number(a.level) || 1) - (Number(b.level) || 1));
      setRecipes(filteredRecipes);
      const stationResource = masterResources.find((resource) => resource.type === stationType);
      setStationDetails(stationResource);
      setAllResources(masterResources || []);
    } catch (error) {
      console.error('Error processing masterResources:', error);
    }
  }, [stationType, masterResources, gridId, npcRefreshKey]);
  
  // Periodically refresh to check for NPC changes
  useEffect(() => {
    const interval = setInterval(() => {
      setNpcRefreshKey(prev => prev + 1);
    }, 2000); // Check every 2 seconds
    
    return () => clearInterval(interval);
  }, []);


  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };

  // Check if player meets the level requirement
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => {
    if (!resourceLevel) return true; // No level requirement
    return playerLevel >= resourceLevel;
  };


  const deltaSetters = { setCurrentPlayer, setInventory, setBackpack };

  // An NPC the server has placed on its Worker Slot (now its own '<type> Slot'): show the slot
  // swap and walk it out (docs/citizens.md decision 3). `home` comes from the answer.
  const showNewWorker = (npcType, home) => {
    const craftedResource = allResources.find(res => res.type === npcType);
    if (!craftedResource || !home) return;
    const ownSlotType = `${craftedResource.type} Slot`;
    const ownSlotDef = allResources.find(res => res.type === ownSlotType);
    const current = GlobalGridStateTilesAndResources.getResources();
    const swapped = current.map(res => (res.x === home.x && res.y === home.y && res.type === 'Worker Slot')
      ? { ...(ownSlotDef || res), type: ownSlotDef ? ownSlotType : 'Worker Slot', x: home.x, y: home.y }
      : res);
    GlobalGridStateTilesAndResources.setResources(swapped);
    setResources(swapped);
    NPCsInGridManager.spawnNPC(gridId, craftedResource, { x: home.x, y: home.y }, { homeX: home.x, homeY: home.y });
    setNpcRefreshKey(prev => prev + 1);
  };
  const showTrophies = (trophies) => {
    for (const t of trophies || []) {
      if (!t.isNewMilestone) continue;
      const def = (masterTrophies || []).find((d) => d.name === t.name);
      if (def && def.visible === false) continue;
      showNotification('Trophy', t.trophy);
    }
  };
  const refusalStatus = (reason) => {
    if (reason === 'no-worker-slot') updateStatus('No worker slot available!');
    else if (reason === 'no-backpack') updateStatus(19);
    else if (reason === 'warehouse-full') updateStatus(20);
    else if (reason === 'backpack-full') updateStatus(21);
    else if (reason === 'short-Gem') updateStatus(4);
    else updateStatus(454);
  };

  // Start a craft: ONE request (game-server routes/actionRoutes.js /action/craft-start); the
  // recipe comes from resources.json on the server.
  const handleCraft = async (transactionId, transactionKey, recipe) => {
    setErrorMessage('');
    if (!recipe) { setErrorMessage('Invalid recipe selected.'); return; }
    const answer = await postAction('/api/action/craft-start', {
      playerId: currentPlayer.playerId, gridId,
      stationX: currentStationPosition.x, stationY: currentStationPosition.y,
      recipeType: recipe.type,
    });
    applyPlayerDelta(answer.data, deltaSetters);
    if (!answer.ok) { updateStatus(answer.status === 400 || answer.status === 403 || String(answer.reason).startsWith('short-') ? 450 : 452); return; }
    const { craftEnd, slots } = answer.data;
    const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
      res.x === currentStationPosition.x && res.y === currentStationPosition.y ? { ...res, slots, craftEnd: undefined, craftedItem: undefined } : res
    );
    GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
    setResources(updatedGlobalResources);
    setCraftedItem(recipe.type);
    setCraftingCountdown(Math.max(0, Math.floor((craftEnd - Date.now()) / 1000)));
    setActiveTimer(true);
    setIsCrafting(true);
    setIsReadyToCollect(false);
    FloatingTextManager.addFloatingText(404, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
    updateStatus(`${strings[440]} ${getLocalizedString(recipe.type, strings)}`);
  };

  // Collect: ONE request (/action/craft-collect). The server gives goods with the skill bonus or
  // seats a new worker on a Worker Slot (First Farm Worker), and advances Craft quests.
  const handleCollect = async (transactionId, transactionKey, recipe) => {
    if (!recipe) { console.error("❌ No valid crafted item to collect."); return; }
    // where the collected card is, taken on the tap: what it made rises from it and flies into
    // Inventory (UI/FlyToTarget.js); an NPC (a worker, an animal) walks out instead, so it only rises
    const cardRect = document.querySelector(`[data-resource-type="${CSS.escape(getLocalizedString(recipe.type, strings))}"]`)?.getBoundingClientRect() || null;
    // Room FIRST for goods (a worker needs a Worker Slot instead: the server checks that)
    const roomFeedback = { at: cardRect ? { rect: cardRect } : { col: currentStationPosition.x, row: currentStationPosition.y, TILE_SIZE }, strings, updateStatus };
    const madeDef = allResources.find((r) => r.type === recipe.type);
    if (madeDef && madeDef.category !== 'npc' && !canCollect({
      resource: recipe.type, quantity: 1, currentPlayer, inventory, backpack, masterResources, globalTuning, ...roomFeedback,
    })) return;
    const answer = await postAction('/api/action/craft-collect', {
      playerId: currentPlayer.playerId, gridId,
      stationX: currentStationPosition.x, stationY: currentStationPosition.y,
      slotIndex: 0, // Farm House is a single-slot station
    });
    applyPlayerDelta(answer.data, deltaSetters);
    if (!answer.ok) { if (!reportRefusal(answer.reason, roomFeedback)) refusalStatus(answer.reason); return; }
    const { collected, isNPC, home, trophies } = answer.data;
    {
      const text = `+${collected.qty} ${allResources.find((r) => r.type === collected.type)?.symbol || ''} ${getLocalizedString(collected.type, strings)}`;
      const flyTo = isNPC ? null : collected.type === 'Money' ? 'money' : 'inventory';
      if (cardRect) FloatingTextManager.addFloatingTextAt(text, cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2, { flyTo });
      else FloatingTextManager.addFloatingText(text, currentStationPosition.x, currentStationPosition.y, TILE_SIZE, { flyTo });
    }
    if (isNPC) showNewWorker(collected.type, home);
    showTrophies(trophies);
    const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
      res.x === currentStationPosition.x && res.y === currentStationPosition.y
        ? { ...res, slots: undefined, craftEnd: undefined, craftedItem: undefined }
        : res
    );
    GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
    setResources(updatedGlobalResources);
    setActiveTimer(false);
    setCraftedItem(null);
    setCraftingCountdown(null);
    setIsReadyToCollect(false);
  };

  const handleSellStation = async (transactionId, transactionKey) => {
    await handleProtectedSelling({
      currentPlayer,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      setResources,
      stationType,
      currentStationPosition,
      gridId,
      TILE_SIZE,
      updateStatus,
      onClose,
      devOnly: true, // Developer-only action
    });
  };

  // Finish now for gems: ONE request (/action/craft-speedup); the server prices it from its clock
  const handleGemSpeedup = async () => {
    if (!isCrafting || !craftingCountdown) { console.error('❌ No active crafting to speed up'); return; }
    const gemCost = calculateGemSpeedupCost(craftingCountdown * 1000); // the button's figure
    const answer = await postAction('/api/action/craft-speedup', {
      playerId: currentPlayer.playerId, gridId,
      stationX: currentStationPosition.x, stationY: currentStationPosition.y, slotIndex: 0,
    });
    applyPlayerDelta(answer.data, deltaSetters);
    if (!answer.ok) {
      updateStatus(answer.reason === 'short-Gem' ? `Need ${gemCost} gems to speed up crafting` : '❌ Failed to speed up crafting');
      return;
    }
    const { slots, gems } = answer.data;
    const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
      res.x === currentStationPosition.x && res.y === currentStationPosition.y ? { ...res, slots, craftEnd: undefined, craftedItem: undefined } : res
    );
    GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
    setResources(updatedGlobalResources);
    setCraftingCountdown(0);
    setIsCrafting(false);
    setIsReadyToCollect(true);
    updateStatus(`Used ${gems} gems to complete crafting instantly`);
    FloatingTextManager.addFloatingText(`-${gems} 💎`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
  };

  // Gem purchase: ONE request (/action/gem-craft): the worker is bought outright (held
  // ingredients plus gems for the rest) and seated on a Worker Slot at once
  const handleGemPurchase = async (modifiedRecipe) => {
    const answer = await postAction('/api/action/gem-craft', {
      playerId: currentPlayer.playerId, gridId,
      stationX: currentStationPosition.x, stationY: currentStationPosition.y,
      recipeType: modifiedRecipe.type,
    });
    applyPlayerDelta(answer.data, deltaSetters);
    if (!answer.ok) { refusalStatus(answer.reason); return; }
    const { collected, isNPC, home, trophies } = answer.data;
    if (isNPC) showNewWorker(collected.type, home);
    showTrophies(trophies);
    updateStatus(`💎 ${getLocalizedString(collected.type, strings)}`);
  };

  // Sell section, pinned under the panel (UI/Panels/SellSection.js): Sell (the refund) and Move
  const sellFooter = sellSection({
    canSell: false,
    isDeveloper,
    resourceType: stationType,
    masterResources,
    onSell: handleSellStation,
    transactionKey: `sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`,
    onMove: () => requestMove({ type: stationType, x: currentStationPosition.x, y: currentStationPosition.y }),
  });

  return (
    <Panel footer={sellFooter} onClose={onClose} descriptionKey="1032" titleKey="1132" panelName="FarmHouse">
      <div className="standard-panel">
        {/* The hiring line: once every worker stands on the homestead, there is no one left to hire */}
        <h3>
          {recipes?.some((recipe) => recipe.action === 'worker') ? strings[17019] : strings[17020]}
        </h3>

          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const ingredients = getIngredientDetails(recipe, allResources || []);
              const affordable = canAfford(recipe, inventory, Array.isArray(backpack) ? backpack : [], 1);
              const meetsSkillRequirement = hasRequiredSkill(recipe.requires);
              const meetsLevel = meetsLevelRequirement(recipe.level);
              const requirementsMet = meetsSkillRequirement && meetsLevel;
              const skillColor = meetsSkillRequirement ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
              const levelColor = meetsLevel ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
              const isCrafting = craftedItem === recipe.type && craftingCountdown > 0;
              const isReadyToCollect = craftedItem === recipe.type && craftingCountdown === 0;
              
              // Calculate gem speedup cost for this crafting item
              const remainingTimeMs = isCrafting ? craftingCountdown * 1000 : 0;
              const gemSpeedupCost = isCrafting ? calculateGemSpeedupCost(remainingTimeMs) : 0;

              
              const craftTimeText = isCrafting
              ? `${strings[441]} ${formatCountdown(Date.now() + craftingCountdown * 1000, Date.now())}`
              : isReadyToCollect
              ? strings[457] 
              : recipe.crafttime
              ? `${strings[458]} ${formatDuration(recipe.crafttime)}`
              : strings[459];
              
              // Custom tooltips for workers
              let info;
              if (recipe.type === 'Farm Hand') {
                info = (
                  <div className="info-content">
                    <div>{strings[350]}</div>
                  </div>
                );
              } else if (recipe.type === 'Rancher') {
                info = (
                  <div className="info-content">
                    <div>{strings[351]}</div>
                  </div>
                );
              } else if (recipe.type === 'Lumberjack') {
                info = (
                  <div className="info-content">
                    <div>{strings[352]}</div>
                  </div>
                );
              } else if (recipe.type === 'Crafter') {
                info = (
                  <div className="info-content">
                    <div>{strings[353]}</div>
                  </div>
                );
              } else if (recipe.type === 'Kent') {
                info = (
                  <div className="info-content">
                    <div>{strings[354]}</div>
                  </div>
                );
              } else if (recipe.type === 'The Shepherd') {
                info = (
                  <div className="info-content">
                    <div>{strings[355]}</div>
                  </div>
                );
              } else {
                // Default info for non-worker recipes
                const usedIn = allResources.filter((res) =>
                  [res.ingredient1, res.ingredient2, res.ingredient3, res.ingredient4].includes(recipe.type)
                );
                info = (
                  <div className="info-content">
                    <div>
                      <strong>{strings[421]}</strong>{' '}
                      {usedIn.length
                        ? usedIn.map((res, i) => <React.Fragment key={res.type}>{i > 0 ? ', ' : ''}<ResourceIcon resource={res} /> {getLocalizedString(res.type, strings)}</React.Fragment>)
                        : 'None'}
                    </div>
                    <div><strong>{strings[422]}</strong> <ResourceIcon type="Money" /> {recipe.minprice || 'n/a'}</div>
                  </div>
                );
              }
              
              // Format costs with color per ingredient (now using display: block and no <br>)
              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = recipe[`ingredient${i}`];
                const qty = recipe[`ingredient${i}qty`];
                if (!type || !qty) return '';

                const playerQty = getPlayerQuantity(type, inventory, backpack); // backpack + warehouse
                const color = playerQty >= qty ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                return `<span style="color: ${color}; display: block;">${resourceIconHtml(type, allResources)} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              return (
                <ResourceButton
                  key={recipe.type}
                  symbol={recipe.symbol}
                  filename={recipe.filename}
                  name={getLocalizedString(recipe.type, strings)}
                  className={`resource-button ${isCrafting ? 'in-progress' : isReadyToCollect ? 'ready btn-sell' : ''}`}
                  details={
                    isCrafting ? craftTimeText :
                    (
                      (recipe.level ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${recipe.level}</span>` : '') +
                      (recipe.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(recipe.requires, strings)}</span>` : '') +
                      `${craftTimeText}<br>` +
                      (isReadyToCollect ? '' : `${strings[461]}<div>${formattedCosts}</div>`)
                    )
                  }
                  info={info}
                  disabled={!isReadyToCollect && (craftedItem !== null || !affordable || !requirementsMet)}
                  onClick={undefined} // Remove direct onClick since we're using transaction mode
                  // Transaction mode props for both craft start and collect
                  isTransactionMode={true}
                  transactionKey={isReadyToCollect ? 
                    `crafting-collect-${recipe.type}-${currentStationPosition.x}-${currentStationPosition.y}` : 
                    `crafting-start-${recipe.type}-${currentStationPosition.x}-${currentStationPosition.y}`}
                  onTransactionAction={isReadyToCollect ? 
                    (transactionId, transactionKey) => handleCollect(transactionId, transactionKey, recipe) :
                    (transactionId, transactionKey) => handleCraft(transactionId, transactionKey, recipe)}
                  // Gem purchase props (for instant purchase) or speedup props (for active crafting)
                  gemCost={isCrafting ? gemSpeedupCost : null}
                  onGemPurchase={isCrafting ? 
                    () => handleGemSpeedup(recipe) : 
                    ((recipe.gemcost && (!affordable || !requirementsMet) && craftedItem === null) ? handleGemPurchase : null)}
                  resource={isCrafting ? { 
                    type: 'CraftingSpeedup', 
                    gemcost: gemSpeedupCost // Main gem cost, no ingredients
                  } : recipe}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources || allResources}
                  currentPlayer={currentPlayer}
                  // Hide gem button logic:
                  // - If ready to collect: hide
                  // - If this item is crafting: show speedup button
                  // - If another item is crafting: hide
                  // - If nothing is crafting and no gem cost: hide
                  // - If nothing is crafting and has gem cost: show purchase button
                  hideGem={isReadyToCollect || 
                           (!isCrafting && craftedItem !== null) || 
                           (!isCrafting && !recipe.gemcost)}
                >
                </ResourceButton>
              );
            })
          ) : null}

        {errorMessage && <p className="error-message">{errorMessage}</p>}


      </div>
    </Panel>
  );
};

export default React.memo(FarmHouse);