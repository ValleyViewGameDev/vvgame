/**
 * avatarLook - the pure half of the avatar system (docs/avatar-plan.md §2): what a bust is
 * made of, given a spec, the catalogue, the palettes and the equipment. No DOM, no Pixi, no
 * fetch, so the client, the editor's Avatar Lab (served raw) and tools/avatar/render.js all
 * run exactly this code.
 *
 * A spec is `player.avatar`:
 *   { v, skin, skinTone, hair, hairColor, eyes, eyeColor, facialHair, hat, top }
 * The catalogue is tuning/avatarParts.json (one row per part, see SLOT_OF_SPEC_KEY for how a
 * spec key picks a slot); the palettes are tuning/avatarPalettes.json (rows { id, slot, hex }).
 *
 * lookFor() resolves the spec + equipment into layers, back to front:
 *   { key, layers: [{ src, tint }], blinkLayers: [{ src, tint }] | null }
 * `src` is `<slot>/<file>` under public/assets/avatar/ (also the atlas frame name under the
 * `avatar/` namespace); `tint` is a hex colour to multiply in, or null to draw the file as is.
 */

/** Draw order, back to front. `hair` contributes its backFile at the front of the list. */
export const Z_ORDER = ['hairBack', 'skin', 'top', 'eyes', 'facialHair', 'hairFront', 'hat', 'hand']; // the top's collar draws over the skin's neck

/** The spec's part keys and the catalogue slot each one picks from. */
export const SLOT_OF_SPEC_KEY = { skin: 'skin', hair: 'hair', facialHair: 'facialHair', eyes: 'eyes', hat: 'hat', top: 'top' };
/** The spec's colour keys and the palette slot each one picks from. */
export const PALETTE_OF_SPEC_KEY = { skinTone: 'skinTone', hairColor: 'hairColor', eyeColor: 'eyeColor' };
export const SPEC_VERSION = 1;

/** Grid kinds where the equipped weapon is drawn (docs/avatar-plan.md decision 3). */
export const ARMED_GRID_KINDS = ['valley', 'dungeon'];

/** Where a part's file lives (and its atlas frame name): `<folder>/<file>`. */
export const partFolder = (slot, which = 'file') => (slot === 'hair' ? (which === 'backFile' ? 'hairBack' : 'hairFront') : slot); // fileMale lives beside file
export const partSrc = (part, which = 'file') => (part && part[which] ? `${partFolder(part.slot, which)}/${part[which]}` : null);

export const byId = (rows, id) => (id ? (rows || []).find((r) => r && r.id === id) || null : null);
export const partsInSlot = (catalogue, slot) => (catalogue || []).filter((r) => r && r.slot === slot);
/** The parts of a slot a BODY can wear: rows with no `body` (None, shared art) and rows drawn for that body (docs/avatar-plan.md v2 D7). */
export const partsFor = (catalogue, slot, body) => partsInSlot(catalogue, slot).filter((r) => !r.body || !body || r.body === body);
/** The body a spec stands on: its face's `body` (female / male). */
export const bodyOf = (catalogue, spec) => byId(catalogue, spec?.skin)?.body || null;
export const palette = (palettes, slot) => (palettes || []).filter((r) => r && r.slot === slot);

/** Hex for a palette id, or null. */
export function colorOf(palettes, id) {
  const row = byId(palettes, id);
  return row && typeof row.hex === 'string' ? row.hex : null;
}

/** The eyes a face calls for (a skin row's `eyes`), falling back to the spec's own or the first eyes. */
export function eyesForFace(catalogue, spec) {
  const face = byId(catalogue, spec?.skin);
  return (face && face.eyes) || spec?.eyes || partsInSlot(catalogue, 'eyes')[0]?.id || null;
}

/** The spec with its eyes set from the face. */
export const withEyes = (catalogue, spec) => {
  const out = { ...spec, eyes: eyesForFace(catalogue, spec) };
  const body = bodyOf(catalogue, out);
  if (body) for (const [key, slot] of Object.entries(SLOT_OF_SPEC_KEY)) {
    if (key === 'skin' || key === 'eyes') continue;
    const row = byId(catalogue, out[key]);
    if (row && row.body && row.body !== body) out[key] = partsFor(catalogue, slot, body).find((p) => p.file)?.id || partsFor(catalogue, slot, body)[0]?.id || null; // the other body's part: swap for this body's first
  }
  return out;
};

/**
 * The DEFAULT look: what a player who has not made one looks like, and what Reset gives (owner
 * 2026-11-10: the man, no clothes, the first hair, brown hair, green eyes). The face and the
 * colours are the rows marked `default` in the tuning files (for `body`, that body's first free
 * face); every other slot is the first free part of that face's body, a None where there is one.
 * The server's avatarCatalogue.defaultSpec is its mirror.
 */
export function defaultSpec(catalogue, palettes, body = null) {
  const free = (p) => (p.tier || 'free') === 'free' && p.file;
  const faces = partsInSlot(catalogue, 'skin');
  const face = (body ? faces.find((p) => free(p) && p.body === body) : faces.find((p) => p.default && free(p))) || faces.find(free) || faces.find((p) => p.file);
  const b = face?.body || body;
  const firstFree = (slot) => partsFor(catalogue, slot, b).find(free)?.id || null;
  const firstColor = (slot) => (palette(palettes, slot).find((r) => r.default) || palette(palettes, slot)[0])?.id || null;
  return withEyes(catalogue, {
    v: SPEC_VERSION,
    skin: face?.id || null, skinTone: firstColor('skinTone'),
    hair: firstFree('hair'), hairColor: firstColor('hairColor'),
    eyes: null, eyeColor: firstColor('eyeColor'),
    facialHair: partsInSlot(catalogue, 'facialHair').find((p) => !p.file)?.id || null,
    hat: partsInSlot(catalogue, 'hat').find((p) => !p.file)?.id || null,
    top: firstFree('top'),
  });
}


/**
 * Check a spec against the catalogue and the palettes. Returns a list of problems (empty =
 * valid). `owned` is the player's bought part ids; a paid part or swatch not in it is a
 * problem; an `npc` tier part is always a problem for a player (allowNpc for Citizens).
 */
export function validateSpec(spec, catalogue, palettes, { owned = [], allowNpc = false } = {}) {
  const problems = [];
  if (!spec || typeof spec !== 'object') return ['spec missing'];
  const ownedSet = new Set(owned || []);
  const checkTier = (row, what) => {
    const tier = row.tier || 'free';
    if (tier === 'npc' && !allowNpc) problems.push(`${what} ${row.id} is not available to players`);
    else if (tier === 'paid' && !ownedSet.has(row.id)) problems.push(`${what} ${row.id} is not owned`);
  };
  for (const [key, slot] of Object.entries(SLOT_OF_SPEC_KEY)) {
    const id = key === 'eyes' ? eyesForFace(catalogue, spec) : spec[key];
    if (id == null) { if (slot === 'skin' || slot === 'eyes') problems.push(`${key} is required`); continue; }
    const row = byId(catalogue, id);
    if (!row) { problems.push(`${key}: unknown part ${id}`); continue; }
    if (row.slot !== slot) { problems.push(`${key}: ${id} is a ${row.slot}, not a ${slot}`); continue; }
    checkTier(row, key);
  }
  for (const [key, slot] of Object.entries(PALETTE_OF_SPEC_KEY)) {
    const id = spec[key];
    if (id == null) { problems.push(`${key} is required`); continue; }
    const row = byId(palettes, id);
    if (!row) { problems.push(`${key}: unknown colour ${id}`); continue; }
    if (row.slot !== slot) { problems.push(`${key}: ${id} is a ${row.slot} colour`); continue; }
    checkTier(row, key);
  }
  return problems;
}

/**
 * A RANDOM look from the FREE parts and colours (the editor's Random button, owner 2026-11-10):
 * either body, then one free choice per slot for that body and one free colour per kind. A paid
 * part is never picked. Hair and clothes are never a None (a random look is neither bald nor
 * undressed); a beard and a hat may be.
 */
export function randomSpec(catalogue, palettes, rng = Math.random) {
  const free = (r) => (r.tier || 'free') === 'free';
  const pick = (rows) => (rows.length ? rows[Math.floor(rng() * rows.length)] : null);
  const face = pick(partsInSlot(catalogue, 'skin').filter((p) => free(p) && p.file));
  const body = face?.body || null;
  const part = (slot, allowNone) => pick(partsFor(catalogue, slot, body).filter((p) => free(p) && (allowNone || (p.file && !p.none))))?.id || null;
  const color = (slot) => pick(palette(palettes, slot).filter(free))?.id || null;
  return withEyes(catalogue, {
    v: SPEC_VERSION,
    skin: face?.id || null, skinTone: color('skinTone'),
    hair: part('hair', false), hairColor: color('hairColor'),
    eyes: null, eyeColor: color('eyeColor'),
    facialHair: part('facialHair', true), hat: part('hat', true), top: part('top', false),
  });
}

/**
 * The look to draw for a player: the one they saved, or the DEFAULT look when they have not made
 * one (or saved one whose face the catalogue no longer has). This is the whole "migration" from
 * the old icons (owner 2026-11-10): no record is rewritten, every surface that draws a player
 * asks here, so a player without a look is the default man until they open the editor.
 */
export function specFor(avatar, { catalogue, palettes }) {
  const face = avatar && typeof avatar === 'object' ? byId(catalogue, avatar.skin) : null;
  return face && face.file ? cleanSpec(avatar) : defaultSpec(catalogue, palettes);
}

/**
 * What a player owns: the paid parts they bought, plus any they are already wearing in their saved
 * look (free when they picked it, priced since: theirs). The server's avatarCatalogue.ownedBy is
 * its mirror, and writes it down at their next save.
 */
export function ownedBy(player, { catalogue, palettes }) {
  const owned = new Set(player?.avatarParts || []);
  for (const id of Object.values(player?.avatar || {})) { const row = typeof id === 'string' ? byId(catalogue, id) || byId(palettes, id) : null; if (row && row.tier === 'paid') owned.add(row.id); }
  return [...owned];
}

/** The paid parts and swatches a look uses that are not in `owned`: the rows themselves (their `gemcost` is the price). */
export function toBuy(spec, { catalogue, palettes }, owned = []) {
  const have = new Set(owned); const out = [];
  for (const id of new Set(Object.values(spec || {}))) { const row = typeof id === 'string' ? byId(catalogue, id) || byId(palettes, id) : null; if (row && row.tier === 'paid' && !have.has(row.id)) out.push(row); }
  return out;
}

/** Keep only the spec keys the schema knows, so stray fields never reach the record. */
export function cleanSpec(spec) {
  const out = { v: SPEC_VERSION };
  for (const key of [...Object.keys(SLOT_OF_SPEC_KEY), ...Object.keys(PALETTE_OF_SPEC_KEY)]) {
    out[key] = spec && typeof spec[key] === 'string' ? spec[key] : null;
  }
  return out;
}

/**
 * Resolve a spec + equipment into drawable layers.
 *
 * @param {object} spec            the avatar spec (player.avatar, or a Citizen's)
 * @param {object} data            { catalogue, palettes }
 * @param {object} [equip]         { armorTop, weaponHand, gtype } where armorTop / weaponHand
 *                                 are part ids from the equipped items' resources.json rows
 *                                 (`avatarTop`, `avatarHand`), or null
 * @returns {{ key: string, layers: Array<{src: string, tint: string|null}>, blinkLayers: Array|null }}
 */
export function lookFor(spec, { catalogue, palettes }, equip = {}) {
  const s = { ...(spec || {}), eyes: eyesForFace(catalogue, spec) }; // the face chooses the eyes
  // a colour the palette no longer has (auburn hair and three eye colours were cut 2026-11-10) falls
  // back to the first colour of its kind: a saved look keeps drawing, never an untinted grey part
  const color = (key) => colorOf(palettes, s[key]) || palette(palettes, PALETTE_OF_SPEC_KEY[key])[0]?.hex || null;
  const tintFor = (name) => (name ? color(name) : null);
  const part = (key) => byId(catalogue, s[key]);
  const armed = equip.weaponHand && ARMED_GRID_KINDS.includes(equip.gtype || '');
  const topRow = equip.armorTop ? byId(catalogue, equip.armorTop) || part('top') : part('top');
  const handRow = armed ? byId(catalogue, equip.weaponHand) : null;
  const hairRow = part('hair');
  const hatRow = part('hat');

  const layers = [];
  const blinkLayers = [];
  const bodyKind = (part('skin') && part('skin').body) || 'female';
  const push = (list, row, which, tintName) => {
    // a part may carry a male cut of its main drawing (fileMale) that follows the male jaw
    const w = which === 'file' && bodyKind === 'male' && row.fileMale ? 'fileMale' : which;
    const src = partSrc(row, w);
    if (src) list.push({ src, tint: tintFor(tintName) });
  };
  const both = (row, which, tintName) => { push(layers, row, which, tintName); push(blinkLayers, row, which, tintName); };
  const twoFiles = (row) => { if (!row) return; both(row, 'file', row.tint); both(row, 'file2', row.tint2); };

  for (const z of Z_ORDER) {
    switch (z) {
      case 'hairBack': if (hairRow) both(hairRow, 'backFile', hairRow.tint); break;
      case 'skin': {
        // file = the face (skinTone); file2 = the eyeballs, UNTINTED, so the whites and the iris keep
        // their own colour under any skin tone (tools/art/eyeballs.js). Open-eyed frames only: the
        // blink's lids are painted over the tinted face, and an eyeball pixel past them would show.
        const skin = part('skin');
        if (skin) { both(skin, 'file', skin.tint); push(layers, skin, 'file2', skin.tint2); }
        break;
      }
      case 'top': twoFiles(topRow); break;
      case 'eyes': {
        const eyes = part('eyes');
        if (!eyes) break;
        push(layers, eyes, 'file', eyes.tint); push(layers, eyes, 'file2', eyes.tint2);
        if (eyes.blinkFile) push(blinkLayers, eyes, 'blinkFile', eyes.blinkTint);
        else { push(blinkLayers, eyes, 'file', eyes.tint); push(blinkLayers, eyes, 'file2', eyes.tint2); }
        break;
      }
      case 'facialHair': twoFiles(part('facialHair')); break;
      case 'hairFront': {
        if (!hairRow) break;
        // a hat that covers the head (hidesHair) flattens the hair (underHat) or hides it;
        // a tiara or crown (hidesHair false) sits on top of the full hair
        if (hatRow && hatRow.file && hatRow.hidesHair) { if (hairRow.underHat) both(hairRow, 'underHat', hairRow.tint); }
        else both(hairRow, 'file', hairRow.tint);
        break;
      }
      case 'hat': twoFiles(hatRow); break;
      case 'hand': twoFiles(handRow); break;
      default: break;
    }
  }
  const hasBlink = !!part('eyes')?.blinkFile;
  const key = layers.map((l) => `${l.src}${l.tint ? '@' + l.tint : ''}`).join('|');
  return { key, layers, blinkLayers: hasBlink ? blinkLayers : null };
}

/** The equipment inputs for lookFor() from a player record and the master resources. */
export function equipFor(player, masterResources, gtype) {
  const find = (type) => (type ? (masterResources || []).find((r) => r && r.type === type) : null);
  const armor = find(player?.settings?.equippedArmor);
  const weapon = find(player?.settings?.equippedWeapon);
  return { armorTop: armor?.avatarTop || null, weaponHand: weapon?.avatarHand || null, gtype: gtype || player?.location?.gtype || null };
}
