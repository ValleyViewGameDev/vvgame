/**
 * Arrival hop: a player who travels by signpost appears ON the destination's signpost, then
 * steps off it onto a free tile (owner 2026-10-13). The preferred tile is the signpost's
 * arrival offset (GridManagement.js SIGNPOST_ARRIVAL_OFFSETS: one right of Signpost Town at
 * home, one left of Signpost Home in town); when that is taken, the nearest free tile ring by
 * ring around the signpost, walked to step by step. A deliberate pace, slower than walking.
 *
 * Steps go through playersInGridManager.updatePC (animated, saved like any move), not through
 * the movement loop, so the hop never collects a doober or trips a transit. A key press or a tap
 * that moves the player first ends the hop where it is.
 */
import playersInGridManager from '../GridState/PlayersInGrid';
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import { buildPassability, findPath } from './Pathfinding';

export const ARRIVAL_HOP_DELAY_MS = 350;  // the avatar is seen on the signpost first
export const ARRIVAL_STEP_MS = 260;       // one hop step (walking is 90 ms a step)
const MAX_RING = 6;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The tile to step onto: the preferred one if free, else the nearest free one by ring. */
export function pickArrivalTile(signpost, preferred, isFree, reachable) {
  if (preferred && isFree(preferred.x, preferred.y) && reachable(preferred)) return preferred;
  for (let ring = 1; ring <= MAX_RING; ring++) {
    const cells = [];
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        cells.push({ x: signpost.x + dx, y: signpost.y + dy, d: dx * dx + dy * dy });
      }
    }
    // closest first (orthogonal before diagonal); ties lean toward the preferred side
    const side = preferred ? Math.sign(preferred.x - signpost.x) : 0;
    cells.sort((a, b) => a.d - b.d || (Math.sign(b.x - signpost.x) === side) - (Math.sign(a.x - signpost.x) === side));
    for (const c of cells) {
      if (isFree(c.x, c.y) && reachable(c)) return { x: c.x, y: c.y };
    }
  }
  return null;
}

/**
 * Step the local player off `signpost` (they must already be standing on it). Resolves when the
 * hop is done or abandoned.
 */
export async function hopOffSignpost({ gridId, playerId, signpost, preferred, masterResources, currentPlayer }) {
  await wait(ARRIVAL_HOP_DELAY_MS);
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  const npcs = NPCsInGridManager.getNPCsInGrid(gridId);
  if (!tiles?.length) return;
  const passable = buildPassability({ tiles, resources, npcs, masterResources, currentPlayer });
  const occupied = new Set(resources.filter(Boolean).map((r) => `${r.x},${r.y}`));
  // Free = walkable, and nothing on it (no doober to collect, no crop to trample)
  const isFree = (x, y) => passable(x, y) && !occupied.has(`${x},${y}`);
  const reachable = (t) => (Math.max(Math.abs(t.x - signpost.x), Math.abs(t.y - signpost.y)) <= 1)
    || findPath(signpost, t, passable).length > 0;
  const target = pickArrivalTile(signpost, preferred, isFree, reachable);
  if (!target) return;

  const adjacent = Math.max(Math.abs(target.x - signpost.x), Math.abs(target.y - signpost.y)) <= 1;
  const steps = adjacent ? [target] : findPath(signpost, target, passable);
  let at = { x: signpost.x, y: signpost.y };
  for (const step of steps) {
    const now = playersInGridManager.getPlayerPosition(gridId, playerId);
    // the player moved on their own (a key, a tap) or left the grid: the hop ends there
    if (!now || Math.round(now.x) !== at.x || Math.round(now.y) !== at.y) return;
    playersInGridManager.updatePC(gridId, playerId, { position: { x: step.x, y: step.y } }, { durationMs: ARRIVAL_STEP_MS });
    at = { x: step.x, y: step.y };
    await wait(ARRIVAL_STEP_MS);
  }
}
