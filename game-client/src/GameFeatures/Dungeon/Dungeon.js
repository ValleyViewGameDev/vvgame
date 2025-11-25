import API_BASE from "../../config";
import axios from "axios";
import { changePlayerLocation } from "../../Utils/GridManagement";
import FloatingTextManager from "../../UI/FloatingText";
import { getLocalizedString } from "../../Utils/stringLookup";

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
    
    // Check if dungeon is open
    if (dungeonPhase !== 'open') {
      console.log("🔒 Dungeon is closed (phase: " + dungeonPhase + ")");
      
      // Show floating text at resource position
      const message = strings?.["10201"] || "The dungeon is currently closed";
      FloatingTextManager.addFloatingText(message, resourcePosition.x, resourcePosition.y, TILE_SIZE);
      updateStatus(message);
      return;
    }
    
    // Start fade transition for immersive teleportation
    if (transitionFadeControl?.startTransition) {
      console.log('🌑 [DUNGEON] Starting fade transition');
      transitionFadeControl.startTransition();
    }
    
    console.log("✅ Dungeon is open, preparing teleportation...");
    
    // Get a random dungeon from the server and store source grid
    try {
      // First, store the current grid as the source
      const sourceGridId = currentPlayer.location.g;
      
      const response = await axios.post(`${API_BASE}/api/enter-dungeon`, {
        playerId: currentPlayer._id,
        sourceGridId: sourceGridId,
        frontierId: currentPlayer.frontierId
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to enter dungeon");
      }
      
      const dungeonGridId = response.data.dungeonGridId;
      const dungeonEntryPosition = response.data.entryPosition; // Position of Dungeon Exit resource
      
      console.log("🎲 Entering dungeon:", dungeonGridId, "at position:", dungeonEntryPosition);
      
      const fromLocation = { ...currentPlayer.location };
      const toLocation = {
        x: dungeonEntryPosition.x,
        y: dungeonEntryPosition.y,
        g: dungeonGridId,
        s: currentPlayer.settlementId,
        f: currentPlayer.frontierId,
        gtype: "dungeon",
        gridCoord: null // Dungeons don't appear on the minimap
      };
    
      console.log("📍 Teleporting to dungeon:", toLocation);
    
      // Perform the teleportation
      await changePlayerLocation(
        currentPlayer,
        fromLocation,
        toLocation,
        setCurrentPlayer,
        setGridId,
        setGrid,
        setTileTypes,
        setResources,
        TILE_SIZE,
        closeAllPanels,
        updateStatus,
        bulkOperationContext,
        masterResources,
        strings,
        masterTrophies
      );
      
      // Show success message
      const successMessage = strings?.["10202"] || "You have entered the dungeon!";
      updateStatus(successMessage);
      
      // End fade transition
      if (transitionFadeControl?.endTransition) {
        transitionFadeControl.endTransition();
      }
      
    } catch (error) {
      throw error; // Re-throw to be caught by outer catch
    }
    
  } catch (error) {
    console.error("❌ Error entering dungeon:", error);
    
    // Log more details about the error
    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
    }
    
    const errorMessage = error.response?.data?.error || "Failed to enter dungeon";
    updateStatus(errorMessage);
    
    // End fade transition on error
    if (transitionFadeControl?.endTransition) {
      transitionFadeControl.endTransition();
    }
  }
}

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
    
    // Start fade transition
    if (transitionFadeControl?.startTransition) {
      console.log('🌑 [DUNGEON] Starting fade transition');
      transitionFadeControl.startTransition();
    }
    
    // Get exit information from server
    const response = await axios.post(`${API_BASE}/api/exit-dungeon`, {
      playerId: currentPlayer._id
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error || "Failed to exit dungeon");
    }
    
    const sourceGridId = response.data.sourceGridId;
    const exitPosition = response.data.exitPosition; // Position of Dungeon Entrance resource
    
    console.log("🏠 Returning to grid:", sourceGridId, "at position:", exitPosition);
    
    const fromLocation = { ...currentPlayer.location };
    const toLocation = {
      x: exitPosition.x,
      y: exitPosition.y,
      g: sourceGridId,
      s: currentPlayer.settlementId,
      f: currentPlayer.frontierId,
      gtype: response.data.gridType || "valley",
      gridCoord: response.data.gridCoord // Restore minimap position
    };
    
    console.log("📍 Teleporting back to:", toLocation);
    
    // Perform the teleportation
    await changePlayerLocation(
      currentPlayer,
      fromLocation,
      toLocation,
      setCurrentPlayer,
      setGridId,
      setGrid,
      setTileTypes,
      setResources,
      TILE_SIZE,
      closeAllPanels,
      updateStatus,
      bulkOperationContext,
      masterResources,
      strings,
      masterTrophies
    );
    
    // Show success message
    const successMessage = strings?.["10203"] || "You have exited the dungeon";
    updateStatus(successMessage);
    
    // End fade transition
    if (transitionFadeControl?.endTransition) {
      transitionFadeControl.endTransition();
    }
    
  } catch (error) {
    console.error("❌ Error exiting dungeon:", error);
    
    // Log more details about the error
    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
      console.error("Error response headers:", error.response.headers);
    }
    
    updateStatus("Failed to exit dungeon");
    
    // End fade transition on error
    if (transitionFadeControl?.endTransition) {
      transitionFadeControl.endTransition();
    }
  }
}