/**
 * Pathfinding: A* over the current 64x64 grid for tap-to-walk.
 *
 * Passability mirrors PlayerMovement.isTileValidForPlayer: the tile type must be passable
 * per masterResources (a player in a boat may only use water), a resource anchored on the
 * tile with `passable === false` blocks it unless it is a door the player holds the key for
 * (Doors.checkDoorAccess, the same rule keyboard movement applies; the step through the
 * door still runs canPassThroughDoor with its sound and message), and an impassable NPC
 * blocks the tile it stands on. Eight directions, no corner cutting (a diagonal step
 * needs both orthogonal neighbours open), octile heuristic.
 *
 * If the goal itself is blocked (a tree, a building, an NPC) the path ends on the nearest
 * reachable tile adjacent to it, which is what "tap the thing you want to reach" means.
 *
 * Returns the steps AFTER the start tile, or [] when start === goal or nothing is reachable.
 */

import { checkDoorAccess } from '../GameFeatures/Doors/Doors';

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
    if (npc && npc.passable === false && npc.position) {
      blockedByNpc.add(key(Math.floor(npc.position.x), Math.floor(npc.position.y)));
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

/**
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} goal
 * @param {(x:number,y:number)=>boolean} passable
 * @returns {Array<{x:number,y:number}>}
 */
export function findPath(start, goal, passable) {
  if (!start || !goal) return [];
  const sx = Math.round(start.x), sy = Math.round(start.y);
  const gx = Math.round(goal.x), gy = Math.round(goal.y);
  if (sx === gx && sy === gy) return [];

  // Targets: the goal itself when open, otherwise its open neighbours
  const targets = new Set();
  if (passable(gx, gy)) {
    targets.add(key(gx, gy));
  } else {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = gx + dx, ny = gy + dy;
        if (passable(nx, ny)) targets.add(key(nx, ny));
      }
    }
  }
  if (targets.size === 0) return [];
  if (targets.has(key(sx, sy))) return []; // already adjacent to a blocked goal

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
        // No corner cutting: a diagonal needs both orthogonal neighbours open
        if (dx !== 0 && dy !== 0 && (!passable(x + dx, y) || !passable(x, y + dy))) continue;
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
  return [];
}
