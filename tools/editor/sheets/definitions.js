/**
 * Sheet definitions: one object per editable JSON file.
 *
 * Shared by the editor server (validation before a write; Node >= 22.12 can require() this
 * ESM file) and the client (served at /sheets/definitions.js). Adding a new export the owner
 * maintains in a Google Sheet = adding a definition here; the engine does the rest.
 *
 * shape
 *   'array'             array of flat objects (most files)
 *   'array-of-scalars'  array of strings/numbers; rows are { value }
 *   'object'            object of values; rows are { __key, value } (value edited as JSON literal)
 *   'object-of-objects' object of objects; rows are { __key, ...inner }, columns are the union of inner keys
 *
 * column.type: string | number | boolean | enum | ref | json | any
 * column.ref:  'resource' (resources.json type) | 'npc' (resources.json type, category npc) |
 *              'quest' (questsEN title) | 'tile' (resources.json type, category tile)
 * column.refLevel: 'error' | 'warn' (default warn: unknown references are reported, not blocked)
 * column.refAllow: sentinel values a ref column may hold besides real references
 * column.immutable: locked once the row exists on disk (persisted identifiers)
 * identity: the key(s) that must be unique together; immutable columns are usually these
 * presetsFromData: column presets are computed per value of categoryKey from the keys rows use
 * column.derived: computed by def.derive (read-only in the grid; recomputed live and on every save)
 * derive(rows): recomputes the derived columns in place; returns how many rows changed
 */

import { deriveResources } from './economy.js';

const VALIDON = ['g', 'd', 's', 'p', 'w', 'l', 'n', 'o', 'x', 'y', 'z', 'c', 'v', 'u'];

const num = (key, label) => ({ key, label, type: 'number' });
const str = (key, label) => ({ key, label, type: 'string' });
const bool = (key, label) => ({ key, label, type: 'boolean' });
const ref = (key, target, level = 'warn', label) => ({ key, label, type: 'ref', ref: target, refLevel: level });
const json = (key, label) => ({ key, label, type: 'json' });

export const DEFINITIONS = [
  {
    id: 'resources',
    freeze: 1,   // pin the name column while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'ECONOMY',
    group: 'economy',
    file: 'tuning/resources.json',
    description: 'The master resource table (tuning/resources.json). type and layoutkey are persisted identifiers: never rename in place; duplicate the row instead. The game server caches this file at boot, so edits need a restart (nodemon locally, a deploy on Render).',
    shape: 'array',
    identity: ['type'],
    uniqueAlso: [['layoutkey']],
    categoryKey: 'category',
    presetsFromData: true,
    restartNeeded: true,
    derive: deriveResources,
    columns: [
      { ...str('type'), immutable: true, required: true },
      { ...str('layoutkey'), immutable: true },
      { ...str('category'), type: 'enum', enum: ['tile', 'special', 'doober', 'source', 'farmplot', 'travel', 'editor', 'deco', 'stall', 'training', 'crafting', 'trainingAndShop', 'station', 'farmhouse', 'shop', 'npc', 'skill', 'power', 'pet', 'region'], required: true },
      str('symbol'), str('filename'), str('action'), bool('passable'), num('level'), str('source'),
      { ...ref('shopregion', 'resource', 'error'), label: 'shopregion (only this region\'s shops sell it)' }, str('requires'),
      num('size'), num('qtycollected'), num('xp'), num('crafttime'), num('totalnestedtime'),
      { ...num('gemcost'), label: 'gemcost (derived)', derived: true },
      { ...bool('nogems'), label: 'nogems (never bought with gems)' },
      { ...num('gemOverride'), label: 'gemOverride (hand-set gemcost)' },
      { ...bool('rare'), label: 'rare (gems by effort)' },
      { ...num('parallel'), label: 'parallel (producers run at once)' },
      { ...num('maxpergrid'), label: 'maxpergrid (most per grid; the Inn: 1)' },
      { ...num('effort'), label: 'effort (min/unit, derived)', derived: true },
      { ...ref('output', 'resource'), refAllow: ['noBank', 'hp', 'noRel', 'Buy', 'backpackCapacity', 'range'] }, num('growtime'), bool('repeatable'),
      ref('ingredient1', 'resource'), num('ingredient1qty'), ref('ingredient2', 'resource'), num('ingredient2qty'),
      ref('ingredient3', 'resource'), num('ingredient3qty'), ref('ingredient4', 'resource'), num('ingredient4qty'),
      num('pricemod'), num('minprice'), num('maxprice'),
      num('scrollqty'), { key: 'scrollchance', type: 'enum', enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'] },
      { key: 'season', type: 'enum', enum: ['Spring', 'Summer', 'Fall', 'Winter'] },
      num('hp'), num('maxhp'), num('range'), num('speed'), num('damage'), num('armorclass'), num('attackbonus'), num('attackrange'), bool('ranged'),
      { ...num('hands'), label: 'hands (weapons: 1 or 2; 2 = no shield)' }, { ...bool('shield'), label: 'shield (armory: off-hand slot)' },
      { key: 'projectile', label: 'projectile (enemy shot look)', type: 'enum', enum: ['arrow', 'fireball', 'fireball-small', 'blob', 'none'] },
      { ...num('leapcooldown'), label: 'leapcooldown (s; enemy leaps beside the player)' }, { ...num('attackinterval'), label: 'attackinterval (s between an enemy\'s attacks)' }, str('deathVfx'), num('movespeed'), { key: 'artFacing', type: 'enum', enum: ['left', 'right', 'front'] }, { ...str('wallSet'), label: 'wallSet (walls/fences that join up: the piece set in public/assets/walls, e.g. stone, fence)' }, { key: 'artFamily', type: 'enum', enum: ['', 'tudor', 'castle', 'cottage', 'fantastical', 'industrial', 'japanese', 'tent', 'workshop', 'camp', 'ruin', 'vehicle'], label: 'artFamily (building architecture, docs/art/buildings-bible.md)' }, { key: 'artLook', type: 'enum', enum: ['', 'town', 'valley', 'homestead'], label: 'artLook (valley = moss and vines; town = clean)' }, { ...str('artAccent'), label: 'artAccent (the building\'s colour: roof and sign, so it reads from afar)' }, { ...str('artSign'), label: 'artSign (what the image-only sign shows, or none)' }, { ...num('artSpan'), label: 'artSpan (tiles the square art covers, footprint at its bottom-centre; above size = headroom for roofs and tall statues)' }, { ...str('artVariants'), label: 'artVariants (cosmetic alternatives, weighted, picked per cell: "file=weight;file=weight"; the oak: oak-tree.svg=2;oak-tree-autumn-gold.svg=1;oak-tree-autumn-red.svg=1)' },
      str('workerType'), num('stateWorking'), num('stateResting'), num('stateRoaming'), num('stateEating'), num('stateSocializing'),
      str('avatarTop'), str('avatarHand'),
      ...VALIDON.map((t) => bool(`validon${t}`)),
    ],
  },
  {
    id: 'avatarParts',
    freeze: 1,   // pin the name column while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'AVATAR PARTS',
    group: 'avatar',
    file: 'tuning/avatarParts.json',
    description: 'The avatar catalogue (tuning/avatarParts.json, docs/avatar-plan.md §2.2): one row per part. id is persisted on player records: never rename in place. Files live under game-client/public/assets/avatar/<slot>/ (hair: file = hairFront, backFile = hairBack; a hat with hidesHair covers the hair unless the hair has an underHat drawing; a skin row\'s eyes names the eyes part that face always wears). tint / tint2 / blinkTint name a palette slot (skinTone, hairColor, eyeColor) multiplied into that file. tier npc = Citizens only. Preview in the Avatar Lab tab. The game server caches this file at boot.',
    shape: 'array',
    identity: ['id'],
    categoryKey: 'slot',
    restartNeeded: true,
    columns: [
      { ...str('id'), immutable: true, required: true },
      { key: 'slot', type: 'enum', enum: ['skin', 'hair', 'facialHair', 'eyes', 'hat', 'top', 'hand', 'npc'], required: true },
      str('label'),
      { key: 'tier', type: 'enum', enum: ['free', 'paid', 'npc'] },
      num('gemcost'),
      str('file'), str('fileMale'), { key: 'tint', type: 'enum', enum: ['skinTone', 'hairColor', 'eyeColor'] },
      str('file2'), { key: 'tint2', type: 'enum', enum: ['skinTone', 'hairColor', 'eyeColor'] },
      str('backFile'), str('underHat'), bool('hidesHair'), str('eyes'), { key: 'body', type: 'enum', enum: ['female', 'male'] },
      str('blinkFile'), { key: 'blinkTint', type: 'enum', enum: ['skinTone', 'hairColor', 'eyeColor'] },
      str('notes'),
    ],
  },
  {
    id: 'avatarPalettes',
    freeze: 1,   // pin the name column while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'AVATAR COLOURS',
    group: 'avatar',
    file: 'tuning/avatarPalettes.json',
    description: 'The avatar swatches (tuning/avatarPalettes.json): skin tones, hair colours, eye colours. id is persisted on player records: never rename in place. hex is multiplied into the tintable parts. The game server caches this file at boot.',
    shape: 'array',
    identity: ['id'],
    categoryKey: 'slot',
    restartNeeded: true,
    columns: [
      { ...str('id'), immutable: true, required: true },
      { key: 'slot', type: 'enum', enum: ['skinTone', 'hairColor', 'eyeColor'], required: true },
      str('label'), { ...str('hex'), required: true },
      { key: 'tier', type: 'enum', enum: ['free', 'paid'] }, num('gemcost'),
    ],
  },
  {
    id: 'quests',
    freeze: 2,   // pin the id and the name while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'QUESTS',
    group: 'quests',
    file: 'tuning/quests/questsEN.json',
    description: 'Quest definitions (tuning/quests/questsEN.json). title is the persisted questId on every player record: never rename in place. giver is an NPC type; items and rewards are resource types.',
    shape: 'array',
    identity: ['title'],
    uniqueAlso: [['index']],
    categoryKey: 'giver',
    restartNeeded: false,
    columns: [
      { ...num('index'), required: true },
      { ...str('title'), immutable: true, required: true },
      str('symbol'), num('level'), bool('repeatable'),
      { ...ref('giver', 'npc'), required: true },
      ref('reward', 'resource'), num('rewardqty'), num('xp'),
      { key: 'goal1action', type: 'enum', enum: ['Collect', 'Build', 'Plant', 'Acquire', 'Buy', 'Craft', 'Kill', 'Sell', 'Vote'] },
      ref('goal1item', 'resource'), num('goal1qty'),
      { key: 'goal2action', type: 'enum', enum: ['Collect', 'Build', 'Plant', 'Acquire', 'Buy', 'Craft', 'Kill', 'Sell', 'Vote'] },
      ref('goal2item', 'resource'), num('goal2qty'),
      { key: 'goal3action', type: 'enum', enum: ['Collect', 'Build', 'Plant', 'Acquire', 'Buy', 'Craft', 'Kill', 'Sell', 'Vote'] },
      ref('goal3item', 'resource'), num('goal3qty'),
      str('rel'), num('relscore'),
    ],
  },
  {
    id: 'traders',
    freeze: 2,   // pin the id and the name while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'TRADERS',
    group: 'traders',
    file: 'tuning/traders.json',
    description: 'Trader offers (tuning/traders.json): one row per offer. trader is an NPC type; gives and requiresN are resource types. Served fresh per request, no restart needed.',
    shape: 'array',
    identity: ['trader', 'index'],
    categoryKey: 'trader',
    restartNeeded: false,
    columns: [
      { ...ref('trader', 'resource'), immutable: true, required: true },
      { ...num('index'), immutable: true, required: true },
      ref('gives', 'resource'), num('givesqty'), num('xp'), bool('repeat'),
      ...[1, 2, 3, 4, 5, 6, 7].flatMap((n) => [ref(`requires${n}`, 'resource'), num(`requires${n}qty`)]),
      str('rel'), num('relscore'),
      { ...str('minigame'), label: 'minigame (won, not paid: Minigames/minigames.js id)' },
    ],
  },
  {
    id: 'store',
    freeze: 2,   // pin the id and the name while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'Store offers',
    group: 'sheets',
    file: 'tuning/store.json',
    description: 'Stripe store offers (tuning/store.json). rewards is a JSON array of {item, qty}. Cached at boot: restart needed.',
    shape: 'array',
    identity: ['id'],
    restartNeeded: true,
    columns: [{ ...num('id'), immutable: true, required: true }, str('title'), str('body'), num('price'), num('priceInCents'), num('shelflifeDays'), json('rewards')],
  },
  {
    id: 'trophies',
    freeze: 1,   // pin the name column while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'Trophies',
    group: 'sheets',
    file: 'tuning/trophies.json',
    description: 'Trophies (tuning/trophies.json). name is persisted on players: never rename in place. progress is a JSON array of milestones.',
    shape: 'array',
    identity: ['name'],
    restartNeeded: true,
    columns: [{ ...str('name'), immutable: true, required: true }, str('tooltip'), { key: 'type', type: 'enum', enum: ['Event', 'Progress', 'Count'] }, bool('visible'), num('reward'), json('progress')],
  },
  {
    id: 'interactions',
    freeze: 1,   // pin the name column while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'Relationship interactions',
    group: 'sheets',
    file: 'tuning/interactions.json',
    description: 'Conversation interactions (tuning/interactions.json). Served fresh per request.',
    shape: 'array',
    identity: ['interaction'],
    restartNeeded: false,
    columns: [
      { ...str('interaction'), immutable: true, required: true }, bool('isaninteraction'), bool('isvisible'),
      num('relscoremin'), num('relscoremax'), num('chance'), num('relscoreresult'), num('rounds'),
      str('relbitblock1'), str('relbitblock2'), str('relbitrequired'), str('relbitadd'), str('relbitremove'),
      num('relbuff'), str('relbuff1'), str('relbuff2'), str('relbuff3'),
      str('playertopic1'), str('playertopic2'), str('playertopic3'), str('npctopic1'), str('npctopic2'), str('npctopic3'),
    ],
  },
  {
    id: 'seasons',
    freeze: 1,   // pin the name column while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'Seasons',
    group: 'sheets',
    file: 'tuning/seasons.json',
    description: 'Season tuning (tuning/seasons.json). Lists and crop weights are JSON cells. Note the Spring row carries SeasonMoneyNerf with a capital S (a sheet-header slip the code reads as-is). Cached at boot: restart needed.',
    shape: 'array',
    identity: ['seasonType'],
    restartNeeded: true,
    columns: [{ ...str('seasonType'), immutable: true, required: true }, json('seasonResources'), num('seasonMultiplier'), num('seasonMoneyNerf'), num('SeasonMoneyNerf'), num('pricePoints'), json('carnivalRewards'), json('seasonTownCrops'), json('seasonHomesteadCrops')],
  },
  {
    id: 'skillsTuning',
    label: 'Skill multipliers',
    group: 'sheets',
    file: 'tuning/skillsTuning.json',
    description: 'Skill multipliers (tuning/skillsTuning.json): one row per skill, one column per resource or station it multiplies. Served fresh per request.',
    shape: 'object-of-objects',
    identity: ['__key'],
    restartNeeded: false,
    dynamicColumns: { type: 'number', ref: 'resource', refLevel: 'warn' },
    columns: [{ key: '__key', label: 'skill', type: 'ref', ref: 'resource', refLevel: 'warn', immutable: true, required: true }],
  },
  {
    id: 'xpLevels',
    label: 'XP levels',
    group: 'sheets',
    file: 'tuning/xpLevels.json',
    description: 'XP thresholds (tuning/xpLevels.json), one row per level. Order is the level order.',
    shape: 'array',
    identity: ['lvl'],
    orderMatters: true,
    restartNeeded: false,
    columns: [{ ...num('lvl'), required: true }, { ...num('xp'), required: true }],
  },
  {
    id: 'warehouse',
    freeze: 1,   // pin the name column while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'Warehouse levels',
    group: 'sheets',
    file: 'tuning/warehouse.json',
    description: 'Warehouse upgrade table (tuning/warehouse.json).',
    shape: 'array',
    identity: ['Level'],
    orderMatters: true,
    restartNeeded: true,
    columns: [{ ...num('Level'), required: true }, num('add'), ref('ingredient1', 'resource'), num('ingredient1qty'), ref('ingredient2', 'resource'), num('ingredient2qty'), ref('ingredient3', 'resource'), num('ingredient3qty')],
  },
  {
    id: 'messages',
    freeze: 2,   // pin the id and the name while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'Mailbox templates',
    group: 'sheets',
    file: 'tuning/messages.json',
    description: 'Mailbox message templates (tuning/messages.json). rewards is a JSON array of {item, qty}. Cached at boot: restart needed.',
    shape: 'array',
    identity: ['id'],
    restartNeeded: true,
    columns: [{ ...num('id'), immutable: true, required: true }, str('title'), str('body'), json('rewards'), bool('everyoneRewards'), bool('neverPurge')],
  },
  {
    id: 'FTUEsteps',
    freeze: 2,   // pin the id and the name while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'FTUE steps',
    group: 'sheets',
    file: 'tuning/FTUEsteps.json',
    description: 'First-time-user steps (tuning/FTUEsteps.json). addQuests is a JSON array of quest titles; doinkerTarget may be a string or array.',
    shape: 'array',
    identity: ['step'],
    orderMatters: true,
    restartNeeded: false,
    columns: [{ ...num('step'), required: true }, str('trigger'), bool('showModal'), str('modalIcon'), num('bodyKey'), num('notificationKey'), str('notificationIcon'), bool('continue'), json('addQuests'), bool('doinker'), str('doinkerType'), json('doinkerTarget'), str('openPanel'), ref('panelTargetNPC', 'npc'), bool('showFeedbackModalAfter')],
  },
  {
    id: 'globalTuning',
    label: 'Global tuning',
    group: 'sheets',
    file: 'tuning/globalTuning.json',
    description: 'Scalar caps, costs, zoom levels and the scheduler phase blocks (tuning/globalTuning.json). Values are JSON literals (numbers, strings, objects). Cached at boot: restart needed.',
    shape: 'object',
    identity: ['__key'],
    restartNeeded: true,
    columns: [{ key: '__key', label: 'key', type: 'string', immutable: true, required: true }, { key: 'value', type: 'any' }],
  },
  {
    id: 'randomValleyGridLayouts',
    freeze: 1,   // pin the name column while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'Random valley templates',
    group: 'sheets',
    file: 'layouts/gridLayouts/randomValleyGridLayouts.json',
    description: 'Random valley generation rows (layouts/gridLayouts/randomValleyGridLayouts.json): tile percentages, resource and enemy quantities. Used by the server at grid creation and by the Layouts tab presets.',
    shape: 'array',
    identity: ['layout'],
    categoryKey: 'valleyType',
    restartNeeded: true,
    columns: [
      { ...str('layout'), required: true }, { key: 'valleyType', type: 'enum', enum: ['valley1', 'valley2', 'valley3'] }, { key: 'variant', type: 'any' }, str('description'),
      ...VALIDON.map((t) => num(t)),
      ...Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [ref(`r${n}`, 'resource'), num(`r${n}qty`)]),
      ...[1, 2, 3].flatMap((n) => [ref(`e${n}`, 'npc'), num(`e${n}qty`)]),
    ],
  },
  {
    id: 'developerUsernames',
    label: 'Developer usernames',
    group: 'sheets',
    file: 'tuning/developerUsernames.json',
    description: 'Usernames treated as developers (excluded from analytics and leaderboards, debug UI on). Read per request.',
    shape: 'array-of-scalars',
    identity: ['value'],
    restartNeeded: false,
    columns: [{ ...str('value'), label: 'username', required: true }],
  },
  {
    id: 'artPalette',
    freeze: 2,   // pin the id and the name while the sheet scrolls sideways (Sheet.js frozen columns)
    label: 'Art palette',
    group: 'sheets',
    file: '../tools/art/styles/elsinore/palette.json',   // sheet files resolve against game-server/; this one lives in tools/art
    description: 'The art palette (tools/art/styles/elsinore/palette.json, docs/art/slice-b/palette.md): the colours extracted from the style bible, one row per swatch. Rename or nudge a hex here, then run `node tools/art/palette.js card` to redraw the swatch card the generator sends. id is referenced by the card and the checker: never rename in place. share is the percentage of bible pixels the colour covers (informational, rewritten by `palette.js extract`). The game server never reads this file.',
    shape: 'array',
    identity: ['id'],
    categoryKey: 'group',
    restartNeeded: false,
    columns: [
      { ...str('id'), immutable: true, required: true },
      str('name'),
      { ...str('hex'), required: true },
      { key: 'group', type: 'enum', enum: ['outline', 'grass', 'foliage', 'earth', 'wood', 'thatch', 'stone', 'metal', 'skin', 'hair', 'cloth-red', 'cloth-green', 'cloth-blue', 'cloth-purple', 'cloth-cream', 'cloth-brown', 'accent'], required: true },
      { ...num('share'), label: 'share (% of bible pixels)' },
    ],
  },
];

export const byId = (id) => DEFINITIONS.find((d) => d.id === id) || null;

/** Rows as the engine edits them, from the file's parsed JSON. */
export function toRows(def, data) {
  switch (def.shape) {
    case 'array': return (data || []).map((r) => ({ ...r }));
    case 'array-of-scalars': return (data || []).map((v) => ({ value: v }));
    case 'object': return Object.entries(data || {}).map(([k, v]) => ({ __key: k, value: v }));
    case 'object-of-objects': return Object.entries(data || {}).map(([k, v]) => ({ __key: k, ...(v || {}) }));
    default: throw new Error(`Unknown shape ${def.shape}`);
  }
}

/** The file's JSON from rows (sparse: absent keys stay absent). */
export function fromRows(def, rows) {
  switch (def.shape) {
    case 'array': return rows.map((r) => stripMeta(r));
    case 'array-of-scalars': return rows.map((r) => r.value);
    case 'object': return Object.fromEntries(rows.map((r) => [r.__key, r.value]));
    case 'object-of-objects': return Object.fromEntries(rows.map((r) => { const { __key, ...rest } = stripMeta(r); return [__key, rest]; }));
    default: throw new Error(`Unknown shape ${def.shape}`);
  }
}

function stripMeta(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('__') || k === '__key') out[k] = v;
  return out;
}

/** Columns for a definition given the rows (dynamic columns for object-of-objects). */
export function columnsFor(def, rows) {
  const cols = [...def.columns];
  const known = new Set(cols.map((c) => c.key));
  if (def.dynamicColumns || def.shape === 'array') {
    // Any key the data uses that the definition does not list is still editable (as the dynamic type, or 'any')
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (k.startsWith('__') || known.has(k)) continue;
        known.add(k);
        cols.push({ key: k, type: def.dynamicColumns ? def.dynamicColumns.type : 'any', ref: def.dynamicColumns?.ref, refLevel: def.dynamicColumns?.refLevel, dynamic: true });
      }
    }
  }
  return cols;
}

/**
 * Validate rows. `refs` = { resource: Set, npc: Set, tile: Set, quest: Set } of known names.
 * Returns { errors: [{row, col, message}], warnings: [...] }; rows are indexes into `rows`.
 * `baseline` (from errorSignatures of the on-disk rows) demotes errors the file already had
 * to warnings, so an old defect never blocks saving an unrelated edit.
 */
export function validateRows(def, rows, refs = {}, baseline = null) {
  const out = validateRowsRaw(def, rows, refs);
  if (!baseline) return out;
  const errors = [], warnings = [...out.warnings];
  for (const e of out.errors) {
    if (baseline.has(signature(e))) warnings.push({ ...e, message: `${e.message} (pre-existing)` });
    else errors.push(e);
  }
  return { errors, warnings };
}

const signature = (p) => `${p.col}|${p.message.replace(/\(also row \d+\)/, '')}`;

/** Signatures of the errors a row set already has, for validateRows' baseline. */
export function errorSignatures(def, rows, refs = {}) {
  return new Set(validateRowsRaw(def, rows, refs).errors.map(signature));
}

function validateRowsRaw(def, rows, refs = {}) {
  const errors = [];
  const warnings = [];
  const cols = columnsFor(def, rows);
  const colByKey = Object.fromEntries(cols.map((c) => [c.key, c]));
  const identity = def.identity || [];

  // identity + uniqueAlso
  const seen = new Map();
  rows.forEach((r, i) => {
    for (const keyset of [identity, ...(def.uniqueAlso || [])]) {
      if (!keyset.length) continue;
      const vals = keyset.map((k) => r[k]);
      if (vals.some((v) => v === undefined || v === null || v === '')) {
        if (keyset === identity) keyset.forEach((k) => { if (r[k] === undefined || r[k] === '') errors.push({ row: i, col: k, message: `${k} is required` }); });
        continue;
      }
      const sig = keyset.join('+') + '=' + JSON.stringify(vals);
      if (seen.has(sig)) errors.push({ row: i, col: keyset[0], message: `duplicate ${keyset.join('+')} (also row ${seen.get(sig) + 1})` });
      else seen.set(sig, i);
    }
  });

  // per cell
  rows.forEach((r, i) => {
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('__') && k !== '__key') continue;
      const col = colByKey[k];
      if (!col) continue;
      if (v === undefined) continue;
      if (col.required && (v === null || v === '')) errors.push({ row: i, col: k, message: `${k} is required` });
      switch (col.type) {
        case 'number':
          if (typeof v !== 'number' || Number.isNaN(v)) errors.push({ row: i, col: k, message: `${k} must be a number (got ${JSON.stringify(v)})` });
          break;
        case 'boolean':
          if (typeof v !== 'boolean') errors.push({ row: i, col: k, message: `${k} must be true/false (got ${JSON.stringify(v)})` });
          break;
        case 'enum':
          if (v !== '' && !col.enum.includes(v)) warnings.push({ row: i, col: k, message: `${k}: "${v}" is not one of ${col.enum.join(', ')}` });
          break;
        case 'ref': {
          const set = refs[col.ref];
          if (set && v !== '' && v !== null && !set.has(v) && !(col.refAllow || []).includes(v)) {
            (col.refLevel === 'error' ? errors : warnings).push({ row: i, col: k, message: `${k}: "${v}" is not a known ${col.ref}` });
          }
          break;
        }
        default: break;
      }
    }
    for (const col of cols) {
      if (col.required && (r[col.key] === undefined)) errors.push({ row: i, col: col.key, message: `${col.key} is required` });
    }
  });
  return { errors, warnings };
}

/** Reference sets from the live files, for validateRows. */
export function buildRefs({ resources = [], quests = [] } = {}) {
  return {
    resource: new Set(resources.map((r) => r.type)),
    npc: new Set(resources.filter((r) => r.category === 'npc').map((r) => r.type)),
    tile: new Set(resources.filter((r) => r.category === 'tile').map((r) => r.type)),
    quest: new Set(quests.map((q) => q.title)),
  };
}
