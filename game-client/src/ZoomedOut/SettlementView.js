import API_BASE from "../config";
import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import "./SettlementView.css";
import { StatusBarContext } from "../UI/StatusBar/StatusBar";
import { changePlayerLocation } from "../Utils/GridManagement";
import { fetchTownSignpostPosition, fetchHomesteadSignpostPosition } from "../Utils/worldHelpers";
import settlementTileData from './SettlementTile.json';
import { useBulkOperation } from "../UI/BulkOperationContext";
import { getGridBackgroundColor } from './ZoomedOut';
import { centerCameraOnPlayer } from "../PlayerMovement";
import playersInGridManager from "../GridState/PlayersInGrid";
import { fetchHomesteadOwner } from "../Utils/worldHelpers";
import { updateGridStatus } from "../Utils/GridManagement";
import { processRelocation } from "../Utils/Relocation";
import { getVisitedGridCoords } from "../Utils/gridsVisitedUtils";
import RenderVisitedGrid from "./RenderVisitedGrid";

// Center camera on player's current grid in settlement view
export function centerCameraOnPlayerGrid(currentPlayer, settlementGrid) {
  if (!currentPlayer?.location?.g || !settlementGrid || settlementGrid.length === 0) {
    console.warn("Cannot center camera: missing player location or settlement grid");
    return;
  }

  const playerGridId = currentPlayer.location.g;
  
  // Find the player's grid position in the settlement
  let playerRow = -1;
  let playerCol = -1;
  
  for (let row = 0; row < settlementGrid.length; row++) {
    for (let col = 0; col < settlementGrid[row].length; col++) {
      if (settlementGrid[row][col]?.gridId === playerGridId) {
        playerRow = row;
        playerCol = col;
        break;
      }
    }
    if (playerRow !== -1) break;
  }
  
  if (playerRow === -1 || playerCol === -1) {
    console.warn(`Player's grid ${playerGridId} not found in settlement`);
    return;
  }

  // Wait for next frame to ensure layout is complete
  requestAnimationFrame(() => {
    // Find the specific tile element instead of calculating position
    const allTiles = document.querySelectorAll(".settlement-tile");
    const tileIndex = playerRow * 8 + playerCol; // 8 columns per row
    const playerTile = allTiles[tileIndex];
    
    if (!playerTile) {
      console.warn("Player tile element not found");
      return;
    }

    // Scroll the tile into view with centering
    playerTile.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center"
    });
    
    // Fallback: If scrollIntoView doesn't work well, try manual scroll after a delay
    setTimeout(() => {
      const updatedRect = playerTile.getBoundingClientRect();
      const isVisible = (
        updatedRect.top >= 0 &&
        updatedRect.left >= 0 &&
        updatedRect.bottom <= window.innerHeight &&
        updatedRect.right <= window.innerWidth
      );
      
      if (!isVisible) {
        // Calculate center manually using body scroll
        const tileCenterX = updatedRect.left + (updatedRect.width / 2);
        const tileCenterY = updatedRect.top + (updatedRect.height / 2);
        const windowCenterX = window.innerWidth / 2;
        const windowCenterY = window.innerHeight / 2;
        
        const scrollX = window.scrollX + (tileCenterX - windowCenterX);
        const scrollY = window.scrollY + (tileCenterY - windowCenterY);
        
        window.scrollTo({
          left: Math.max(0, scrollX),
          top: Math.max(0, scrollY),
          behavior: "smooth"
        });
      }
    }, 500);
  });
}

const SettlementView = ({ 
  currentPlayer, 
  isDeveloper,
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
  const [visitedGridTiles, setVisitedGridTiles] = useState({}); // Map gridCoord -> encoded tiles
  const { updateStatus } = useContext(StatusBarContext);
  const bulkOperationContext = useBulkOperation();

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

  // Fetch tiles for visited grids
  useEffect(() => {
    const fetchVisitedGridTiles = async () => {
      if (!settlementGrid.length || !currentPlayer?.gridsVisited || !visibleSettlementId) return;

      // Get all visited coords in SSGG format (from bit buffer)
      const visitedSSGG = getVisitedGridCoords(currentPlayer.gridsVisited);

      // Get settlement tiles with their full gridCoords
      const settlementTiles = settlementGrid.flat()
        .filter(tile => tile.gridCoord !== undefined && tile.gridId);

      // Find intersection - compare SSGG parts (last 4 digits) of full gridCoords
      // with the SSGG values from the visited buffer
      const coordsToFetch = settlementTiles
        .filter(tile => visitedSSGG.includes(tile.gridCoord % 10000))
        .map(tile => tile.gridCoord);

      if (coordsToFetch.length === 0) return;

      try {
        const response = await axios.post(`${API_BASE}/api/grids-tiles`, {
          settlementId: visibleSettlementId,
          gridCoords: coordsToFetch
        });

        if (response.data.success && response.data.tilesMap) {
          setVisitedGridTiles(response.data.tilesMap);
          console.log(`📍 Fetched tiles for ${Object.keys(response.data.tilesMap).length} visited grids`);
        }
      } catch (err) {
        console.error('Error fetching visited grid tiles:', err);
      }
    };

    fetchVisitedGridTiles();
  }, [settlementGrid, currentPlayer?.gridsVisited, visibleSettlementId]);

  // Center camera on player's grid when settlement view loads
  useEffect(() => {
    if (settlementGrid.length > 0 && currentPlayer?.location?.g) {
      // Delay to ensure DOM is ready and rendered
      setTimeout(() => {
        centerCameraOnPlayerGrid(currentPlayer, settlementGrid);
      }, 300);
    }
  }, [settlementGrid, currentPlayer?.location?.g]);


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
        await updateGridStatus(gridType, username, updateStatus, currentPlayer, currentPlayer.location.g);
      }
      let pcs = null;
      let pc = null;
      pcs = playersInGridManager.getPlayersInGrid(tile.gridId);
      pc = pcs?.[currentPlayer.playerId];
      centerCameraOnPlayer(pc.position, TILE_SIZE);
      return;
    }
    
    // Check if player has Horse skill before allowing teleportation to another grid
    if (tile.gridId && tile.gridId !== currentPlayer.location.g) {
      const hasHorse = currentPlayer.skills?.some((skill) => skill.type === "Horse" && skill.quantity > 0);
      if (!hasHorse) {
        console.log("🐴 Player lacks Horse skill for teleportation");
        updateStatus(15); // "You need Horse skill to travel"
        return;
      }
    }
  
    // Clicking on any other valley tile
    if (["valley0", "valley1", "valley2", "valley3"].includes(tile.gridType) && !isDeveloper) {
      updateStatus(9);
      return;
    }

    // Clicking on an unoccupied homestead tile
    if (tile.gridType === "homestead" && tile.available === true) {
      updateStatus(126); // "This homestead is unoccupied."
      return;
    }

    try {
      // Default position
      let arrivalX = 0;
      let arrivalY = 0;
      
      // If clicking on a town tile, find the Train location
      if (tile.gridType === "town") {
        console.log("🏘️ Clicking on town grid, fetching Train location...");
        const signpostPosition = await fetchTownSignpostPosition(tile.gridId);
        arrivalX = signpostPosition.x;
        arrivalY = signpostPosition.y;
      }
      // If clicking on a homestead tile, find the Signpost Town location
      else if (tile.gridType === "homestead") {
        console.log("🏠 Clicking on homestead grid, fetching Signpost Town location...");
        const signpostPosition = await fetchHomesteadSignpostPosition(tile.gridId);
        arrivalX = signpostPosition.x;
        arrivalY = signpostPosition.y;
      }
      
      const toLocation = {
        x: arrivalX,  
        y: arrivalY,
        g: tile.gridId,
        s: currentPlayer.location.s,
        f: currentPlayer.location.f,
        gtype: tile.gridType || "unknown", 
        gridCoord: tile.gridCoord || 0,
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
        closeAllPanels,
        updateStatus,
        bulkOperationContext,
        masterResources,
        null, // strings not available in SettlementView
        null  // masterTrophies not available in SettlementView
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
    const isTownGrid = gridType === "town";
    const usePixelRendering = isValleyGrid || isTownGrid; // Valley and Town use pixel rendering, Homestead does not
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

    // Check if this is a visited valley/town grid - render actual tiles instead of tree pattern
    // Homestead grids keep their current emoji-based rendering
    const hasVisitedTiles = tile.gridCoord !== undefined && visitedGridTiles[tile.gridCoord];
    if (usePixelRendering && hasVisitedTiles) {
      // Render pixel tiles, with player icon overlay at correct miniX,miniY position if player is here
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <RenderVisitedGrid
            encodedTiles={visitedGridTiles[tile.gridCoord]}
            size={64}
            className="visited-grid-canvas"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
          {isPlayerHere && (
            <div style={{
              position: 'absolute',
              top: `${(miniY / 8) * 100}%`,
              left: `${(miniX / 8) * 100}%`,
              width: '12.5%',
              height: '12.5%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.6em',
              zIndex: 1
            }}>
              {currentPlayer.icon}
            </div>
          )}
        </div>
      );
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
                  // Only show the item if it hasn't been bought
                  if (stall?.resource && !stall?.boughtBy) {
                    const template = masterResources.find(r => r.type === stall.resource);
                    if (template?.symbol) content = template.symbol;
                  }
                }
              } else if (cell === "username") {
                content = owner?.username || "";
              } else if (cell === "role") {
                content = owner?.role || "Citizen";
              } else if (cell === "netWorth") {
                content = `${owner?.netWorth?.toLocaleString() || "0"} (net worth)`;
              }
            }
  
            // Determine cell styling based on content type
            let cellClasses = "mini-cell";
            let contentClasses = "";
            
            // Check if this cell shows username
            if (cell === "username" && content) {
              contentClasses = "username-text";
            }
            
            // Check if this cell shows role (Mayor)
            if (cell === "role" && content === "Mayor") {
              contentClasses = "mayor-text";
            }
            
            // Check if this cell shows player icon on current grid
            if (isPlayerHere && content === currentPlayer.icon) {
              contentClasses = "player-icon-current";
            }

            return (
              <div key={`${rowIndex}-${colIndex}`} className={cellClasses}>
                <span className={contentClasses}>{content}</span>
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
