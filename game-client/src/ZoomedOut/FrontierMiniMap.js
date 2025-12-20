import React, { useMemo } from 'react';
import './FrontierMiniMap.css';
import { handleTransitSignpost } from '../GameFeatures/Transit/Transit';

/**
 * Frontier Mini Map - 128x128 pixel representation (2x2 pixels per grid)
 * 64x64 grid representing all grids in the frontier (8x8 settlements, each with 8x8 grids)
 * Player location calculated from gridCoord, shown as yellow cell
 */
const FrontierMiniMap = ({ 
  currentPlayer, 
  strings, 
  setCurrentPlayer, 
  setGridId, 
  setGrid, 
  setTileTypes, 
  setResources, 
  updateStatus, 
  TILE_SIZE, 
  closeAllPanels, 
  bulkOperationContext, 
  masterResources, 
  masterTrophies, 
  transitionFadeControl,
  timers,
  countdowns
}) => {
  // Calculate player's position in the 64x64 grid from gridCoord
  const playerGridPosition = useMemo(() => {
    if (!currentPlayer?.location?.gridCoord) {
      return null;
    }

    const gridCoord = currentPlayer.location.gridCoord;
    console.log('🗺️ Calculating position from gridCoord:', gridCoord);
    
    // Convert gridCoord to string and pad to ensure consistent format
    const gridCoordStr = gridCoord.toString().padStart(8, '0');
    
    // Parse gridCoord: TTIISSGG
    // TT = tier (ignore)
    // II = index (ignore) 
    // SS = settlement row & col (positions 4-5)
    // GG = grid row & col within settlement (positions 6-7)
    
    const settlementRow = parseInt(gridCoordStr[4], 10);
    const settlementCol = parseInt(gridCoordStr[5], 10);
    const gridRow = parseInt(gridCoordStr[6], 10);
    const gridCol = parseInt(gridCoordStr[7], 10);
    
    // Calculate final position in 64x64 grid
    const finalRow = settlementRow * 8 + gridRow;
    const finalCol = settlementCol * 8 + gridCol;
    
    console.log('🗺️ Parsed gridCoord:', {
      gridCoord: gridCoordStr,
      settlementRow, settlementCol,
      gridRow, gridCol,
      finalRow, finalCol
    });
    
    return { row: finalRow, col: finalCol };
  }, [currentPlayer?.location?.gridCoord]);

  // Calculate homestead position from homesteadGridCoord
  const homesteadGridPosition = useMemo(() => {
    if (!currentPlayer?.homesteadGridCoord) {
      return null;
    }

    const gridCoord = currentPlayer.homesteadGridCoord;
    console.log('🏠 Calculating homestead position from gridCoord:', gridCoord);
    
    // Convert gridCoord to string and pad to ensure consistent format
    const gridCoordStr = gridCoord.toString().padStart(8, '0');
    
    // Parse gridCoord: TTIISSGG
    const settlementRow = parseInt(gridCoordStr[4], 10);
    const settlementCol = parseInt(gridCoordStr[5], 10);
    const gridRow = parseInt(gridCoordStr[6], 10);
    const gridCol = parseInt(gridCoordStr[7], 10);
    
    // Calculate final position in 64x64 grid
    const finalRow = settlementRow * 8 + gridRow;
    const finalCol = settlementCol * 8 + gridCol;
    
    console.log('🏠 Parsed homestead gridCoord:', {
      gridCoord: gridCoordStr,
      settlementRow, settlementCol,
      gridRow, gridCol,
      finalRow, finalCol
    });
    
    return { row: finalRow, col: finalCol };
  }, [currentPlayer?.homesteadGridCoord]);

  // Check if player is in a dungeon
  const isInDungeon = currentPlayer?.location?.gtype === 'dungeon';

  // Generate the 64x64 grid (each cell represents one grid in the frontier)
  const frontierGrid = useMemo(() => {
    const grid = [];
    
    for (let row = 0; row < 64; row++) {
      const gridRow = [];
      for (let col = 0; col < 64; col++) {
        // Check if this is the player's position
        const isPlayerPosition = playerGridPosition && 
          playerGridPosition.row === row && 
          playerGridPosition.col === col;
        
        // Check if this is the homestead position
        const isHomesteadPosition = homesteadGridPosition && 
          homesteadGridPosition.row === row && 
          homesteadGridPosition.col === col;

        gridRow.push({
          row,
          col,
          isPlayer: isPlayerPosition,
          isHomestead: isHomesteadPosition,
          key: `${row}-${col}`
        });
      }
      grid.push(gridRow);
    }
    
    return grid;
  }, [playerGridPosition, homesteadGridPosition]);

  // Get the current region name from player location
  const currentRegion = currentPlayer?.location?.region;

  // Compute the display title based on location
  const displayTitle = useMemo(() => {
    // 1. If there's a region name, show that (takes precedence)
    if (currentRegion) {
      return currentRegion;
    }

    // 2. If at home grid (location.g matches player's homestead gridId)
    if (currentPlayer?.location?.g && currentPlayer?.gridId) {
      const currentGridId = currentPlayer.location.g.toString();
      const homeGridId = currentPlayer.gridId.toString();
      if (currentGridId === homeGridId) {
        return strings[107] || 'Your Homestead';
      }
    }

    // 3. If in a town grid that belongs to home settlement
    if (currentPlayer?.location?.gtype === 'town' &&
        currentPlayer?.location?.s &&
        currentPlayer?.settlementId) {
      const currentSettlementId = currentPlayer.location.s.toString();
      const homeSettlementId = currentPlayer.settlementId.toString();
      if (currentSettlementId === homeSettlementId) {
        return strings[108] || 'Your Town';
      }
    }

    // 4. If in a valley grid (valley0-3) with no region
    const gtype = currentPlayer?.location?.gtype;
    if (['valley0', 'valley1', 'valley2', 'valley3'].includes(gtype)) {
      return strings[10184] || 'The Valley';
    }

    // 5. Default to "Map"
    return strings[2] || 'Map';
  }, [currentRegion, currentPlayer?.location?.g, currentPlayer?.gridId,
      currentPlayer?.location?.gtype, currentPlayer?.location?.s,
      currentPlayer?.settlementId, strings]);

  return (
    <div className="frontier-mini-map">
      {/* Title row - show computed display title */}
      <h3 style={{ textAlign: 'center', fontFamily: 'Berkshire Swash', margin: '0 0 8px 0' }}>
        {displayTitle}
      </h3>

      {/* Map row with Home and Town buttons on sides */}
      <div className="mini-map-row-container">
        {/* Home button column - right aligned */}
        <div className="minimap-button-column home-column">
          {!isInDungeon && (
            <span
              className="minimap-signpost-button"
              onClick={() => handleTransitSignpost(
                currentPlayer,
                "Signpost Home",
                setCurrentPlayer,
                setGridId,
                setGrid,
                setTileTypes,
                setResources,
                updateStatus,
                TILE_SIZE,
                currentPlayer.skills,
                closeAllPanels,
                bulkOperationContext,
                masterResources,
                strings,
                masterTrophies,
                transitionFadeControl
              )}
              title={strings && strings[107] ? strings[107] : "Go Home"}
            >
              🏠
            </span>
          )}
        </div>

        {/* Map in center */}
        <div className="mini-map-grid">
        {frontierGrid.map((row, rowIndex) => (
          <div key={rowIndex} className="mini-map-row">
            {row.map((cell) => {
              // Determine cell type and class
              let cellClass = 'default-cell';
              let cellTitle = `Grid (${cell.row}, ${cell.col})`;

              if (cell.isPlayer) {
                cellClass = 'player-cell';
                cellTitle = `You are here (${cell.row}, ${cell.col})`;
              } else if (cell.isHomestead) {
                cellClass = 'homestead-cell';
                cellTitle = `Your homestead (${cell.row}, ${cell.col})`;
              }

              return (
                <div
                  key={cell.key}
                  className={`mini-map-cell ${cellClass}`}
                  title={cellTitle}
                />
              );
            })}
          </div>
        ))}
        </div>

        {/* Town button column - left aligned */}
        <div className="minimap-button-column town-column">
          {!isInDungeon && (
            <span
              className="minimap-signpost-button"
              onClick={() => handleTransitSignpost(
                currentPlayer,
                "Signpost Town Home",
                setCurrentPlayer,
                setGridId,
                setGrid,
                setTileTypes,
                setResources,
                updateStatus,
                TILE_SIZE,
                currentPlayer.skills,
                closeAllPanels,
                bulkOperationContext,
                masterResources,
                strings,
                masterTrophies,
                transitionFadeControl
              )}
              title={strings && strings[108] ? strings[108] : "Go to Town"}
            >
              🏛️
            </span>
          )}
        </div>
      </div>

      {/* Only show dungeon timer when in dungeon */}
      {isInDungeon && (
        <div className="mini-map-dungeon-info">
          {(() => {
            const countdown = countdowns?.dungeon || '--:--:--';
            const days = countdown.match(/(\d+)d/)?.[1] || '0';
            const hours = countdown.match(/(\d+)h/)?.[1] || '0';
            const minutes = countdown.match(/(\d+)m/)?.[1] || '0';
            const isLessThanOneMinute = parseInt(days, 10) === 0 && parseInt(hours, 10) === 0 && parseInt(minutes, 10) === 0;

            return (
              <span style={{
                color: isLessThanOneMinute ? '#a71616ff' : 'inherit',
                fontWeight: isLessThanOneMinute ? 'bold' : 'normal'
              }}>
                Dungeon closes in {countdown}
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default FrontierMiniMap;