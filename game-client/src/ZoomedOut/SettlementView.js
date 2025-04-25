import API_BASE from "../config";
import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import "./SettlementView.css";
import { StatusBarContext } from "../UI/StatusBar";
import { changePlayerLocation } from "../Utils/GridManagement";
import settlementTileData from './SettlementTile.json';
import { getGridBackgroundColor } from './ZoomedOut';

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
  masterResources,
}) => {
  const [settlementGrid, setSettlementGrid] = useState([]);
  const [players, setPlayers] = useState({});  // Map player IDs to player data
  const [error, setError] = useState(null);
  const [gridStates, setGridStates] = useState({});  // Add new state for grid states
  const { updateStatus } = useContext(StatusBarContext);

  console.log("Entering SettlementView for:", currentPlayer.location.s);

  // Fetch both settlement grid and player data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch settlement grid and settlement data
        const gridResponse = await axios.get(
          `${API_BASE}/api/get-settlement-grid/${currentPlayer.location.s}`
        );
        const gridData = gridResponse.data.grid || [];
        
        // Get all occupied grid IDs
        const occupiedGridIds = [];
        gridData.forEach(row => 
          row.forEach(grid => {
            if (grid.gridId && !grid.available) {
              occupiedGridIds.push(grid.gridId);
            }
          })
        );

        // Fetch grid states if there are occupied grids
        if (occupiedGridIds.length > 0) {
          const gridStatesResponse = await axios.post(
            `${API_BASE}/api/get-multiple-grid-states`,
            { gridIds: occupiedGridIds }
          );
          setGridStates(gridStatesResponse.data);
        }
        
        setSettlementGrid(gridData);

        // Fetch all players in settlement with tradeStall data
        const playersResponse = await axios.get(
          `${API_BASE}/api/get-players-by-settlement/${currentPlayer.location.s}?fields=username,role,netWorth,tradeStall`
        );
        
        console.log('Raw player data from API:', playersResponse.data);

        playersResponse.data.forEach(player => {
          console.log(`Player ${player.username} tradeStall:`, player.tradeStall);
        });
        
        const playersMap = playersResponse.data.reduce((acc, player) => {
          acc[player._id] = player;
          return acc;
        }, {});
        setPlayers(playersMap);
        console.log("Players in settlement:", playersMap);

      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to fetch settlement data");
      }
    };

    fetchData();
  }, [currentPlayer.location.s]);

  const handleTileClick = async (tile) => {
    console.log("Clicked tile:", tile);
  
    // Case 1: Clicking on the current valley tile
    if (
      ["valley0", "valley1", "valley2", "valley3"].includes(tile.gridType) &&
      tile.gridId === currentPlayer.location.g
    ) {
      console.log("Clicked on the current valley tile. Zooming into grid view.");
      setZoomLevel("far"); // Zoom into grid view
      updateStatus(16); // Display "Zooming into grid view."
      return;
    }
  
    // Case 2: Clicking on any other valley tile
    if (["valley0", "valley1", "valley2", "valley3"].includes(tile.gridType)) {
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

  // Update the tooltip generation logic
  const getTooltip = (tile) => {
    if (!tile.gridId) return '';
    const gridState = gridStates[tile.gridId];
    const pcs = gridState?.gridStatePCs?.pcs;

    if (!pcs || Object.keys(pcs).length === 0) {
      return '';
    }

    return Object.values(pcs)
      .map(pc => `${pc.username || 'Unknown'}: ${pc.hp || 0} HP`)
      .join('\n');
  };

  const renderMiniGrid = (tile) => {
    let gridType = tile.gridType;
    if (gridType === "homestead") {
      gridType = tile.available ? "homesteadEmpty" : "homesteadOccupied";
    }

    const tileData = settlementTileData[gridType] || Array(8).fill(Array(8).fill(""));
    const isPlayerHere = tile.gridId === currentPlayer.location.g;
    
    let owner = null;
    if (tile.ownerId && players) {
      owner = players[tile.ownerId];
    }

    const tooltip = getTooltip(tile);
    
    return (
      <div className="mini-grid">
        {tileData.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            let content = cell;
            
            // Player icon always goes in cell [0,7] if present
            if (isPlayerHere && rowIndex === 0 && colIndex === 0) {
              content = currentPlayer.icon;
            }
            if (isPlayerHere && rowIndex === 0 && colIndex === 1) {
              content = "(You are here)";
            }            
            // For homesteads, handle special content
            else if (gridType === "homesteadOccupied") {
              if (rowIndex === 7 && colIndex < 6) {
                // Trade stall rendering in first 6 cells of row 7
                if (owner && Array.isArray(owner.tradeStall)) {
                  const stall = owner.tradeStall[colIndex];
                  if (stall && typeof stall === 'object' && stall.resource) {
                    const resourceTemplate = masterResources.find(r => r.type === stall.resource);
                    if (resourceTemplate?.symbol) {
                      content = resourceTemplate.symbol;
                    }
                  }
                }
              } else if (cell === "username" && owner) {
                content = owner.username;
              } else if (cell === "role" && owner) {
                content = owner.role || "Citizen";
              } else if (cell === "netWorth" && owner) {
                content = owner.netWorth?.toLocaleString() || '0';
              }
            }
            
            return (
              <div 
                key={`${rowIndex}-${colIndex}`} 
                className="mini-cell"
              >
                <span>{content}</span>
                {tooltip && (
                  <div className="tooltip">
                    <p>Who's Here:</p>
                    {tooltip}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
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
              backgroundColor: getGridBackgroundColor(tile.gridType),
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

export default SettlementView;
