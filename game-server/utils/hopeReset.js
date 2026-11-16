/**
 * The Quest for Hope begins again every season (owner 2026-11-16, docs/season-reset.md).
 *
 * Player half (seasonReset, for every player at once): the seven artifacts and Hope leave the
 * backpack and the warehouse, `hopeFound` is emptied (so the shops offer the artifacts again),
 * `storyFlags.hopeReturned` is cleared (the Oracle is back; `hopeGemsDropped` stays: the gems fall
 * once, ever) and Elbow's artifact quests (every quest with a "Find <artifact or Hope>" goal) leave
 * the active and completed lists, so they are offered again with their XP. Keys, skills,
 * relationships, woken characters and every other quest and flag are kept.
 *
 * Grid half (gridResolver.applySeasonCatchUp, a Valley1 / Valley2 copy's first entry of the new
 * season): any guardian or artifact pickup the grid's fixed layout places and the copy lacks is
 * put back at its layout spot, or the nearest free one (a player may have built on it); artifact
 * pickups only on a layout that also has a guardian. Valley3
 * copies are rebuilt whole by the reset, and dungeons reset on their own clock.
 */
const fs = require('fs');
const path = require('path');
const { hopeArtifacts } = require('./hopeArtifacts');
const { HOPE, occupiedTiles, spotNear, claim } = require('./hopeFinale');
const { npcRecord, npcMap } = require('./storyState');
const gridResourceManager = require('./GridResourceManager');
const gridTileManager = require('./GridTileManager');
const masterResources = require('../tuning/resources.json');

const QUESTS = path.join(__dirname, '..', 'tuning', 'quests', 'questsEN.json');
const LAYOUTS = path.join(__dirname, '..', 'layouts', 'gridLayouts', 'valleyFixedCoord');

// The enemies that stand between a player and an artifact: put back with the artifacts.
const GUARDIANS = ['Great Bear', 'Cerberus'];

/** The seven artifacts and Hope. */
const hopeItems = () => new Set([...hopeArtifacts(), HOPE]);

/** Titles of the quests that ask the player to Find an artifact or Hope (read fresh: the editor saves the sheet live). */
function hopeQuestTitles() {
  const items = hopeItems();
  try {
    const quests = JSON.parse(fs.readFileSync(QUESTS, 'utf8'));
    return new Set(quests.filter((q) => [1, 2, 3].some((i) => q[`goal${i}action`] === 'Find' && items.has(q[`goal${i}item`])))
      .map((q) => q.title));
  } catch (e) {
    console.error('hopeReset: could not read quests', e.message);
    return new Set();
  }
}

/**
 * The update that starts a player's Quest for Hope again, or null when there is nothing to undo.
 * `summary` counts what it takes away (for the reset's log and the dry run).
 */
function hopeResetFor(player, items = hopeItems(), titles = hopeQuestTitles()) {
  const keep = (list) => (list || []).filter((i) => !(i && items.has(i.type)));
  const taken = [...(player.inventory || []), ...(player.backpack || [])]
    .filter((i) => i && items.has(i.type) && i.quantity > 0).map((i) => i.type);
  const active = (player.activeQuests || []).filter((q) => !titles.has(q?.questId));
  const completed = (player.completedQuests || []).filter((q) => !titles.has(q?.questId));
  const questsRemoved = (player.activeQuests || []).length - active.length + (player.completedQuests || []).length - completed.length;
  const found = Array.isArray(player.hopeFound) ? player.hopeFound.length : 0;
  const returned = !!player.storyFlags?.hopeReturned;
  if (!taken.length && !questsRemoved && !found && !returned) return { update: null, summary: null };

  const update = {
    $set: { inventory: keep(player.inventory), backpack: keep(player.backpack), activeQuests: active, completedQuests: completed, hopeFound: [] },
  };
  if (returned) update.$unset = { 'storyFlags.hopeReturned': '' };
  return { update, summary: { taken, questsRemoved, found, returned } };
}

const layoutCache = new Map();
/** What a fixed layout places that the reset puts back: [{ type, x, y, npc }]. */
function restorablesFor(gridCoord) {
  if (layoutCache.has(gridCoord)) return layoutCache.get(gridCoord);
  let out = [];
  try {
    const file = path.join(LAYOUTS, `${gridCoord}.json`);
    if (fs.existsSync(file)) {
      const wanted = new Map(masterResources
        .filter((r) => r.layoutkey && (hopeArtifacts().has(r.type) || GUARDIANS.includes(r.type)))
        .map((r) => [r.layoutkey, r]));
      const layout = JSON.parse(fs.readFileSync(file, 'utf8'));
      (layout.resources || []).forEach((row, y) => (row || []).forEach((key, x) => {
        const def = wanted.get(key);
        if (def) out.push({ type: def.type, x, y, npc: def.category === 'npc' });
      }));
      // an artifact pickup comes back only where a guardian keeps it (Cerberus and the Brief Candle);
      // a layout that lays artifacts out unguarded is the test grid (1016101, CLAUDE.md), not part of the hunt
      if (!out.some((o) => o.npc)) out = [];
    }
  } catch (e) {
    console.error(`hopeReset: layout ${gridCoord}`, e.message);
    out = [];
  }
  layoutCache.set(gridCoord, out);
  return out;
}

/** Put the Quest for Hope's guardians and artifacts back on a valley copy (no save). Returns what was added. */
function restoreHopeGuardians(grid) {
  const want = restorablesFor(Number(grid.gridCoord));
  const added = [];
  if (!want.length) return added;
  const npcs = npcMap(grid);
  const resources = gridResourceManager.getResources(grid);
  const tiles = gridTileManager.getTiles(grid);
  const taken = occupiedTiles(resources);
  for (const n of npcs.values()) if (n?.position) taken.add(`${Math.floor(n.position.x)},${Math.floor(n.position.y)}`);

  for (const w of want) {
    const present = w.npc
      ? [...npcs.values()].some((n) => n?.type === w.type)
      : resources.some((r) => r.type === w.type);
    if (present) continue;
    const at = spotNear(tiles, taken, w.x, w.y, 1);
    if (!at) continue;
    if (w.npc) {
      const rec = npcRecord(w.type, at.x, at.y);
      npcs.set(rec.id, rec);
    } else {
      gridResourceManager.updateResource(grid, { type: w.type, x: at.x, y: at.y });
    }
    claim(taken, at.x, at.y);
    added.push({ type: w.type, x: at.x, y: at.y });
  }
  if (added.some((a) => want.find((w) => w.type === a.type)?.npc)) {
    grid.NPCsInGrid = npcs;
    grid.markModified?.('NPCsInGrid');
    grid.NPCsInGridLastUpdated = new Date();
  }
  return added;
}

module.exports = { hopeItems, hopeQuestTitles, hopeResetFor, restoreHopeGuardians, restorablesFor, GUARDIANS };
