import { changePlayerLocation } from "../../Utils/GridManagement";
import GlobalGridStateTilesAndResources from "../../GridState/GlobalGridStateTilesAndResources";
import FloatingTextManager from "../../UI/FloatingText";

/** True while the player is in their FTUE cave (grid flag from enter-grid, never a hard-coded id). */
export function isInFTUECave() {
  return !!GlobalGridStateTilesAndResources.getGridMeta()?.isFTUECave;
}

/**
 * Dungeon Entrance click. The server resolves which dungeon template is
 * registered for the cell the player is standing in, creates/resets their copy
 * and returns `spawn` (next to the Dungeon Exit); changePlayerLocation uses it.
 * Signature shared with App.js.
 */
export async function handleDungeonEntrance(
  currentPlayer,
  dungeonPhase,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setTileTypes,
  setResources,
  updateStatus,
  TILE_SIZE,
  closeAllPanels,
  bulkOperationContext,
  masterResources,
  strings = null,
  masterTrophies = null,
  transitionFadeControl = null,
  resourcePosition = { x: 0, y: 0 }
) {
  try {
    console.log("🚪 Handling dungeon entrance click, phase:", dungeonPhase);

    if (dungeonPhase !== 'open') {
      const message = strings?.["10201"] || "The dungeon is currently closed";
      FloatingTextManager.addFloatingText(message, resourcePosition.x, resourcePosition.y, TILE_SIZE);
      updateStatus(message);
      return false;
    }

    const fromGridId = currentPlayer.location?.g ? String(currentPlayer.location.g) : null;
    if (!fromGridId) {
      updateStatus(105);
      return false;
    }

    const moved = await changePlayerLocation(
      currentPlayer,
      { type: 'enter-dungeon', fromGridId },
      setCurrentPlayer,
      setGridId,
      setGrid,
      setTileTypes,
      setResources,
      updateStatus,
      closeAllPanels,
      bulkOperationContext,
      strings,
      transitionFadeControl
    );
    if (!moved) return false;

    // The server set player.sourceGridBeforeDungeon = fromGridId; mirror it locally
    if (setCurrentPlayer) {
      setCurrentPlayer((prev) => ({ ...prev, sourceGridBeforeDungeon: fromGridId }));
    }

    updateStatus(strings?.["10202"] || "You have entered the dungeon!");
    return true;
  } catch (error) {
    console.error("❌ Error entering dungeon:", error);
    updateStatus(error.response?.data?.error || "Failed to enter dungeon");
    if (transitionFadeControl?.endTransition) transitionFadeControl.endTransition();
    return false;
  }
}

/**
 * Dungeon Exit click and the auto-exit on phase flip. The server resolves
 * `player.sourceGridBeforeDungeon` (or the homestead for the FTUE cave) and
 * returns `spawn` next to the Dungeon Entrance. Returns false when the exit
 * failed so App.js can fall back to Signpost Home.
 */
export async function handleDungeonExit(
  currentPlayer,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setTileTypes,
  setResources,
  updateStatus,
  TILE_SIZE,
  closeAllPanels,
  bulkOperationContext,
  masterResources,
  strings = null,
  masterTrophies = null,
  transitionFadeControl = null
) {
  try {
    console.log("🚪 Handling dungeon exit click");

    const moved = await changePlayerLocation(
      currentPlayer,
      { type: 'exit-dungeon' },
      setCurrentPlayer,
      setGridId,
      setGrid,
      setTileTypes,
      setResources,
      updateStatus,
      closeAllPanels,
      bulkOperationContext,
      strings,
      transitionFadeControl
    );
    if (!moved) return false;

    if (setCurrentPlayer) {
      setCurrentPlayer((prev) => ({ ...prev, sourceGridBeforeDungeon: null }));
    }

    // Note: the FTUE cave is left through Signpost Home (Transit.js), not Dungeon Exit
    updateStatus(strings?.["10203"] || "You have exited the dungeon");
    return true;
  } catch (error) {
    console.error("❌ Error exiting dungeon:", error);
    updateStatus("Failed to exit dungeon");
    if (transitionFadeControl?.endTransition) transitionFadeControl.endTransition();
    return false;
  }
}
