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

/**
 * The DEFAULT look (mirrors avatarLook.defaultSpec): what a player who has not made one looks like
 * (owner 2026-11-10: the man, no clothes, the first hair, brown hair, green eyes). The face and the
 * colours are the rows marked `default` in the tuning files; every other slot is the first free
 * part of that face's body, a None where the slot has one.
 */
function defaultSpec() {
  const { catalogue, palettes } = load();
  const inSlot = (slot) => catalogue.filter((r) => r.slot === slot);
  const free = (p) => (p.tier || 'free') === 'free' && p.file;
  const face = inSlot('skin').find((p) => p.default && free(p)) || inSlot('skin').find(free);
  const body = face?.body || null;
  // every slot from the face's body: rows with no body (None, shared art) or drawn for it (docs/avatar-plan.md v2 D7)
  const firstFree = (slot) => inSlot(slot).filter((r) => !r.body || !body || r.body === body).find((p) => (p.tier || 'free') === 'free' && p.file)?.id || null;
  const swatches = (slot) => palettes.filter((r) => r.slot === slot);
  const color = (slot) => (swatches(slot).find((r) => r.default) || swatches(slot)[0])?.id || null;
  return {
    v: SPEC_VERSION,
    skin: face?.id || null, skinTone: color('skinTone'),
    hair: firstFree('hair'), hairColor: color('hairColor'),
    eyes: face?.eyes || firstFree('eyes'), eyeColor: color('eyeColor'),
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
  const face = byId(catalogue, spec.skin);
  for (const [key, slot] of Object.entries(SLOT_OF_SPEC_KEY)) {
    const id = key === 'eyes' ? ((face && face.eyes) || spec.eyes) : spec[key]; // the face chooses the eyes
    if (id == null) { if (REQUIRED_PARTS.includes(slot)) problems.push(`${key} is required`); continue; }
    const row = byId(catalogue, id);
    if (!row) { problems.push(`${key}: unknown part ${id}`); continue; }
    if (row.slot !== slot) { problems.push(`${key}: ${id} is a ${row.slot}`); continue; }
    // a part drawn for one body is not worn on the other (the editor only offers the face's own; this is for a request that is not the editor's)
    if (row.body && face && face.body && row.body !== face.body) { problems.push(`${key}: ${id} is drawn for the other body`); continue; }
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

/**
 * What a player owns: the paid parts they have bought, plus any they are ALREADY WEARING in their
 * saved look (a part that was free when they picked it and has a price now is theirs: nobody is
 * charged for, or loses, what they have on).
 */
function ownedBy(player) {
  const { catalogue, palettes } = load();
  const owned = new Set(player?.avatarParts || []);
  const saved = player?.avatar;
  if (saved && typeof saved === 'object') for (const id of Object.values(saved)) { const row = typeof id === 'string' ? byId(catalogue, id) || byId(palettes, id) : null; if (row && row.tier === 'paid') owned.add(row.id); }
  return [...owned];
}

/** The paid parts and swatches a spec uses that are not in `owned`: [{ id, gemcost }] (an unpriced one has gemcost null). */
function toBuy(spec, owned = []) {
  const { catalogue, palettes } = load();
  const have = new Set(owned); const out = [];
  for (const id of new Set(Object.values(spec || {}))) {
    const row = typeof id === 'string' ? byId(catalogue, id) || byId(palettes, id) : null;
    if (!row || row.tier !== 'paid' || have.has(row.id)) continue;
    const gemcost = Number(row.gemcost);
    out.push({ id: row.id, gemcost: Number.isFinite(gemcost) && gemcost > 0 ? gemcost : null });
  }
  return out;
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

module.exports = { load, reload, defaultSpec, cleanSpec, validateSpec, purchasable, paidIds, ownedBy, toBuy, SPEC_VERSION };
