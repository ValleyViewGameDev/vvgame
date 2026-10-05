import API_BASE from "../../config";
import axios from "axios";
import { changePlayerLocation } from "../../Utils/GridManagement";
import { getEntryPosition } from './transitConfig';
import playersInGridManager from "../../GridState/PlayersInGrid";
import GlobalGridStateTilesAndResources from "../../GridState/GlobalGridStateTilesAndResources";
import { parseGridCoord, encodeGridCoord } from "../../Utils/gridsVisitedUtils";
import { worldMapCell } from "../../Utils/WorldMap";
import FloatingTextManager from "../../UI/FloatingText";
import { earnTrophy } from "../Trophies/TrophyUtils";
import { tryAdvanceFTUEByTrigger } from "../FTUE/FTUEutils";

// Direction -> [rowOffset, colOffset] within the settlement's 8x8 grid
const DIRECTION_OFFSETS = {
  N:  [-1,  0],
  S:  [ 1,  0],
  E:  [ 0,  1],
  W:  [ 0, -1],
  NE: [-1,  1],
  SE: [ 1,  1],
  SW: [ 1, -1],
  NW: [-1, -1],
};

const OPPOSITE_DIRECTIONS = {
  NE: 'SW', SW: 'NE',
  E: 'W', W: 'E',
  SE: 'NW', NW: 'SE',
  S: 'N', N: 'S',
};

/**
 * Neighbour gridCoord for a directional move, or null when the move would
 * leave the 8x8 settlement array (the frontier edge). Pure.
 */
export function computeNeighbourGridCoord(currentGridCoord, direction) {
  const parsed = parseGridCoord(currentGridCoord);
  if (!parsed) return null;

  const [rowOffset, colOffset] = DIRECTION_OFFSETS[direction] || [0, 0];
  let gridRow = parsed.gridRow + rowOffset;
  let gridCol = parsed.gridCol + colOffset;
  let settlementRow = parsed.settlementRow;
  let settlementCol = parsed.settlementCol;

  // Crossing the local 8x8 sub-grid boundary moves to the next settlement
  if (gridRow < 0) { gridRow = 7; settlementRow -= 1; }
  else if (gridRow > 7) { gridRow = 0; settlementRow += 1; }
  if (gridCol < 0) { gridCol = 7; settlementCol -= 1; }
  else if (gridCol > 7) { gridCol = 0; settlementCol += 1; }

  // Beyond the frontier (settlement array is 0..7 on both axes)
  if (settlementRow < 0 || settlementRow > 7 || settlementCol < 0 || settlementCol > 7) {
    return null;
  }

  return encodeGridCoord({
    frontierTier: parsed.frontierTier,
    frontierIndex: parsed.frontierIndex,
    settlementRow,
    settlementCol,
    gridRow,
    gridCol,
  });
}

/**
 * Can the player walk/signpost from `fromGridCoord` in `direction`? Pure
 * (docs/phase-3-contract.md §4.1): neighbour via computeNeighbourGridCoord,
 * then the world-map cell. Call it BEFORE starting the fade.
 *
 * @returns {{ ok: true, gridCoord: number } | { ok: false, reason: 106|10020|10021 }}
 *   106   beyond the frontier
 *   10020 someone else's homestead
 *   105   reserved / closed settlement / anything else
 * With no world map loaded (fetch failed at boot) the neighbour is allowed and
 * the server's own 403/404 remain the authority.
 */
export function canTravel(fromGridCoord, direction) {
  const gridCoord = computeNeighbourGridCoord(fromGridCoord, direction);
  if (gridCoord == null) return { ok: false, reason: 106 };
  const cell = worldMapCell(gridCoord);
  if (cell === null) return { ok: true, gridCoord };
  if (cell === 'H') return { ok: false, reason: 10020 };
  if (cell === 'M' || cell === 'T' || cell === 'V') return { ok: true, gridCoord };
  return { ok: false, reason: 10021 }; // reserved / closed cell: "You can't go that way."
}

/**
 * Where to stand when the opposite signpost is missing from the destination:
 * preserve the row for E/W, the column for N/S, fixed corners for diagonals.
 */
function fallbackEntryPosition(direction, fromX, fromY) {
  if (direction === "E" || direction === "W") {
    return { x: direction === "E" ? 0 : 63, y: fromY };
  }
  if (direction === "N" || direction === "S") {
    return { x: fromX, y: direction === "N" ? 63 : 0 };
  }
  return getEntryPosition(direction);
}

async function resolveSkills(currentPlayer) {
  if (currentPlayer.skills?.length) return currentPlayer.skills;
  try {
    const res = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
    return res.data.skills || [];
  } catch (err) {
    console.warn("⚠️ Could not fetch skills for transit check:", err.message);
    return [];
  }
}

/**
 * Handle a travel resource click (any "Signpost *") or an edge-walk.
 * The signature is shared with App.js, PlayerMovement.js and FrontierMiniMap.js.
 * `TILE_SIZE` is only used for floating text; `masterResources` and
 * `masterTrophies` are no longer needed here (kept for call-site compatibility).
 */
export async function handleTransitSignpost(
  currentPlayer,
  resourceType,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setTileTypes,
  setResources,
  updateStatus,
  TILE_SIZE,
  skills,
  closeAllPanels,
  bulkOperationContext,
  masterResources,
  strings = null,
  masterTrophies = null,
  transitionFadeControl = null
) {
  const endFade = () => {
    if (transitionFadeControl?.endTransition) transitionFadeControl.endTransition();
  };
  // Every early return before changePlayerLocation must end the fade.
  const bail = (status) => {
    if (status != null && typeof updateStatus === "function") updateStatus(status);
    endFade();
  };

  try {
    if (typeof updateStatus !== "function") {
      console.warn("⚠️ updateStatus is not a function:", updateStatus);
    }
    console.log("Handling transit for resource:", resourceType);

    // Home/Town: fade immediately for a responsive feel. Directional travel
    // validates with canTravel first; changePlayerLocation then owns the fade
    // (and skips it when the neighbour's bundle is already prefetched).
    const startFade = () => {
      if (transitionFadeControl?.startTransition) transitionFadeControl.startTransition();
    };

    const currentGridId = currentPlayer.location?.g;
    const playerId = String(currentPlayer._id || currentPlayer.playerId);

    const showNoHorse = () => {
      const playersInGrid = playersInGridManager.getPlayersInGrid(currentGridId);
      const position = playersInGrid?.[playerId]?.position;
      if (position) FloatingTextManager.addFloatingText(91, position.x, position.y, TILE_SIZE);
      bail(15); // "You need a Horse to travel here."
    };

    const moveArgs = [
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
    ];

    // ------------------------------------------------------------ Signpost Home
    if (resourceType === "Signpost Home") {
      // Refusals come first, with no fade: in the cave a player without the deed just reads
      // the status-bar line ("You'll need a Home Deed...") and keeps playing.
      const hasHomeDeed =
        currentPlayer.backpack?.some((item) => item.type === "Home Deed" && item.quantity > 0) ||
        currentPlayer.inventory?.some((item) => item.type === "Home Deed" && item.quantity > 0);
      if (!hasHomeDeed) return bail(109);

      const playerSkills = await resolveSkills(currentPlayer);
      if (!playerSkills.some((item) => item.type === "Horse" && item.quantity > 0)) return showNoHorse();

      // Home Deed bought but the homestead may not exist yet (race with create-homestead)
      if (!currentPlayer.gridId) return bail(113);

      startFade();
      updateStatus(101); // "Traveling home ..."
      const moved = await changePlayerLocation(
        currentPlayer,
        { type: 'home' },
        ...moveArgs,
        { findSignpost: 'Signpost Town', offset: { x: 1, y: 0 } }
      );
      if (!moved) return;

      const hasTraveledToHomesteadTrophy = currentPlayer.trophies?.some(
        (t) => t.type === "TraveledToHomestead" && t.progress > 0
      );
      if (!hasTraveledToHomesteadTrophy && currentPlayer?.playerId) {
        await earnTrophy(currentPlayer.playerId, "TraveledToHomestead", 1, currentPlayer, masterTrophies, setCurrentPlayer);
      }
      // Reusable FTUE trigger for homestead visits (several steps use it)
      if (currentPlayer?.firsttimeuser) {
        await tryAdvanceFTUEByTrigger('HomesteadVisit', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
      }
      return;
    }

    // ------------------------------------------------------------ Signpost Town / Town Home
    if (resourceType === "Signpost Town Home" || resourceType === "Signpost Town") {
      startFade();
      updateStatus(102); // "Traveling to town ..."
      const moved = await changePlayerLocation(
        currentPlayer,
        { type: 'town' },
        ...moveArgs,
        { findSignpost: 'Signpost Home' }
      );
      if (!moved) return;

      const hasTraveledToTownTrophy = currentPlayer.trophies?.some(
        (t) => t.type === "TraveledToTown" && t.progress > 0
      );
      if (!hasTraveledToTownTrophy && currentPlayer?.playerId) {
        await earnTrophy(currentPlayer.playerId, "TraveledToTown", 1, currentPlayer, masterTrophies, setCurrentPlayer);
        await tryAdvanceFTUEByTrigger('FirstTownVisit', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
      }
      return;
    }

    // ------------------------------------------------------------ Directional signpost / edge-walk
    // No fade has started yet: every refusal below leaves the player on the tile.
    const direction = resourceType.replace("Signpost ", "");
    if (!DIRECTION_OFFSETS[direction]) {
      console.error("❌ Unknown signpost direction:", resourceType);
      return bail(105);
    }

    const currentGridCoord =
      currentPlayer.location?.gridCoord ?? GlobalGridStateTilesAndResources.getGridMeta()?.gridCoord;
    if (currentGridCoord == null) {
      console.error("❌ No gridCoord for the current grid; cannot compute neighbour.");
      return bail(105);
    }

    // §4.1: validate against the world map BEFORE any fade or request
    // (106 beyond the frontier, 10020 someone else's homestead, 105 closed/reserved).
    const travel = canTravel(currentGridCoord, direction);
    if (!travel.ok) return bail(travel.reason);
    const targetGridCoord = travel.gridCoord;

    const playerSkills = skills?.length ? skills : await resolveSkills(currentPlayer);
    if (!playerSkills.some((item) => item.type === "Horse" && item.quantity > 0)) return showNoHorse();

    // The server keeps its own checks (403 not-your-homestead, 404);
    // changePlayerLocation shows the status for those.

    updateStatus(103); // "Travelling ..."

    const fromPosition = playersInGridManager.getPlayersInGrid(currentGridId)?.[playerId]?.position;
    const fromX = fromPosition?.x ?? 0;
    const fromY = fromPosition?.y ?? 0;
    const oppositeSignpost = `Signpost ${OPPOSITE_DIRECTIONS[direction]}`;

    await changePlayerLocation(
      currentPlayer,
      { type: 'coord', gridCoord: targetGridCoord },
      ...moveArgs,
      {
        findSignpost: oppositeSignpost,
        fallback: fallbackEntryPosition(direction, fromX, fromY),
      }
    );
  } catch (error) {
    console.error("Error handling transit:", error.message || error);
    bail("Error during travel.");
  }
}
