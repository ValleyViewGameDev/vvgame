import { useState, useEffect } from 'react';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import './FTUE.css';

/**
 * FTUEDoinker - A bouncing red arrow that points to a target resource or NPC on the grid
 *
 * Props:
 * - doinkerTarget: string - The resource/NPC type to point at (e.g., "Dungeon Exit", "Constable Elbow")
 * - TILE_SIZE: number - The current tile size for positioning
 * - visible: boolean - Whether the doinker should be visible
 * - gridId: string - The current grid ID (needed to look up NPCs)
 */
const FTUEDoinker = ({ doinkerTarget, TILE_SIZE, visible, gridId }) => {
  const [targetPosition, setTargetPosition] = useState(null);

  // Find the target resource/NPC position - continuously poll to handle async loading
  useEffect(() => {
    if (!doinkerTarget || !visible) {
      console.log('👆 Doinker: Clearing - doinkerTarget:', doinkerTarget, 'visible:', visible);
      setTargetPosition(null);
      return;
    }

    const findTarget = () => {
      // First, check resources
      const resources = GlobalGridStateTilesAndResources.getResources();
      if (resources && resources.length > 0) {
        const targetResource = resources.find(res => res.type === doinkerTarget);
        if (targetResource) {
          return {
            x: targetResource.x,
            y: targetResource.y,
            range: targetResource.range || 1,
            source: 'resource'
          };
        }
      }

      // If not found in resources, check NPCs
      if (gridId) {
        const npcs = NPCsInGridManager.getNPCsInGrid(gridId);
        if (npcs && Object.keys(npcs).length > 0) {
          const npcArray = Object.values(npcs);
          console.log('👆 Doinker: NPC types in grid:', npcArray.map(npc => npc.type));
          const targetNPC = npcArray.find(npc => npc.type === doinkerTarget);
          if (targetNPC && targetNPC.position) {
            return {
              x: targetNPC.position.x,
              y: targetNPC.position.y,
              range: 1,
              source: 'npc'
            };
          }
        }
      }

      return null;
    };

    // Initial search
    const position = findTarget();
    if (position) {
      console.log(`👆 Doinker: Found target "${doinkerTarget}" (${position.source}) at (${position.x}, ${position.y})`);
      setTargetPosition(position);
    } else {
      console.log(`👆 Doinker: Target "${doinkerTarget}" not found yet, will keep checking...`);
    }

    // Keep polling - resources/NPCs may load asynchronously or grid may change
    const interval = setInterval(() => {
      const pos = findTarget();
      setTargetPosition(prevPos => {
        if (pos) {
          // Only log if position actually changed
          if (!prevPos || prevPos.x !== pos.x || prevPos.y !== pos.y) {
            console.log(`👆 Doinker: Updated target "${doinkerTarget}" (${pos.source}) position to (${pos.x}, ${pos.y})`);
          }
          return pos;
        } else if (prevPos) {
          console.log(`👆 Doinker: Target "${doinkerTarget}" lost - no longer exists`);
          return null;
        }
        return prevPos;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [doinkerTarget, visible, gridId]);

  // Don't render if not visible or no target found
  if (!visible || !targetPosition) {
    return null;
  }

  // Calculate pixel position
  // Center the doinker on the target tile (or center of multi-tile resource)
  const centerOffset = (targetPosition.range - 1) / 2;
  const pixelX = (targetPosition.x + centerOffset + 0.5) * TILE_SIZE;
  const pixelY = (targetPosition.y - centerOffset + 0.5) * TILE_SIZE;

  // Arrow dimensions (responsive to tile size)
  const arrowHeight = Math.max(30, TILE_SIZE * 0.8);
  const arrowWidth = Math.max(20, TILE_SIZE * 0.5);

  return (
    <div
      className="ftue-doinker"
      style={{
        left: `${pixelX}px`,
        top: `${pixelY - arrowHeight - 10}px`, // Position above the target with small gap
        width: `${arrowWidth}px`,
        height: `${arrowHeight}px`,
      }}
    >
      {/* SVG Arrow pointing down */}
      <svg
        width={arrowWidth}
        height={arrowHeight}
        viewBox="0 0 40 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="ftue-doinker-arrow"
      >
        {/* Arrow body */}
        <path
          d="M15 0 L15 35 L5 35 L20 60 L35 35 L25 35 L25 0 Z"
          fill="#e53935"
          stroke="#b71c1c"
          strokeWidth="2"
        />
        {/* Highlight */}
        <path
          d="M17 2 L17 33 L20 33 L20 2 Z"
          fill="#ff6f60"
          opacity="0.6"
        />
      </svg>
    </div>
  );
};

export default FTUEDoinker;
