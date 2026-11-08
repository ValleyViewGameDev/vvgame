import { fetchInventoryAndBackpack } from './Utils/InventoryManagement';
import { calculateSkillMultiplier, isCurrency } from './Utils/InventoryManagement';
import { canCollect, reportRefusal } from './Utils/noRoom';
import { applyPlayerDelta, postAction, predictGain } from './Utils/playerDelta';
import { queueRetry, isNoAnswer, ACTION_TIMEOUT_MS } from './Utils/actionRetry';
import { loadMasterResources, loadMasterSkills, getFTUEsteps } from './Utils/TuningManager'; // Centralized tuning manager
import { tryAdvanceFTUEByTrigger } from './GameFeatures/FTUE/FTUEutils';
import FloatingTextManager from './UI/FloatingText';
import { lockResource, unlockResource } from './Utils/ResourceLockManager';
import { showNotification } from './UI/Notifications/Notifications';
import { createCollectEffect, createSourceConversionEffect, createPlantGrowEffect, calculateTileCenter } from './VFX/VFX';
import { boardArtScale } from './Render/PixiRenderer/boardArt';
import soundManager from './Sound/SoundManager';
import CombatFX from './Render/PixiRenderer/CombatFX';
import { useStrings } from './UI/StringsContext';
import { getLocalizedString } from './Utils/stringLookup';
import { formatSingleCollection } from './UI/StatusBar/CollectionFormatters';
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import playersInGridManager from './GridState/PlayersInGrid';
import { getDerivedRange, nearestFootprintTile } from './Utils/worldHelpers';
import { enrichResourceFromMaster, isACrop } from './Utils/ResourceHelpers';
import { rememberLastDoober } from './GameFeatures/Relationships/conversationMemory';
import { isMultiTile } from './Utils/footprint';

// FTUE Collect Wheat beat: how many Wheat, and the counter's storage key (survives a refresh)
const FTUE_WHEAT_NEEDED = 3;
const FTUE_WHEAT_COUNT_KEY = 'vv_ftue_wheat_count';

// FTUE Cave dungeon grid ID (must match auth.js and Dungeon.js)

 
 // Handles resource click actions based on category. //
 export async function handleResourceClick(
  resource,
  row,
  col,
  resources,
  setResources,
  setInventory,
  setBackpack,
  inventory,
  backpack,
  addFloatingText,
  gridId,
  TILE_SIZE,
  tileTypes,
  currentPlayer,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setTileTypes,
  updateStatus,
  masterResources,
  masterSkills,
  setModalContent,
  setIsModalOpen,
  closeAllPanels,
  strings,
  bulkOperationContext,
  openPanel,
  masterTrophies = null,
  globalTuning = null,
  transitionFadeControl = null,
  timers = null
) {
  console.log(`Resource Clicked:  (${row}, ${col}):`, { resource, tileType: tileTypes[row]?.[col] });
  if (!resource || !resource.category) { console.error(`Invalid resource at (${col}, ${row}):`, resource); return; }
  
  // Check range before doing anything else (skip on own homestead)
  const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
  const playerPos = playersInGridManager.getPlayerPosition(gridId, String(currentPlayer._id));
  // range is to the nearest tile of the resource's footprint (a building's closest wall)
  const resourcePos = isMultiTile(resource) && playerPos ? nearestFootprintTile(playerPos, resource) : { x: col, y: row };

  if (!isOnOwnHomestead && playerPos && typeof playerPos.x === 'number' && typeof playerPos.y === 'number') {
    const distance = Math.sqrt(Math.pow(playerPos.x - resourcePos.x, 2) + Math.pow(playerPos.y - resourcePos.y, 2));
    const playerRange = getDerivedRange(currentPlayer, masterResources);

    if (distance > playerRange) {
      // Show "Out of range" message
      FloatingTextManager.addFloatingText(24, col, row, TILE_SIZE);
      console.log('Resource out of range');
      return;
    }

    // Wall blocking check removed - App.js handles this before calling handleResourceClick
  }
  
  lockResource(col, row); // Optimistically lock the resource

  try {
    // Load master resources and skills (cached internally)
    if (!masterResources || masterResources.length === 0) { 
      masterResources = await loadMasterResources();  // Direct assignment without `const`
    }
    if (!masterSkills || masterSkills.length === 0) { 
      masterSkills = await loadMasterSkills(); 
    }
    const skills = currentPlayer.skills;
    // Fetch inventory and backpack if either is empty
    if ((!Array.isArray(inventory)) || (!Array.isArray(backpack))) {
      console.warn('Inventory or backpack is not initialized; fetching from server.');
      const { inventory: fetchedInventory, backpack: fetchedBackpack } = await fetchInventoryAndBackpack(currentPlayer.playerId);
      setInventory(fetchedInventory); // Update state with fetched inventory
      setBackpack(fetchedBackpack); // Update state with fetched backpack
    }

    switch (resource.category) {

      case 'doober':
      case 'special':
        await handleDooberClick(
          resource,
          row,
          col,
          resources,
          setResources,
          setInventory,
          setBackpack,
          currentPlayer?.inventory || [],
          currentPlayer?.backpack || [],
          skills,
          gridId,
          addFloatingText,
          TILE_SIZE,
          currentPlayer,
          setCurrentPlayer,
          updateStatus,
          masterResources,
          masterSkills, // Pass tuning data
          strings,
          openPanel,
          globalTuning,
          masterTrophies
        );
        break;

      case 'source':
        await handleSourceConversion(
          resource,
          row,
          col,
          resources,
          setResources,
          inventory,
          setInventory,
          backpack,
          setBackpack,  
          gridId,
          addFloatingText,
          TILE_SIZE,
          currentPlayer,
          setCurrentPlayer,
          masterResources,
          masterSkills, 
          setModalContent,
          setIsModalOpen,
          updateStatus,
          strings
        );
        break;

      case 'seed':
        console.log('Seed clicked; do nothing');
        break;

      case 'deco':
        console.log('Deco clicked; placeholder for future functionality');
        break;
        
        
      default:
        console.warn(`Unhandled resource category: ${resource.category}`);
    }
  } catch (error) {
    console.error('Error handling resource click:', error);
    unlockResource(col, row); // Unlock the resource on error
  } finally {
    unlockResource(col, row);
  }
}


// HANDLE DOOBER CLICKS //
//
export async function handleDooberClick(
  resource,
  row,
  col,
  resources,
  setResources,
  setInventory,
  setBackpack,
  inventory = [],
  backpack = [],
  skills = [],
  gridId,
  addFloatingText,
  TILE_SIZE,
  currentPlayer,
  setCurrentPlayer,
  updateStatus,
  masterResources,
  masterSkills,
  strings = {},
  openPanel = null,
  globalTuning = null,
  masterTrophies = null
) {
  console.log('handleDooberClick: Current Player:', currentPlayer);
  console.log('handleDooberClick: Current backpack:', backpack);
  const gtype = currentPlayer.location.gtype;
  const baseQtyCollected = resource.qtycollected || 1;

  if (!Array.isArray(inventory) || !Array.isArray(backpack)) {
    console.warn("Inventory or backpack missing; aborting doober click.");
    return;
  }

  // Create a unique ID for this doober to prevent double-processing
  const dooberId = `${resource.type}-${col}-${row}`;
  
  // Check if we're already processing this doober (prevent double-clicks)
  if (window._processingDoobers && window._processingDoobers.has(dooberId)) {
    console.log("Already processing this doober, ignoring duplicate click");
    return;
  }
  
  // Mark this doober as being processed
  if (!window._processingDoobers) {
    window._processingDoobers = new Set();
  }
  window._processingDoobers.add(dooberId);

  // Check for Pickaxe/Better Pickaxe requirement on doobers (unique to mining doobers)
  const requiresPickaxe = resource.requires === 'Pickaxe' || resource.requires === 'Better Pickaxe';
  if (requiresPickaxe) {
    const hasRequiredPickaxe = currentPlayer?.skills?.some(
      (skill) => skill.type === resource.requires && skill.quantity > 0
    );
    if (!hasRequiredPickaxe) {
      addFloatingText(`${resource.requires} Required`, col, row, TILE_SIZE);
      // Show notification about missing pickaxe
      showNotification('FTUE', {
        title: strings[7049],
        message: strings[7058], // Pickaxe required message
        icon: '💪',
        username: currentPlayer?.username
      });
      // Clear processing flag
      if (window._processingDoobers) {
        window._processingDoobers.delete(dooberId);
      }
      return;
    }
  }

  console.log('MasterSkills:', masterSkills);
  // Extract player skills from inventory
  const playerBuffs = skills
    .filter((item) => {
      const resourceDetails = masterResources.find((res) => res.type === item.type);
      const isSkill = resourceDetails?.category === 'skill';
      const appliesToResource = (masterSkills?.[item.type]?.[resource.type] || 1) > 1;
      return isSkill && appliesToResource;
    })
    .map((buffItem) => buffItem.type);

  //console.log('Player Buffs (Skills and Upgrades):', playerBuffs);
  // Calculate skill multiplier
  const skillMultiplier = playerBuffs.reduce((multiplier, buff) => {
    const buffValue = masterSkills?.[buff]?.[resource.type] || 1;
    //console.log(`Buff "${buff}" applies to "${resource.type}" with multiplier x${buffValue}`);
    return multiplier * buffValue;
  }, 1);
  const qtyCollected = baseQtyCollected * skillMultiplier;
  console.log('[DEBUG] qtyCollected after multiplier:', qtyCollected);
  
  // Room FIRST, before any "+N" (Utils/noRoom.js canCollect: the shared collect response)
  const isCurrencyItem = isCurrency(resource.type);
  // A doober that IS experience (resources.json grantsXP: OneKXP, the Quest for Hope finale's
  // stars) needs no room and goes to no inventory: "+1000 XP" on the tap, the server adds it
  const grantsXP = Number(masterResources?.find((m) => m.type === resource.type)?.grantsXP || resource.grantsXP) || 0;
  if (grantsXP > 0) {
    const xp = grantsXP * (resource.qtycollected || 1);
    setResources((prev) => prev.filter((res) => !(res.x === col && res.y === row)));
    createCollectEffect(col, row, TILE_SIZE);
    FloatingTextManager.addFloatingText(`+${xp} XP`, col, row, TILE_SIZE);
    soundManager.playSFX('success');
    setCurrentPlayer?.((prev) => ({ ...prev, xp: (prev?.xp || 0) + xp }));
    const body = { playerId: currentPlayer.playerId, gridId, x: col, y: row };
    const answer = await postAction('/api/action/harvest', body, { timeout: ACTION_TIMEOUT_MS });
    if (window._processingDoobers) window._processingDoobers.delete(dooberId);
    if (answer.ok) { applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack }); return; }
    if (isNoAnswer(answer.status)) { queueRetry('/api/action/harvest', body); return; } // safe to repeat ('gone' after the first)
    applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack }); // the server's true xp
    if (answer.reason !== 'gone') setResources((prev) => [...prev, resource]);
    return;
  }
  if (!canCollect({
    resource: resource.type, quantity: qtyCollected, currentPlayer, inventory, backpack, masterResources, globalTuning,
    at: { col, row, TILE_SIZE }, strings, updateStatus, openPanel,
  })) {
    if (window._processingDoobers) window._processingDoobers.delete(dooberId);
    return;
  }

  // Check if this is a repeatable tree resource that should be instantly replaced
  let optimisticTreeFarmplot = null;
  if (resource.repeatable === true) {
    const farmplotResource = masterResources.find(
      (res) => res.category === 'farmplot' && res.output === resource.type
    );
    if (farmplotResource && farmplotResource.source === 'tree') {
      // Pre-calculate the farmplot for optimistic placement
      const growEndTime = Date.now() + (farmplotResource.growtime || 0) * 1000;
      optimisticTreeFarmplot = enrichResourceFromMaster(
        {
          type: farmplotResource.type,
          x: col,
          y: row,
          growEnd: growEndTime,
        },
        masterResources
      );
      console.log(`🌳 Optimistic tree replacement: ${resource.type} -> ${farmplotResource.type}`);
    }
  }

  // Optimistically update resources - remove doober and add tree farmplot if applicable
  setResources((prevResources) => {
    const filtered = prevResources.filter((res) => !(res.x === col && res.y === row));
    if (optimisticTreeFarmplot) {
      return [...filtered, optimisticTreeFarmplot];
    }
    return filtered;
  });

  // the player's first Interest in their next conversation (Relationships/conversationMemory.js)
  if (!isCurrencyItem) rememberLastDoober(currentPlayer?.playerId, resource.type);

  // Show VFX and floating text immediately for responsiveness
  createCollectEffect(col, row, TILE_SIZE);
  FloatingTextManager.addFloatingText(`+${qtyCollected} {res:${resource.type}} ${getLocalizedString(resource.type, strings)}`, col, row, TILE_SIZE);

  // Play collection SFX based on resource type
  if (requiresPickaxe) {
    soundManager.playSFX('stoneCut');
  } else if (isCurrencyItem) {
    soundManager.playSFX('collect_money');
  } else if (isACrop(resource.type, masterResources)) {
    soundManager.playSFX('collect_crop');
  } else {
    soundManager.playSFX('collect_item');
  }

  // The counts move on the tap too (the answer's player delta replaces the prediction)
  const atHome = currentPlayer?.location?.gtype === 'homestead';
  predictGain({ type: resource.type, qty: qtyCollected, isCurrencyItem, atHome, setCurrentPlayer, setInventory, setBackpack });

  const putBack = () => setResources((prevResources) => {
    const filtered = optimisticTreeFarmplot
      ? prevResources.filter((res) => !(res.x === col && res.y === row && res.type === optimisticTreeFarmplot.type))
      : prevResources;
    return [...filtered, resource];
  });
  const deltaSetters = { setCurrentPlayer, setInventory, setBackpack };

  // ONE request (game-server routes/actionRoutes.js /action/harvest): the server removes the
  // doober, grants it with the skill multiplier, advances Collect quests, rolls the crop's bonus
  // tool, awards collection trophies and replants a repeatable doober, then answers with the
  // player delta. Nothing here refetches the player.
  try {
    const harvestBody = { playerId: currentPlayer.playerId, gridId, x: col, y: row };
    const answer = await postAction('/api/action/harvest', harvestBody, { timeout: ACTION_TIMEOUT_MS });

    if (!answer.ok) {
      if (isNoAnswer(answer.status)) {
        // No answer (network, timeout, gateway): the server may or may not have done it. Keep the
        // board and the predicted counts, and send it again until it answers (Utils/actionRetry.js;
        // a harvest is safe to repeat: a tile already collected answers 'gone' with the true counts)
        console.warn('⚠️ Harvest got no answer; queued to retry.');
        queueRetry('/api/action/harvest', harvestBody);
        return;
      }
      applyPlayerDelta(answer.data, deltaSetters); // back to the server's counts
      if (answer.reason === 'gone') return; // already collected (a double tap): it stays gone
      putBack();
      if (reportRefusal(answer.reason, { at: { col, row, TILE_SIZE }, strings, updateStatus, openPanel })) {
        // no room / no backpack: the shared response (Utils/noRoom.js)
      } else if (String(answer.reason || '').startsWith('needs-')) {
        addFloatingText(`${resource.requires} Required`, col, row, TILE_SIZE);
      } else {
        console.warn('❌ Harvest refused:', answer.status, answer.reason);
      }
      return;
    }

    const result = answer.data;
    applyPlayerDelta(result, deltaSetters);

    // Format and show status message using shared formatter
    const skillInfo = calculateSkillMultiplier(resource.type, skills || [], masterSkills);
    const statusMessage = formatSingleCollection('harvest', resource.type, result.collected?.qty ?? qtyCollected,
      skillInfo.hasSkills ? skillInfo : null, strings, getLocalizedString);
    updateStatus(statusMessage);

    // The crop's bonus tool, if one dropped (the server rolled it and granted it when it fit)
    if (result.drop) {
      const dropDef = (masterResources || []).find((r) => r.type === result.drop.type);
      FloatingTextManager.addFloatingText(
        `${dropDef?.symbol || ''} +${result.drop.qty} ${getLocalizedString(result.drop.type, strings)}`,
        col, row - (30 / TILE_SIZE), TILE_SIZE
      );
    }

    // Collection trophies (King's Crown, Trident): the notification for a new milestone
    for (const t of result.trophies || []) {
      if (!t.isNewMilestone) continue;
      const trophyDef = (masterTrophies || []).find((d) => d.name === t.name);
      if (trophyDef && trophyDef.visible === false) continue;
      showNotification('Trophy', t.trophy);
    }

    // The tutorial's Wheat: remember its tile so the planting beat can point back at it
    if (currentPlayer?.firsttimeuser && resource.type === 'Wheat') {
      try { localStorage.setItem('vv_ftue_wheat_tile', JSON.stringify({ x: col, y: row })); } catch (_) { /* storage off */ }
    }
    // The FTUE's Collect Wheat beat (the step before the one triggered by CollectedWheat): three
    // Wheat in a row, counted across refreshes, then the step advances to selling them to Kent.
    // It also advances when no Wheat is left on the board, so the player can never be stuck.
    if (currentPlayer?.firsttimeuser && resource.type === 'Wheat') {
      const wheatStep = (getFTUEsteps() || []).find((s) => s.trigger === 'CollectedWheat');
      if (wheatStep && currentPlayer.ftuestep === wheatStep.step - 1) {
        let count = 0;
        try { count = Number(localStorage.getItem(FTUE_WHEAT_COUNT_KEY) || 0) + 1; localStorage.setItem(FTUE_WHEAT_COUNT_KEY, String(count)); } catch (_) { count = FTUE_WHEAT_NEEDED; }
        const wheatLeft = (GlobalGridStateTilesAndResources.getResources() || []).some((r) => r && r.type === 'Wheat' && !(r.x === col && r.y === row));
        if (count >= FTUE_WHEAT_NEEDED || !wheatLeft) {
          try { localStorage.removeItem(FTUE_WHEAT_COUNT_KEY); } catch (_) { /* storage off */ }
          tryAdvanceFTUEByTrigger('CollectedWheat', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
        }
      }
    }
    // A crop (its source is a farm plot) was harvested: App.js listens for the first one to make
    // the once-only email ask (docs/onboarding-plan.md §4.5).
    try {
      const master = (masterResources || []).find((r) => r.type === resource.type);
      const source = master && (masterResources || []).find((r) => r.type === master.source);
      if (source && source.category === 'farmplot') window.dispatchEvent(new CustomEvent('vv:crop-harvested', { detail: { type: resource.type } }));
    } catch (_) { /* never block a collection */ }

    // A repeatable doober was replanted by the server: show it growing, with the server's clock
    if (result.replant) {
      await showReplant(result.replant, setResources, masterResources, TILE_SIZE);
    }
  } catch (error) {
    console.error('Error during doober collection:', error);
    putBack();
  } finally {
    unlockResource(col, row); // Always unlock the resource
    // Clear the processing flag for this doober
    if (window._processingDoobers) {
      window._processingDoobers.delete(dooberId);
    }
  }
}

// SHOW REPLANT - the board half of a replant the server already made (/action/harvest answers
// with { type, x, y, growEnd }): the grow animation, the farm plot in local state and FarmState's
// timer. Trees were placed optimistically on the tap, so they only get their timer; a plot
// flagged noGrow (the Grape Vine) just stands back up at full size.
async function showReplant(replant, setResources, masterResources, TILE_SIZE) {
  const { type, x: col, y: row, growEnd } = replant;
  const farmplotResource = (masterResources || []).find((res) => res.type === type);
  if (!farmplotResource) return;
  const enriched = enrichResourceFromMaster({ type, x: col, y: row, growEnd }, masterResources);
  const isTree = farmplotResource.source === 'tree';

  if (!isTree && !farmplotResource.noGrow && enriched.symbol && TILE_SIZE) {
    // Start the grow animation BEFORE the state update so the canvas skips drawing it early
    createPlantGrowEffect(col, row, TILE_SIZE, enriched.symbol, null, enriched.filename, boardArtScale(enriched));
  }
  const current = GlobalGridStateTilesAndResources.getResources() || [];
  const others = current.filter((res) => !(res.x === col && res.y === row));
  const finalResources = [...others, enriched];
  GlobalGridStateTilesAndResources.setResources(finalResources);
  setResources(finalResources);

  const farmState = (await import('./FarmState')).default;
  farmState.addSeed({ type, x: col, y: row, growEnd, output: farmplotResource.output });
}

// HANDLE SOURCE CONVERSIONS //
//
export async function handleSourceConversion(
  resource,
  row,
  col,
  resources,
  setResources,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  gridId,
  addFloatingText,
  TILE_SIZE,
  currentPlayer,
  setCurrentPlayer,
  masterResources,
  masterSkills,
  setModalContent,
  setIsModalOpen,
  updateStatus,
  strings
) {
  if (resource.action !== 'convertTo') return;

  // Get target resource first
  const targetResource = masterResources.find((res) => res.type === resource.output);
  if (!targetResource) { console.warn(`⚠️ No matching resource found for output: ${resource.output}`); return; }

  // Get required skill
  const requirement = resource.requires;
  const isSkill = masterResources.some(
    res => res.type === requirement && res.category === "skill"
  );

  // Required Skill Missing
  if (isSkill) {
    const hasSkill = currentPlayer.skills?.some(skill => skill.type === requirement);
    if (!hasSkill) {
      addFloatingText(`${requirement} Required`, col, row, TILE_SIZE);
      // Show notification about missing skill (different message for Axe vs Pickaxe)
      // Skip notification in starter dungeon - player is expected to not have Axe yet
      const isInStarterDungeon = !!GlobalGridStateTilesAndResources.getGridMeta()?.isFTUECave;
      const messageKey = requirement === 'Axe' ? 7057 : requirement === 'Pickaxe' ? 7058 : null;
      if (messageKey && !isInStarterDungeon) {
        showNotification('FTUE', {
          title: strings[7049],
          message: strings[messageKey],
          icon: '💪',
          username: currentPlayer?.username
        });
      }
      return;
    }
  }

    createSourceConversionEffect(col, row, TILE_SIZE, requirement);

    // Play SFX based on tool used
    if (requirement === 'Axe') {
      soundManager.playSFX('treeCut');
    } else if (requirement === 'Pickaxe') {
      soundManager.playSFX('stoneCut');
    }

  // Check if the object should disappear (output is null/empty) or transform
  const shouldDisappear = !resource.output || resource.output === 'null' || !targetResource;
  // the board as it was, to put back if the server refuses (/action/convert)
  const boardBefore = GlobalGridStateTilesAndResources.getResources();
  
  if (shouldDisappear) {
    // Find the original resource to check for shadows - use global state like ProtectedSelling does
    const originalResource = GlobalGridStateTilesAndResources.getResources().find(
      r => r.x === col && r.y === row
    );

    // Update local state to reflect removal of resource and shadows
    const filteredResources = GlobalGridStateTilesAndResources.getResources().filter(
      (res) => {
        // Remove the main resource
        if (res.x === col && res.y === row) return false;
        
        // Remove any shadows belonging to this resource if it was multi-tile
        if (originalResource && isMultiTile(originalResource) && res.type === 'shadow') {
          const anchorKey = originalResource.anchorKey || `${originalResource.type}-${originalResource.x}-${originalResource.y}`;
          if (res.parentAnchorKey === anchorKey) {
            return false;
          }
        }
        return true;
      }
    );

    // Update both global and local state with the same filtered array - exactly like ProtectedSelling does
    GlobalGridStateTilesAndResources.setResources(filteredResources);
    setResources(filteredResources);

  } else {
    // Build the new resource object to replace the one we just clicked
    const x = col;
    const y = row;
    const enrichedNewResource = {
      ...targetResource,
      x,
      y,
      symbol: targetResource.symbol,
      qtycollected: targetResource.qtycollected || 1,
      category: targetResource.category || 'doober',
      growEnd: targetResource.growEnd || null,
    };
    console.log('Enriched newResource for local state: ', enrichedNewResource);

    // Find the original resource to check for shadows - use global state like ProtectedSelling does
    const originalResource = GlobalGridStateTilesAndResources.getResources().find(
      r => r.x === col && r.y === row
    );

    // Filter out the main resource AND any shadows, then add the new resource
    const filteredResources = GlobalGridStateTilesAndResources.getResources().filter(
      (res) => {
        // Remove the main resource
        if (res.x === col && res.y === row) return false;

        // Remove any shadows belonging to this resource if it was multi-tile
        if (originalResource && isMultiTile(originalResource) && res.type === 'shadow') {
          const anchorKey = originalResource.anchorKey || `${originalResource.type}-${originalResource.x}-${originalResource.y}`;
          if (res.parentAnchorKey === anchorKey) {
            return false;
          }
        }
        return true;
      }
    );
    
    // Add the new resource to the filtered list
    const finalResources = [...filteredResources, enrichedNewResource];

    // A doober drops in the way a kill's loot does (CombatFX.dropBounce): it holds the board's
    // sprite hidden from this call until its fall-and-bounce ends, so it must start before the
    // resource lands in state below.
    if (enrichedNewResource.category === 'doober') {
      CombatFX.dropBounce(x, y, { symbol: enrichedNewResource.symbol, filename: enrichedNewResource.filename || null });
    }
    
    // Update both global and local state with the same filtered array - exactly like ProtectedSelling does
    GlobalGridStateTilesAndResources.setResources(finalResources);
    setResources(finalResources);
  }

  // ONE validated request (game-server routes/actionRoutes.js /action/convert): the server checks
  // the tool skill and makes the same change; a refusal puts the board back. No player refetch:
  // converting a source changes only the grid.
  try {
    const answer = await postAction('/api/action/convert', { playerId: currentPlayer.playerId, gridId, x: col, y: row });
    if (!answer.ok && answer.status !== 0 && answer.reason !== 'gone') {
      console.warn('❌ Source conversion refused:', answer.status, answer.reason);
      GlobalGridStateTilesAndResources.setResources(boardBefore);
      setResources(boardBefore);
    }
  } finally {
    unlockResource(col, row);
  }
}