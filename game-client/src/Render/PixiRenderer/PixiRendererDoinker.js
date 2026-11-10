// @refresh reset
// ^ Development only: remount on a hot reload instead of re-running effects on destroyed Pixi objects (see PixiRenderer.js).
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PixiCamera from './PixiCamera';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import DoinkerArrow from '../../GameFeatures/FTUE/DoinkerArrow';
import { resolveFtueDirtTile, nearestResourceOfType } from '../../GameFeatures/FTUE/findBoardTarget';
import { revealTileBesidePanels } from '../../PlayerMovement';
import '../../GameFeatures/FTUE/FTUE.css';
import { footprintOf } from '../../Utils/footprint';

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
 * - visible: boolean - Whether the doinker should be visible
 * - gridId: string - The current grid ID (needed to look up NPCs)
 */
const PixiRendererDoinker = ({
  doinkerTargets,
  doinkerType = 'resource',
  TILE_SIZE,
  visible,
  gridId,
}) => {
  const [targetPositions, setTargetPositions] = useState([]);

  // Find the target resource/NPC positions - continuously poll to handle async loading
  // Only handles resource/NPC type doinkers (button type uses the original component)
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
  if (!visible || doinkerType === 'button' || doinkerType === 'element') {
    return null;
  }

  if (targetPositions.length === 0) {
    return null;
  }

  // Screen placement: the arrows are portalled to <body> (position: fixed) so they can sit above
  // a Scrim Moment (FTUEScrim.css lifts .ftue-doinker to 1600); inside the board they would be
  // trapped under the board's own stacking context. Positions follow the camera on a short tick.
  return <BoardArrows targets={targetPositions} TILE_SIZE={TILE_SIZE} />;
};

// While a Scrim Moment is up the player cannot pan or walk (FTUEScrim locks input), so an
// off-screen target would strand them: re-check this often and bring it back.
const SCRIM_RECHECK_MS = 1000;

function BoardArrows({ targets, TILE_SIZE }) {
  const [arrows, setArrows] = useState([]);
  const revealedAt = useRef(new Map()); // targetName -> last reveal check (ms)
  useEffect(() => {
    if (!targets.length) { setArrows([]); return undefined; }
    const place = () => {
      const host = PixiCamera.isAttached() && document.querySelector('.homestead')?.getBoundingClientRect();
      if (!host) { setArrows([]); return; }
      // The thing the arrow points at must be on screen (a phone shows a small slice of the
      // grid): ease the camera to the first target when it appears, and keep it there while
      // a scrim is up. Afterwards the player may pan away freely.
      const first = targets[0];
      const now = performance.now();
      const last = revealedAt.current.get(first.targetName);
      const scrim = document.body.classList.contains('ftue-scrim-active');
      if (last === undefined || (scrim && now - last > SCRIM_RECHECK_MS)) {
        revealedAt.current.set(first.targetName, now);
        revealTileBesidePanels(first.x, first.y, first.size);
      }
      const z = PixiCamera.getZoom();
      const next = targets.map((t) => {
        const cw = ((t.w || t.size || 1) - 1) / 2, ch = ((t.h || t.size || 1) - 1) / 2;
        const p = PixiCamera.worldToScreen((t.x + cw + 0.5) * TILE_SIZE, (t.y - ch + 0.5) * TILE_SIZE);
        const x = host.left + p.x;
        const y = host.top + p.y;
        const height = Math.max(30, TILE_SIZE * 0.8) * z;
        const width = Math.max(20, TILE_SIZE * 0.5) * z;
        const onBoard = x >= host.left && x <= host.right && y >= host.top && y <= host.bottom;
        return { key: `${t.targetName}-${t.x}-${t.y}`, x: Math.round(x), top: Math.round(y - height - 10 * z), width, height, onBoard };
      }).filter((a) => a.onBoard);
      setArrows((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    place();
    const id = setInterval(place, 33);
    return () => clearInterval(id);
  }, [targets, TILE_SIZE]);

  if (!arrows.length) return null;
  return createPortal(
    <>
      {arrows.map((a) => (
        <div
          key={a.key}
          className="ftue-doinker ftue-doinker-board"
          style={{ left: `${a.x}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` }}
        >
          <DoinkerArrow width={a.width} height={a.height} />
        </div>
      ))}
    </>,
    document.body
  );
}

export default PixiRendererDoinker;
