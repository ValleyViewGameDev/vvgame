import API_BASE from "../config";
import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import "./FrontierView.css";
import { StatusBarContext } from "../UI/StatusBar";
import { changePlayerLocation } from "../Utils/GridManagement";

const FrontierView = ({ 
  currentPlayer, 
  setZoomLevel, 
  setCurrentPlayer,            
  fetchGrid,
  setGridId,                // ✅ Ensure this is passed
  setGrid,                  // ✅ Pass setGrid function
  setResources,             // ✅ Pass setResources function
  setTileTypes,             // ✅ Pass setTileTypes function
  setGridState,
  TILE_SIZE,
}) => {


  const [frontierGrid, setFrontierGrid] = useState([]);
  const [settlementIcons, setSettlementIcons] = useState({});
  const [error, setError] = useState(null);
  const { updateStatus } = useContext(StatusBarContext);

  // Fetch Frontier Grid
  useEffect(() => {
    const fetchFrontierGrid = async () => {
      try {
        const response = await axios.get(
          `${API_BASE}/api/get-frontier-grid/${currentPlayer.location.f}`
        );
        const gridData = response.data.frontierGrid || [];
        console.log("Fetched Frontier Grid:", gridData);
        setFrontierGrid(gridData);

        // Fetch icons for all settlements
        await preloadSettlementIcons(gridData);
      } catch (err) {
        console.error("Error fetching Frontier Grid:", err);
        setError("Failed to fetch Frontier Grid");
      }
    };

    fetchFrontierGrid();
  }, [currentPlayer.location]);

  // Preload icons for all settlements
  const preloadSettlementIcons = async (gridData) => {
    const icons = {};
    for (const row of gridData) {
      for (const tile of row) {
        if (tile.settlementType === "homesteadSet") {
          icons[tile.settlementId] = await fetchSettlementIcon(tile.settlementId);
        }
      }
    }
    setSettlementIcons(icons);
  };

  // Fetch icon based on settlement player presence
  const fetchSettlementIcon = async (settlementId) => {
    try {
      const response = await axios.get(
        `${API_BASE}/api/get-settlement-grid/${settlementId}`
      );
      const grids = response.data.grid || [];

      const hasOccupiedGrids = grids.some((row) =>
        row.some((grid) => grid.gridType === "homestead" && grid.available === false)
      );
      return hasOccupiedGrids ? "🏡" : "🌳";
    } catch (err) {
      console.error(`Error fetching grids for settlement ${settlementId}:`, err);
    }
    return "🌳"; // Fallback icon
  };

  // Determine background color based on settlementType
  const getBackgroundColor = (settlementType) => {
    switch (settlementType) {
      case "homesteadSet":
        return "#3dc43d"; // Light green
      case "valley1Set":
      case "valley2Set":
      case "valley3Set":
        return "#00851f"; // Variations of green for valleys
      default:
        return "#d3d3d3"; // Light gray for unknown
    }
  };

  const getTileIcon = (tile) => {
    if (tile.settlementId === currentPlayer.location.s) {
//    return "😀"; // Player's profile icon
      return currentPlayer.icon; // Player's profile icon
    }

    switch (tile.settlementType) {
      case "homesteadSet":
        return settlementIcons[tile.settlementId] || "🏡"; // Show house if occupied
      case "valley1Set":
        return "🌲"; // One tree for valley1
      case "valley2Set":
        return "🌲🌲"; // Two trees for valley2
      case "valley3Set":
        return "🌲🌲🌲"; // Three trees for valley3
      default:
        return "?"; // Default for unknown types
    }
  };


  const handleTileClick = async (tile) => {
    console.log("Clicked tile:", tile);
  
    // Case 1: Clicking on the tile where the player is currently located
    if (tile.settlementId === currentPlayer.location.s) {
      console.log("Player clicked their current settlement. Zooming to SettlementView.");
      setZoomLevel("settlement");
      updateStatus(12); // Display "Settlement view."
      return;
    }
  
    // Case 2: Clicking on a tile where the player owns a homestead
    if (tile.settlementType === "homesteadSet") {
      try {
        // Fetch the settlement grid
        const response = await axios.get(`${API_BASE}/api/get-settlement-grid/${tile.settlementId}`);
        const grids = response.data.grid || [];
  
        console.log("currentPlayer.gridId:", currentPlayer.gridId);
        console.log("grids:", grids);

        // Find the player's owned homestead
        const ownedHomestead = grids.flat().find(
          (grid) => grid.gridType === "homestead" && grid.gridId === currentPlayer.gridId
        );
  
        console.log("ownedHomestead:", ownedHomestead);
  
        if (ownedHomestead) {
          console.log("Traveling to owned homestead:", ownedHomestead);
          await changePlayerLocation(
            currentPlayer,
            currentPlayer.location, // fromLocation
            { 
              x: 1, 
              y: 1, 
              g: ownedHomestead.gridId, 
              s: tile.settlementId, 
              f: currentPlayer.location.f 
            }, // toLocation
            setCurrentPlayer,
            fetchGrid,
            setGridId,                // ✅ Ensure this is passed
            setGrid,                  // ✅ Pass setGrid function
            setResources,             // ✅ Pass setResources function
            setTileTypes,             // ✅ Pass setTileTypes function
            setGridState,
            TILE_SIZE,
          );

          setZoomLevel("far");
          return;
        }
      } catch (error) {
        console.error("Error checking for owned homestead:", error);
        updateStatus(8); // General error
        return;
      }
  
      console.log("Player does not own a homestead in this settlement.");
      updateStatus(17); // Homestead tile clicked but no ownership
      return;
    }
  
    // Case 3: Clicking on any other valley tile
    if (["valley1Set", "valley2Set", "valley3Set"].includes(tile.settlementType)) {
      console.log("Player clicked a valley tile.");
      updateStatus(9); // Valley tile clicked
      return;
    }
  
    // Default case: Unexpected tile type
    console.warn("Unexpected tile type clicked:", tile.settlementType);
    updateStatus(8); // General error
  };

  


  if (error) return <div>Error: {error}</div>;
  if (!frontierGrid.length) return <div>Loading Frontier Grid...</div>;

  return (
    <div className="frontier-grid">
      {frontierGrid.map((row, rowIndex) =>
        row.map((tile, colIndex) => (
          <div
            key={`${rowIndex}-${colIndex}`}
            className="frontier-tile"
            style={{
              backgroundColor: getBackgroundColor(tile.settlementType),
              width: "100px",
              height: "100px",
            }}
            onClick={() => handleTileClick(tile)}
          >
            {getTileIcon(tile)}
            </div>
        ))
      )}
    </div>
  );
};

export default FrontierView;
