import API_BASE from "../config";
import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import "./FrontierView.css";
import { StatusBarContext } from "../UI/StatusBar";
import { changePlayerLocation } from "../Utils/GridManagement";
import frontierTileData from './FrontierTile.json';
import { getGridBackgroundColor } from './ZoomedOut';

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
  const [settlementGrids, setSettlementGrids] = useState({}); // Store all settlement grids
  const [error, setError] = useState(null);
  const { updateStatus } = useContext(StatusBarContext);

  // Fetch Frontier Grid and Settlement Grids
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch frontier grid first
        const response = await axios.get(
          `${API_BASE}/api/get-frontier-grid/${currentPlayer.location.f}`
        );
        const gridData = response.data.frontierGrid || [];
        setFrontierGrid(gridData);

        // Then fetch only populated settlement grids
        const settlementData = {};
        for (const row of gridData) {
          for (const tile of row) {
            if (tile.settlementId && tile.population > 0) {  // Only fetch if populated
              try {
                const settlementResponse = await axios.get(
                  `${API_BASE}/api/get-settlement-grid/${tile.settlementId}`
                );
                settlementData[tile.settlementId] = settlementResponse.data;
              } catch (err) {
                console.error(`Error fetching settlement ${tile.settlementId}:`, err);
              }
            }
          }
        }
        setSettlementGrids(settlementData);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to fetch grid data");
      }
    };

    fetchData();
  }, [currentPlayer.location.f]);

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

  const renderMiniGrid = (tile) => {
    const tileData = frontierTileData[tile.settlementType] || Array(8).fill(Array(8).fill(""));
    const settlementGrid = settlementGrids[tile.settlementId]?.grid || [];
    
    return (
      <div className="mini-grid">
        {tileData.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            let content = cell;
            const gridIndex = rowIndex * 8 + colIndex;
            const gridData = settlementGrid.flat()[gridIndex];
            
            // Priority 1: Show player icon if they're here
            if (gridData?.gridId === currentPlayer.location.g) {
              content = currentPlayer.icon;
            }
            // Priority 2: Show house icon for owned homesteads
            else if (gridData?.gridType === 'homestead' && !gridData.available) {
              content = '🏠';
            }
            // Priority 3: Show town icon for town grids
            else if (gridData?.gridType === 'town') {
              content = '🚂';
            }
            // Priority 4: Use template content
            else {
              content = cell;
            }

            return (
              <div key={`${rowIndex}-${colIndex}`} className="mini-cell">
                <span>{content}</span>
              </div>
            );
          })
        )}
      </div>
    );
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
              backgroundColor: getGridBackgroundColor(tile.settlementType),
            }}
            onClick={() => handleTileClick(tile)}
          >
            {renderMiniGrid(tile)}
          </div>
        ))
      )}
    </div>
  );
};

export default FrontierView;
