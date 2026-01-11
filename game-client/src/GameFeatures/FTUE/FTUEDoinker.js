import { useState, useEffect } from 'react';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import './FTUE.css';

/**
 * FTUEDoinker - Bouncing red arrows that point to target resources or NPCs on the grid
 *
 * Props:
 * - doinkerTargets: string | string[] - The resource/NPC type(s) to point at (e.g., "Dungeon Exit", ["Mailbox", "Constable Elbow"])
 * - TILE_SIZE: number - The current tile size for positioning
 * - visible: boolean - Whether the doinker should be visible
 * - gridId: string - The current grid ID (needed to look up NPCs)
 */
const FTUEDoinker = ({ doinkerTargets, TILE_SIZE, visible, gridId }) => {
  const [targetPositions, setTargetPositions] = useState([]);

  // Find the target resource/NPC positions - continuously poll to handle async loading
  useEffect(() => {
    if (!doinkerTargets || !visible) {
      console.log('👆 Doinker: Clearing - doinkerTargets:', doinkerTargets, 'visible:', visible);
      setTargetPositions([]);
      return;
    }

    // Normalize to array
    const targetsArray = Array.isArray(doinkerTargets) ? doinkerTargets : [doinkerTargets];

    const findTargets = () => {
      const foundPositions = [];

      for (const targetName of targetsArray) {
        let found = false;

        // First, check resources
        const resources = GlobalGridStateTilesAndResources.getResources();
        if (resources && resources.length > 0) {
          // Find the first matching resource (only one doinker per target type)
          const targetResource = resources.find(res => res.type === targetName);
          if (targetResource) {
            foundPositions.push({
              x: targetResource.x,
              y: targetResource.y,
              size: targetResource.size || 1,
              source: 'resource',
              targetName
            });
            found = true;
          }
        }

        // If not found in resources, check NPCs
        if (!found && gridId) {
          const npcs = NPCsInGridManager.getNPCsInGrid(gridId);
          if (npcs && Object.keys(npcs).length > 0) {
            const npcArray = Object.values(npcs);
            const targetNPC = npcArray.find(npc => npc.type === targetName);
            if (targetNPC && targetNPC.position) {
              foundPositions.push({
                x: targetNPC.position.x,
                y: targetNPC.position.y,
                size: 1,
                source: 'npc',
                targetName
              });
              found = true;
            }
          }
        }

        // If target not found, gracefully skip it (no error, just don't show doinker for it)
        if (!found) {
          console.log(`👆 Doinker: Target "${targetName}" not found in current grid`);
        }
      }

      return foundPositions;
    };

    // Initial search
    const positions = findTargets();
    if (positions.length > 0) {
      console.log(`👆 Doinker: Found ${positions.length} target(s):`, positions.map(p => `${p.targetName} (${p.source}) at (${p.x}, ${p.y})`));
      setTargetPositions(positions);
    } else {
      console.log(`👆 Doinker: No targets found yet for:`, targetsArray);
    }

    // Keep polling - resources/NPCs may load asynchronously or grid may change
    const interval = setInterval(() => {
      const newPositions = findTargets();
      setTargetPositions(prevPositions => {
        // Check if positions actually changed
        const positionsChanged =
          newPositions.length !== prevPositions.length ||
          newPositions.some((pos, idx) => {
            const prev = prevPositions[idx];
            return !prev || prev.x !== pos.x || prev.y !== pos.y || prev.targetName !== pos.targetName;
          });

        if (positionsChanged) {
          if (newPositions.length > 0) {
            console.log(`👆 Doinker: Updated to ${newPositions.length} target(s):`, newPositions.map(p => `${p.targetName} at (${p.x}, ${p.y})`));
          } else if (prevPositions.length > 0) {
            console.log(`👆 Doinker: All targets lost`);
          }
          return newPositions;
        }
        return prevPositions;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [doinkerTargets, visible, gridId]);

  // Don't render if not visible or no targets found
  if (!visible || targetPositions.length === 0) {
    return null;
  }

  // Render a doinker arrow for each found target
  return (
    <>
      {targetPositions.map((targetPosition, index) => {
        // Calculate pixel position
        // Center the doinker on the target tile (or center of multi-tile resource)
        const centerOffset = (targetPosition.size - 1) / 2;
        const pixelX = (targetPosition.x + centerOffset + 0.5) * TILE_SIZE;
        const pixelY = (targetPosition.y - centerOffset + 0.5) * TILE_SIZE;

        // Arrow dimensions (responsive to tile size)
        const arrowHeight = Math.max(30, TILE_SIZE * 0.8);
        const arrowWidth = Math.max(20, TILE_SIZE * 0.5);

        return (
          <div
            key={`doinker-${targetPosition.targetName}-${index}`}
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
      })}
    </>
  );
};

export default FTUEDoinker;
