import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import "./SettlementView.css";
import { StatusBarContext } from "../UI/StatusBar";
import { changePlayerLocation } from "../Utils/GridManagement";

const SettlementView = ({ 
  currentPlayer, 
  setZoomLevel, 
  setCurrentPlayer,            
  fetchGrid,
  setGridId,        
  setGrid,      
  setResources, 
  setTileTypes,  
  setGridState,
  TILE_SIZE,
}) => {
  const [settlementGrid, setSettlementGrid] = useState([]);
  const [error, setError] = useState(null);
  const { updateStatus } = useContext(StatusBarContext);

  console.log("Entering SettlementView for:", currentPlayer.location.s);

  // Fetch Settlement Grid
  useEffect(() => {
    const fetchSettlementGrid = async () => {
      try {
        const response = await axios.get(
          `http://localhost:3001/api/get-settlement-grid/${currentPlayer.location.s}`
        );
        const gridData = response.data.grid || [];
        console.log("Fetched Settlement Grid:", gridData);
        setSettlementGrid(gridData);
      } catch (err) {
        console.error("Error fetching Settlement Grid:", err);
        setError("Failed to fetch Settlement Grid");
      }
    };

    fetchSettlementGrid();
  }, [currentPlayer.location]);

  // Determine background color based on gridType
  const getBackgroundColor = (gridType) => {
    switch (gridType) {
      case "homestead":
        return "#3dc43d"; // Light green
      case "reserved":
        return "#8b0000"; // Dark red
      case "town":
        return "#deb887"; // Beige
      case "valley1":
      case "valley2":
      case "valley3":
        return "#00851f"; // Dark green for valleys
      default:
        return "#d3d3d3"; // Light gray for unknown
    }
  };

  // Determine icon based on tile type and player location
  const getTileIcon = (tile) => {
    if (tile.gridId === currentPlayer.location.g) {
      return currentPlayer.icon; // Player's icon
    }

    if (tile.gridType === "homestead") {
      return tile.available ? "💰" : "📪"; // Money bag for available, mailbox for occupied
    }

    switch (tile.gridType) {
      case "reserved":
        return "🚫";
      case "town":
        return "🏠";
      case "valley1":
        return "🌲";
      case "valley2":
        return "🌲🌲";
      case "valley3":
        return "🌲🌲🌲";
      default:
        return "?";
    }
  };

  const handleTileClick = async (tile) => {
    console.log("Clicked tile:", tile);
  
    // Case 1: Clicking on the current valley tile
    if (
      ["valley1", "valley2", "valley3"].includes(tile.gridType) &&
      tile.gridId === currentPlayer.location.g
    ) {
      console.log("Clicked on the current valley tile. Zooming into grid view.");
      setZoomLevel("far"); // Zoom into grid view
      updateStatus(16); // Display "Zooming into grid view."
      return;
    }
  
    // Case 2: Clicking on any other valley tile
    if (["valley1", "valley2", "valley3"].includes(tile.gridType)) {
      updateStatus(9);
      return;
    }
  

    try {
      const toLocation = {
        x: 1,  // Default to (1, 1) or dynamically set if needed
        y: 1,
        g: tile.gridId,
        s: currentPlayer.location.s,
        f: currentPlayer.location.f,
        gtype: tile.gridType || "unknown",  // Include gridType if available
      };
  
      console.log("Built toLocation object:", toLocation);
      console.log("About to call changePlayerLocation from SettlementView;  current player = ",currentPlayer, "toLocatoin = ", toLocation);
     
      // Call changePlayerLocation using the properly built toLocation
      await changePlayerLocation(
        currentPlayer,
        currentPlayer.location,
        toLocation,  // Use the clean location object
        setCurrentPlayer,
        fetchGrid,
        setGridId,                // ✅ Ensure this is passed
        setGrid,                  // ✅ Pass setGrid function
        setResources,             // ✅ Pass setResources function
        setTileTypes,             // ✅ Pass setTileTypes function
        setGridState,
        TILE_SIZE,
      );


      // Zoom into grid view after movement
      setZoomLevel("far");
  
    } catch (error) {
      console.error("Error changing player location:", error);
      updateStatus(10); // General error
    }
  };
  

  if (error) return <div>Error: {error}</div>;
  if (!settlementGrid.length) return <div>Loading Settlement Grid...</div>;

  return (
    <div className="settlement-grid">
      {settlementGrid.map((row, rowIndex) =>
        row.map((tile, colIndex) => (
          <div
            key={`${rowIndex}-${colIndex}`}
            className="settlement-tile"
            style={{
              backgroundColor: getBackgroundColor(tile.gridType),
              width: "120px",
              height: "120px",
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

export default SettlementView;
