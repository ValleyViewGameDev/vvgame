import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import DoinkerArrow from './DoinkerArrow';
import './FTUE.css';

/**
 * FTUEDoinker - Bouncing red arrows that point to target resources, NPCs, or UI buttons
 *
 * Props:
 * - doinkerTargets: string | string[] | number - The resource/NPC type(s) to point at, or button index (e.g., "Dungeon Exit", 3)
 * - doinkerType: string - Type of doinker: "resource" (default) or "button"
 * - TILE_SIZE: number - The current tile size for positioning
 * - visible: boolean - Whether the doinker should be visible
 * - gridId: string - The current grid ID (needed to look up NPCs)
 * - activePanel: string - The currently open panel (needed for button targeting)
 */
const FTUEDoinker = ({ doinkerTargets, doinkerType = 'resource', TILE_SIZE, visible, gridId, activePanel }) => {
  const [targetPositions, setTargetPositions] = useState([]);
  const [buttonPosition, setButtonPosition] = useState(null);

  // Find the target resource/NPC positions - continuously poll to handle async loading
  // Skip this logic for button-type doinkers (handled by separate useEffect below)
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
          return newPositions;
        }
        return prevPositions;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [doinkerTargets, visible, gridId, doinkerType]);

  // Handle button-type doinkers - use CSS selector to find target element
  useEffect(() => {
    // doinkerTargets should be a CSS selector string when doinkerType is 'button'
    if (doinkerType !== 'button' || !visible || !activePanel || typeof doinkerTargets !== 'string') {
      setButtonPosition(null);
      return;
    }

    const findButton = () => {
      const panelElement = document.querySelector(`[data-panel-name="${activePanel}"]`);
      if (!panelElement) {
        return null;
      }

      // doinkerTargets is a CSS selector string
      const targetButton = panelElement.querySelector(doinkerTargets);
      if (!targetButton) {
        return null;
      }

      const rect = targetButton.getBoundingClientRect();

      // Use viewport coordinates directly since we use position: fixed
      return {
        x: rect.left + rect.width / 2, // Center of button in viewport
        y: rect.top, // Top of button (arrow will be positioned above)
        width: rect.width,
        height: rect.height
      };
    };

    // Initial search
    const position = findButton();
    if (position) {
      setButtonPosition(position);
    }

    // Keep polling - panel might not be rendered yet or button might change position
    const interval = setInterval(() => {
      const newPosition = findButton();
      setButtonPosition(newPosition);
    }, 500);

    return () => clearInterval(interval);
  }, [doinkerType, doinkerTargets, visible, activePanel]);

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  // For button type, use buttonPosition; for resource type, use targetPositions
  if (doinkerType === 'button') {
    if (!buttonPosition) {
      return null;
    }
  } else {
    if (targetPositions.length === 0) {
      return null;
    }
  }

  // Render doinker arrow(s)
  // For button type: render one arrow over the button (using portal to escape .homestead overflow)
  // For resource type: render arrows over each resource/NPC
  if (doinkerType === 'button' && buttonPosition) {
    const arrowHeight = 40;
    const arrowWidth = 30;

    // Use portal to render at document.body level, escaping any parent overflow:hidden/auto
    return createPortal(
      <div
        key="doinker-button"
        className="ftue-doinker-button"
        style={{
          left: `${buttonPosition.x - arrowWidth / 2}px`, // Center arrow horizontally over button
          top: `${buttonPosition.y - arrowHeight - 10}px`, // Position above button
          width: `${arrowWidth}px`,
          height: `${arrowHeight}px`,
        }}
      >
        <DoinkerArrow width={arrowWidth} height={arrowHeight} />
      </div>,
      document.body
    );
  }

  // Resource/NPC type doinkers
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
            <DoinkerArrow width={arrowWidth} height={arrowHeight} />
          </div>
        );
      })}
    </>
  );
};

export default FTUEDoinker;
