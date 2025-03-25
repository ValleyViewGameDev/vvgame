import axios from "axios";
import { changePlayerLocation } from "../../Utils/GridManagement";
import gridStateManager from "../../GridState/GridState";

export async function handleTransitSignpost(
  currentPlayer,
  resourceType,
  setCurrentPlayer,
  fetchGrid,
  setGridId,                // ✅ Ensure this is passed
  setGrid,                  // ✅ Pass setGrid function
  setResources,             // ✅ Pass setResources function
  setTileTypes,             // ✅ Pass setTileTypes function
  setGridState,
  updateStatus,
  TILE_SIZE,
  skills
) {
  try {
    console.log("Handling transit for resource:", resourceType);

    console.log("🔍 currentPlayer before checking skills:", currentPlayer);
    console.log("📜 currentPlayer.skills:", currentPlayer.skills);

    // 1) Ensure the player has the Horse skill
    skills = currentPlayer.skills.length ? currentPlayer.skills : await axios.get(`http://localhost:3001/api/inventory/${currentPlayer.playerId}`).then(res => res.data.skills || []);

    console.log('skillResponse.data: ', skills);
    console.log('currentPlayer = ',currentPlayer.username);
    
    const hasHorse = skills.some((item) => item.type === "Horse" && item.quantity > 0);
    console.log('hasHorse: ', hasHorse);
    if (!hasHorse) { updateStatus(15); return; }

    // 2) Handle special signposts
    const { g: currentGridId, s: settlementId, f: frontierId } = currentPlayer.location;

    // Signpost Home
    if (resourceType === "Signpost Home") {
      console.log("Signpost Home clicked. Traveling to player's homestead.");

      const newPlayerPosition = {
        x: 1,
        y: 1,
        g: currentPlayer.gridId,      // The player's homestead grid
        s: currentPlayer.settlementId,
        f: currentPlayer.location.f,
        gtype: "homestead",
        gridCoord: currentPlayer.gridCoord,
      };
      updateStatus(101);
      await changePlayerLocation(
        currentPlayer,
        currentPlayer.location,   // fromLocation
        newPlayerPosition,        // toLocation
        setCurrentPlayer,
        fetchGrid,
        setGridId,                // ✅ Ensure this is passed
        setGrid,                  // ✅ Pass setGrid function
        setResources,             // ✅ Pass setResources function
        setTileTypes,             // ✅ Pass setTileTypes function
        setGridState,
        TILE_SIZE
      );
      return;
    }

    // Signpost Town
    if (resourceType === "Signpost Town") {
      console.log("Signpost Town clicked. Finding the first town grid in the settlement.");

      const settlementResponse = await axios.get(`http://localhost:3001/api/get-settlement/${settlementId}`);
      const settlement = settlementResponse.data;
      if (!settlement || !settlement.grids) { updateStatus(104); return; }

      // Find any sub-grid with gridType = town
      const townGrid = settlement.grids.flat().find((grid) => grid.gridType === "town" && grid.gridId);
      if (!townGrid) { updateStatus(104); return; }

      console.log("Found town grid:", townGrid);
      const newPlayerPosition = {
        x: 1,
        y: 1,
        g: townGrid.gridId,
        s: settlementId,
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
        fetchGrid,
        setGridId,                // ✅ Ensure this is passed
        setGrid,                  // ✅ Pass setGrid function
        setResources,             // ✅ Pass setResources function
        setTileTypes,             // ✅ Pass setTileTypes function
        setGridState,
        TILE_SIZE
      );
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
    const settlementResponse = await axios.get(`http://localhost:3001/api/get-settlement/${settlementId}`);
    const settlement = settlementResponse.data;
    if (!settlement || !settlement.grids) {
      console.error("Settlement data is invalid or missing grids."); updateStatus(105); return; }

      // Find the sub-grid doc matching currentGridId
    const currentGrid = settlement.grids.flat().find((grid) => grid.gridId === currentGridId);
    if (!currentGrid) {
      console.error("Current grid not found in settlement."); updateStatus(105); return; }

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
      `http://localhost:3001/api/get-settlement-by-coords/${newSetRow}/${newSetCol}`
    );
    const targetSettlement = targetSettlementResponse.data;
    if (!targetSettlement || !targetSettlement.grids) {
      console.warn("Target settlement not found or invalid.");
      updateStatus(105);
      return;
    }
 
    // 10) Find the sub-grid at newGRow/newGCol
    const targetGrid = targetSettlement.grids[newGRow][newGCol];
    if (!targetGrid?.gridId) {
      updateStatus(18);
      return;
    }

    // 11) Fetch the destination grid type via load-grid
    // const destinationGridResponse = await axios.get(
    //   `http://localhost:3001/api/load-grid/${targetGrid.gridId}`
    // );
    // const destinationGridData = destinationGridResponse.data;

    // 12) Finally, update the player location
    const newPlayerPosition = {
      x: 1,
      y: 1,
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
      fetchGrid,
      setGridId,                // ✅ Ensure this is passed
      setGrid,                  // ✅ Pass setGrid function
      setResources,             // ✅ Pass setResources function
      setTileTypes,             // ✅ Pass setTileTypes function
      setGridState,
      TILE_SIZE
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

