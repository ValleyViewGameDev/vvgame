import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { resolveFtueDirtTile, nearestResourceOfType } from './findBoardTarget';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import DoinkerArrow from './DoinkerArrow';
import './FTUE.css';
import { footprintOf } from '../../Utils/footprint';

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
 * - pointing: 'down' (default: above the target) | 'left' (to the target's right, pointing at it;
 *   button / element doinkers only, from the step's doinkerPointing)
 */
const FTUEDoinker = ({ doinkerTargets, doinkerType = 'resource', TILE_SIZE, visible, gridId, activePanel, pointing = 'down' }) => {
  const [targetPositions, setTargetPositions] = useState([]);
  const [buttonPosition, setButtonPosition] = useState(null);

  // Find the target resource/NPC positions - continuously poll to handle async loading
  // Skip this logic for button-type doinkers (handled by separate useEffect below)
  useEffect(() => {
    if (!doinkerTargets || !visible || doinkerType === 'button' || doinkerType === 'element') {
      setTargetPositions([]);
      return;
    }

    // Normalize to array
    const targetsArray = Array.isArray(doinkerTargets) ? doinkerTargets : [doinkerTargets];

    const findTargets = () => {
      const foundPositions = [];

      for (const targetName of targetsArray) {
        let found = false;

        // 'tile' doinkers point at a computed tile (today: the FTUE planting tile)
        if (doinkerType === 'tile') {
          const t = targetName === 'ftue-dirt' ? resolveFtueDirtTile() : null;
          if (t) foundPositions.push({ x: t.x, y: t.y, size: 1, source: 'tile', targetName });
          continue;
        }

        // First, check resources
        const resources = GlobalGridStateTilesAndResources.getResources();
        if (resources && resources.length > 0) {
          // One doinker per target type: the instance nearest the player (findBoardTarget.js)
          const targetResource = nearestResourceOfType(resources, targetName);
          if (targetResource) {
            foundPositions.push({
              x: targetResource.x,
              y: targetResource.y,
              size: Math.max(footprintOf(targetResource).w, footprintOf(targetResource).h),
              w: footprintOf(targetResource).w,
              h: footprintOf(targetResource).h,
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
    // 'button' looks inside the active panel; 'element' anywhere in the document (a nav button)
    const isElement = doinkerType === 'element';
    if ((doinkerType !== 'button' && !isElement) || !visible || (!isElement && !activePanel) || typeof doinkerTargets !== 'string') {
      setButtonPosition(null);
      return;
    }

    const findButton = () => {
      const panelElement = isElement ? document : document.querySelector(`[data-panel-name="${activePanel}"]`);
      if (!panelElement) {
        return null;
      }
      // The panel slides in (panelLeftIn / mPanelLeftIn, 260 ms): a rect measured mid-slide
      // puts the arrow where the panel WAS, and it then jumps. Stay hidden until the slide ends.
      if (!isElement && typeof panelElement.getAnimations === 'function' &&
          panelElement.getAnimations().some((a) => a.playState === 'running')) {
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
        right: rect.right,
        midY: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height
      };
    };

    // Initial search, then quick retries while the panel mounts and finishes sliding in
    // (about 260 ms), then a slow poll in case the button moves (scroll, relayout).
    setButtonPosition(findButton());
    const quick = setInterval(() => {
      const p = findButton();
      if (p) { setButtonPosition(p); clearInterval(quick); }
    }, 50);
    const interval = setInterval(() => {
      setButtonPosition(findButton());
    }, 500);

    return () => { clearInterval(quick); clearInterval(interval); };
  }, [doinkerType, doinkerTargets, visible, activePanel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  // For button type, use buttonPosition; for resource type, use targetPositions
  if (doinkerType === 'button' || doinkerType === 'element') {
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
  if ((doinkerType === 'button' || doinkerType === 'element') && buttonPosition) {
    const arrowHeight = 40;
    const arrowWidth = 30;

    // Pointing left: a horizontal arrow just right of the target, centred on its middle
    if (pointing === 'left') {
      return createPortal(
        <div
          key="doinker-button"
          className="ftue-doinker-button ftue-doinker-left"
          style={{
            left: `${buttonPosition.right + 6}px`,
            top: `${buttonPosition.midY - arrowWidth / 2}px`,
            width: `${arrowHeight}px`,
            height: `${arrowWidth}px`,
          }}
        >
          <div className="ftue-doinker-left-arrow">
            <DoinkerArrow width={arrowWidth} height={arrowHeight} />
          </div>
        </div>,
        document.body
      );
    }

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
        const cw = ((targetPosition.w || targetPosition.size || 1) - 1) / 2, ch = ((targetPosition.h || targetPosition.size || 1) - 1) / 2;
        const pixelX = (targetPosition.x + cw + 0.5) * TILE_SIZE;
        const pixelY = (targetPosition.y - ch + 0.5) * TILE_SIZE;

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
