/**
 * Dungeon wiring from a repo file (owner 2026-11-11): which dungeon template each Dungeon Entrance
 * cell leads to lives in tuning/dungeonEntrances.json ({ "<gridCoord>": "<template>" }), saved
 * by the editor's Dungeons tab like a layout and deployed by the push. Keyed by cell, so a cell
 * can never lead to two dungeons.
 *
 * On boot (production) syncDungeonWiring() makes every frontier's registry (Frontier.dungeons,
 * read by gridResolver.dungeonTemplateForEntrance) match the file: each template's entry gets
 * exactly the cells the file gives it, an entry the file does not name keeps no entrances
 * (its grid and its players' copies are left alone), and a template wired for the first time
 * gets its registry entry and template instance. A template whose layout file is missing is
 * skipped with a warning, so a half-pushed change never breaks the boot.
 */
const fs = require('fs');
const path = require('path');
const Frontier = require('../models/frontier');
const { createDungeonGrid, dungeonTemplateExists } = require('./dungeonUtils');

const FILE = path.join(__dirname, '../tuning/dungeonEntrances.json');
const strip = (s) => String(s || '').replace(/\.json$/, '');

/** template -> [gridCoord], from the file. */
function wiringByTemplate() {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const out = new Map();
  for (const [coord, template] of Object.entries(raw)) {
    const c = Number(coord);
    if (!Number.isFinite(c) || !template) continue;
    const t = strip(template);
    out.set(t, [...(out.get(t) || []), c].sort((a, b) => a - b));
  }
  return out;
}

const sameCoords = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

async function syncFrontier(frontier, wanted) {
  if (!frontier.dungeons) frontier.dungeons = new Map();
  const changes = [];
  const seen = new Set();
  for (const [id, entry] of frontier.dungeons.entries()) {
    const t = strip(entry.templateUsed);
    const coords = seen.has(t) ? [] : (wanted.get(t) || []); // a duplicate entry of a template keeps none
    seen.add(t);
    const before = (entry.entranceGrids || []).map(Number).sort((a, b) => a - b);
    if (!sameCoords(before, coords)) { entry.entranceGrids = coords; changes.push(`${t}: ${before.length} -> ${coords.length}`); }
    frontier.dungeons.set(id, entry);
  }
  for (const [t, coords] of wanted) {
    if (seen.has(t)) continue;
    if (!dungeonTemplateExists(t)) { console.warn(`⚠️ dungeonEntrances.json: template ${t} has no layout file on this server; skipped`); continue; }
    const grid = await createDungeonGrid(t, { frontierId: frontier._id, settlementId: frontier._id, isTemplate: true });
    const id = grid._id.toString();
    frontier.dungeons.set(id, {
      gridId: id, templateUsed: t, createdAt: new Date(),
      needsReset: false, lastReset: new Date(), sourceValleyGrid: null, entranceGrids: coords,
    });
    changes.push(`${t}: new, ${coords.length}`);
  }
  if (changes.length) {
    frontier.markModified('dungeons');
    await frontier.save();
  }
  return changes;
}

async function syncDungeonWiring() {
  const wanted = wiringByTemplate();
  for (const frontier of await Frontier.find({})) {
    const changes = await syncFrontier(frontier, wanted);
    console.log(changes.length
      ? `🏰 Dungeon wiring synced for ${frontier.name}: ${changes.join('; ')}`
      : `🏰 Dungeon wiring for ${frontier.name} already matches dungeonEntrances.json`);
  }
}

module.exports = { syncDungeonWiring, wiringByTemplate, FILE };
