import API_BASE from "../../config";
import axios from "axios";
import { changePlayerLocation } from "../../Utils/GridManagement";
import { getEntryPosition } from './transitConfig';
import playersInGridManager from "../../GridState/PlayersInGrid";
import { fetchHomesteadOwner, fetchHomesteadSignpostPosition, fetchTownSignpostPosition } from "../../Utils/worldHelpers";
import { updateGridStatus } from "../../Utils/GridManagement";
import FloatingTextManager from "../../UI/FloatingText";
import { earnTrophy } from "../Trophies/TrophyUtils";
import { tryAdvanceFTUEByTrigger } from "../FTUE/FTUEutils";

// FTUE Cave grid ID - used to trigger ExitedCave when clicking Signpost Home
const FTUE_CAVE_GRID_ID = '695bd5b76545a9be8a36ee22';

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
  try {
    if (typeof updateStatus !== "function") {
      console.warn("⚠️ updateStatus is not a function:", updateStatus);
    }
    console.log("Handling transit for resource:", resourceType);
    
    // 🌑 Start fade transition IMMEDIATELY for responsive feel (both signpost and keyboard movement)
    if (transitionFadeControl?.startTransition) {
      console.log('🌑 [IMMEDIATE FADE] Starting fade transition for signpost travel');
      console.log('🌑 [DEBUG] transitionFadeControl object:', transitionFadeControl);
      transitionFadeControl.startTransition();
    } else {
      console.warn('🌑 [DEBUG] transitionFadeControl not available or missing startTransition method');
      console.log('🌑 [DEBUG] transitionFadeControl value:', transitionFadeControl);
    }
    
    console.log("🔍 currentPlayer before checking skills:", currentPlayer);
    console.log("📜 currentPlayer.skills:", currentPlayer.skills);

    // 1) Handle special signposts (no Horse skill required for Town/Home)
    const { g: currentGridId, s: settlementId, f: frontierId } = currentPlayer.location;
    
    // Check if this is Signpost Town or Signpost Home (no Horse required)
    const isSpecialSignpost = resourceType === "Signpost Town" || resourceType === "Signpost Home" || resourceType === "Signpost Town Home";
    
    // 2) For non-special signposts, ensure the player has the Horse skill
    if (!isSpecialSignpost) {
        skills = currentPlayer.skills.length ? currentPlayer.skills : await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`).then(res => res.data.skills || []);

        console.log('skillResponse.data: ', skills);
        console.log('currentPlayer = ',currentPlayer.username);
        
        const hasHorse = skills.some((item) => item.type === "Horse" && item.quantity > 0);
        console.log('hasHorse: ', hasHorse);
        if (!hasHorse) { 
            updateStatus(15);
            // Add floating text at player's current position using PlayersInGrid
            const playersInGrid = playersInGridManager.getPlayersInGrid(currentGridId);
            if (playersInGrid && playersInGrid[currentPlayer.playerId]) {
                const position = playersInGrid[currentPlayer.playerId].position;
                FloatingTextManager.addFloatingText(91, position.x, position.y, TILE_SIZE);
            }
            // End fade transition since travel failed due to missing Horse skill
            if (transitionFadeControl?.endTransition) {
                transitionFadeControl.endTransition();
            }
            return; 
        }
    }

    // Signpost Home
    if (resourceType === "Signpost Home") {
      // FTUE trigger: First-time user clicking Signpost Home in the FTUE cave
      const isInFTUECave = currentPlayer?.location?.g?.toString() === FTUE_CAVE_GRID_ID;
      if (currentPlayer?.firsttimeuser && isInFTUECave) {
        console.log('🎓 First-time user clicked Signpost Home in FTUE Cave - triggering ExitedCave');
        await tryAdvanceFTUEByTrigger('ExitedCave', currentPlayer._id, currentPlayer, setCurrentPlayer);
      }

      // First check if player has Home Deed in backpack or inventory (warehouse)
      const hasHomeDeedInBackpack = currentPlayer.backpack?.some(item => item.type === "Home Deed" && item.quantity > 0);
      const hasHomeDeedInInventory = currentPlayer.inventory?.some(item => item.type === "Home Deed" && item.quantity > 0);

      if (!hasHomeDeedInBackpack && !hasHomeDeedInInventory) {
        updateStatus(109);
        // End fade transition since travel failed
        if (transitionFadeControl?.endTransition) {
          transitionFadeControl.endTransition();
        }
        return;
      }

      // Then check if player has Horse skill (required to travel home)
      const playerSkills = currentPlayer.skills?.length ? currentPlayer.skills : await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`).then(res => res.data.skills || []);
      const hasHorse = playerSkills.some((item) => item.type === "Horse" && item.quantity > 0);

      if (!hasHorse) {
        updateStatus(15);
        // Add floating text at player's current position
        const playersInGrid = playersInGridManager.getPlayersInGrid(currentGridId);
        if (playersInGrid && playersInGrid[currentPlayer.playerId]) {
          const position = playersInGrid[currentPlayer.playerId].position;
          FloatingTextManager.addFloatingText(91, position.x, position.y, TILE_SIZE);
        }
        // End fade transition since travel failed due to missing Horse skill
        if (transitionFadeControl?.endTransition) {
          transitionFadeControl.endTransition();
        }
        return;
      }

      console.log("🏠 Traveling to homestead:", {
        gridId: currentPlayer.gridId,
        settlementId: currentPlayer.settlementId,
        gridCoord: currentPlayer.gridCoord,
      });

      // Fetch the homestead grid data to find Signpost Town location
      try {
        const signpostPosition = await fetchHomesteadSignpostPosition(currentPlayer.gridId);

        // Get the homestead's actual gridCoord from the player's stored homesteadGridCoord
        const homesteadGridCoord = currentPlayer.homesteadGridCoord;

        // Place player at x+1 offset from Signpost Town
        const newPlayerPosition = {
          x: signpostPosition.x + 1,
          y: signpostPosition.y,
          g: currentPlayer.gridId,      // The player's homestead grid
          s: currentPlayer.settlementId,
          f: currentPlayer.location.f,
          gtype: "homestead",
          gridCoord: homesteadGridCoord,
        };
        
        updateStatus(101);
        await changePlayerLocation(
          currentPlayer,
          currentPlayer.location,   // fromLocation
          newPlayerPosition,        // toLocation
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
          masterTrophies,
          transitionFadeControl
        );

        // Check if this is the player's first time traveling to homestead
        const hasTraveledToHomesteadTrophy = currentPlayer.trophies?.some(
          t => t.type === "TraveledToHomestead" && t.progress > 0
        );
        if (!hasTraveledToHomesteadTrophy && currentPlayer?.playerId) {
          console.log("🏠 First time traveling to homestead - awarding trophy and advancing FTUE");
          await earnTrophy(currentPlayer.playerId, "TraveledToHomestead", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          // Try to advance FTUE if player is at the correct step for FirstHomesteadVisit
          await tryAdvanceFTUEByTrigger('FirstHomesteadVisit', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
        }

      } catch (error) {
        console.error("❌ Error traveling home:", error);
        if (error.message && error.message.includes('Failed to remove player from previous grid')) {
          updateStatus("Failed to leave current location. Please try again.");
        } else {
          updateStatus("Error traveling home");
        }
      }
      
      return;
    }

    // Signpost Town Home or Signpost Town
    if (resourceType === "Signpost Town Home" || resourceType === "Signpost Town") {
      const isPlayerOwnedTown = resourceType === "Signpost Town Home";
      const targetSettlementId = isPlayerOwnedTown ? currentPlayer.settlementId : settlementId;
      
      console.log(isPlayerOwnedTown 
        ? "Signpost Town Home clicked. Finding the first town grid in the player's owned settlement."
        : "Signpost Town clicked. Finding the first town grid in the settlement.");

      const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${targetSettlementId}`);
      const settlement = settlementResponse.data;
      if (!settlement || !settlement.grids) { 
        updateStatus(104); 
        if (transitionFadeControl?.endTransition) {
          transitionFadeControl.endTransition();
        }
        return; 
      }

      // Find any sub-grid with gridType = town
      const townGrid = settlement.grids.flat().find((grid) => grid.gridType === "town" && grid.gridId);
      if (!townGrid) { 
        updateStatus(104); 
        if (transitionFadeControl?.endTransition) {
          transitionFadeControl.endTransition();
        }
        return; 
      }

      console.log("Found town grid:", townGrid);

      // Fetch the town grid data to find Signpost Home location
      try {
        const signpostPosition = await fetchTownSignpostPosition(townGrid.gridId);
        
        const newPlayerPosition = {
          x: signpostPosition.x,
          y: signpostPosition.y,
          g: townGrid.gridId,
          s: targetSettlementId,
          f: frontierId,
          gtype: "town",
          gridCoord: townGrid.gridCoord,
        };
        
        updateStatus(102);
        
        await changePlayerLocation(
          currentPlayer,
          currentPlayer.location,   // fromLocation
          newPlayerPosition,        // toLocation
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
          masterTrophies,
          transitionFadeControl
        );

        // Check if this is the player's first time traveling to town (for FTUE)
        const hasTraveledToTownTrophy = currentPlayer.trophies?.some(
          t => t.type === "TraveledToTown" && t.progress > 0
        );
        if (!hasTraveledToTownTrophy && currentPlayer?.playerId) {
          console.log("🏘️ First time traveling to town - awarding trophy and advancing FTUE");
          await earnTrophy(currentPlayer.playerId, "TraveledToTown", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          // Try to advance FTUE if player is at the correct step for FirstTownVisit
          await tryAdvanceFTUEByTrigger('FirstTownVisit', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
        }

      } catch (error) {
        console.error(`❌ Error traveling to ${isPlayerOwnedTown ? "player's town" : "town"}:`, error);
        if (error.message && error.message.includes('Failed to remove player from previous grid')) {
          updateStatus("Failed to leave current location. Please try again.");
        } else {
          updateStatus("Error traveling to town");
        }
      }
      
      return;
    }

    // 3) Regular signpost => Move directionally
    console.log("Regular Signpost clicked. Calculating transit options dynamically.");
    const direction = resourceType.replace("Signpost ", "");
    const offsets = {
      N:  [-1,  0],
      S:  [ 1,  0],
      E:  [ 0,  1],
      W:  [ 0, -1],
      NE: [-1,  1],
      SE: [ 1,  1],
      SW: [ 1, -1],
      NW: [-1, -1],
    };

    // 4) Fetch the current Settlement
    const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${settlementId}`);
    const settlement = settlementResponse.data;
    if (!settlement || !settlement.grids) {
      console.error("Settlement data is invalid or missing grids."); 
      updateStatus(105); 
      if (transitionFadeControl?.endTransition) {
        transitionFadeControl.endTransition();
      }
      return; 
    }

      // Find the sub-grid doc matching currentGridId
    console.log(`🔍 [TRANSIT DEBUG] Looking for currentGridId: ${currentGridId} in settlement`);
    console.log(`🔍 [TRANSIT DEBUG] Settlement has ${settlement.grids.length} rows`);
    console.log(`🔍 [TRANSIT DEBUG] Total grids in settlement: ${settlement.grids.flat().length}`);

    const currentGrid = settlement.grids.flat().find((grid) => grid.gridId === currentGridId);

    if (!currentGrid) {
      console.error("❌ Current grid not found in settlement.");
      console.error(`❌ currentGridId type: ${typeof currentGridId}`);
      console.error(`❌ currentGridId value: ${currentGridId}`);
      console.error(`❌ Sample gridIds from settlement:`, settlement.grids.flat().slice(0, 5).map(g => ({
        gridId: g.gridId,
        type: typeof g.gridId,
        match: g.gridId === currentGridId,
        toString: g.gridId?.toString(),
        stringMatch: g.gridId?.toString() === currentGridId.toString()
      })));

      updateStatus(105);
      if (transitionFadeControl?.endTransition) {
        transitionFadeControl.endTransition();
      }
      return;
    }

    console.log(`✅ [TRANSIT DEBUG] Found current grid in settlement: ${currentGrid.gridId}, type: ${currentGrid.gridType}, gridCoord: ${currentGrid.gridCoord}`);

      // 5) Decode the current gridCoord to get gRow/gCol
    if (!currentGrid.gridCoord) {
      console.error("No gridCoord found on current grid."); updateStatus(105); return; }

    updateStatus(103); // "Travelling ..."

    const { 
      frontierTier, frontierIndex, 
      setRow, setCol, gRow, gCol
    } = decodeCoord(currentGrid.gridCoord); // Implement decodeCoord to match your system

    // 6) Apply signpost offsets to sub-grid row/col
    const [rowOffset, colOffset] = offsets[direction] || [0, 0];

    let newGRow = gRow + rowOffset;
    let newGCol = gCol + colOffset;
    let newSetRow = setRow;
    let newSetCol = setCol;

    // 7) Check if crossing the local 8x8 sub-grid boundary
    if (newGRow < 0) {
      newGRow = 7;
      newSetRow -= 1;
    } else if (newGRow > 7) {
      newGRow = 0;
      newSetRow += 1;
    }

    if (newGCol < 0) {
      newGCol = 7;
      newSetCol -= 1;
    } else if (newGCol > 7) {
      newGCol = 0;
      newSetCol += 1;
    }

    // 8) Verify we can still stay in bounds of the settlement array (0..7 for setRow/setCol)
    if (newSetRow < 0 || newSetRow > 7 || newSetCol < 0 || newSetCol > 7) {
      updateStatus(106); // "Can't travel beyond frontier"
      return;
    }

    // 9) Fetch the new settlement if setRow/setCol changed
    //    If your server has an endpoint like get-settlement-by-coords/:row/:col, do that:
    const targetSettlementResponse = await axios.get(
      `${API_BASE}/api/get-settlement-by-coords/${newSetRow}/${newSetCol}`
    );
    const targetSettlement = targetSettlementResponse.data;
    if (!targetSettlement || !targetSettlement.grids) {
      console.warn("Target settlement not found or invalid.");
      updateStatus(105);
      return;
    }
 
    // 10) Find the sub-grid at newGRow/newGCol
    const targetGrid = targetSettlement.grids[newGRow][newGCol];
    console.log('targetGrid = ',targetGrid);
    if (!targetGrid?.gridId) {
      console.log('❌ [TRAVEL FAILED] No valid grid found - ending fade transition');
      updateStatus(18);
      
      // End fade transition since travel failed
      if (transitionFadeControl?.endTransition) {
        transitionFadeControl.endTransition();
      }
      
      return;
    }

    // 11) Get the entry position based on the direction traveled
    // First, try to find the opposite signpost in the destination grid
    let entryPosition;
    const playerId = currentPlayer._id?.toString();
    const gridId = currentPlayer.location?.g;
    const playerData = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
    const fromX = playerData?.position?.x ?? 0;
    const fromY = playerData?.position?.y ?? 0;
    console.log("Current player position:", { x: fromX, y: fromY });
    console.log("Direction:", direction);

    // Map of opposite directions
    const oppositeDirections = {
      NE: 'SW', SW: 'NE',
      E: 'W', W: 'E',
      SE: 'NW', NW: 'SE',
      S: 'N', N: 'S'
    };

    const oppositeDirection = oppositeDirections[direction];
    const oppositeSignpostType = `Signpost ${oppositeDirection}`;

    // Try to fetch the opposite signpost position from the destination grid
    let oppositeSignpostFound = false;
    try {
      const gridResourcesResponse = await axios.get(`${API_BASE}/api/load-grid/${targetGrid.gridId}`);
      const gridResources = gridResourcesResponse.data.resources || [];

      // Look for the opposite signpost in the destination grid
      const oppositeSignpost = gridResources.find(res => res.type === oppositeSignpostType);

      if (oppositeSignpost && oppositeSignpost.x !== undefined && oppositeSignpost.y !== undefined) {
        // Apply directional offset so player spawns next to signpost, not on top of it
        // The offset moves the player one tile away from the signpost in the appropriate direction
        const signpostOffsets = {
          'Signpost NE': { x: -1, y: 1 },
          'Signpost E':  { x: -1, y: 0 },
          'Signpost SE': { x: -1, y: -1 },
          'Signpost S':  { x: 0,  y: -1 },
          'Signpost SW': { x: 1,  y: -1 },
          'Signpost W':  { x: 1,  y: 0 },
          'Signpost NW': { x: 1,  y: 1 },
          'Signpost N':  { x: 0,  y: 1 },
        };
        const offset = signpostOffsets[oppositeSignpostType] || { x: 0, y: 0 };

        entryPosition = {
          x: oppositeSignpost.x + offset.x,
          y: oppositeSignpost.y + offset.y
        };
        oppositeSignpostFound = true;
        console.log(`✅ Found opposite signpost ${oppositeSignpostType} at (${oppositeSignpost.x}, ${oppositeSignpost.y}), applying offset (${offset.x}, ${offset.y}) -> entry position (${entryPosition.x}, ${entryPosition.y})`);
      }
    } catch (error) {
      console.warn("Could not fetch opposite signpost position:", error);
    }

    // If no opposite signpost found, use position-based logic
    if (!oppositeSignpostFound) {
      if (["E", "W"].includes(direction)) {
        // Preserve row (Y) when moving left/right
        entryPosition = {
          x: direction === "E" ? 0 : 63,
          y: fromY
        };
        console.log("No opposite signpost found. Preserving row (Y) for E/W direction:", entryPosition);
      } else if (["N", "S"].includes(direction)) {
        // Preserve column (X) when moving up/down
        entryPosition = {
          x: fromX,
          y: direction === "N" ? 63 : 0
        };
        console.log("No opposite signpost found. Preserving column (X) for N/S direction:", entryPosition);
      } else {
        // Fallback to existing logic for diagonals and non-cardinal directions
        entryPosition = getEntryPosition(direction);
        console.log("No opposite signpost found. Using default entry position for diagonal:", entryPosition);
      }
    }

    // 12) Finally, update the player location
    const newPlayerPosition = {
      x: entryPosition.x,
      y: entryPosition.y,
      g: targetGrid.gridId,
      s: targetSettlement._id,
      f: frontierId,
      gtype: targetGrid.gridType,
      gridCoord: targetGrid.gridCoord,
    };
 
    await changePlayerLocation(
      currentPlayer,
      currentPlayer.location,   // fromLocation
      newPlayerPosition,        // toLocation
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
      masterTrophies,
      transitionFadeControl
    );

    console.log(`Player moved to grid ID: ${targetGrid.gridId}`);
  } catch (error) {
    console.error("Error handling transit:", error.message || error);
    updateStatus("Error during travel.");
  }
}

// Example decode function (adjust to match your chosen gridCoord structure)
function decodeCoord(coord) {
  const str = coord.toString().padStart(8, '0');
  return {
    frontierTier:  parseInt(str.slice(0, 2), 10), // first 2 digits
    frontierIndex: parseInt(str.slice(2, 4), 10), // next 2 digits
    setRow:        parseInt(str.slice(4, 5), 10), // next 1 digit
    setCol:        parseInt(str.slice(5, 6), 10), // next 1 digit
    gRow:          parseInt(str.slice(6, 7), 10), // next 1 digit
    gCol:          parseInt(str.slice(7, 8), 10), // last 1 digit
  };
}
