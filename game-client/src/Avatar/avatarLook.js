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
export const partFolder = (slot, which = 'file') => (slot === 'hair' ? (which === 'backFile' ? 'hairBack' : 'hairFront') : slot);
export const partSrc = (part, which = 'file') => (part && part[which] ? `${partFolder(part.slot, which)}/${part[which]}` : null);

export const byId = (rows, id) => (id ? (rows || []).find((r) => r && r.id === id) || null : null);
export const partsInSlot = (catalogue, slot) => (catalogue || []).filter((r) => r && r.slot === slot);
export const palette = (palettes, slot) => (palettes || []).filter((r) => r && r.slot === slot);

/** Hex for a palette id, or null. */
export function colorOf(palettes, id) {
  const row = byId(palettes, id);
  return row && typeof row.hex === 'string' ? row.hex : null;
}

/** The starter look: the first free part of every slot, the middle skin tone. */
export function defaultSpec(catalogue, palettes) {
  const firstFree = (slot) => partsInSlot(catalogue, slot).find((p) => (p.tier || 'free') === 'free' && p.file)?.id || null;
  const firstColor = (slot) => palette(palettes, slot)[0]?.id || null;
  const tones = palette(palettes, 'skinTone');
  return {
    v: SPEC_VERSION,
    skin: firstFree('skin'), skinTone: (tones[1] || tones[0])?.id || null, // the second lightest (owner 2026-10-14)
    hair: firstFree('hair'), hairColor: firstColor('hairColor'),
    eyes: firstFree('eyes'), eyeColor: firstColor('eyeColor'),
    facialHair: partsInSlot(catalogue, 'facialHair').find((p) => !p.file)?.id || null,
    hat: partsInSlot(catalogue, 'hat').find((p) => !p.file)?.id || null,
    top: firstFree('top'),
  };
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
    const id = spec[key];
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
  const s = spec || {};
  const color = (key) => colorOf(palettes, s[key]);
  const tintFor = (name) => (name ? color(name) : null);
  const part = (key) => byId(catalogue, s[key]);
  const armed = equip.weaponHand && ARMED_GRID_KINDS.includes(equip.gtype || '');
  const topRow = equip.armorTop ? byId(catalogue, equip.armorTop) || part('top') : part('top');
  const handRow = armed ? byId(catalogue, equip.weaponHand) : null;
  const hairRow = part('hair');
  const hatRow = part('hat');

  const layers = [];
  const blinkLayers = [];
  const push = (list, row, which, tintName) => {
    const src = partSrc(row, which);
    if (src) list.push({ src, tint: tintFor(tintName) });
  };
  const both = (row, which, tintName) => { push(layers, row, which, tintName); push(blinkLayers, row, which, tintName); };
  const twoFiles = (row) => { if (!row) return; both(row, 'file', row.tint); both(row, 'file2', row.tint2); };

  for (const z of Z_ORDER) {
    switch (z) {
      case 'hairBack': if (hairRow) both(hairRow, 'backFile', hairRow.tint); break;
      case 'skin': twoFiles(part('skin')); break;
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
