/**
 * The login scene's little world (docs/login-scene-plan.md §3.4): coyotes and bears wander their
 * clearings, the Lumberjack fells trees near the cottage, and felled trees grow back so the scene
 * never runs out. Purely local and look-only: no server call, no save, no analytics, and none of
 * the game's grid singletons (GlobalGridStateTilesAndResources, NPCsInGridManager) are touched.
 *
 * createSceneDriver(...) returns { start, stop }. Every change hands fresh arrays to onChange
 * ({ resources, npcs }), which LoginScene puts in React state for PixiRenderer, the same way the
 * game's own NPC tick does: the renderer tweens each step (npc.lastStepMs), flips the facing and
 * bobs, so this file only decides where things stand.
 */
import { buildPassability, findPath } from '../Utils/Pathfinding';
import { footprintOf } from '../Utils/footprint';
import { enrichResourceFromMaster } from '../Utils/ResourceHelpers';
import StoryFX from '../Render/PixiRenderer/StoryFX';

const TICK_MS = 100;
const REGROW_MS = [45000, 60000];     // a felled tree comes back after this long
const SWINGS = 4;                      // axe swings per tree
const SWING_MS = 650;
const LUMBER_AREA = { x0: 0, y0: 0, x1: 15, y1: 13 }; // the trees he works: in view on a phone too
const WANDER_PAUSE_MS = [1800, 5500];
const WANDER_LEG = [2, 5];             // steps per leg
const LUMBER_REST_MS = [4000, 7000];   // a breather between trees, so the woodlot stays full

export function createSceneDriver({ tiles, resources, npcs, zones, masterResources, onChange, seed = Date.now() }) {
  // --- seeded randomness: varied between visits, repeatable for a given seed ---------------------
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const between = ([a, b]) => a + rand() * (b - a);
  const pick = (list) => list[Math.floor(rand() * list.length)];

  const master = (type) => masterResources.find((r) => r.type === type);
  let res = resources.map((r) => enrichResourceFromMaster(r, masterResources));
  const isTree = (r) => r && r.category === 'source' && /Tree$/.test(r.type);
  const regrowQueue = []; // { at, tree }

  const actors = npcs.map((n, i) => {
    const m = master(n.type) || {};
    const stepMs = Math.round(1000 / (Number(m.movespeed) > 0 ? Number(m.movespeed) : 1) * (0.9 + rand() * 0.2));
    return {
      ...m,
      id: `scene-${n.type}-${i}`,
      type: n.type,
      position: { x: n.x, y: n.y },
      facing: rand() < 0.5 ? -1 : 1,
      lastStepMs: stepMs,
      stepMs,
      zone: null,
      plan: { mode: 'pause', until: Date.now() + between([300, 2500]) },
      path: [],
      nextStepAt: 0,
    };
  });
  // each wanderer keeps to the zone it starts in (tools/login-scene.js ZONES)
  const zoneList = Object.values(zones || {});
  for (const a of actors) {
    if (a.action !== 'attack') continue;
    a.zone = zoneList.find(([x0, y0, x1, y1]) => a.position.x >= x0 && a.position.x <= x1 && a.position.y >= y0 && a.position.y <= y1) || null;
  }

  // --- passability: the tile, every impassable resource's whole footprint, and the other actors -
  let passBase = null;
  let footprintBlocked = new Set();
  const rebuildPassability = () => {
    passBase = buildPassability({ tiles, resources: res, npcs: [], masterResources, currentPlayer: null });
    footprintBlocked = new Set();
    for (const r of res) {
      if (r.passable !== false) continue;
      const { w, h } = footprintOf(r);
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) footprintBlocked.add(`${r.x + dx},${r.y - dy}`);
    }
  };
  rebuildPassability();
  const occupied = (x, y, self) => actors.some((a) => a !== self && Math.round(a.position.x) === x && Math.round(a.position.y) === y);
  const passable = (x, y) => passBase(x, y) && !footprintBlocked.has(`${x},${y}`);

  const emit = () => onChange({ resources: res, npcs: actors.map((a) => ({ ...a, position: { ...a.position } })) });

  // --- moving one step along a path -----------------------------------------------------------
  const stepAlong = (a, now) => {
    if (now < a.nextStepAt || !a.path.length) return false;
    const next = a.path[0];
    if (!passable(next.x, next.y) || occupied(next.x, next.y, a)) { a.path = []; return false; } // blocked: re-plan
    a.path.shift();
    const dx = next.x - a.position.x;
    const diagonal = dx !== 0 && next.y !== a.position.y;
    if (dx !== 0) a.facing = dx > 0 ? 1 : -1;
    a.lastStepMs = Math.round(a.stepMs * (diagonal ? Math.SQRT2 : 1));
    a.position = { x: next.x, y: next.y };
    a.nextStepAt = now + a.lastStepMs;
    return true;
  };

  // --- wanderers: short legs inside their zone, then a pause ------------------------------------
  const tickWanderer = (a, now) => {
    if (a.path.length) return stepAlong(a, now);
    if (a.plan.mode === 'walk') { a.plan = { mode: 'pause', until: now + between(WANDER_PAUSE_MS) }; return false; }
    if (now < a.plan.until) return false;
    const [x0, y0, x1, y1] = a.zone || [a.position.x - 4, a.position.y - 4, a.position.x + 4, a.position.y + 4];
    const reach = Math.round(between(WANDER_LEG));
    for (let tries = 0; tries < 8; tries++) {
      const gx = Math.max(x0, Math.min(x1, a.position.x + Math.round((rand() * 2 - 1) * reach)));
      const gy = Math.max(y0, Math.min(y1, a.position.y + Math.round((rand() * 2 - 1) * reach)));
      if ((gx === a.position.x && gy === a.position.y) || !passable(gx, gy)) continue;
      const route = findPath(a.position, { x: gx, y: gy }, passable);
      if (route.length && route.length <= reach + 3) { a.path = route; a.plan = { mode: 'walk' }; return stepAlong(a, now); }
    }
    a.plan = { mode: 'pause', until: now + between(WANDER_PAUSE_MS) };
    return false;
  };

  // --- the Lumberjack: walk to a tree, three swings, it falls, rest, the next one ---------------
  const inLumberArea = (t) => t.x >= LUMBER_AREA.x0 && t.x <= LUMBER_AREA.x1 && t.y >= LUMBER_AREA.y0 && t.y <= LUMBER_AREA.y1;
  const chooseTree = (a) => {
    const trees = res.filter((t) => isTree(t) && inLumberArea(t))
      .map((t) => ({ t, d: (t.x - a.position.x) ** 2 + (t.y - a.position.y) ** 2 }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 5);
    // the nearest few, in a random order, so he does not shave the woodlot in one straight line
    for (let i = trees.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [trees[i], trees[j]] = [trees[j], trees[i]]; }
    for (const { t } of trees) {
      const adjacent = Math.max(Math.abs(t.x - a.position.x), Math.abs(t.y - a.position.y)) === 1;
      const route = adjacent ? [] : findPath(a.position, { x: t.x, y: t.y }, passable, { stopShort: true });
      if (adjacent || route.length) return { tree: t, route };
    }
    return null;
  };
  const tickLumberjack = (a, now) => {
    const p = a.plan;
    if (p.mode === 'pause') {
      if (now < p.until) return false;
      const found = chooseTree(a);
      if (!found) { a.plan = { mode: 'pause', until: now + 3000 }; return false; }
      a.path = found.route;
      a.plan = { mode: 'toTree', tree: found.tree };
      return false;
    }
    if (p.mode === 'toTree') {
      if (!res.includes(p.tree)) { a.plan = { mode: 'pause', until: now }; a.path = []; return false; }
      if (a.path.length) return stepAlong(a, now);
      // the last step is still being drawn (the renderer tweens it over lastStepMs, which ends at
      // nextStepAt): he is not at the tree until it lands (owner 2026-11-11)
      if (now < a.nextStepAt) return false;
      const adjacent = Math.max(Math.abs(p.tree.x - a.position.x), Math.abs(p.tree.y - a.position.y)) <= 1;
      if (!adjacent) { a.plan = { mode: 'pause', until: now + 500 }; return false; } // blocked on the way: choose again
      const face = p.tree.x === a.position.x ? a.facing : (p.tree.x > a.position.x ? 1 : -1);
      const turned = face !== a.facing;
      a.facing = face;
      a.plan = { mode: 'chop', tree: p.tree, swings: 0, nextSwingAt: now + 400 };
      return turned;
    }
    if (p.mode === 'chop') {
      if (now < p.nextSwingAt) return false;
      p.swings += 1;
      // each stroke: chips fly back toward him and the tree shivers (owner 2026-11-11; no squash on him)
      StoryFX.treeHit(p.tree.x, p.tree.y, -a.facing);
      if (p.swings < SWINGS) { p.nextSwingAt = now + SWING_MS; return false; }
      // the tree falls; a log pops off and vanishes (the wood goes nowhere), and it will grow back
      const tree = p.tree;
      res = res.filter((r) => r !== tree);
      rebuildPassability();
      StoryFX.woodChip(tree.x, tree.y);
      regrowQueue.push({ at: now + between(REGROW_MS), tree });
      a.plan = { mode: 'pause', until: now + between(LUMBER_REST_MS) };
      return true;
    }
    return false;
  };

  // --- regrowth: a felled tree returns once nobody stands on its tile ---------------------------
  const tickRegrowth = (now) => {
    let changed = false;
    for (let i = regrowQueue.length - 1; i >= 0; i--) {
      const { at, tree } = regrowQueue[i];
      if (now < at || occupied(tree.x, tree.y, null)) continue;
      regrowQueue.splice(i, 1);
      res = [...res, tree];
      changed = true;
    }
    if (changed) rebuildPassability();
    return changed;
  };

  // --- the clock ----------------------------------------------------------------------------------
  let timer = null;
  const tick = () => {
    const now = Date.now();
    let changed = tickRegrowth(now);
    for (const a of actors) {
      if (a.action === 'attack') changed = tickWanderer(a, now) || changed;
      else if (a.type === 'Lumberjack') changed = tickLumberjack(a, now) || changed;
    }
    if (changed) emit();
  };
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  function start() {
    if (timer) return;
    // after a hidden spell, resume from now rather than catching up in one burst
    const now = Date.now();
    for (const a of actors) { a.nextStepAt = Math.max(a.nextStepAt, now); if (a.plan.until) a.plan.until = Math.max(a.plan.until, now); }
    timer = setInterval(tick, TICK_MS);
  }
  function stop() { clearInterval(timer); timer = null; }

  emit();
  return {
    start() { document.addEventListener('visibilitychange', onVisibility); if (!document.hidden) start(); },
    stop() { document.removeEventListener('visibilitychange', onVisibility); stop(); },
  };
}
