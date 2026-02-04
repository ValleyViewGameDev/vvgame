import { useState, useEffect } from 'react';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import DoinkerArrow from '../../GameFeatures/FTUE/DoinkerArrow';
import '../../GameFeatures/FTUE/FTUE.css';

/**
 * PixiRendererDoinker - Bouncing red arrows that point to target resources or NPCs
 *
 * This is the PixiRenderer-compatible version of FTUEDoinker. It renders arrows
 * positioned relative to the PixiJS canvas container, accounting for the zoom scale.
 *
 * Button-type doinkers are handled by the original FTUEDoinker component since
 * they use fixed positioning on UI elements outside the game world.
 *
 * Props:
 * - doinkerTargets: string | string[] - The resource/NPC type(s) to point at
 * - doinkerType: string - Type of doinker: 'resource' (only type supported here)
 * - TILE_SIZE: number - Base tile size (before zoom scaling)
 * - zoomScale: number - Current zoom scale factor
 * - visible: boolean - Whether the doinker should be visible
 * - gridId: string - The current grid ID (needed to look up NPCs)
 * - gridWorldPosition: { x, y } - Position of the grid in world coordinates (pixels)
 */
const PixiRendererDoinker = ({
  doinkerTargets,
  doinkerType = 'resource',
  TILE_SIZE,
  zoomScale,
  visible,
  gridId,
  gridWorldPosition = { x: 0, y: 0 }
}) => {
  const [targetPositions, setTargetPositions] = useState([]);

  // Find the target resource/NPC positions - continuously poll to handle async loading
  // Only handles resource/NPC type doinkers (button type uses the original component)
  useEffect(() => {
    if (!doinkerTargets || !visible || doinkerType === 'button') {
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
      }

      return foundPositions;
    };

    // Initial search
    const positions = findTargets();
    if (positions.length > 0) {
      setTargetPositions(positions);
    }

    // Keep polling - resources/NPCs may load asynchronously
    const interval = setInterval(() => {
      const newPositions = findTargets();
      setTargetPositions(prevPositions => {
        const positionsChanged =
          newPositions.length !== prevPositions.length ||
          newPositions.some((pos, idx) => {
            const prev = prevPositions[idx];
            return !prev || prev.x !== pos.x || prev.y !== pos.y || prev.targetName !== pos.targetName;
          });

        if (positionsChanged) {
          return newPositions;
        }
        return prevPositions;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [doinkerTargets, visible, gridId, doinkerType]);

  // Don't render if not visible or button type (button type handled elsewhere)
  if (!visible || doinkerType === 'button') {
    return null;
  }

  if (targetPositions.length === 0) {
    return null;
  }

  // Render doinker arrows positioned within the world container
  // The arrows need to be positioned in world coordinates (accounting for zoom)
  return (
    <>
      {targetPositions.map((targetPosition, index) => {
        // Calculate pixel position in BASE coordinates (before zoom)
        // The arrow will be positioned relative to the grid's world position
        const centerOffset = (targetPosition.size - 1) / 2;

        // Position in grid-local coordinates (tiles -> pixels at base tile size)
        const gridLocalX = (targetPosition.x + centerOffset + 0.5) * TILE_SIZE;
        const gridLocalY = (targetPosition.y - centerOffset + 0.5) * TILE_SIZE;

        // Apply zoom scale to get world position
        const worldX = gridWorldPosition.x + gridLocalX * zoomScale;
        const worldY = gridWorldPosition.y + gridLocalY * zoomScale;

        // Arrow dimensions (scaled with zoom for visibility)
        const baseArrowHeight = Math.max(30, TILE_SIZE * 0.8);
        const baseArrowWidth = Math.max(20, TILE_SIZE * 0.5);
        const arrowHeight = baseArrowHeight * zoomScale;
        const arrowWidth = baseArrowWidth * zoomScale;

        return (
          <div
            key={`pixi-doinker-${targetPosition.targetName}-${index}`}
            className="ftue-doinker"
            style={{
              position: 'absolute',
              left: `${worldX}px`,
              top: `${worldY - arrowHeight - 10 * zoomScale}px`,
              width: `${arrowWidth}px`,
              height: `${arrowHeight}px`,
              transform: 'translateX(-50%)', // Center horizontally
              zIndex: 1000,
            }}
          >
            <DoinkerArrow width={arrowWidth} height={arrowHeight} />
          </div>
        );
      })}
    </>
  );
};

export default PixiRendererDoinker;
