import API_BASE from '../config';
import axios from 'axios';
import { initializeGridFromData } from '../AppInit';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import { mergeTiles } from './ResourceHelpers';
import { centerCameraOnPlayer } from '../PlayerMovement';
import { earnTrophy } from '../GameFeatures/Trophies/TrophyUtils';
import { showNotification } from '../UI/Notifications/Notifications';
import locationChangeManager from './LocationChangeManager';
import { isGridVisited, markGridVisited, toServerFormat, parseGridCoord } from './gridsVisitedUtils';
import farmState from '../FarmState';
import ambientVFXManager from '../VFX/AmbientVFXManager';
import soundManager from '../Sound/SoundManager';
import { loadMasterResources, loadMasterTrophies, loadGlobalTuning } from './TuningManager';

export const updateGridResource = async (
  gridId,
  resource,
  broadcast = true
) => {
  //console.log('UPDATE GRID RESOURCE; resource = ', resource);

  try {
    const { x, y, growEnd, craftEnd, craftedItem, type, stationLevel, slots } = resource;

    // ✅ 1. Flat payload — no "newResource" key
    const payload = {
      resource: {
        type,
        x,
        y,
        ...(growEnd !== undefined && { growEnd }),
        ...(craftEnd !== undefined && { craftEnd }),
        ...(craftedItem !== undefined && { craftedItem }),
        ...(stationLevel !== undefined && { stationLevel }),
        ...(slots !== undefined && { slots }),
      },
      broadcast, // optional - depending on your server usage
    };
    //console.log('UPDATE GRID RESOURCE; payload = ', payload);

    // ✅ 2. Update the database
    const response = await axios.patch(`${API_BASE}/api/update-grid/${gridId}`, payload);
    if (!response.data.success) throw new Error('Failed DB update');

    return { success: true };
  } catch (error) {
    console.error('❌ Error in updateGridResource:', error);
    return { success: false };
  }
};


export const convertTileType = async (gridId, x, y, newType, setTileTypes = null) => {
  try {
    //console.log(`Converting tile at (${x}, ${y}) to type: ${newType}`);

    // Update the tile in the database
    const response = await axios.patch(`${API_BASE}/api/update-tile/${gridId}`, {
      x,
      y,
      newType,
    });

    if (response.data.success) {
      //console.log(`✅ Tile at (${x}, ${y}) successfully updated to ${newType} in the database.`);

      // ✅ Immediately update local state optimistically
      if (setTileTypes) {
        setTileTypes((prevTiles) => {
          const updated = mergeTiles(prevTiles, [{ x, y, type: newType }]);
          console.log("🌱 Optimistically updated tileTypes (emitter):", updated);
          return updated;
        });
      }
    } else {
      console.error(`❌ Failed to update tile at (${x}, ${y}):`, response.data.message);
    }
  } catch (error) {
    console.error(`❌ Error converting tile at (${x}, ${y}):`, error);
  }
};

/**
 * Arrival offsets: where the player stands relative to a signpost when
 * arriving next to it. This is the ONE copy of the table; Transit passes the
 * signpost name, changePlayerLocation applies the offset.
 */
export const SIGNPOST_ARRIVAL_OFFSETS = {
  'Signpost NE':   { x: -1, y: 1 },
  'Signpost E':    { x: -1, y: 0 },
  'Signpost SE':   { x: -1, y: -1 },
  'Signpost S':    { x: 0,  y: -1 },
  'Signpost SW':   { x: 1,  y: -1 },
  'Signpost W':    { x: 1,  y: 0 },
  'Signpost NW':   { x: 1,  y: 1 },
  'Signpost N':    { x: 0,  y: 1 },
  'Signpost Home': { x: -1, y: 0 }, // arriving in town: one tile left of Signpost Home
  'Signpost Town': { x: 1,  y: 0 }, // arriving at the homestead: one tile right of Signpost Town
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Resolve the arrival tile. Precedence:
 *   1. `spawn` from the server (dungeon entry/exit, FTUE exit, home fallback)
 *   2. `arrival.findSignpost` located in the loaded resources, plus
 *      `arrival.offset` (or the SIGNPOST_ARRIVAL_OFFSETS entry for that signpost)
 *   3. `arrival.fallback`
 *   4. `arrival.x/y`, then `target.x/y`
 *   5. {0,0}
 */
export function resolveArrivalPosition(arrival = {}, target = {}, spawn = null, resources = []) {
  if (spawn && isNum(spawn.x) && isNum(spawn.y)) {
    return { x: spawn.x, y: spawn.y, source: 'spawn' };
  }

  if (arrival.findSignpost) {
    const signpost = (resources || []).find((res) => res.type === arrival.findSignpost);
    if (signpost && isNum(signpost.x) && isNum(signpost.y)) {
      const offset = arrival.offset || SIGNPOST_ARRIVAL_OFFSETS[arrival.findSignpost] || { x: 0, y: 0 };
      return { x: signpost.x + offset.x, y: signpost.y + offset.y, source: 'signpost' };
    }
    console.log(`⚠️ [ARRIVAL] ${arrival.findSignpost} not found in destination grid`);
  }

  if (arrival.fallback && isNum(arrival.fallback.x) && isNum(arrival.fallback.y)) {
    return { x: arrival.fallback.x, y: arrival.fallback.y, source: 'fallback' };
  }
  if (isNum(arrival.x) && isNum(arrival.y)) {
    return { x: arrival.x, y: arrival.y, source: 'arrival' };
  }
  if (isNum(target.x) && isNum(target.y)) {
    return { x: target.x, y: target.y, source: 'target' };
  }
  return { x: 0, y: 0, source: 'default' };
}

/**
 * The one HTTP call that resolves and loads a grid for the player.
 * Returns `response.data` = `{ grid, location, spawn, ownerUsername }`
 * (see docs/phase-2-contract.md). Throws the axios error on failure.
 */
export async function enterGrid(playerId, target) {
  const response = await axios.post(`${API_BASE}/api/enter-grid`, { playerId, target });
  return response.data;
}

/**
 * Seed every client store from an `enter-grid` grid payload: grid meta,
 * tiles + resources (+ FarmState, ambient VFX, music), NPCs, and the local PC
 * record. Used by changePlayerLocation and by App boot (`{type:'current'}`).
 *
 * @param {object} grid       `response.data.grid`
 * @param {object} player     the player AFTER the location merge
 * @param {object} opts       { setGrid, setResources, setTileTypes, TILE_SIZE?, pixiBaseTileSize?, masterResources?, ownerUsername? }
 */
export async function seedGridFromBundle(grid, player, opts = {}) {
  const playerId = String(player._id || player.playerId);
  const masterResources = opts.masterResources || await loadMasterResources();
  const tuning = await loadGlobalTuning();
  const pixiBaseTileSize = opts.pixiBaseTileSize || tuning?.closeZoom || null;
  const TILE_SIZE = opts.TILE_SIZE || playersInGridManager.tileSize || pixiBaseTileSize || 40;

  GlobalGridStateTilesAndResources.setGridMeta({
    gridId: String(grid._id),
    gridType: grid.gridType ?? null,
    gridCoord: grid.gridCoord ?? null,
    templateKey: grid.templateKey ?? null,
    ownerId: grid.ownerId ? String(grid.ownerId?._id ?? grid.ownerId) : null,
    ownerUsername: opts.ownerUsername ?? null,
    isFTUECave: !!grid.isFTUECave,
    region: grid.region ?? null,
    settlementId: grid.settlementId ? String(grid.settlementId) : null,
    frontierId: grid.frontierId ? String(grid.frontierId) : null,
  });

  await initializeGridFromData(
    TILE_SIZE,
    grid,
    opts.setGrid,
    opts.setResources,
    opts.setTileTypes,
    player,
    masterResources,
    pixiBaseTileSize
  );

  // Server sends NPCsInGrid as a bare map with NPCsInGridLastUpdated beside it
  const npcData = grid.NPCsInGrid && typeof grid.NPCsInGrid === 'object' && 'npcs' in grid.NPCsInGrid
    ? grid.NPCsInGrid
    : { npcs: grid.NPCsInGrid || {}, lastUpdated: grid.NPCsInGridLastUpdated || 0 };
  await NPCsInGridManager.initializeFromData(String(grid._id), npcData);
  // The PC record comes from the Player (location.x/y, hp, maxhp, base stats + powers), not the bundle
  await playersInGridManager.initializeForPlayer(String(grid._id), { ...player, _id: playerId });
}

/**
 * Map an `enter-grid` failure to a status message. Returns a string or a
 * string id for updateStatus.
 */
function enterGridErrorStatus(error, strings) {
  const status = error?.response?.status;
  const reason = error?.response?.data?.reason || error?.response?.data?.error;
  if (status === 403 && reason === 'not-your-homestead') {
    return strings?.[10020] || 'That homestead belongs to someone else.';
  }
  if (status === 404) {
    if (reason === 'no-homestead') return 113; // "Your homestead is being prepared..."
    if (reason === 'no-dungeon-here') return strings?.[10201] || 'The dungeon is currently closed';
    return 105; // "There was a problem trying to travel."
  }
  if (status === 503) {
    return strings?.[10012] || 'Down for maintenance';
  }
  if (status === 400) return 105;
  return 105;
}

/**
 * The one grid-change executor. Every way a player changes grid ends here.
 *
 * @param {object}   currentPlayer
 * @param {object}   target   a docs/phase-2-contract.md target:
 *                            {type:'coord', gridCoord} | {type:'home'} | {type:'town'} |
 *                            the two dungeon targets ({fromGridId} on entry) | {type:'current'}
 *                            Optional target.x / target.y when the arrival tile is already known.
 * @param {Function} setCurrentPlayer
 * @param {Function} setGridId
 * @param {Function} setGrid
 * @param {Function} setTileTypes
 * @param {Function} setResources
 * @param {Function} updateStatus
 * @param {Function} closeAllPanels
 * @param {object}   bulkOperationContext
 * @param {object}   strings
 * @param {object}   transitionFadeControl   { startTransition, endTransition }
 * @param {object}   arrival  { findSignpost?: 'Signpost W' | 'Signpost Town' | 'Signpost Home' | ...,
 *                              offset?: {x,y}   (overrides the SIGNPOST_ARRIVAL_OFFSETS entry),
 *                              fallback?: {x,y} (used when the signpost is missing),
 *                              x?, y?           (explicit tile, lowest precedence after fallback) }
 *                            Precedence: server `spawn` > findSignpost > fallback > arrival.x/y > target.x/y.
 * @returns {Promise<boolean>} true when the player is standing in the new grid; false on any
 *                             failure (status already shown, fade ended, lock released).
 */
export const changePlayerLocation = async (
  currentPlayer,
  target,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setTileTypes,
  setResources,
  updateStatus,
  closeAllPanels,
  bulkOperationContext,
  strings,
  transitionFadeControl,
  arrival = {}
) => {
  const endFade = () => {
    if (transitionFadeControl?.endTransition) transitionFadeControl.endTransition();
  };

  // Fade to black immediately so the UI reacts on the tap
  if (transitionFadeControl?.startTransition) {
    transitionFadeControl.startTransition();
  }

  if (!target || !target.type) {
    console.error('❌ changePlayerLocation: invalid target', target);
    endFade();
    return false;
  }

  if (bulkOperationContext?.isAnyBulkOperationActive?.()) {
    if (updateStatus) updateStatus(470); // "Cannot travel right now, farming actions in progress."
    endFade();
    return false;
  }

  const playerId = String(currentPlayer._id || currentPlayer.playerId);
  const fromLocation = currentPlayer.location || {};
  const fromGridId = fromLocation.g ? String(fromLocation.g) : null;

  const canProceed = await locationChangeManager.requestLocationChange({
    from: fromLocation,
    to: target,
    playerId,
    timestamp: Date.now(),
  });
  if (!canProceed) {
    if (updateStatus) updateStatus('Location change in progress, please wait...');
    // The in-flight change owns the fade; do not end it here.
    return false;
  }

  if (closeAllPanels) closeAllPanels();

  const fail = (statusMsg, error) => {
    if (error) console.error('❌ Location change error:', error);
    if (updateStatus && statusMsg != null) updateStatus(statusMsg);
    endFade();
    locationChangeManager.failLocationChange(error || new Error(String(statusMsg)));
    return false;
  };

  try {
    if (updateStatus) updateStatus('Leaving ...');

    // ---------------------------------------------------------------- leave
    // The live PC record holds the current hp/maxhp; carry them onto the player
    // so the record rebuilt on arrival (from the Player) does not regress.
    const fromPlayerState = (fromGridId && playersInGridManager.getAllPCs(fromGridId)?.[playerId]) || {};

    if (fromGridId) {
      await Promise.all([
        NPCsInGridManager.flushGridPositionUpdates(fromGridId),
        playersInGridManager.flushState(),
      ]);
    }

    try {
      farmState.stopSeedTimer();
      ambientVFXManager.onGridLeave();
      soundManager.onGridLeave();
    } catch (timerError) {
      console.warn('⚠️ [CLEANUP] Error stopping timers:', timerError);
    }

    if (updateStatus) updateStatus('Loading ...');

    // ---------------------------------------------------------------- resolve + load
    // Resolve BEFORE removing the PC from the old grid so a refused move
    // (403 not-your-homestead, 404) leaves the player exactly where they were.
    let bundle;
    try {
      bundle = await enterGrid(playerId, target);
    } catch (error) {
      return fail(enterGridErrorStatus(error, strings), error);
    }

    const { grid, location, spawn, ownerUsername } = bundle || {};
    if (!grid?._id || !Array.isArray(grid.tiles) || grid.tiles.length === 0 || !Array.isArray(grid.resources) || !location) {
      return fail(105, new Error('enter-grid returned an incomplete bundle'));
    }
    const toGridId = String(grid._id);

    if (updateStatus) updateStatus('Entering ...');

    // Player location: contract `location` merged over the old one
    const mergedLocation = { ...fromLocation, ...location, g: toGridId };
    const fromRegion = fromLocation.region || null;
    const toRegion = grid.region ?? location.region ?? null;

    const updatedPlayer = {
      ...currentPlayer,
      location: mergedLocation,
      hp: fromPlayerState.hp ?? currentPlayer.hp,
      maxhp: fromPlayerState.maxhp ?? currentPlayer.maxhp,
    };

    // Seed tiles/resources/NPCs/PC from the bundle
    const masterResources = await loadMasterResources();
    await seedGridFromBundle(grid, updatedPlayer, {
      setGrid,
      setResources,
      setTileTypes,
      masterResources,
      ownerUsername,
    });

    // ---------------------------------------------------------------- arrival
    const resolved = resolveArrivalPosition(arrival, target, spawn, GlobalGridStateTilesAndResources.getResources());
    const finalX = resolved.x;
    const finalY = resolved.y;
    console.log(`📍 [ARRIVAL] (${finalX}, ${finalY}) via ${resolved.source}`);

    updatedPlayer.location = { ...mergedLocation, x: finalX, y: finalY };

    // Place the PC on the arrival tile (no slide animation from the old grid's
    // tile) and persist so the server's Player.location carries the arrival x/y.
    playersInGridManager.updatePC(toGridId, playerId, { position: { x: finalX, y: finalY } }, { animate: false });
    await playersInGridManager.flushState();

    // Local gridsVisited mirror (the server already marked the bit in enter-grid)
    const toGridCoord = location.gridCoord ?? grid.gridCoord ?? null;
    if (isNum(toGridCoord) && toGridCoord >= 0 && !isGridVisited(currentPlayer.gridsVisited, toGridCoord)) {
      updatedPlayer.gridsVisited = toServerFormat(markGridVisited(currentPlayer.gridsVisited, toGridCoord));
    }

    // Commit React + localStorage state
    setGridId(toGridId);
    setCurrentPlayer(updatedPlayer);
    localStorage.setItem('player', JSON.stringify(updatedPlayer));
    localStorage.setItem('gridId', toGridId);

    // ---------------------------------------------------------------- side effects
    // First time visiting a valley: trophy + notification
    const gtype = location.gtype || grid.gridType || '';
    if (gtype.startsWith('valley') && strings) {
      const hasValleyTrophy = currentPlayer.trophies?.some((trophy) => trophy.name === 'Explore the Valley');
      if (!hasValleyTrophy) {
        try {
          const masterTrophies = await loadMasterTrophies();
          const trophyResult = await earnTrophy(playerId, 'Explore the Valley', 1, updatedPlayer, masterTrophies, setCurrentPlayer);
          if (trophyResult.success) {
            showNotification('Message', { title: strings[7002], message: strings[7021] });
          } else {
            console.warn('⚠️ Failed to award valley trophy:', trophyResult.error);
          }
        } catch (error) {
          console.error('❌ Error awarding valley trophy:', error);
        }
      }
    }

    // Region transition notification
    if (strings && fromRegion !== toRegion) {
      if (toRegion) {
        showNotification('Travel', {
          title: strings[10185] || 'Elsinore',
          message: `${strings[10182] || 'You are entering '}${toRegion}.`,
        });
      } else if (fromRegion) {
        showNotification('Travel', {
          title: strings[10185] || 'Elsinore',
          message: `${strings[10183] || 'You are leaving '}${fromRegion}.`,
        });
      }
    }

    // ---------------------------------------------------------------- camera
    const tuning = await loadGlobalTuning();
    const TILE_SIZE = playersInGridManager.tileSize || tuning?.closeZoom || 40;
    const cameraCoord = toGridCoord ?? updatedPlayer.homesteadGridCoord;
    const parsed = parseGridCoord(cameraCoord);
    const gridPosition = parsed ? parsed.gridPosition : { row: 0, col: 0 };
    const settlementPosition = parsed ? parsed.settlementPosition : { row: 0, col: 0 };
    if (!parsed) {
      console.warn(`⚠️ [GRID TRANSITION] No gridCoord for grid ${toGridId}; camera uses (0,0) offsets`);
    }

    await centerCameraOnPlayer(
      { x: finalX, y: finalY },
      TILE_SIZE,
      1,    // zoomScale
      0,    // retryCount
      gridPosition,
      settlementPosition,
      true  // instant for grid transitions
    );

    if (updateStatus && gtype) {
      updateGridStatus(gtype, ownerUsername ?? null, updateStatus, updatedPlayer, toGridId);
    }

    // Let PixiJS render a few frames at the new camera position before fading up
    await new Promise((resolve) => {
      let frameCount = 0;
      const waitForFrames = () => {
        frameCount++;
        if (frameCount >= 3) resolve();
        else requestAnimationFrame(waitForFrames);
      };
      requestAnimationFrame(waitForFrames);
    });

    endFade();

    locationChangeManager.completeLocationChange({
      from: fromLocation,
      to: updatedPlayer.location,
      gridId: toGridId,
      playerId,
      success: true,
    });

    console.log(`🎉 [GRID TRANSITION] Entered grid ${toGridId} (${gtype}) at (${finalX}, ${finalY})`);
    return true;
  } catch (error) {
    return fail(105, error);
  }
};

/**
 * Tiles + resources + meta of the LOADED grid, from the in-memory store.
 * Kept for Utils/debug.js (timers dump). Grid loads go through enter-grid;
 * nothing on the client fetches a grid document any more (that route is the editor's).
 */
export async function fetchGridData(gridId, updateStatus) {
  const meta = GlobalGridStateTilesAndResources.getGridMeta();
  if (gridId && meta && meta.gridId !== String(gridId)) {
    console.warn(`fetchGridData: ${gridId} is not the loaded grid (${meta.gridId}); returning nothing`);
    if (updateStatus) updateStatus('Grid data is only available for the current grid');
    return {};
  }
  return {
    ...(meta || {}),
    _id: meta?.gridId ?? gridId,
    tiles: GlobalGridStateTilesAndResources.getTiles(),
    resources: GlobalGridStateTilesAndResources.getResources(),
  };
}

/**
 * Status-bar message for the grid the player just entered.
 * `ownerUsername` comes from the enter-grid bundle (homesteads only); when it
 * is not supplied, the grid meta / player's own gridId decide "home" vs visit.
 */
export function updateGridStatus(gridType, ownerUsername, updateStatus, currentPlayer = null, gridId = null) {
  if (!updateStatus) return;

  switch (gridType) {
    case 'homestead': {
      const meta = GlobalGridStateTilesAndResources.getGridMeta();
      const playerId = currentPlayer ? String(currentPlayer._id || currentPlayer.playerId || '') : '';
      const isOwn =
        (ownerUsername && currentPlayer && ownerUsername === currentPlayer.username) ||
        (gridId && currentPlayer?.gridId && String(gridId) === String(currentPlayer.gridId)) ||
        (meta && gridId && meta.gridId === String(gridId) && meta.ownerId && meta.ownerId === playerId);
      if (isOwn) {
        updateStatus(112); // "Welcome home."
        return;
      }
      const name = ownerUsername || meta?.ownerUsername || 'Unknown';
      updateStatus(`Welcome to ${name}'s homestead.`);
      break;
    }
    case 'town':
      updateStatus(14); // Town view
      break;
    case 'valley0':
    case 'valley1':
    case 'valley2':
    case 'valley3':
      updateStatus(16);
      break;
    case 'settlement':
      updateStatus(12); // Settlement view
      break;
    case 'frontier':
      updateStatus(13); // Frontier view
      break;
    default:
      break;
  }
}

/** Helper to get tiles in line of sight between two points using Bresenham's algorithm **/
export function getLineOfSightTiles(start, end) {
    const tiles = [];
    let x0 = Math.floor(start.x);
    let y0 = Math.floor(start.y);
    const x1 = Math.floor(end.x);
    const y1 = Math.floor(end.y);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let prevX = x0;
    let prevY = y0;

    while (true) {
        // Don't include the start or end positions
        if ((x0 !== Math.floor(start.x) || y0 !== Math.floor(start.y)) &&
            (x0 !== x1 || y0 !== y1)) {
            tiles.push({ x: x0, y: y0 });

            // Check if we moved diagonally - if so, add the two adjacent tiles
            // to prevent line of sight going through corners
            if (prevX !== x0 && prevY !== y0) {
                tiles.push({ x: prevX, y: y0 }); // Vertical neighbor of previous position
                tiles.push({ x: x0, y: prevY }); // Horizontal neighbor of current position
            }
        }

        if (x0 === x1 && y0 === y1) break;

        prevX = x0;
        prevY = y0;

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }

    return tiles;
}

/** Helper to check if a position falls within a wall's footprint **/
function isWithinWallFootprint(x, y, wall) {
    const tileSpan = wall.size || 1;
    // For walls with size > 1, check if (x, y) falls within the footprint
    // Wall footprint extends from anchor (wall.x, wall.y) down and right
    return (
        x >= wall.x &&
        x < wall.x + tileSpan &&
        y >= wall.y &&
        y < wall.y + tileSpan
    );
}

/** Helper to check if there's a wall blocking line of sight **/
export function isWallBlocking(start, end) {
    const resources = GlobalGridStateTilesAndResources.getResources();
    const lineOfSightTiles = getLineOfSightTiles(start, end);

    // Check each tile in the line of sight for walls
    for (const tile of lineOfSightTiles) {
        // Check if this tile is blocked by any wall (including large walls)
        const wall = resources.find(res =>
            (res.action === 'wall' || res.action === 'door') &&
            isWithinWallFootprint(tile.x, tile.y, res)
        );
        if (wall) {
            return true; // Wall found blocking the path
        }
    }

    return false; // No walls blocking
}
