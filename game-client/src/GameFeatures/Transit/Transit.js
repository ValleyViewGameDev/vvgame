import API_BASE from "../../config";
import axios from "axios";
import { changePlayerLocation } from "../../Utils/GridManagement";
import { getEntryPosition } from './transitConfig';
import playersInGridManager from "../../GridState/PlayersInGrid";
import GlobalGridStateTilesAndResources from "../../GridState/GlobalGridStateTilesAndResources";
import { parseGridCoord, encodeGridCoord } from "../../Utils/gridsVisitedUtils";
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

    // Fade immediately for a responsive feel (signpost click and edge-walk)
    if (transitionFadeControl?.startTransition) {
      transitionFadeControl.startTransition();
    }

    const currentGridId = currentPlayer.location?.g;
    const playerId = String(currentPlayer._id || currentPlayer.playerId);
    const isSpecialSignpost =
      resourceType === "Signpost Town" ||
      resourceType === "Signpost Home" ||
      resourceType === "Signpost Town Home";

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
      const hasHomeDeed =
        currentPlayer.backpack?.some((item) => item.type === "Home Deed" && item.quantity > 0) ||
        currentPlayer.inventory?.some((item) => item.type === "Home Deed" && item.quantity > 0);
      if (!hasHomeDeed) return bail(109);

      const playerSkills = await resolveSkills(currentPlayer);
      if (!playerSkills.some((item) => item.type === "Horse" && item.quantity > 0)) return showNoHorse();

      // Home Deed bought but the homestead may not exist yet (race with create-homestead)
      if (!currentPlayer.gridId) return bail(113);

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
    if (!isSpecialSignpost) {
      const playerSkills = skills?.length ? skills : await resolveSkills(currentPlayer);
      if (!playerSkills.some((item) => item.type === "Horse" && item.quantity > 0)) return showNoHorse();
    }

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

    const targetGridCoord = computeNeighbourGridCoord(currentGridCoord, direction);
    if (targetGridCoord == null) return bail(106); // "You cannot travel beyond the frontier."

    // A homestead that is not the player's own is refused by the server (403
    // not-your-homestead); changePlayerLocation shows the status for that.

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
