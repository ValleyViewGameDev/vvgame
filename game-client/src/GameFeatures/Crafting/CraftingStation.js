import API_BASE from '../../config';
import { canHover } from '../../Utils/inputMode';
import playersInGridManager from '../../GridState/PlayersInGrid';
import React, { useState, useEffect, useContext, useMemo } from 'react';
import ReactDOM from 'react-dom';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import '../../UI/Buttons/ResourceButton.css';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import ResourceIcon, { resourceIconHtml } from '../../UI/Icons/ResourceIcon';
import FloatingTextManager from '../../UI/FloatingText';
import { canAfford, calculateSkillMultiplier, applySkillMultiplier, getPlayerQuantity } from '../../Utils/InventoryManagement';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { ensureRoomFor } from '../../Utils/InventoryManagement';
import { confirmGemSpend } from '../../UI/Modals/GemSpendConfirm';
import { formatSingleCollection } from '../../UI/StatusBar/CollectionFormatters';
import soundManager from '../../Sound/SoundManager';
import '../../UI/Buttons/SharedButtons.css';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import { formatDuration, formatCompactCountdown, formatNumber } from '../../UI/Timers';
import { getMayorUsername } from '../Government/GovUtils';
import { getDerivedLevel } from '../../Utils/playerManagement';
import './CraftingStation.css'; // Import for crafting station panel and slot styles
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';
import InfoButton from '../../UI/Buttons/InfoButton';
import { rememberLastDoober } from '../Relationships/conversationMemory';
import { canCollect, reportRefusal } from '../../Utils/noRoom';
import { calculateGemSpeedupCost } from '../../Economy/EconomyUtils';
import { usePanelContext } from '../../UI/Panels/PanelContext';

// Slots with a collect on its way to the server, per station ("gridId:x,y" -> Set of slot
// indexes). The server answers collects one at a time (the per-grid write lock), and each answer
// carries the station's slots as they stood after THAT collect, so with several taps in flight
// the first answer still shows the later slots full. Those slots stay empty on the client until
// their own answer lands; a failed collect puts back only its own slot.
const pendingSlotCollects = new Map();

const CraftingStation = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  resources,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
  masterResources,
  masterSkills,
  TILE_SIZE,
  isDeveloper,
  currentSeason,
  globalTuning,
  masterXPLevels,
}) => {
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const strings = useStrings();
  const [recipes, setRecipes] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const { updateStatus } = useContext(StatusBarContext);
  const { openPanel } = usePanelContext();
  const [stationDetails, setStationDetails] = useState(null);
  const [npcRefreshKey, setNpcRefreshKey] = useState(0);
  const [stationRefreshKey, setStationRefreshKey] = useState(0);
  const [isMayor, setIsMayor] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [slotTooltip, setSlotTooltip] = useState({ show: false, slotIndex: null, top: 0, left: 0 });
  // Per-slot countdown timers (keyed by slot index)
  const [slotCountdowns, setSlotCountdowns] = useState({});
  // Slot index showing "Added" floating text animation (null when none)
  const [slotAddedAnimation, setSlotAddedAnimation] = useState(null);

  // Tooltip position update function (similar to ResourceButton)
  const updateSlotTooltipPosition = (event, slotIndex) => {
    setSlotTooltip({
      show: true,
      slotIndex,
      top: event.clientY + window.scrollY + 10,
      left: event.clientX + window.scrollX + 15,
    });
  };

  // Get station level (default 0 for pre-existing stations)
  const station = resources?.find(
    (res) => res.x === currentStationPosition?.x && res.y === currentStationPosition?.y
  );
  const stationLevel = station?.stationLevel ?? 0;
  const maxSlots = globalTuning?.maxCraftingStationSlots || 4;

  // Compute effective slots - merge legacy craftEnd/craftedItem into slot 0 if no slots array
  // This handles backward compatibility for stations that had crafts before the multi-slot update
  const effectiveSlots = useMemo(() => {
    if (station?.slots && station.slots.length > 0) {
      return station.slots;
    }
    // Legacy fallback: if station has craftEnd/craftedItem but no slots, treat as slot 0
    if (station?.craftEnd || station?.craftedItem) {
      return [{
        craftEnd: station.craftEnd,
        craftedItem: station.craftedItem,
        qty: station.qty || 1
      }];
    }
    return [];
  }, [station?.slots, station?.craftEnd, station?.craftedItem, station?.qty]);

   // ✅ Manage per-slot countdown timers
   useEffect(() => {
    if (!stationType || !currentStationPosition) return;

    const updateCountdowns = () => {
      const newCountdowns = {};
      (effectiveSlots || []).forEach((slot, i) => {
        if (slot?.craftEnd && slot.craftEnd > Date.now()) {
          newCountdowns[i] = Math.max(0, Math.floor((slot.craftEnd - Date.now()) / 1000));
        }
      });
      setSlotCountdowns(newCountdowns);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 1000);
    return () => clearInterval(interval);
  }, [stationType, currentStationPosition, effectiveSlots, stationRefreshKey]);


  // (The inventory arrives as props and every action's answer updates it: no resync GET here.)

  // Fetch recipes and resources (refactored: use masterResources directly)
  useEffect(() => {
    try {
      let filteredRecipes = masterResources.filter((resource) => {
        // Check if resource source matches station type
        if (resource.source !== stationType) return false;
        
        // Check seasonal restriction
        if (resource.season && currentSeason && resource.season !== currentSeason) {
          return false;
        }
        
        return true;
      });
      
      // Filter out non-repeatable resources that already exist on the grid
      const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
      if (npcsInGrid) {
        // Get all NPC types currently on the grid
        // NPCs are stored directly under NPCsInGrid with their ID as the key
        const existingNPCTypes = Object.values(npcsInGrid)
          .filter(npc => npc && npc.type) // Filter out any null/undefined entries
          .map(npc => npc.type);        
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

  // Check if player is mayor for town building selling permissions
  useEffect(() => {
    const checkMayorStatus = async () => {
      let isPlayerMayor = false;
      if (currentPlayer?.location?.gtype === 'town' && currentPlayer?.location?.s) {
        try {
          const mayorUsername = await getMayorUsername(currentPlayer.location.s);
          isPlayerMayor = mayorUsername === currentPlayer.username;
        } catch (error) {
          console.error('Error checking mayor status:', error);
        }
      }
      setIsMayor(isPlayerMayor);
    };

    if (currentPlayer) {
      checkMayorStatus();
    }
  }, [currentPlayer?.location?.s, currentPlayer?.username]);

  // Build a spendIngredients-compatible recipe from globalTuning slot costs
  const buildSlotCostRecipe = (slotIndex) => {
    const slotKey = `slot${slotIndex}`;
    const costs = globalTuning?.craftingStationSlotCosts?.[slotKey];
    if (!costs) return null;

    const recipe = {};
    let i = 1;
    for (const [resourceType, qty] of Object.entries(costs)) {
      if (qty <= 0) continue;
      recipe[`ingredient${i}`] = resourceType;
      recipe[`ingredient${i}qty`] = qty;
      i++;
    }
    return Object.keys(recipe).length > 0 ? recipe : null;
  };

  const handleUpgradeSlot = async (slotIndex) => {
    if (isUpgrading) return;
    // The server spends the slot's cost, so ask here ("Spend X Gems?" for 10+ gems)
    const slotCosts = globalTuning?.craftingStationSlotCosts?.[`slot${slotIndex}`] || {};
    const otherCosts = Object.entries(slotCosts).filter(([type, qty]) => type !== 'Gem' && qty > 0).map(([type, amount]) => ({ type, amount }));
    if (!(await confirmGemSpend({ gems: slotCosts.Gem || 0, items: otherCosts, oneShot: false }))) return;
    setIsUpgrading(true);

    try {
      const response = await axios.post(`${API_BASE}/api/crafting/upgrade-station`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
        targetLevel: slotIndex,
        transactionId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        transactionKey: `upgrade-station-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`
      });

      if (response.data.success) {
        // Update inventory from server
        if (response.data.inventory) setInventory(response.data.inventory);
        if (response.data.backpack) setBackpack(response.data.backpack);
        setCurrentPlayer(prev => ({
          ...prev,
          inventory: response.data.inventory || prev.inventory,
          backpack: response.data.backpack || prev.backpack
        }));

        // Update station level in local grid resources
        const newLevel = response.data.newLevel;
        const updatedResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? { ...res, stationLevel: newLevel }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedResources);
        setResources(updatedResources);

        FloatingTextManager.addFloatingText(`Slot ${slotIndex + 1}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
        soundManager.playSFX('collect_item');

      }
    } catch (error) {
      if (error.response?.status === 429) {
        updateStatus(451);
      } else {
        updateStatus(452);
      }
    } finally {
      setIsUpgrading(false);
    }
  };

  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };

  // A recipe's level is a lock, as at the FarmHouse and in shops: owning the station opens its menu
  // level by level (skills are the Money gate on top; docs/tuning.md §4g)
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => !resourceLevel || playerLevel >= resourceLevel;


  // Protected function to start crafting using transaction system (slot-based)
  // Put the server's slots / level for this station into the local grid state (a conflict
  // answer from start-craft carries them)
  const applyServerStation = ({ slots, stationLevel } = {}) => {
    if (!Array.isArray(slots)) return;
    console.warn(`🔄 [CRAFT] Station at (${currentStationPosition.x}, ${currentStationPosition.y}) was out of sync; applying the server's slots`);
    const synced = GlobalGridStateTilesAndResources.getResources().map(res =>
      res.x === currentStationPosition.x && res.y === currentStationPosition.y
        ? { ...res, slots, ...(Number.isInteger(stationLevel) ? { stationLevel } : {}) }
        : res
    );
    GlobalGridStateTilesAndResources.setResources(synced);
    setResources(synced);
    setStationRefreshKey(prev => prev + 1);
  };

  const handleCraft = async (transactionId, transactionKey, recipe) => {
    console.log(`🔒 [PROTECTED CRAFTING] Starting protected craft for ${recipe.type}`);
    setErrorMessage('');

    if (!recipe) {
      setErrorMessage('Invalid recipe selected.');
      return;
    }

    // Check if all slots are full (client-side pre-check)
    const currentSlots = effectiveSlots;
    const unlockedCount = stationLevel + 1;
    let hasAvailableSlot = false;
    for (let i = 0; i < unlockedCount; i++) {
      const slot = currentSlots[i];
      if (!slot?.craftedItem) {
        hasAvailableSlot = true;
        break;
      }
    }

    if (!hasAvailableSlot) {
      updateStatus(409); // "All crafting slots are full."
      return;
    }

    // ONE request (game-server routes/actionRoutes.js /action/craft-start): the server takes the
    // recipe from resources.json, checks its station, skill and level, spends it and starts the
    // slot, then answers with the player delta.
    const answer = await postAction('/api/action/craft-start', {
      playerId: currentPlayer.playerId,
      gridId,
      stationX: currentStationPosition.x,
      stationY: currentStationPosition.y,
      recipeType: recipe.type,
    });
    if (!answer.ok) {
      applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
      if (answer.reason === 'SLOTS_FULL') {
        // Our copy showed a free slot and the server's did not: take the server's state so the
        // panel shows the truth at once
        applyServerStation(answer.data || {});
        updateStatus(409); // "All crafting slots are full."
      } else if (String(answer.reason || '').startsWith('short-') || answer.status === 400 || answer.status === 403) {
        updateStatus(450);
      } else {
        updateStatus(452);
      }
      return;
    }
    const { slots: newSlots, slotIndex } = answer.data;
    applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
    const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
      res.x === currentStationPosition.x && res.y === currentStationPosition.y
        ? { ...res, slots: newSlots }
        : res
    );
    GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
    setResources(updatedGlobalResources);

    // Show "Added" floating text on the slot
    setSlotAddedAnimation(slotIndex);
    setTimeout(() => setSlotAddedAnimation(null), 1800); // Clear after animation (matches 1.8s CSS duration)
    updateStatus(`${strings[440]} ${getLocalizedString(recipe.type, strings)}`);
  };


  // Slot-based collection function - uses optimistic UI pattern for responsiveness
  const handleCollectSlot = async (slotIndex) => {
    playersInGridManager.flushAfterTransaction(); // collecting a craft: save the position with it
    const slot = effectiveSlots?.[slotIndex];
    if (!slot?.craftedItem) {
      console.error('❌ No item in this slot');
      return;
    }
    if (slot.craftEnd > Date.now()) {
      console.error('❌ Item not ready yet');
      return;
    }

    // Prevent double-clicks on the same slot
    const collectId = `collect-slot-${slotIndex}-${currentStationPosition.x}-${currentStationPosition.y}`;
    if (window._processingSlotCollects && window._processingSlotCollects.has(collectId)) {
      console.log("Already processing this slot collection, ignoring duplicate click");
      return;
    }
    if (!window._processingSlotCollects) {
      window._processingSlotCollects = new Set();
    }
    window._processingSlotCollects.add(collectId);

    const craftedItemType = slot.craftedItem;

    console.log(`🔒 [PROTECTED CRAFTING] Collecting from slot ${slotIndex}: ${craftedItemType}`);

    // Calculate quantities and info BEFORE optimistic update
    const skillInfo = calculateSkillMultiplier(stationType, currentPlayer.skills || [], masterSkills);
    const baseQtyCollected = slot.qty || 1;
    const finalQtyCollected = applySkillMultiplier(baseQtyCollected, skillInfo.multiplier);
    const craftedItemResource = masterResources.find(r => r.type === craftedItemType);
    const craftedSymbol = craftedItemResource?.symbol || '🎁';
    // a collected doober is the player's opening Interest in their next conversation
    if (craftedItemResource?.category === 'doober') rememberLastDoober(currentPlayer?.playerId, craftedItemType);

    // Room FIRST, before any "+N" (Utils/noRoom.js: the board's collect response, at the slot's card)
    const slotRect = document.querySelector(`[data-craft-slot="${slotIndex}"]`)?.getBoundingClientRect() || null;
    const roomFeedback = { at: slotRect ? { rect: slotRect } : { col: currentStationPosition.x, row: currentStationPosition.y, TILE_SIZE }, strings, updateStatus };
    if (craftedItemResource?.category !== 'npc' && !canCollect({
      resource: craftedItemType, quantity: finalQtyCollected, currentPlayer, inventory, backpack, masterResources, globalTuning, ...roomFeedback,
    })) {
      window._processingSlotCollects?.delete(collectId);
      return;
    }

    const stationKey = `${gridId}:${currentStationPosition.x},${currentStationPosition.y}`;
    if (!pendingSlotCollects.has(stationKey)) pendingSlotCollects.set(stationKey, new Set());
    const pending = pendingSlotCollects.get(stationKey);
    pending.add(slotIndex);
    const writeStation = (update) => {
      const updated = GlobalGridStateTilesAndResources.getResources().map(res =>
        res.x === currentStationPosition.x && res.y === currentStationPosition.y ? update(res) : res
      );
      GlobalGridStateTilesAndResources.setResources(updated);
      setResources(updated);
      setStationRefreshKey(prev => prev + 1);
    };
    const keepPendingEmpty = (slots) => slots.map((s, i) =>
      pending.has(i) ? { craftEnd: null, craftedItem: null, qty: null } : s
    );

    // Save original slot state for potential rollback. A station from before multi-slot crafting
    // keeps its craft on the station itself (craftEnd / craftedItem, which effectiveSlots shows
    // as slot 0): the optimistic clear works from the slots the panel shows and clears those
    // legacy fields too, so its ✅ goes at once like any other.
    const originalSlots = [...(station?.slots || [])];
    const legacyFields = { craftEnd: station?.craftEnd ?? null, craftedItem: station?.craftedItem ?? null, qty: station?.qty ?? null };
    const shownSlots = [...(effectiveSlots || [])];
    // Put back only this slot (unless something has filled it since); the legacy single-craft
    // station has just the one slot, so it gets its old fields back whole
    const rollbackSlot = () => {
      pending.delete(slotIndex);
      writeStation((res) => {
        if (originalSlots.length === 0) return { ...res, slots: originalSlots, ...legacyFields };
        const slots = [...(res.slots || [])];
        if (!slots[slotIndex]?.craftedItem) slots[slotIndex] = slot;
        return { ...res, slots: keepPendingEmpty(slots) };
      });
    };

    // ===== OPTIMISTIC UI: Show feedback immediately =====
    // 1. Play sound immediately
    soundManager.playSFX('collect_item');

    // 2. The collected goods rise from the slot and fly home (UI/FlyToTarget.js): Money to the money
    //    counter, anything you can hold to Inventory; a craft that makes an NPC just rises and fades
    const slotEl = document.querySelector(`[data-craft-slot="${slotIndex}"]`);
    if (slotEl) {
      const r = slotEl.getBoundingClientRect();
      const flyTo = craftedItemType === 'Money' ? 'money' : craftedItemResource?.category === 'npc' ? null : 'inventory';
      FloatingTextManager.addFloatingTextAt(`+${finalQtyCollected} {res:${craftedItemType}} ${getLocalizedString(craftedItemType, strings)}`,
        r.left + r.width / 2, r.top + r.height / 2, { flyTo });
    }

    // 3. Optimistically clear the slot visually
    writeStation((res) => ({
      ...res,
      slots: keepPendingEmpty(originalSlots.length === 0 ? shownSlots : (res.slots || shownSlots)),
      ...(originalSlots.length === 0 ? { craftEnd: null, craftedItem: null, qty: null } : {}),
    }));

    // ===== SERVER =====
    // ONE request (/action/craft-collect): the server grants the goods with the station bonus
    // (room first), advances Craft quests and clears the slot; an NPC is spawned here.
    try {
      const answer = await postAction('/api/action/craft-collect', {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
        slotIndex,
      });

      if (!answer.ok) {
        if (answer.status === 0) { rollbackSlot(); updateStatus('❌ Failed to collect item'); return; }
        applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
        rollbackSlot();
        if (!reportRefusal(answer.reason, roomFeedback)) updateStatus('❌ Failed to collect item');
        return;
      }

      const { collected, slots: newSlots, isNPC } = answer.data;
      applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
      if (isNPC) {
        const craftedResource = allResources.find(res => res.type === collected.type);
        if (craftedResource) {
          NPCsInGridManager.spawnNPC(gridId, craftedResource, { x: currentStationPosition.x, y: currentStationPosition.y });
          setNpcRefreshKey(prev => prev + 1);
        }
      }

      // Take the server's slots, keeping any slot whose own collect is still in flight empty
      pending.delete(slotIndex);
      writeStation((res) => ({ ...res, slots: keepPendingEmpty(Array.isArray(newSlots) ? newSlots : (res.slots || [])) }));

      const statusMessage = formatSingleCollection('craft', collected.type, collected.qty ?? finalQtyCollected,
        skillInfo.hasSkills ? skillInfo : null, strings, getLocalizedString);
      updateStatus(statusMessage);
    } catch (error) {
      console.error('Error collecting from slot:', error);
      rollbackSlot();
      updateStatus('❌ Failed to collect item');
    } finally {
      // Clear the processing flag
      pending.delete(slotIndex);
      if (window._processingSlotCollects) {
        window._processingSlotCollects.delete(collectId);
      }
    }
  };


  // Finish a running slot now for gems: ONE request (/action/craft-speedup), priced by the server
  // from its own clock (ceil(minutes left ^ 0.45), the button's figure). Optimistic: the slot turns
  // ready on the tap; a refusal puts its countdown back.
  const speedupsInFlight = React.useRef(new Set());
  const handleSpeedupSlot = async (slotIndex) => {
    const slot = effectiveSlots?.[slotIndex];
    const left = slot?.craftEnd ? slot.craftEnd - Date.now() : 0;
    if (!slot?.craftedItem || !(left > 0) || speedupsInFlight.current.has(slotIndex)) return;
    const gems = calculateGemSpeedupCost(left);
    if (getPlayerQuantity('Gem', inventory, backpack) < gems) { openPanel('HowToGemsPanel'); return; }
    if (!(await confirmGemSpend({ gems }))) return;
    speedupsInFlight.current.add(slotIndex);
    const writeSlot = (craftEnd) => {
      const updated = GlobalGridStateTilesAndResources.getResources().map((res) => {
        if (res.x !== currentStationPosition.x || res.y !== currentStationPosition.y) return res;
        if (!res.slots?.length) return { ...res, craftEnd }; // a pre-slots station: its one craft
        const slots = [...res.slots];
        if (slots[slotIndex]?.craftedItem === slot.craftedItem) slots[slotIndex] = { ...slots[slotIndex], craftEnd };
        return { ...res, slots };
      });
      GlobalGridStateTilesAndResources.setResources(updated);
      setResources(updated);
      setStationRefreshKey((k) => k + 1);
    };
    writeSlot(Date.now());
    soundManager.playSFX('collect_item');
    const slotEl = document.querySelector(`[data-craft-slot="${slotIndex}"]`);
    if (slotEl) {
      const r = slotEl.getBoundingClientRect();
      FloatingTextManager.addFloatingTextAt(`-${gems} {res:Gem}`, r.left + r.width / 2, r.top + r.height / 2);
    }
    try {
      const answer = await postAction('/api/action/craft-speedup', {
        playerId: currentPlayer.playerId, gridId,
        stationX: currentStationPosition.x, stationY: currentStationPosition.y, slotIndex,
      });
      applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
      if (!answer.ok) {
        writeSlot(slot.craftEnd);
        updateStatus(answer.reason === 'short-Gem' ? `Need ${gems} gems to speed up crafting` : '❌ Failed to speed up crafting');
      }
    } finally {
      speedupsInFlight.current.delete(slotIndex);
    }
  };

  const handleSellStation = async (transactionId, transactionKey) => {
    // Mayor can sell town buildings, homestead owners can sell at home
    const isTownMayorSelling = stationDetails?.source === 'BuildTown' && currentPlayer.location.gtype === 'town' && isMayor;
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
      devOnly: !isHomestead && !isTownMayorSelling, // Only verify developer status when NOT on homestead and NOT mayor selling town building
    });
  };

  // Handle gem purchase for instant crafting: ONE request (game-server routes/actionRoutes.js
  // /action/gem-craft). The server prices the missing part in gems with the same formula as the
  // button (Economy/GemCosts.js), spends, grants one at once and advances Craft quests.
  const handleGemPurchase = async (modifiedRecipe) => {
    // Room first, payment second: the item lands at once, so a full Warehouse or Backpack says so
    if (allResources.some((res) => res.type === modifiedRecipe.type)
      && !ensureRoomFor({ resource: modifiedRecipe.type, quantity: 1, currentPlayer, inventory, backpack, masterResources, globalTuning, updateStatus })) return;
    const answer = await postAction('/api/action/gem-craft', {
      playerId: currentPlayer.playerId,
      gridId,
      stationX: currentStationPosition.x,
      stationY: currentStationPosition.y,
      recipeType: modifiedRecipe.type,
    });
    applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
    if (!answer.ok) {
      if (answer.reason === 'short-Gem') updateStatus(4);
      else if (answer.reason === 'warehouse-full') updateStatus(20);
      else if (answer.reason === 'backpack-full') updateStatus(21);
      else if (answer.reason === 'no-backpack') updateStatus(19);
      else updateStatus('❌ Failed to add crafted item to inventory');
      return;
    }
    updateStatus(`${getLocalizedString(modifiedRecipe.type, strings)} crafted instantly!`);
    FloatingTextManager.addFloatingText(`+1 ${getLocalizedString(modifiedRecipe.type, strings)}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
  };

  // Generate skill bonus info (multiplier + tooltip messages)
  const getSkillBonusInfo = () => {
    // Find all skills that apply to this station
    const applicableSkills = Object.entries(masterSkills || {})
      .filter(([skillName, stations]) => {
        return stations && typeof stations === 'object' && stations[stationType] > 1;
      })
      .map(([skillName, stations]) => ({
        skillName,
        multiplier: stations[stationType],
        hasSkill: currentPlayer.skills?.some(item => item.type === skillName)
      }));

    if (applicableSkills.length === 0) return { multiplier: 1, tooltipLines: [], hasSkills: false };

    // Separate owned and unowned skills
    const ownedSkills = applicableSkills.filter(skill => skill.hasSkill);
    const unownedSkills = applicableSkills.filter(skill => !skill.hasSkill);

    // Calculate combined multiplier for owned skills
    const combinedMultiplier = ownedSkills.reduce((total, skill) => total * skill.multiplier, 1);

    let tooltipLines = [];

    // Message for owned skills
    if (ownedSkills.length > 0) {
      if (ownedSkills.length === 1) {
        // Single skill: "Your [skill] Skill increases the base output of this station by [X]."
        tooltipLines.push(`${strings[805]}${getLocalizedString(ownedSkills[0].skillName, strings)}${strings[806]}${ownedSkills[0].multiplier}x.`);
      } else {
        // Multiple skills: list them with their multipliers and show combined effect
        const skillsList = ownedSkills
          .map(skill => `${getLocalizedString(skill.skillName, strings)} (${skill.multiplier}x)`)
          .join(' & ');
        tooltipLines.push(`Your ${skillsList} skills combine to increase output by ${combinedMultiplier}x.`);
      }
    }

    // Message for unowned skills
    if (unownedSkills.length > 0) {
      unownedSkills.forEach(skill => {
        const skillResource = allResources.find(res => res.type === skill.skillName);
        const skillSource = skillResource?.source || 'Skill Shop';
        // "Acquire the [skill] Skill at the [source] to increase the output of this station by [X]x."
        tooltipLines.push(`${strings[801]}${getLocalizedString(skill.skillName, strings)}${strings[802]}${getLocalizedString(skillSource, strings)}${strings[803]}${skill.multiplier}x.`);
      });
    }

    return { multiplier: combinedMultiplier, tooltipLines, hasSkills: applicableSkills.length > 0 };
  };

  const skillBonusInfo = getSkillBonusInfo();

  // Count hospitals on the current grid
  const countHospitals = () => {
    if (!resources || !allResources) return 0;
    
    return resources.filter(resource => {
      // Find the master resource to check if it's a Hospital
      const masterResource = allResources.find(mr => mr.type === resource.type);
      return masterResource && masterResource.type === 'Hospital';
    }).length;
  };

  // Count existing healers on the current grid
  const countHealers = () => {
    const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
    if (!npcsInGrid) return 0;
    
    return Object.values(npcsInGrid).filter(npc => npc && npc.action === 'heal').length;
  };

  // Calculate maximum healers allowed based on hospitals and doctorsPerHospital setting
  const getMaxHealersAllowed = () => {
    const hospitalCount = countHospitals();
    const doctorsPerHospital = globalTuning?.doctorsPerHospital || 1; // Default to 1 if not set
    return hospitalCount * doctorsPerHospital;
  };

  const currentHealers = countHealers();
  const maxHealersAllowed = getMaxHealersAllowed();

  // Sell section, pinned under the panel (UI/Panels/SellSection.js): Sell (the refund) and Move.
  // A Mayor may sell (not move) a town building of their own settlement.
  // the Mayor may sell (and move) a town-built station in their own town
  const sellFooter = sellSection({
    canSell: isHomestead || (stationDetails?.source === 'BuildTown' && currentPlayer.location.gtype === 'town' && isMayor),
    isDeveloper,
    resourceType: stationType,
    masterResources,
    onSell: handleSellStation,
    transactionKey: `sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`,
    onMove: () => requestMove({ type: stationType, x: currentStationPosition.x, y: currentStationPosition.y }),
  });

  return (
    <Panel footer={sellFooter} onClose={onClose} title={getLocalizedString(stationType, strings)} panelName="CraftingStation">
      <div className="station-panel-container">
        {/* Check if Library or Hospital requires home settlement (valley grids are open to all) */}
        {(stationType === 'Library' || stationType === 'Hospital') &&
         !currentPlayer?.location?.gtype?.startsWith('valley') &&
         String(currentPlayer.location.s) !== String(currentPlayer.settlementId) ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h3>{strings[2050] || "This is not your home settlement. You cannot access community services in any settlement but your own."}</h3>
          </div>
        ) : (
          <>
            {skillBonusInfo.hasSkills && (
              <div className="output-multiplier-row">
                <span className="output-multiplier-badge">
                  {strings[807] || 'Output'}: {skillBonusInfo.multiplier}x
                </span>
                {/* why the output is multiplied: the ℹ️ badge, hover on desktop, a tap on touch */}
                <InfoButton
                  className="output-multiplier-info"
                  info={skillBonusInfo.tooltipLines.length > 0 ? (
                    <>
                      {skillBonusInfo.tooltipLines.map((line, idx) => (
                        <p key={idx} style={{ marginBottom: idx < skillBonusInfo.tooltipLines.length - 1 ? '6px' : 0 }}>{line}</p>
                      ))}
                    </>
                  ) : null}
                />
              </div>
            )}
            {/* Crafting Station Slots — only for crafting category */}
            {stationDetails?.category === 'crafting' && (() => {
              // Progressive row display logic:
              // - Show row N only if the last slot of row N-1 is unlocked (or it's the first row)
              // - Each row has 4 slots
              const SLOTS_PER_ROW = 4;
              const totalRows = Math.ceil(maxSlots / SLOTS_PER_ROW);

              // Determine how many rows to show based on stationLevel
              // A row becomes visible when the last slot of the previous row is unlocked
              // Row 0 (slots 0-3): always visible
              // Row 1 (slots 4-7): visible when slot 3 is unlocked (stationLevel >= 3)
              // Row 2 (slots 8-11): visible when slot 7 is unlocked (stationLevel >= 7)
              // etc.
              // Formula: show next row when stationLevel >= (rowIndex * 4) - 1, i.e., last slot of previous row
              const visibleRows = Math.min(
                totalRows,
                Math.floor((stationLevel + 1) / SLOTS_PER_ROW) + 1
              );

              return (
                <div className="crafting-slots-container">
                  {Array.from({ length: visibleRows }, (_, rowIndex) => {
                    const rowStartSlot = rowIndex * SLOTS_PER_ROW;
                    const rowEndSlot = Math.min(rowStartSlot + SLOTS_PER_ROW, maxSlots);

                    return (
                      <div className="crafting-slots-grid" key={rowIndex}>
                        {Array.from({ length: rowEndSlot - rowStartSlot }, (_, slotInRow) => {
                          const i = rowStartSlot + slotInRow;
                          const isUnlocked = i <= stationLevel;
                          const slotCostRecipe = !isUnlocked ? buildSlotCostRecipe(i) : null;
                          const canAffordSlot = slotCostRecipe ? canAfford(slotCostRecipe, inventory, backpack, 1) : false;
                          const isNextSlot = i === stationLevel + 1;

                          // Get slot state from effectiveSlots (only for unlocked slots)
                          const slot = isUnlocked ? effectiveSlots?.[i] : null;
                          const slotIsCrafting = slot?.craftEnd && slot.craftEnd > Date.now();
                          const slotIsReady = slot?.craftedItem && slot?.craftEnd && slot.craftEnd <= Date.now();
                          const slotIsEmpty = isUnlocked && !slot?.craftedItem;

                          // Get item info for symbol
                          const craftedItemInfo = slot?.craftedItem
                            ? masterResources?.find(r => r.type === slot.craftedItem)
                            : null;

                          return (
                            <div className="crafting-slot-wrapper" key={i}>
                              <div
                                data-craft-slot={i}
                                className={`crafting-slot ${isUnlocked ? 'unlocked' : 'locked'} ${!isUnlocked && isNextSlot ? 'clickable' : ''} ${!isUnlocked && canAffordSlot && isNextSlot ? 'affordable' : ''} ${slotIsCrafting ? 'crafting' : ''} ${slotIsReady ? 'ready' : ''}`}
                                onMouseEnter={(e) => canHover() && updateSlotTooltipPosition(e, i)}
                                onMouseMove={(e) => canHover() && updateSlotTooltipPosition(e, i)}
                                onMouseLeave={() => setSlotTooltip({ show: false, slotIndex: null, top: 0, left: 0 })}
                                onClick={() => {
                                  if (!isUnlocked && isNextSlot && !isUpgrading) {
                                    if (canAffordSlot) {
                                      handleUpgradeSlot(i);
                                    } else {
                                      updateStatus(305); // "Not enough resources"
                                    }
                                  } else if (slotIsReady) {
                                    handleCollectSlot(i);
                                  } else if (slotIsCrafting) {
                                    handleSpeedupSlot(i); // a tap on a counting-down slot is the speed-up
                                  }
                                }}
                              >
                                {!isUnlocked ? (
                                  <>
                                    <span className="crafting-slot-icon locked"><img className="lock-icon" src="/assets/icons/icon-lock.svg" alt="" draggable="false" /></span>
                                  </>
                                ) : slotIsEmpty ? (
                                  <span className="crafting-slot-icon"></span>
                                ) : (
                                  <>
                                    <span className="crafting-slot-icon"><ResourceIcon resource={craftedItemInfo} symbol={craftedItemInfo?.symbol || '🎁'} /></span>
                                    {slotIsReady && <span className="crafting-slot-ready-badge">&#x2705;</span>}
                                  </>
                                )}
                                {/* "Added" floating text animation on slot */}
                                {slotAddedAnimation === i && (
                                  <span className="crafting-slot-added-text">{strings[300]}</span>
                                )}
                                {/* Countdown timer overlay at bottom of slot */}
                                {slotIsCrafting && slotCountdowns[i] !== undefined && (
                                  <span className="crafting-slot-timer">
                                    {formatCompactCountdown(slot.craftEnd, Date.now())}
                                  </span>
                                )}
                              </div>
                              {/* Under the slot, inside its width (every layout): the unlock price of a
                                  locked slot, the gem speed-up while it counts down, COLLECT when ready.
                                  Each does what a tap on the slot does. */}
                              <div className="crafting-slot-below">
                                {/* only the NEXT slot to buy shows its price; the ones beyond it show nothing */}
                                {!isUnlocked && isNextSlot && slotCostRecipe ? (() => {
                                  const [costType, costQty] = Object.entries(globalTuning.craftingStationSlotCosts[`slot${i}`]).find(([, v]) => v > 0);
                                  const short = getPlayerQuantity(costType, inventory, backpack) < costQty;
                                  return costType === 'Gem' ? (
                                    <span className="gem-button crafting-slot-below-gem"
                                      onClick={() => !isUpgrading && (canAffordSlot ? handleUpgradeSlot(i) : openPanel('HowToGemsPanel'))}>
                                      <img className="gem-button-icon" src="/assets/resources/item-gem.svg" alt="" draggable="false" />
                                      <span className="gem-button-cost">{formatNumber(costQty)}</span>
                                    </span>
                                  ) : (
                                    <span className={`crafting-slot-cost ${short ? 'insufficient' : 'sufficient'}`}
                                      onClick={() => !isUpgrading && (canAffordSlot ? handleUpgradeSlot(i) : updateStatus(305))}>
                                      <ResourceIcon type={costType} masterResources={masterResources} />{formatNumber(costQty)}
                                    </span>
                                  );
                                })() : slotIsCrafting ? (
                                  <span className="gem-button crafting-slot-below-gem" onClick={() => handleSpeedupSlot(i)}>
                                    <img className="gem-button-icon" src="/assets/resources/item-gem.svg" alt="" draggable="false" />
                                    <span className="gem-button-cost">{formatNumber(calculateGemSpeedupCost(slot.craftEnd - Date.now()))}</span>
                                  </span>
                                ) : slotIsReady ? (
                                  <span className="shared-buttons crafting-slot-below-collect">
                                    <button type="button" className="btn-basic btn-mini btn-success" onClick={() => handleCollectSlot(i)}>
                                      {strings[318] || 'Collect'}
                                    </button>
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div className="station-panel-content">
        
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const affordable = canAfford(recipe, inventory, Array.isArray(backpack) ? backpack : [], 1);
              const meetsSkill = hasRequiredSkill(recipe.requires);
              const meetsLevel = meetsLevelRequirement(recipe.level);
              const requirementsMet = meetsSkill && meetsLevel;
              const skillColor = meetsSkill ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
              const levelColor = meetsLevel ? 'var(--color-text-positive)' : 'var(--color-text-negative)';

              // Check if this is a healer and if we've hit the hospital capacity limit
              const isHealer = recipe.action === 'heal';
              const healerLimitReached = isHealer && currentHealers >= maxHealersAllowed;

              // Craft time display (no longer shows countdown - that's in slots now)
              // the card's FIRST details row, right-justified under the ℹ️ badge, bold, no "Time:"
              const craftTimeText = recipe.crafttime ? formatDuration(recipe.crafttime) : strings[459];

              const usedIn = allResources.filter((res) =>
                [res.ingredient1, res.ingredient2, res.ingredient3, res.ingredient4].includes(recipe.type)
              );
              const info = (
                <div className="info-content">
                  <div>
                    <strong>{strings[421]}</strong>{' '}
                    {usedIn.length
                      ? usedIn.map((res, i) => <React.Fragment key={res.type}>{i > 0 ? ', ' : ''}<ResourceIcon resource={res} /> {getLocalizedString(res.type, strings)}</React.Fragment>)
                      : 'None'}
                  </div>
                  <div><strong>{strings[422]}</strong> <ResourceIcon type="Money" /> {recipe.minprice || 'n/a'}</div>
                  {/* Show healer maxhp info for Hospital buildings with healer NPCs */}
                  {stationType === 'Hospital' && recipe.action === 'heal' && (
                    <div><strong>{strings[51]}</strong> {recipe.maxhp || 'n/a'}</div>
                  )}
                </div>
              );

              // Format costs with color per ingredient
              const formattedCosts = [1, 2, 3, 4].map((idx) => {
                const type = recipe[`ingredient${idx}`];
                const qty = recipe[`ingredient${idx}qty`];
                if (!type || !qty) return '';

                const playerQty = getPlayerQuantity(type, inventory, backpack); // backpack + warehouse
                const color = playerQty >= qty ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                return `<span style="color: ${color}; display: block;">${resourceIconHtml(type, allResources)} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              return (
                <ResourceButton
                  key={recipe.type}
                  symbol={recipe.symbol}
                  name={getLocalizedString(recipe.type, strings)}
                  className="resource-button craft-card"
                  details={
                    `<strong class="craft-time">${craftTimeText}</strong>` + // floats right on whichever row comes first
                    (healerLimitReached ? `<span style="color: var(--color-text-negative);">${strings[408]}</span>` : '') +
                    (recipe.level > 1 && !meetsLevel ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${recipe.level}</span>` : '') + // spans are block-level here: no <br>
                    (recipe.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(recipe.requires, strings)}</span>` : '') +
                    `${strings[461]}<div>${formattedCosts}</div>`
                  }
                  info={info}
                  disabled={!affordable || !requirementsMet || healerLimitReached}
                  onClick={undefined}
                  isTransactionMode={true}
                  transactionKey={`crafting-start-${recipe.type}-${currentStationPosition.x}-${currentStationPosition.y}`}
                  onTransactionAction={(transactionId, transactionKey) => handleCraft(transactionId, transactionKey, recipe)}
                  // Gem purchase for instant craft (bypasses slot system - instant to inventory)
                  // gems may buy a missing skill or ingredients, never a level
                  onGemPurchase={(recipe.gemcost && meetsLevel && (!affordable || !meetsSkill) && !healerLimitReached) ? handleGemPurchase : null}
                  resource={recipe}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources}
                  currentPlayer={currentPlayer}
                  hideGem={!recipe.gemcost || healerLimitReached || !meetsLevel}
                >
                </ResourceButton>
              );
            })
          ) : <p>{strings[424]}</p>}

          {errorMessage && <p className="error-message">{errorMessage}</p>}
        </div>
        
          </>
        )}
      </div>

      {/* Slot tooltip portal - renders near cursor like ResourceButton info tooltip */}
      {slotTooltip.show && slotTooltip.slotIndex !== null && (() => {
        const idx = slotTooltip.slotIndex;
        const isUnlocked = idx <= stationLevel;
        const slot = effectiveSlots?.[idx];
        const slotIsCrafting = slot?.craftEnd && slot.craftEnd > Date.now();
        const slotIsReady = slot?.craftedItem && slot?.craftEnd && slot.craftEnd <= Date.now();

        // Empty unlocked slot - no tooltip
        if (isUnlocked && !slotIsCrafting && !slotIsReady) return null;

        return ReactDOM.createPortal(
          <div
            className="info-toaster"
            style={{
              top: slotTooltip.top,
              left: slotTooltip.left,
              position: 'absolute',
            }}
          >
            {!isUnlocked ? (
              // Locked slot - show unlock costs with have/need format
              <div>
                <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>{strings[175] || 'Unlock'}:</div>
                {globalTuning?.craftingStationSlotCosts?.[`slot${idx}`] &&
                  Object.entries(globalTuning.craftingStationSlotCosts[`slot${idx}`])
                    .filter(([, v]) => v > 0)
                    .map(([resourceType, qty]) => {
                      const resourceInfo = masterResources?.find(r => r.type === resourceType);
                      const playerQty = getPlayerQuantity(resourceType, inventory, backpack); // backpack + warehouse
                      const hasEnough = playerQty >= qty;
                      return (
                        <div key={resourceType} style={{ color: hasEnough ? 'var(--color-text-positive)' : 'var(--color-text-negative)' }}>
                          <ResourceIcon resource={resourceInfo} /> {getLocalizedString(resourceType, strings)}: {qty} / {playerQty}
                        </div>
                      );
                    })}
              </div>
            ) : (
              // Crafting or ready slot - show item info (quantity is shown in Output badge)
              <div>
                <div><ResourceIcon type={slot.craftedItem} masterResources={masterResources} symbol={masterResources?.find(r => r.type === slot.craftedItem)?.symbol || '🎁'} /> {getLocalizedString(slot.craftedItem, strings)}</div>
                {slotIsReady && <div style={{ color: 'var(--color-text-positive)' }}>{strings[457] || 'Ready to collect!'}</div>}
              </div>
            )}
          </div>,
          document.body
        );
      })()}
    </Panel>
  );
};

export default React.memo(CraftingStation);