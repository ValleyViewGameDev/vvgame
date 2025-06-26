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
  isRelocating,
  setIsRelocating,
  setCurrentPlayer,            
  setGridId,                // ✅ Ensure this is passed
  setGrid,                  // ✅ Pass setGrid function
  setResources,             // ✅ Pass setResources function
  setTileTypes,             // ✅ Pass setTileTypes function
  TILE_SIZE,
  closeAllPanels,
  visibleSettlementId,
  setVisibleSettlementId,
}) => {

  const [frontierGrid, setFrontierGrid] = useState([]);
  const [settlementGrids, setSettlementGrids] = useState({}); // Store all settlement grids
  const [error, setError] = useState(null);
  const { updateStatus } = useContext(StatusBarContext);

  // Fetch Frontier Grid and Settlement Grids together
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/frontier-bundle/${currentPlayer.location.f}`);
        const { frontierGrid, settlementGrids = {} } = response.data;

        setFrontierGrid(frontierGrid);

        const settlementData = settlementGrids;
        setSettlementGrids(settlementData);

      } catch (err) {
        console.error("Error fetching frontier bundle:", err);
        setError("Failed to fetch grid data");
      }
    };

    fetchData();
  }, [currentPlayer.location.f]);

  useEffect(() => {
    if (isRelocating) {
      updateStatus(125);
    }
  }, [isRelocating]);

  const handleTileClick = async (tile) => {
    console.log('🎯 Tile clicked:', tile);
    console.log('👤 Current player state:', {
      id: currentPlayer?._id,
      playerId: currentPlayer?.playerId,
      location: currentPlayer?.location,
      gridId: currentPlayer?.gridId
    });

    // Are we in RELOCATION mode?
    if (isRelocating) {
      if (tile.settlementType.startsWith('homesteadSet')) {
        if (tile.settlementId) {
          setVisibleSettlementId(tile.settlementId); // ✅ Select target settlement
        }
        setZoomLevel('settlement');
        return;
      } else { 
        updateStatus(122); 
        return; 
      }
    };

    try {
      // Add validation before attempting transit
      if (!tile.settlementId) {
        console.warn('❌ Missing settlementId in clicked tile');
        updateStatus("Invalid destination");
        return;
      }

      // Case 1: Current settlement
      if (tile.settlementId === currentPlayer.location.s) {
        console.log('🏠 Player clicked current settlement - zooming in');
        setZoomLevel("settlement");
        updateStatus(12);
        return;
      }

      // Case 2: Clicking on a tile where the player owns a homestead
      if (tile.settlementType.startsWith('homesteadSet')) {
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
            const toLocation = {
              x: 1,  
              y: 1,
              g: ownedHomestead.gridId, 
              s: tile.settlementId, 
              f: currentPlayer.location.f,
              gtype: ownedHomestead.gridType, 
              gridCoord: ownedHomestead.gridCoord  
            };
            await changePlayerLocation(
              currentPlayer,
              currentPlayer.location, 
              toLocation,
              setCurrentPlayer,
              setGridId,                // ✅ Ensure this is passed
              setGrid,                  // ✅ Pass setGrid function
              setTileTypes,             // ✅ Pass setTileTypes function
              setResources,             // ✅ Pass setResources function
              TILE_SIZE,
              updateStatus,
              closeAllPanels
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
      if (["valley0Set", "valley1Set", "valley2Set", "valley3Set"].includes(tile.settlementType)) {
        console.log("Player clicked a valley tile.");
        updateStatus(9); // Valley tile clicked
        return;
      }

    } catch (error) {
      console.error('❌ Transit error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        tile: tile
      });
      updateStatus("Failed to travel to destination");
    }
  };

  const renderMiniGrid = (tile) => {
    const tileData = frontierTileData[tile.settlementType] || Array(8).fill(Array(8).fill(""));
    const settlementGrid = settlementGrids[tile.settlementId]?.grid || [];
    const flatSettlementGrid = settlementGrid.flat();

    return (
      <div className="mini-grid">
        {tileData.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            let content = cell;
            const gridIndex = rowIndex * 8 + colIndex;
            const gridData = flatSettlementGrid[gridIndex];
            
            // Use gridData.gridId for comparison
            if (gridData?.gridId === currentPlayer.location.g) {
              //console.log('✅ Found player at position:', { rowIndex, colIndex, gridId: gridData.gridId });
              content = currentPlayer.icon;
            } 
            // Other content checks
            else if (gridData?.gridType === 'homestead' && !gridData.available) {
              content = '🏠';
            }
            else if (gridData?.gridType === 'town') {
              content = '🚂';
            }
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
