/**
 * Pathfinding: A* over the current 64x64 grid for tap-to-walk.
 *
 * Passability mirrors PlayerMovement.isTileValidForPlayer: the tile type must be passable
 * per masterResources (a player in a boat may only use water), a resource anchored on the
 * tile with `passable === false` blocks it unless it is a door the player holds the key for
 * (Doors.checkDoorAccess, the same rule keyboard movement applies; the step through the
 * door still runs canPassThroughDoor with its sound and message), and an impassable NPC
 * blocks the tile it stands on. Eight directions, and a diagonal only needs its target tile
 * open, exactly like keyboard movement (holding two arrows): it may slip between two trees.
 * Octile heuristic. Used for the player's tap-to-walk and every NPC route (followPath).
 *
 * If the goal itself is blocked (a tree, a building, an NPC) the path ends on the nearest
 * reachable tile adjacent to it, which is what "tap the thing you want to reach" means.
 *
 * Returns the steps AFTER the start tile, or [] when start === goal or nothing is reachable.
 */

import { checkDoorAccess } from '../GameFeatures/Doors/Doors.js';
import { npcCells } from './npcFootprint';

const SQRT2 = Math.SQRT2;
const MAX_EXPANSIONS = 6000;   // the whole grid is 4,096 tiles; this bounds a hopeless search
const GRID = 64;

function key(x, y) { return y * GRID + x; }

/** Build a synchronous passability test for the current grid. */
export function buildPassability({ tiles, resources, npcs, masterResources, currentPlayer }) {
  const tilePassable = new Map();
  for (const r of masterResources || []) {
    if (r.category === 'tile' || (typeof r.type === 'string' && r.type.length === 1)) {
      tilePassable.set(r.type, !!r.passable);
    }
  }
  const blockedByResource = new Set();
  for (const res of resources || []) {
    if (!res || res.passable !== false || !Number.isInteger(res.x) || !Number.isInteger(res.y)) continue;
    // A door opens for a player who has its key: route through it, as a key press would
    if (res.action === 'door' && checkDoorAccess(res, currentPlayer, null)?.hasAccess) continue;
    blockedByResource.add(key(res.x, res.y));
  }
  const blockedByNpc = new Set();
  const npcList = Array.isArray(npcs) ? npcs : Object.values(npcs || {});
  for (const npc of npcList) {
    // Spawners are passable (BL-19), whatever their row or saved record says
    if (npc && npc.passable === false && npc.action !== 'spawn' && npc.position) {
      for (const c of npcCells(npc)) blockedByNpc.add(key(c.x, c.y)); // its whole body (a 2 x 2 Phoenix blocks four tiles)
    }
  }
  const inBoat = !!currentPlayer?.isinboat;
  const rows = tiles?.length || 0;
  const cols = tiles?.[0]?.length || 0;

  return (x, y) => {
    if (x < 0 || y < 0 || y >= rows || x >= cols) return false;
    const tileType = tiles[y][x];
    if (!tileType) return false;
    if (inBoat) return tileType === 'w';
    const passable = tilePassable.get(tileType);
    if (!passable) return false;
    const k = key(x, y);
    if (blockedByResource.has(k)) return false;
    if (blockedByNpc.has(k)) return false;
    return true;
  };
}

function octile(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
}

const SIDE_DETOUR = 6; // `beside`: extra steps worth spending to stand in the NPC's row

/**
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} goal
 * @param {(x:number,y:number)=>boolean} passable
 * @param {{stopShort?:boolean, beside?:boolean}} [opts] stopShort: end beside the goal, never on it;
 *   beside: the player walking up to an NPC, ending in its row (see below)
 * @returns {Array<{x:number,y:number}>}
 */
export function findPath(start, goal, passable, { stopShort = false, beside = false } = {}) {
  if (!start || !goal) return [];
  const sx = Math.round(start.x), sy = Math.round(start.y);
  const gx = Math.round(goal.x), gy = Math.round(goal.y);
  if (sx === gx && sy === gy) return [];

  // `beside` (the player walking up to a tapped NPC, owner 2026-11-10): end on the NPC's LEFT or
  // RIGHT, in its row, so the two stand side by side and face each other. Whichever side is the
  // shorter walk; a tile above or below (then a diagonal) only when neither side can be reached,
  // or when getting to a side would cost more than SIDE_DETOUR extra steps.
  if (beside) {
    const open = (list) => new Set(list.filter(([x, y]) => passable(x, y)).map(([x, y]) => key(x, y)));
    const tiers = [
      open([[gx - 1, gy], [gx + 1, gy]]),
      open([[gx, gy - 1], [gx, gy + 1]]),
      open([[gx - 1, gy - 1], [gx + 1, gy - 1], [gx - 1, gy + 1], [gx + 1, gy + 1]]),
    ];
    if (tiers[0].has(key(sx, sy))) return [];
    const side = tiers[0].size ? search(sx, sy, gx, gy, tiers[0], passable) : null;
    let other = null;
    for (const t of tiers.slice(1)) {
      if (!t.size) continue;
      if (t.has(key(sx, sy))) { other = []; break; }
      other = search(sx, sy, gx, gy, t, passable);
      if (other) break;
    }
    if (side && (!other || side.length <= other.length + SIDE_DETOUR)) return side;
    if (other) return other;
    if (passable(gx, gy)) return search(sx, sy, gx, gy, new Set([key(gx, gy)]), passable) || []; // a pocket (see below)
    return [];
  }

  // Targets: the goal itself when open, otherwise its open neighbours. `stopShort` (walking up
  // to an NPC) never steps onto the goal: it prefers the four orthogonal neighbours, which are
  // within any interaction range, and falls back to the diagonals.
  const targets = new Set();
  if (!stopShort && passable(gx, gy)) {
    targets.add(key(gx, gy));
  } else {
    const ring = (diagonal) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if ((dx !== 0 && dy !== 0) !== diagonal) continue;
          const nx = gx + dx, ny = gy + dy;
          if (passable(nx, ny)) targets.add(key(nx, ny));
        }
      }
    };
    ring(false);
    if (!stopShort || targets.size === 0) ring(true);
    // An NPC standing in a pocket with no open neighbour (NPCs roam over resources): the
    // goal tile itself is the only way to reach it, better than "can't go that way"
    if (stopShort && targets.size === 0 && passable(gx, gy)) targets.add(key(gx, gy));
  }
  if (targets.size === 0) return [];
  if (targets.has(key(sx, sy))) return []; // already adjacent to a blocked goal
  return search(sx, sy, gx, gy, targets, passable) || [];
}

/**
 * A route to the nearest of a given set of tiles (a multi-tile NPC walking up to the player: the
 * tiles are the anchors where its body touches the player's tile, Utils/npcFootprint.anchorsBeside).
 * `passable` is asked about anchors, so it must answer for the whole body. Steps after the
 * start, or [] when already there or nothing is reachable.
 */
export function findPathToAny(start, goal, targetTiles, passable) {
  if (!start || !goal) return [];
  const sx = Math.round(start.x), sy = Math.round(start.y);
  const targets = new Set();
  for (const t of targetTiles || []) if (t.x >= 0 && t.y >= 0 && t.x < GRID && t.y < GRID && passable(t.x, t.y)) targets.add(key(t.x, t.y));
  if (!targets.size || targets.has(key(sx, sy))) return [];
  return search(sx, sy, Math.round(goal.x), Math.round(goal.y), targets, passable) || [];
}

/** A* from (sx, sy) to the nearest tile in `targets` (keys), heuristic toward (gx, gy); the path, or null. */
function search(sx, sy, gx, gy, targets, passable) {

  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();
  // Binary heap on f; entries [f, g, x, y]
  const open = [];
  const push = (entry) => {
    open.push(entry);
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (open[p][0] <= open[i][0]) break;
      [open[p], open[i]] = [open[i], open[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open.pop();
    if (open.length) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i], open[m]];
        i = m;
      }
    }
    return top;
  };

  const startKey = key(sx, sy);
  gScore.set(startKey, 0);
  push([octile(sx, sy, gx, gy), 0, sx, sy]);
  let expansions = 0;

  while (open.length && expansions < MAX_EXPANSIONS) {
    const [, g, x, y] = pop();
    const k = key(x, y);
    if (closed.has(k)) continue;
    closed.add(k);
    expansions++;

    if (targets.has(k)) {
      const path = [];
      let cur = k;
      while (cur !== startKey) {
        path.push({ x: cur % GRID, y: Math.floor(cur / GRID) });
        cur = cameFrom.get(cur);
      }
      return path.reverse();
    }

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (!passable(nx, ny)) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = g + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          cameFrom.set(nk, k);
          push([ng + octile(nx, ny, gx, gy), ng, nx, ny]);
        }
      }
    }
  }
  return null;
}
