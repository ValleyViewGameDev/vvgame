/**
 * avatarCatalogue - the server's view of the avatar parts and palettes
 * (tuning/avatarParts.json, tuning/avatarPalettes.json; docs/avatar-plan.md §2.7).
 *
 * Validates a spec the way the client's avatarLook.validateSpec does (ids exist, slot
 * matches, tier allowed, paid parts owned) so nothing the picker could not choose reaches a
 * record, and prices a part for /player/avatar-part. Cached at boot like the other tuning
 * files (restart to pick up a sheet save).
 */
const path = require('path');
const fs = require('fs');

const PARTS_FILE = path.join(__dirname, '../tuning/avatarParts.json');
const PALETTES_FILE = path.join(__dirname, '../tuning/avatarPalettes.json');

const SLOT_OF_SPEC_KEY = { skin: 'skin', hair: 'hair', facialHair: 'facialHair', eyes: 'eyes', hat: 'hat', top: 'top' };
const PALETTE_OF_SPEC_KEY = { skinTone: 'skinTone', hairColor: 'hairColor', eyeColor: 'eyeColor' };
const REQUIRED_PARTS = ['skin', 'eyes']; // every other slot has a None (No Clothes included)
const SPEC_VERSION = 1;

let cache = null;
function load() {
  if (cache) return cache;
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return []; } };
  cache = { catalogue: read(PARTS_FILE), palettes: read(PALETTES_FILE) };
  return cache;
}
const byId = (rows, id) => (id ? rows.find((r) => r && r.id === id) || null : null);

/** The starter look (mirrors avatarLook.defaultSpec). */
function defaultSpec() {
  const { catalogue, palettes } = load();
  const inSlot = (slot) => catalogue.filter((r) => r.slot === slot);
  const firstFree = (slot) => inSlot(slot).find((p) => (p.tier || 'free') === 'free' && p.file)?.id || null;
  const swatches = (slot) => palettes.filter((r) => r.slot === slot);
  const tones = swatches('skinTone');
  return {
    v: SPEC_VERSION,
    skin: firstFree('skin'), skinTone: (tones[1] || tones[0])?.id || null, // the second lightest
    hair: firstFree('hair'), hairColor: swatches('hairColor')[0]?.id || null,
    eyes: firstFree('eyes'), eyeColor: swatches('eyeColor')[0]?.id || null,
    facialHair: inSlot('facialHair').find((p) => !p.file)?.id || null,
    hat: inSlot('hat').find((p) => !p.file)?.id || null,
    top: firstFree('top'),
  };
}

/** Only the known keys, strings or null. */
function cleanSpec(spec) {
  const out = { v: SPEC_VERSION };
  for (const key of [...Object.keys(SLOT_OF_SPEC_KEY), ...Object.keys(PALETTE_OF_SPEC_KEY)]) out[key] = spec && typeof spec[key] === 'string' ? spec[key] : null;
  return out;
}

/** Problems with a spec for THIS player (empty = valid). */
function validateSpec(spec, { owned = [], allowNpc = false } = {}) {
  const { catalogue, palettes } = load();
  const problems = [];
  if (!spec || typeof spec !== 'object') return ['spec missing'];
  const ownedSet = new Set(owned);
  const tierOk = (row, what) => {
    const tier = row.tier || 'free';
    if (tier === 'npc' && !allowNpc) problems.push(`${what} ${row.id} is not available to players`);
    else if (tier === 'paid' && !ownedSet.has(row.id)) problems.push(`${what} ${row.id} is not owned`);
  };
  for (const [key, slot] of Object.entries(SLOT_OF_SPEC_KEY)) {
    const id = spec[key];
    if (id == null) { if (REQUIRED_PARTS.includes(slot)) problems.push(`${key} is required`); continue; }
    const row = byId(catalogue, id);
    if (!row) { problems.push(`${key}: unknown part ${id}`); continue; }
    if (row.slot !== slot) { problems.push(`${key}: ${id} is a ${row.slot}`); continue; }
    tierOk(row, key);
  }
  for (const [key, slot] of Object.entries(PALETTE_OF_SPEC_KEY)) {
    const id = spec[key];
    if (id == null) { problems.push(`${key} is required`); continue; }
    const row = byId(palettes, id);
    if (!row) { problems.push(`${key}: unknown colour ${id}`); continue; }
    if (row.slot !== slot) { problems.push(`${key}: ${id} is a ${row.slot} colour`); continue; }
    tierOk(row, key);
  }
  return problems;
}

/** A buyable part or swatch: { id, gemcost } or null (unknown, free, npc, or unpriced). */
function purchasable(id) {
  const { catalogue, palettes } = load();
  const row = byId(catalogue, id) || byId(palettes, id);
  if (!row || (row.tier || 'free') !== 'paid') return null;
  const gemcost = Number(row.gemcost);
  if (!Number.isFinite(gemcost) || gemcost <= 0) return null;
  return { id: row.id, gemcost };
}

/** Every paid id in the catalogue and palettes right now (the migration's launch set). */
function paidIds() {
  const { catalogue, palettes } = load();
  return [...catalogue, ...palettes].filter((r) => r && r.tier === 'paid').map((r) => r.id);
}

function reload() { cache = null; return load(); }

module.exports = { load, reload, defaultSpec, cleanSpec, validateSpec, purchasable, paidIds, SPEC_VERSION };
