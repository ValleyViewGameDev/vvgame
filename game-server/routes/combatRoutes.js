/**
 * Combat outcomes (docs/audits/combat-and-npc-review-2026-10-07.md, Track 2).
 *
 * The fight is simulated on the client; the server hears about OUTCOMES through this route and
 * checks what it can reason about: the grid is the player's, the NPC exists there and is
 * hostile, and kills are not arriving faster than the player's server-derived stats allow.
 * It then does everything a kill pays out in one write: removes the NPC, grants the template's
 * xp, places the drop on a free tile, and advances Kill quests. The client never calls
 * /addXP, /update-grid or /remove-single-npc for a kill any more.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const Player = require('../models/player');
const Grid = require('../models/grid');
const gridResourceManager = require('../utils/GridResourceManager');
const gridTileManager = require('../utils/GridTileManager');
const masterResources = require('../tuning/resources.json');
const { derivedStats, attackCooldownMs } = require('../utils/combatStats');
const { publicPlayer } = require('../utils/publicPlayer');
const { recordQuestCompleted, recordLevelUps, recordEnemyKill } = require('../utils/analytics');
const { applyTrophy } = require('../utils/trophyUtils');

const questsPath = path.join(__dirname, '../tuning/quests/questsEN.json');
let questDefs = null;
const loadQuestDefs = () => {
  if (!questDefs) { try { questDefs = JSON.parse(fs.readFileSync(questsPath, 'utf-8')); } catch (e) { questDefs = []; } }
  return questDefs;
};

const fail = (res, status, reason) => res.status(status).json({ error: reason, reason });

// Kill-rate bound, per process (Render runs one). Swing time is a running ledger, not a gap since
// the last kill: wounds stay client-side and a player fights a pack at once (Demons around
// Cerberus), so a kill may land one swing after the previous one when its swings were spent
// earlier. Each kill's swings are laid end to end after the previous kills' (`busyUntil`),
// starting no earlier than KILL_CREDIT_MS ago; the kill stands if they fit before now (owner
// 2026-11-06: the old gap check refused a boss finished just after a pack kill, losing its xp
// and drop).
const KILL_CREDIT_MS = 5 * 60 * 1000;
const busyUntil = new Map();

// Spawners are not targets (BL-19): invisible, passable, indestructible; only what they spawn is fought
const isHostile = (def) => def && def.action === 'attack';

/** The grid belongs to this player: their homestead, or their own copy of a town/valley/dungeon. */
function ownsGrid(grid, player) {
  const pid = String(player._id);
  if (grid.ownerId && String(grid.ownerId) === pid) return true;
  if (grid.gridType === 'homestead' && player.gridId && String(player.gridId) === String(grid._id)) return true;
  return false;
}

/** Nearest free walkable tile to (x, y) (not water/lava, no resource), the tile itself first. */
function freeTileNear(grid, x, y, avoid) {
  const tiles = gridTileManager.getTiles(grid) || [];
  const resources = gridResourceManager.getResources(grid) || [];
  const taken = new Set(resources.map((r) => `${r.x},${r.y}`));
  if (avoid) taken.add(`${avoid.x},${avoid.y}`);
  const free = (tx, ty) => tiles[ty]?.[tx] && !['w', 'l'].includes(tiles[ty][tx]) && !taken.has(`${tx},${ty}`);
  if (free(x, y)) return { x, y };
  for (let radius = 1; radius <= 3; radius++) {
    let best = null; let bestD = Infinity;
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius || !free(x + dx, y + dy)) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x: x + dx, y: y + dy }; }
    }
    if (best) return best;
  }
  return { x, y };
}

/** Advance every active Kill quest for this NPC type; returns true if any changed. */
function advanceKillQuests(player, npcType) {
  const defs = loadQuestDefs();
  let changed = false;
  for (const quest of player.activeQuests || []) {
    if (!quest || quest.completed || quest.rewardCollected) continue;
    const def = defs.find((q) => q.title === quest.questId) || quest;
    const progress = { ...(quest.progress || {}) };
    let goals = 0; let done = 0;
    for (let i = 1; i <= 3; i++) {
      const action = def[`goal${i}action`]; const item = def[`goal${i}item`]; const qty = def[`goal${i}qty`];
      if (!action || !item || !qty) continue;
      goals++;
      if (action === 'Kill' && item === npcType) {
        progress[`goal${i}`] = Math.min((progress[`goal${i}`] || 0) + 1, qty);
        changed = true;
      }
      if ((progress[`goal${i}`] || 0) >= qty) done++;
    }
    if (!changed) continue;
    quest.progress = progress;
    if (goals > 0 && done === goals && !quest.completed) {
      quest.completed = true;
      recordQuestCompleted?.(player._id, quest.questId)?.catch?.(() => {});
    }
  }
  if (changed) player.markModified('activeQuests');
  return changed;
}

/**
 * POST /api/action/npc-kill { playerId, gridId, npcId, dropAt?: {x, y} }
 * → { success, xpGained, xp, drop: {type, x, y} | null, activeQuests }
 */
router.post('/action/npc-kill', async (req, res) => {
  const { playerId, gridId, npcId, dropAt } = req.body || {};
  if (!playerId || !gridId || !npcId) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');

    const npcs = grid.NPCsInGrid instanceof Map ? grid.NPCsInGrid : new Map(Object.entries(grid.NPCsInGrid || {}));
    const npc = npcs.get(String(npcId));
    if (!npc) return fail(res, 404, 'no-npc');
    const def = masterResources.find((r) => r.type === npc.type && r.category === 'npc');
    if (!isHostile(def)) return fail(res, 400, 'not-hostile');

    // Kill-rate bound from the server's own view of the player's stats: a kill cannot land
    // sooner than the swings it needs, at the fastest swing the tuning allows.
    const stats = derivedStats(player);
    const maxhp = Number(def.maxhp || npc.maxhp || 1); // the tuning's: the client saves the NPC record (BL-20)
    const minHits = Math.max(1, Math.ceil(maxhp / (stats.damage + 6)));
    const needMs = (minHits - 1) * attackCooldownMs(stats.speed);
    const now = Date.now();
    const key = String(player._id);
    const done = Math.max(busyUntil.get(key) || 0, now - KILL_CREDIT_MS) + needMs;
    if (done > now) return fail(res, 429, 'too-fast');
    busyUntil.set(key, done);

    // 1. The NPC is gone
    npcs.delete(String(npcId));
    grid.NPCsInGrid = npcs;
    grid.NPCsInGridLastUpdated = new Date();

    // 2. The drop, on a free tile (the client's suggestion when it is free)
    let drop = null;
    if (def.output) {
      const want = dropAt && Number.isInteger(dropAt.x) && Number.isInteger(dropAt.y) ? dropAt : null;
      const base = { x: Math.floor(npc.position?.x ?? 0), y: Math.floor(npc.position?.y ?? 0) };
      const at = freeTileNear(grid, want ? want.x : base.x, want ? want.y : base.y, player.location?.g && String(player.location.g) === String(grid._id) ? { x: player.location.x, y: player.location.y } : null);
      gridResourceManager.updateResource(grid, { type: def.output, x: at.x, y: at.y });
      drop = { type: def.output, x: at.x, y: at.y };
    }
    await grid.save({ validateBeforeSave: false });

    // 3. XP and quests on the player
    const xpGained = Number(def.xp) || 0;
    recordLevelUps(player._id, player.xp || 0, (player.xp || 0) + xpGained).catch(() => {}); // pacing (OB-7)
    player.xp = (player.xp || 0) + xpGained;
    advanceKillQuests(player, npc.type);
    // Duke Angelo's kill earns its trophy here, with the kill (the client no longer claims it)
    const trophies = [];
    if (npc.type === 'Duke Angelo') {
      const t = applyTrophy(player, 'Kill the Duke', 1);
      if (t.success) trophies.push({ name: 'Kill the Duke', trophy: t.trophy, isNewMilestone: t.isNewMilestone });
    }
    player.lastActive = new Date();
    await player.save();
    recordEnemyKill(player._id).catch(() => {}); // analytics day flag, fire-and-forget

    const pub = publicPlayer(player);
    return res.json({ success: true, xpGained, xp: player.xp, drop, activeQuests: pub.activeQuests, trophies, playerTrophies: pub.trophies });
  } catch (err) {
    console.error('❌ npc-kill failed:', err);
    return res.status(500).json({ error: 'npc-kill failed', detail: err.message });
  }
});

module.exports = router;
