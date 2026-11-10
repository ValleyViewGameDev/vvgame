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
                // a figure NPC stands `artSpan` tiles tall from its tile's bottom edge, so its head is
                // (artSpan - 0.5) tiles above the tile's centre, where the arrow used to point: the arrow
                // is lifted by that much and sits over the head instead of across the face (owner 2026-11-10)
                lift: Math.max(0, (Number(targetNPC.artSpan) || 0) - 0.5),
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

// The arrows on screen now, with what each points at. The arrow itself lets taps through
// (pointer-events: none), so a tap on it used to land on whatever art was under it: for Snug
// beside his town's door, the door (owner 2026-11-10). PixiRenderer's handleClick asks here first,
// so a tap on an arrow is a tap on its target; FTUEScrim keeps the arrow inside its hole.
let liveArrows = [];
const ARROW_SLACK = 14; // px: the bounce, and a thumb's margin

/** The target ({ x, y, w, h, size, source: 'resource'|'npc'|'tile', targetName }) of the board arrow under a page point, or null. */
export function boardArrowTargetAt(clientX, clientY) {
  for (const a of liveArrows) {
    if (clientX >= a.left - ARROW_SLACK && clientX <= a.right + ARROW_SLACK
      && clientY >= a.top - ARROW_SLACK && clientY <= a.bottom + ARROW_SLACK) return a.target;
  }
  return null;
}

// While a Scrim Moment is up the player cannot pan or walk (FTUEScrim locks input), so an
// off-screen target would strand them: re-check this often and bring it back.
const SCRIM_RECHECK_MS = 1000;

function BoardArrows({ targets, TILE_SIZE }) {
  const [arrows, setArrows] = useState([]);
  const revealedAt = useRef(new Map()); // targetName -> last reveal check (ms)
  useEffect(() => {
    if (!targets.length) { setArrows([]); liveArrows = []; return undefined; }
    const place = () => {
      const host = PixiCamera.isAttached() && document.querySelector('.homestead')?.getBoundingClientRect();
      if (!host) { setArrows([]); liveArrows = []; return; }
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
        const lift = (t.lift || 0) * TILE_SIZE * z; // a figure NPC: up to the top of its head
        return { key: `${t.targetName}-${t.x}-${t.y}`, x: Math.round(x), top: Math.round(y - height - 10 * z - lift), width, height, onBoard, target: t };
      }).filter((a) => a.onBoard);
      liveArrows = next.map((a) => ({ left: a.x - a.width / 2, right: a.x + a.width / 2, top: a.top, bottom: a.top + a.height, target: a.target }));
      setArrows((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    place();
    const id = setInterval(place, 33);
    return () => { clearInterval(id); liveArrows = []; };
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
