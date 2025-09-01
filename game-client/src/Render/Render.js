import React, { memo, useState, useEffect, useRef } from 'react';
import { startAmbientVFX, stopAmbientVFX } from '../VFX/AmbientVFX';
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import { getOverlayContent } from './RenderDynamic';
import { getLocalizedString } from '../Utils/stringLookup';
import './Render.css';
import '../App.css';

export function generateResourceTooltip(resource, strings) {
  if (!resource || resource.category === 'doober' || resource.category === 'source') return '';

  const lines = [];

  const currentTime = Date.now();
  const localizedResourceType = getLocalizedString(resource.type, strings);

  switch (resource.category) {
    case 'farmplot':
      lines.push(`<p>${localizedResourceType}</p>`);
      if (resource.growEnd) {
        const remainingTime = Math.max(0, resource.growEnd - currentTime);
        const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
        if (remainingTime > 0) {
          const parts = [];
          if (days > 0) parts.push(`${days}d`);
          if (hours > 0) parts.push(`${hours}h`);
          if (minutes > 0) parts.push(`${minutes}m`);
          if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
          lines.push(`<p>🌱 ${parts.join(' ')} remaining</p>`);
        }
      }
      break;

    case 'crafting':
      lines.push(`<p>${localizedResourceType}</p>`);
      if (resource.craftEnd) {
        const remainingTime = Math.max(0, resource.craftEnd - currentTime);
        const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
        if (remainingTime > 0) {
          const parts = [];
          if (days > 0) parts.push(`${days}d`);
          if (hours > 0) parts.push(`${hours}h`);
          if (minutes > 0) parts.push(`${minutes}m`);
          if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
          lines.push(`<p>⏳ ${parts.join(' ')} remaining</p>`);
        }
      }
      break;

    default:
      lines.push(`<p>${localizedResourceType}</p>`);
      break;
  }

  return lines.join('');
}

export const RenderGrid = memo(
  ({ grid, tileTypes, resources, handleTileClick, TILE_SIZE, setHoverTooltip, currentPlayer, strings }) => {

    const [, forceTick] = useState(0);
      useEffect(() => {
        const interval = setInterval(() => {
          forceTick(t => t + 1);
        }, 1000);
        return () => clearInterval(interval);
      }, []);

    const hoverTimersRef = useRef({}); // ✅ Must be before any early return

    // Validation
    if (!grid || !Array.isArray(grid) || !tileTypes) { console.error('Invalid grid or tileTypes:', grid, tileTypes); return null; }
    if (!TILE_SIZE || isNaN(TILE_SIZE)) { console.error('TILE_SIZE is invalid:', TILE_SIZE); return null; }

    const currentTime = Date.now();

    const craftingStatus = resources.reduce((acc, res) => {
      if (res.category === 'crafting' && res.craftEnd) {
        const key = `${res.x}-${res.y}`;
        if (res.craftEnd < currentTime) {
          acc.ready.push(key);
        } else {
          acc.inProgress.push(key);
        }
      }
      return acc;
    }, { ready: [], inProgress: [] });

    // Check for completed trades at Trading Post
    const tradingStatus = resources.reduce((acc, res) => {
      if (res.type === 'Trading Post' && currentPlayer?.tradeStall) {
        const hasCompletedTrades = currentPlayer.tradeStall.some(trade => 
          trade && (
            (trade.sellTime && new Date(trade.sellTime) < currentTime) ||
            (trade.boughtBy !== null && trade.boughtBy !== undefined)
          )
        );
        if (hasCompletedTrades) {
          acc.ready.push(`${res.x}-${res.y}`);
        }
      }
      return acc;
    }, { ready: [] });

    // Render tiles and resources
    return grid.map((row, rowIndex) =>
      row.map((tile, colIndex) => {
        // Check if this tile is part of a multi-tile resource
        const resource = resources.find((res) => {
          const range = res.range || 1;
          // Check if the current tile falls within the resource's range
          // Resource is anchored at lower-left (res.x, res.y)
          return colIndex >= res.x && colIndex < res.x + range &&
                 rowIndex <= res.y && rowIndex > res.y - range;
        });
        const tileType = tileTypes[rowIndex]?.[colIndex] || 'unknown';
        const tileClass = `tile-${tileType}`;
        const key = `${colIndex}-${rowIndex}`;
        
        // For multi-tile resources, check crafting status against anchor coordinates
        let isCraftReady = false;
        let isCraftInProgress = false;
        let isTradingReady = false;
        
        if (resource && resource.category === 'crafting') {
          const resourceKey = `${resource.x}-${resource.y}`;
          isCraftReady = craftingStatus.ready.includes(resourceKey);
          isCraftInProgress = craftingStatus.inProgress.includes(resourceKey);
        } else if (resource && resource.type === 'Trading Post') {
          const resourceKey = `${resource.x}-${resource.y}`;
          isTradingReady = tradingStatus.ready.includes(resourceKey);
        } else {
          // For regular tiles, use current tile coordinates
          isCraftReady = craftingStatus.ready.includes(key);
          isCraftInProgress = craftingStatus.inProgress.includes(key);
        }

        return (
          <div
            key={`${rowIndex}-${colIndex}-${resource?.symbol || ''}`}
            onClick={() => handleTileClick(rowIndex, colIndex)}
            onMouseEnter={(event) => {
              if (resource && resource.category !== 'doober' && resource.category !== 'source') {
                const rect = event.currentTarget.getBoundingClientRect();
                const updateTooltip = () => {
                  setHoverTooltip({
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    content: generateResourceTooltip(resource, strings),
                  });
                };
                updateTooltip(); // Immediate render
                hoverTimersRef.current[key] = setInterval(updateTooltip, 1000); // Store interval ID
              }
            }}
            onMouseLeave={() => {
              if (hoverTimersRef.current[key]) {
                clearInterval(hoverTimersRef.current[key]);
                delete hoverTimersRef.current[key];
              }
              setHoverTooltip(null);
            }}
            className={tileClass}
            style={{
              position: 'absolute',
              top: rowIndex * TILE_SIZE,
              left: colIndex * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
              fontSize: `${TILE_SIZE * 0.7}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: resource && resource.x === colIndex && resource.y === rowIndex && resource.range > 1 ? 10 : 1,
              cursor: resource ? 'pointer' : 'default',
              overflow: resource && resource.x === colIndex && resource.y === rowIndex && resource.range > 1 ? 'visible' : 'hidden',
            }}
          >
            {/* Resource Overlay - only render at anchor position for multi-tile resources */}
            {resource && resource.x === colIndex && resource.y === rowIndex && (
              <div
                className="resource-overlay"
                style={{
                  fontSize: resource.range > 1 
                    ? `${TILE_SIZE * 1.1 * resource.range}px` 
                    : resource.category === 'deco' && resource.action === 'wall'
                      ? `${TILE_SIZE * 1.1}px` // Walls render slightly larger so they join
                      : `${TILE_SIZE * 0.7}px`,
                  width: resource.range > 1 ? `${TILE_SIZE * resource.range}px` : 'auto',
                  height: resource.range > 1 ? `${TILE_SIZE * resource.range}px` : 'auto',
                  position: resource.range > 1 ? 'absolute' : 'static',
                  left: resource.range > 1 ? '0' : 'auto',
                  top: resource.range > 1 ? `-${TILE_SIZE * (resource.range - 1)}px` : 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: resource.range > 1 ? 10 : 2, // Higher z-index for multi-tile
                  pointerEvents: 'none',
                  overflow: 'visible',
                }}
              >
                {resource.symbol || ''}
              </div>
            )}

            {/* ✅ Add Checkmark for Ready Crafting Stations */}
            {isCraftReady && (!resource || resource.range <= 1 || (resource.x === colIndex && resource.y === rowIndex)) && (
              <div
                className="game-overlay"
                style={{
                  color: getOverlayContent('ready').color,
                }}
              >
                {getOverlayContent('ready').emoji}
              </div>
            )}

            {/* ✅ Add Timer (⌛️) for Crafting Stations Still in Progress */}
            {isCraftInProgress && (!resource || resource.range <= 1 || (resource.x === colIndex && resource.y === rowIndex)) && (
              <div
                className="game-overlay"
                style={{
                  color: getOverlayContent('inprogress').color,
                }}
              >
                {getOverlayContent('inprogress').emoji}
              </div>
            )}

            {/* ✅ Add Checkmark for Trading Post with completed trades */}
            {isTradingReady && resource && resource.type === 'Trading Post' && resource.x === colIndex && resource.y === rowIndex && (
              <div
                className="game-overlay"
                style={{
                  color: getOverlayContent('ready').color,
                }}
              >
                {getOverlayContent('ready').emoji}
              </div>
            )}
          </div>
        );
      })
    );
  }
);


export const RenderVFX = ({ toggleVFX }) => {
  // useEffect(() => {
  //   if (toggleVFX) {
  //     startAmbientVFX();
  //   } else {
  //     stopAmbientVFX();
  //   }
  //   return () => {
  //     stopAmbientVFX(); // Clean up on unmount
  //   };
  // }, [toggleVFX]);

  return null;
};


export const RenderTooltip = memo(({ resource, npc, pc, tooltipPosition, isTooltipVisible }) => {
  // ✅ Always define hooks at the top
  const [craftingCountdown, setCraftingCountdown] = useState(null);
  const [farmingCountdown, setFarmingCountdown] = useState(null);

  // ✅ Prevent the effect from running unnecessarily
  useEffect(() => {
    if (!resource) {
      setCraftingCountdown(null);
      setFarmingCountdown(null);
      return;
    }

    const updateCountdowns = () => {
      if (resource.craftEnd) {
        const remainingTime = Math.max(0, resource.craftEnd - Date.now());
        setCraftingCountdown(remainingTime);
      }

      if (resource.growEnd) {
        const remainingTime = Math.max(0, resource.growEnd - Date.now());
        setFarmingCountdown(remainingTime);
      }
    };

    updateCountdowns(); // Initial fetch
    const timer = setInterval(updateCountdowns, 1000); // Update every second

    return () => clearInterval(timer);
  }, [resource]); // ✅ Depend on `resource` so it updates correctly

  // ✅ Prevent tooltip from rendering empty content
  if (!isTooltipVisible || (!resource && !npc && !pc)) return null;

  const tooltipContent = [];
  const entity = npc || pc || resource; // Prioritize NPCs > PCs > Resources

  // ✅ Tooltip content logic
  switch (entity.category) {

    case 'source':
    case 'doober':
      break;

    case 'farmplot':
      tooltipContent.push(`${entity.type}`);
      if (farmingCountdown !== null && farmingCountdown > 0) {
        const minutes = Math.floor((farmingCountdown % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((farmingCountdown % (1000 * 60)) / 1000);
        tooltipContent.push(`🌱 ${minutes}m ${seconds}s remaining`);
      }
      break;

    case 'crafting':
      tooltipContent.push(`${entity.type}`);
      if (craftingCountdown !== null && craftingCountdown > 0) {
        const minutes = Math.floor((craftingCountdown % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((craftingCountdown % (1000 * 60)) / 1000);
        tooltipContent.push(`⏳ ${minutes}m ${seconds}s remaining`);
      }
      break;

    default:
      tooltipContent.push(`${entity.type}`);
      break;
  }

  if (tooltipContent.length === 0) return null; // Avoid rendering empty tooltips

  return (
    <div
        className="HoverTooltip"
        style={{
        position: 'absolute',
        top: tooltipPosition.y,
        left: tooltipPosition.x,
        zIndex: 20, // Above all
      }}
    >
      {tooltipContent.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  );
});