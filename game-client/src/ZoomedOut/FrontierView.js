import API_BASE from "../config";
import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import "./FrontierView.css";
import { StatusBarContext } from "../UI/StatusBar/StatusBar";
import { changePlayerLocation } from "../Utils/GridManagement";
import { fetchHomesteadSignpostPosition } from "../Utils/worldHelpers";
import frontierTileData from './FrontierTile.json';
import { useBulkOperation } from "../UI/BulkOperationContext";
import { getGridBackgroundColor } from './ZoomedOut';
import { showNotification } from '../UI/Notifications/Notifications';
import { useStrings } from '../UI/StringsContext';
import { earnTrophy } from '../GameFeatures/Trophies/TrophyUtils';
import { isGridVisited } from "../Utils/gridsVisitedUtils";


const FrontierView = ({ 
  currentPlayer, 
  isDeveloper,
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
  masterResources,          // ✅ Add masterResources prop
  masterTrophies,           // ✅ Add masterTrophies prop
}) => {

  const [frontierGrid, setFrontierGrid] = useState([]);
  const [settlementGrids, setSettlementGrids] = useState({}); // Store all settlement grids
  const [error, setError] = useState(null);
  const { updateStatus } = useContext(StatusBarContext);
  const bulkOperationContext = useBulkOperation();
  const strings = useStrings();
 
  // Fetch Frontier Grid and Settlement Grids together
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/frontier-bundle/${currentPlayer.location.f}?playerSettlementId=${currentPlayer.location.s}`);
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

  // Show notification when zooming out to Frontier view (first time only)
  useEffect(() => {
    const checkAndShowFrontierTip = async () => {
      // Check if player has already seen the frontier tip
      const hasSawFrontierTip = currentPlayer.trophies?.some(trophy => trophy.name === "SawFrontierTip");
      
      if (!hasSawFrontierTip) {
        console.log('🏆 First time in Frontier view - awarding "SawFrontierTip" trophy');
        
        try {
          // Award the invisible trophy to mark they've seen the tip
          await earnTrophy(currentPlayer.playerId, "SawFrontierTip", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          
          // Show the notification
          showNotification('Tip', {
            title: strings[7001],
            message: strings[7020]
          });
          
          console.log('✅ Frontier tip shown and trophy awarded');
        } catch (error) {
          console.error('❌ Error awarding SawFrontierTip trophy:', error);
          // Still show notification even if trophy award fails
          showNotification('Tip', {
            title: strings[7001],
            message: strings[7020]
          });
        }
      } else {
        console.log('🔇 Player already has SawFrontierTip trophy - skipping notification');
      }
    };
    
    if (currentPlayer?.playerId && strings && masterTrophies) {
      checkAndShowFrontierTip();
    }
  }, [currentPlayer?.playerId, strings, masterTrophies]); // Re-run if these dependencies change

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
        if (tile.settlementId) { setVisibleSettlementId(tile.settlementId);}
        setZoomLevel('settlement'); return;
      } else { updateStatus(122); return; }
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
          // Find the player's owned homestead
          const ownedHomestead = grids.flat().find(
            (grid) => grid.gridType === "homestead" && grid.gridId === currentPlayer.gridId
          );    
          if (ownedHomestead) {
            console.log("Traveling to owned homestead:", ownedHomestead);
            
            // Fetch the homestead grid data to find Signpost Town location
            const signpostPosition = await fetchHomesteadSignpostPosition(ownedHomestead.gridId);
            
            const toLocation = {
              x: signpostPosition.x,  
              y: signpostPosition.y,
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
              closeAllPanels,
              updateStatus,
              bulkOperationContext,
              masterResources,          // ✅ Pass masterResources
              strings,                  // ✅ Pass strings for valley trophy check
              null                      // ✅ masterTrophies not available in FrontierView
            ); 
            setZoomLevel("far");
            return;
          }
        } catch (error) {
          console.error("Error checking for owned homestead:", error);
          updateStatus(8); // General error
          return;
        }
        updateStatus(17); // Homestead tile clicked but no ownership
        return;
      }

      // Case 3: Clicking on any other valley tile
      if (["valley0Set", "valley1Set", "valley2Set", "valley3Set"].includes(tile.settlementType)) {
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
      updateStatus(99);
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
            const gridIndex = rowIndex * 8 + colIndex;
            const gridData = flatSettlementGrid[gridIndex];

            // Default content from tile data
            let content = cell;
            let cellStyle = {};

            // Check if this is a visited valley grid
            const isValleyType = gridData?.gridType && ['valley0', 'valley1', 'valley2', 'valley3'].includes(gridData.gridType);
            const hasBeenVisited = gridData?.gridCoord !== undefined &&
                                   isGridVisited(currentPlayer.gridsVisited, gridData.gridCoord);
            const isPlayerHere = gridData?.gridId && gridData.gridId === currentPlayer.location.g;

            // Apply visited styling first (green background for visited valley grids)
            if (isValleyType && hasBeenVisited) {
              cellStyle = { backgroundColor: 'var(--valley-visited-color, #8fd67f)' };
              content = ''; // Remove tree emoji for visited grids
            }

            // Then apply content overlays
            if (isPlayerHere) {
              content = currentPlayer.icon;
            } else if (gridData?.gridType === 'homestead' && !gridData.available) {
              content = '🏠';
            } else if (gridData?.gridType === 'town') {
              content = '🚂';
            }

            return (
              <div key={`${rowIndex}-${colIndex}`} className="mini-cell" style={cellStyle}>
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
