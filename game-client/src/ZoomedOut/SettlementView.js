import API_BASE from "../config";
import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import "./SettlementView.css";
import { StatusBarContext } from "../UI/StatusBar";
import { changePlayerLocation } from "../Utils/GridManagement";
import settlementTileData from './SettlementTile.json';
import { getGridBackgroundColor } from './ZoomedOut';
import { centerCameraOnPlayer } from "../PlayerMovement";
import playersInGridManager from "../GridState/PlayersInGrid";
import { fetchHomesteadOwner } from "../Utils/worldHelpers";
import { updateGridStatus } from "../Utils/GridManagement";
import { processRelocation } from "../Utils/Relocation";

const SettlementView = ({ 
  currentPlayer, 
  setZoomLevel, 
  isRelocating,
  setIsRelocating,
  setCurrentPlayer,            
  setGridId,        
  setGrid,      
  setResources, 
  setTileTypes,  
  TILE_SIZE,
  masterResources,
  closeAllPanels,
  visibleSettlementId,
  setVisibleSettlementId,
}) => {

  const [settlementGrid, setSettlementGrid] = useState([]);
  const [players, setPlayers] = useState(new Map());  // Map player IDs to player data
  const [error, setError] = useState(null);
  const [NPCsInGrids, setGridStates] = useState({});  // Add new state for grid states
  const [playersInGridMap, setPlayersInGrid] = useState({});
  const { updateStatus } = useContext(StatusBarContext);

  // Added diagnostic log for player-to-ownerId matching
  if (players) {
    const ownerIdsInGrid = settlementGrid.flat().map(tile => tile.ownerId).filter(Boolean);
    const unmatchedOwnerIds = ownerIdsInGrid.filter(id => !players.get(id));
  }

  // Fetch both settlement grid and player data
  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("📦 Fetching settlement bundle for ID:", visibleSettlementId);
        const response = await axios.post(`${API_BASE}/api/get-settlement-bundle`, { settlementId: visibleSettlementId });
        console.log("✅ Settlement bundle response:", response.data);
        const { gridStates, players: playersArray, settlement } = response.data;

        // Transform playersArray (array) to playersById (object)
        const playersById = {};
        if (Array.isArray(playersArray)) {
          for (const player of playersArray) {
            playersById[player._id] = player;
          }
        }

        setGridStates(gridStates || {});
        setPlayers(new Map(Object.entries(playersById || {})));
        setSettlementGrid(settlement?.grids || []);
        console.log("📐 Settlement grid set:", settlement?.grids);

        // 🔄 Fetch playersInGrid for all grids in this settlement
        const gridIds = (settlement?.grids || []).flat().map(tile => tile.gridId).filter(Boolean);
        const gridStateResponse = await axios.post(`${API_BASE}/api/get-multiple-grid-states`, { gridIds });
        const mergedPlayersInGrid = {};

        for (const gridId in gridStateResponse.data) {
          const pcs = gridStateResponse.data[gridId]?.playersInGrid?.pcs || {};
          mergedPlayersInGrid[gridId] = pcs;
        }

        setPlayersInGrid(mergedPlayersInGrid);

      } catch (err) {
        console.error("Error fetching settlement bundle:", err);
        setError("Failed to fetch settlement data");
      }
    };

    fetchData();
  }, [visibleSettlementId]);

  useEffect(() => {
    if (isRelocating) {
      updateStatus(125);
    }
  }, [isRelocating]);


  const handleTileClick = async (tile, TILE_SIZE) => {
    console.log("Clicked tile:", tile);

    if (tile.settlementId && tile.settlementId !== visibleSettlementId) {
      console.log("Switching visible settlement to:", tile.settlementId);
      setVisibleSettlementId(tile.settlementId);
      return;
    }
  
    // Are we in RELOCATIONN mode?
    if (isRelocating) {
      if (tile.gridType !== 'homestead') {
        updateStatus(123); return;
      }
      if (tile.available != true) {
        updateStatus(124); return; 
      }
      if (tile.available === true) {
        // CONFIRMATION MOADAL
        processRelocation(currentPlayer, setCurrentPlayer, currentPlayer.gridId, tile.gridCoord, settlementGrid);
        setIsRelocating(false);
        setZoomLevel('close');
        updateStatus(121);
      }
      return;
    }

    // Clicking on the tile where the player already is
    if (tile.gridId === currentPlayer.location.g) {
      setZoomLevel("far");
      if (["valley0", "valley1", "valley2", "valley3"].includes(tile.gridType)) {
        updateStatus(16);
      } else if (tile.gridType === "town") {
        updateStatus(111);
      } else {
        const { username, gridType } = await fetchHomesteadOwner(currentPlayer.location.g);
        if (username === currentPlayer.username) { updateStatus(112) }
        else { updateGridStatus(gridType, username, updateStatus) };
      }
      let pcs = null;
      let pc = null;
      pcs = playersInGridManager.getPlayersInGrid(tile.gridId);
      pc = pcs?.[currentPlayer.playerId];
      centerCameraOnPlayer(pc.position, TILE_SIZE);
      return;
    }
  
    // Clicking on any other valley tile
    if (["valley0", "valley1", "valley2", "valley3"].includes(tile.gridType)) {
      updateStatus(9);
      return;
    }

    try {
      const toLocation = {
        x: 1,  
        y: 1,
        g: tile.gridId,
        s: currentPlayer.location.s,
        f: currentPlayer.location.f,
        gtype: tile.gridType || "unknown", 
      };
  
      console.log("Built toLocation object:", toLocation);
      console.log("About to call changePlayerLocation from SettlementView;  current player = ",currentPlayer, "toLocatoin = ", toLocation);
     
      // Call changePlayerLocation using the properly built toLocation
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
      // Zoom into grid view after movement
      setZoomLevel("far"); 

    } catch (error) {
      console.error("Error changing player location:", error);
      updateStatus(10); // General error
    }
  };

const getTooltip = (tile) => {
    if (!tile.gridId) return '';
    const pcs = playersInGridMap[tile.gridId];
    if (!pcs || Object.keys(pcs).length === 0) return '';
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
      const ownerIdStr = typeof tile.ownerId === 'object' ? tile.ownerId._id : tile.ownerId;
      owner = players.get(ownerIdStr);
    }
  
    if (tile.ownerId && !owner) {
    }
  
    const tooltip = getTooltip(tile);
  
    let miniX = 0;
    let miniY = 0;
    const isValleyGrid = ["valley0", "valley1", "valley2", "valley3"].includes(gridType);
    let playerPCs = null;
    let playerPC = null;

    if (isPlayerHere && isValleyGrid && tile.gridId) {
      playerPCs = playersInGridManager.getPlayersInGrid(tile.gridId);
      playerPC = playerPCs?.[currentPlayer.playerId];
      if (playerPC?.position) {
        miniX = Math.floor(playerPC.position.x / 8);
        miniY = Math.floor(playerPC.position.y / 8);
      }
    }
  
    return (
      <div className="mini-grid">
        {tileData.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            let content = cell;
  
            if (isPlayerHere && isValleyGrid && rowIndex === miniY && colIndex === miniX) {
              content = currentPlayer.icon;
            }
  
            // 🏠 For homestead or other grid types, show icon at default corner
            else if (isPlayerHere && !isValleyGrid && rowIndex === 0 && colIndex === 0) {
              content = currentPlayer.icon;
            }
  
            // 🛒 Homestead trade stall rendering
            if (gridType === "homesteadOccupied") {
              if (rowIndex === 7 && colIndex < 6) {
                if (owner && Array.isArray(owner.tradeStall)) {
                  const stall = owner.tradeStall[colIndex];
                  if (stall?.resource) {
                    const template = masterResources.find(r => r.type === stall.resource);
                    if (template?.symbol) content = template.symbol;
                  }
                }
              } else if (cell === "username") {
                content = owner?.username || "";
              } else if (cell === "role") {
                content = owner?.role || "Citizen";
              } else if (cell === "netWorth") {
                content = owner?.netWorth?.toLocaleString() || "0";
              }
            }
  
            return (
              <div key={`${rowIndex}-${colIndex}`} className="mini-cell">
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
            onClick={() => handleTileClick(tile,TILE_SIZE)}
          >
            {renderMiniGrid(tile)}
          </div>
        ))
      )}
    </div>
  );
};

export default SettlementView;
