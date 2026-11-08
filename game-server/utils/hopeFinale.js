const { recordFootprint } = require('./footprint');
/**
 * The Quest for Hope's finale (owner 2026-11-07; docs/story.md §4, "The ending").
 *
 * The player trades the seven treasures to the Oracle for Hope. The client then plays the moment
 * (game-client GameFeatures/Story/hopeFinale.js): the Oracle's speeches, every quarrel mended,
 * the Oracle rising as a dove, the mountain fading, the Oracle's home revealed, gems falling from
 * the sky. This module holds the rules the server keeps for it; POST /api/story/hope-finale
 * (routes/storyRoutes.js) runs them, and enter-grid re-applies the grid half (applyStoryState).
 *
 *   player.storyFlags.hopeReturned  = date   the finale has happened (everything below follows)
 *   player.storyFlags.hopeGemsDropped = date the 100 gems were placed (once, ever)
 *
 * Relationships, once (reconcileRelationships):
 *   - the player is a friend of every character in RelationshipMatrix.json: met, friend, never a
 *     rival, relscore at least FRIEND_SCORE; crush / love / marriage are kept as they are
 *   - every citizen pair the player's world already holds (player.npcRelationships) becomes
 *     friends (love kept); a pair not yet seen reads as friends too, because the client's seed
 *     turns the matrix's rivals into friends once hope is returned (RelationshipUtils)
 *
 * The Oracle's grid (HOPE_COORD, the player's own copy), on the finale and on every entry after:
 *   - the Oracle NPC is gone (she flew away as a dove)
 *   - the Enormous Mountain is gone, and in the clearing it hid stand the Home of the Oracle (a
 *     Farm House look-alike with no function), a Post House (it sends the backpack home), Snug (so Snug Travel can bring the
 *     player back) and Peter Quince, a woodcutter who chops for the joy of it
 *   - the first time only: ten OneKXP stars (1,000 XP each) on free tiles around the middle of
 *     the old mountain, and 100 Gems on free tiles across the grid. The Oracle's Hope trade itself
 *     pays no XP (owner 2026-11-07: a level-up modal would break into the sequence)
 */
const fs = require('fs');
const path = require('path');
const gridResourceManager = require('./GridResourceManager');
const gridTileManager = require('./GridTileManager');
const masterResources = require('../tuning/resources.json');
const { npcRecord, npcMap } = require('./storyState'); // storyState requires this module lazily (no cycle at load)

const HOPE_COORD = 1014307;          // the Oracle's grid in Hope Mountain (valleyFixedCoord/1014307)
const ORACLE = 'Oracle';
const HOPE = 'Hope';
const MOUNTAIN = 'Enormous Mountain';
const FRIEND_SCORE = 40;             // "Make Friends" needs 35 (interactions.json relscoremin)
const NPC_FRIEND_SCORE = 50;         // a citizen pair's friend seed (RelationshipUtils.seedNPCRelationship)
const GEM_COUNT = 100;
const XP_STAR = 'OneKXP';           // a falling star worth 1,000 XP (resources.json grantsXP), instead of XP on the trade
const XP_STAR_COUNT = 10;
const XP_STAR_CENTRE = { x: 34, y: 26 }; // the middle of where the mountain stood
const XP_STAR_RADIUS = 7;

// The clearing behind the mountain (the mountain's footprint is x 25-44, y 16-35, slate ground).
// Anchors are bottom-left for multi-tile resources, as everywhere else.
const CLEARING = {
  resources: [
    { type: 'Home of the Oracle', x: 33, y: 29 },
    { type: 'Post House', x: 38, y: 29 },
  ],
  npcs: [
    { type: 'Snug', x: 31, y: 30 },
    { type: 'Peter Quince', x: 36, y: 31 },
  ],
};

let matrix = null;
function relationshipMatrix() {
  if (!matrix) {
    try { matrix = JSON.parse(fs.readFileSync(path.join(__dirname, '../../game-client/src/GameFeatures/Relationships/RelationshipMatrix.json'), 'utf-8')); }
    catch (e) { matrix = []; }
  }
  return matrix;
}

const isHopeReturned = (player) => !!player?.storyFlags?.hopeReturned;
const holdsHope = (player) =>
  [...(player?.inventory || []), ...(player?.backpack || [])].some((i) => i?.type === HOPE && i.quantity > 0)
  || (player?.trophies || []).some((t) => t?.name === HOPE);
const sizeOf = (type) => Number(masterResources.find((r) => r.type === type)?.size) || 1;

/** Friends with everyone; romance kept; no rivals, the player's or the citizens'. Mutates; the caller saves. */
function reconcileRelationships(player) {
  player.relationships = player.relationships || [];
  for (const entry of relationshipMatrix()) {
    const name = entry?.type;
    if (!name) continue;
    let rel = player.relationships.find((r) => r?.name === name);
    if (!rel) {
      player.relationships.push({ name, relscore: FRIEND_SCORE, met: true, friend: true, rival: false, clues: ['met', 'friend'] });
      continue;
    }
    rel.met = true;
    rel.friend = true;
    rel.rival = false;
    rel.relscore = Math.max(Number(rel.relscore) || 0, FRIEND_SCORE);
    rel.clues = [...new Set([...(rel.clues || []), 'met', 'friend'])];
  }
  player.markModified?.('relationships');
  for (const row of player.npcRelationships || []) {
    row.relscore = Math.max(Number(row.relscore) || 0, NPC_FRIEND_SCORE);
    row.rival = false;
    row.friend = true;
  }
  if (player.npcRelationships?.length) player.markModified?.('npcRelationships');
}

/** Every tile a resource covers (a multi-tile one grows up and right from its bottom-left anchor). */
function occupiedTiles(resources) {
  const taken = new Set();
  for (const r of resources) {
    const { w, h } = recordFootprint(r, masterResources.find((m) => m.type === r.type)); // size, or sizeX x sizeY
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) taken.add(`${r.x + dx},${r.y - dy}`);
  }
  return taken;
}

const walkable = (tiles, x, y) => !!tiles[y]?.[x] && !['w', 'l'].includes(tiles[y][x]);

/** The nearest spot to (x, y) where a size-s thing fits on walkable, untaken tiles (the spot itself first). */
function spotNear(tiles, taken, x, y, s = 1) {
  const fits = (ax, ay) => {
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) {
      if (!walkable(tiles, ax + dx, ay - dy) || taken.has(`${ax + dx},${ay - dy}`)) return false;
    }
    return true;
  };
  for (let radius = 0; radius <= 6; radius++) {
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      if (fits(x + dx, y + dy)) return { x: x + dx, y: y + dy };
    }
  }
  return null;
}
const claim = (taken, x, y, s = 1) => { for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) taken.add(`${x + dx},${y - dy}`); };

/** n random free tiles (walkable, nothing on them, not the given extra tiles); `near` = { x, y, r } keeps them within r. */
function freeTiles(tiles, taken, n, near = null) {
  const free = [];
  for (let y = 0; y < tiles.length; y++) for (let x = 0; x < (tiles[y] || []).length; x++) {
    if (near && Math.hypot(x - near.x, y - near.y) > near.r) continue;
    if (walkable(tiles, x, y) && !taken.has(`${x},${y}`)) free.push({ x, y });
  }
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  return free.slice(0, n);
}

/**
 * Put the player's copy of the Oracle's grid in its after-Hope state (no save). Returns what
 * changed: { changed, removedNpcIds, removedResources, addedResources, addedNpcs, gems }.
 * `dropGems` places the 100 gems (the finale route, once).
 */
function applyHopeGrid(grid, player, { dropGems = false, avoid = [] } = {}) {
  const out = { changed: false, removedNpcIds: [], removedResources: [], addedResources: [], addedNpcs: [], gems: [] };
  if (!grid || Number(grid.gridCoord) !== HOPE_COORD || !isHopeReturned(player)) return out;

  const npcs = npcMap(grid);
  for (const [id, n] of [...npcs.entries()]) {
    if (n?.type === ORACLE) { npcs.delete(id); out.removedNpcIds.push(String(id)); }
  }

  let resources = gridResourceManager.getResources(grid);
  for (const r of resources.filter((res) => res.type === MOUNTAIN)) {
    gridResourceManager.updateResource(grid, { x: r.x, y: r.y, type: null });
    out.removedResources.push({ type: r.type, x: r.x, y: r.y });
  }

  resources = gridResourceManager.getResources(grid);
  const tiles = gridTileManager.getTiles(grid);
  const taken = occupiedTiles(resources);
  for (const n of npcs.values()) if (n?.position) taken.add(`${Math.floor(n.position.x)},${Math.floor(n.position.y)}`);
  for (const a of avoid) if (Number.isInteger(a?.x) && Number.isInteger(a?.y)) taken.add(`${a.x},${a.y}`);

  for (const want of CLEARING.resources) {
    if (resources.some((r) => r.type === want.type)) continue;
    const s = sizeOf(want.type);
    const at = spotNear(tiles, taken, want.x, want.y, s);
    if (!at) continue;
    gridResourceManager.updateResource(grid, { type: want.type, x: at.x, y: at.y });
    claim(taken, at.x, at.y, s);
    out.addedResources.push({ type: want.type, x: at.x, y: at.y });
  }
  for (const want of CLEARING.npcs) {
    if ([...npcs.values()].some((n) => n?.type === want.type)) continue;
    const at = spotNear(tiles, taken, want.x, want.y, 1);
    if (!at) continue;
    const rec = npcRecord(want.type, at.x, at.y);
    npcs.set(rec.id, rec);
    claim(taken, at.x, at.y);
    out.addedNpcs.push(rec);
  }

  if (dropGems && !player.storyFlags?.hopeGemsDropped) {
    // ten 1,000 XP stars around the middle of the old mountain, then the gems over the whole grid
    for (const t of freeTiles(tiles, taken, XP_STAR_COUNT, { ...XP_STAR_CENTRE, r: XP_STAR_RADIUS })) {
      gridResourceManager.updateResource(grid, { type: XP_STAR, x: t.x, y: t.y });
      taken.add(`${t.x},${t.y}`);
      out.gems.push({ type: XP_STAR, x: t.x, y: t.y });
    }
    for (const t of freeTiles(tiles, taken, GEM_COUNT)) {
      gridResourceManager.updateResource(grid, { type: 'Gem', x: t.x, y: t.y });
      out.gems.push({ type: 'Gem', x: t.x, y: t.y });
    }
    player.storyFlags = { ...(player.storyFlags || {}), hopeGemsDropped: new Date() };
    player.markModified?.('storyFlags');
  }

  out.changed = !!(out.removedNpcIds.length || out.removedResources.length || out.addedResources.length || out.addedNpcs.length || out.gems.length);
  if (out.removedNpcIds.length || out.addedNpcs.length) {
    grid.NPCsInGrid = npcs;
    grid.markModified?.('NPCsInGrid');
    grid.NPCsInGridLastUpdated = new Date();
  }
  return out;
}

const SNUG_SPOT = { x: CLEARING.npcs[0].x, y: CLEARING.npcs[0].y };

module.exports = { HOPE_COORD, SNUG_SPOT, ORACLE, HOPE, MOUNTAIN, GEM_COUNT, isHopeReturned, holdsHope, reconcileRelationships, applyHopeGrid };
