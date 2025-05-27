import React, { memo, useState, useEffect, useRef } from 'react';
import { startAmbientVFX, stopAmbientVFX } from '../VFX/AmbientVFX';
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import '../App.css';

export function generateResourceTooltip(resource) {
  if (!resource || resource.category === 'doober' || resource.category === 'source') return '';

  const lines = [];

  const currentTime = Date.now();

  switch (resource.category) {
    case 'farmplot':
      lines.push(`<p>${resource.type}</p>`);
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
      lines.push(`<p>${resource.type}</p>`);
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
      lines.push(`<p>${resource.type}</p>`);
      break;
  }

  return lines.join('');
}

export const RenderGrid = memo(
  ({ grid, tileTypes, resources, handleTileClick, TILE_SIZE, setHoverTooltip }) => {

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

    // Render tiles and resources
    return grid.map((row, rowIndex) =>
      row.map((tile, colIndex) => {
        const resource = resources.find((res) => res.x === colIndex && res.y === rowIndex);
        const tileType = tileTypes[rowIndex]?.[colIndex] || 'unknown';
        const tileClass = `tile-${tileType}`;
        const key = `${colIndex}-${rowIndex}`;
        const isCraftReady = craftingStatus.ready.includes(key);
        const isCraftInProgress = craftingStatus.inProgress.includes(key);

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
                    content: generateResourceTooltip(resource),
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1, // Base layer for tiles
              cursor: resource ? 'pointer' : 'default',
            }}
          >
            {/* Resource Overlay */}
            {resource && (
              <div
                className="resource-overlay"
                style={{
                  fontSize: `${TILE_SIZE * 0.7}px`,
                  zIndex: 2, // Above tiles, below NPCs
                  pointerEvents: 'none',
                }}
              >
                {resource.symbol || ''}
              </div>
            )}

            {/* ✅ Add Checkmark for Ready Crafting Stations */}
            {isCraftReady && (
              <div
                className="craft-notification"
                style={{
                  position: 'absolute',
                  top: '10%',
                  right: '10%',
                  fontSize: `${TILE_SIZE * 0.5}px`,
                  color: 'green',
                  fontWeight: 'bold',
                  zIndex: 3, // Ensure it's above everything else
                  pointerEvents: 'none',
                }}
              >
                ✅
              </div>
            )}

            {/* ✅ Add Timer (⌛️) for Crafting Stations Still in Progress */}
            {isCraftInProgress && (
              <div
                className="craft-notification"
                style={{
                  position: 'absolute',
                  top: '10%',
                  right: '10%',
                  fontSize: `${TILE_SIZE * 0.5}px`,
                  color: 'orange',
                  fontWeight: 'bold',
                  zIndex: 3, // Ensure it's above everything else
                  pointerEvents: 'none',
                }}
              >
                ⌛️
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