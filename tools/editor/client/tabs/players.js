/**
 * Players tab (parity with game-editor/src/Players.jsx).
 *
 * Selection panel: scope filters (frontier, settlement), search, sort, the player list and the
 * two bulk-deletion tools. Editing space: the full sortable player table (#players) or one
 * player's inspector (#players/<id>) with wallet and inventory quantity edits, skill and power
 * deletions, Send Home, Reset Password, Migrate FTUE and Delete Account.
 *
 * Every write goes to the game server through the /api/game proxy, which may be production:
 * each one sits behind confirm() and reports the server's answer in a toast or a modal.
 * Nothing is written on mount.
 */
import { el, clear } from '../core/dom.js';
import { game, local } from '../core/api.js';
import { loadResources } from '../core/resources.js';
import { setDirty } from '../core/dirty.js';
import { modal, confirm, prompt, toast, setStatus } from '../core/ui.js';

const WALLET_TYPES = ['Money', 'Gem', 'Green Heart', 'Yellow Heart', 'Purple Heart'];
const ASPIRATION = { 1: '🌱', 2: '⚔️', 3: '🏛️' };
const DAY = 24 * 60 * 60 * 1000;

const COLUMNS = [
  { key: 'username', label: 'Username' },
  { key: 'language', label: 'Language' },
  { key: 'netWorth', label: 'Net Worth' },
  { key: 'money', label: 'Money' },
  { key: 'accountStatus', label: 'Account Status' },
  { key: 'role', label: 'Role' },
  { key: 'browser', label: 'Browser' },
  { key: 'os', label: 'OS' },
  { key: 'latency', label: 'Latency' },
  { key: 'created', label: 'Created' },
  { key: 'lastActive', label: 'Last Active' },
  { key: 'location', label: 'Last Location', sortable: false },
  { key: 'ftuestep', label: 'FTUE Step' },
  { key: 'aspiration', label: 'Aspiration' },
  { key: 'diagnostics', label: 'Diagnostics', sortable: false },
];

// The device diagnostics captured at account creation (player.ftueFeedback.*).
const DIAG_ROWS = [
  ['Browser', (f) => f.browser || '-'],
  ['OS', (f) => f.os || '-'],
  ['Latency', (f) => (f.latency != null ? `${f.latency}ms` : '-')],
  ['Connection', (f) => f.connectionType || '-'],
  ['Downlink', (f) => (f.downlink != null ? `${f.downlink} Mbps` : '-')],
  ['Screen', (f) => (f.screenWidth && f.screenHeight ? `${f.screenWidth}x${f.screenHeight}` : '-')],
  ['Viewport', (f) => (f.viewportWidth && f.viewportHeight ? `${f.viewportWidth}x${f.viewportHeight}` : '-')],
  ['Pixel Ratio', (f) => f.devicePixelRatio || '-'],
  ['Memory', (f) => (f.deviceMemory != null ? `${f.deviceMemory} GB` : '-')],
  ['CPU Cores', (f) => f.hardwareConcurrency || '-'],
  ['Mobile', (f) => yesNo(f.isMobile)],
  ['Touch', (f) => yesNo(f.isTouchDevice)],
  ['WebGL', (f) => yesNo(f.webglSupported)],
  ['Timezone', (f) => f.timezone || '-'],
];

// ----------------------------------------------------------------------------- state
const P = {
  loaded: false, loading: false, error: null,
  players: [], xpLevels: [], resources: [], frontiers: [], settlements: [],
  search: '', frontier: '', settlement: '', sort: { key: null, dir: 'asc' },
  selectedId: null,
  pending: { wallet: {}, inventory: {}, skills: new Set(), powers: new Set() },
  collapsed: { diagnostics: true, wallet: false, inventory: false, skills: false, powers: false, quests: true },
  ctx: null, els: {},
};

// ----------------------------------------------------------------------------- helpers
const yesNo = (v) => (v == null ? '-' : v ? 'Yes' : 'No');
const num = (v) => Number(v || 0).toLocaleString();
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : 'Unknown');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString() : '');
const money = (p) => Number(p.inventory?.find((i) => i.type === 'Money')?.quantity) || 0;
const current = () => (P.selectedId ? P.players.find((p) => String(p._id) === P.selectedId) : null);

function ago(d) {
  if (!d) return 'Never';
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / DAY), hours = Math.floor(diff / 3600000), mins = Math.floor(diff / 60000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}
function daysAgo(d) { return Math.floor((Date.now() - new Date(d).getTime()) / DAY); }
function location(p) { return p.location?.gtype ? `${p.location.gtype} (${p.location.x}, ${p.location.y})` : 'Unknown'; }
function settlementName(id) {
  if (!id) return 'No homestead';
  const s = P.settlements.find((x) => String(x._id) === String(id));
  return s ? s.name : 'Unknown Settlement';
}
function frontierName(id) { const f = P.frontiers.find((x) => String(x._id) === String(id)); return f ? f.name || String(f._id) : String(id); }
function itemName(obj) { return (obj && typeof obj === 'object') ? (obj.name || obj.type || 'Unknown') : typeof obj === 'string' ? obj : 'Invalid'; }
function walletItems(inv) { return (inv || []).filter((i) => WALLET_TYPES.includes(i.type) && i.quantity > 0).sort((a, b) => a.type.localeCompare(b.type)); }
function nonWalletItems(inv) { return (inv || []).filter((i) => !WALLET_TYPES.includes(i.type)).sort((a, b) => a.type.localeCompare(b.type)); }
function warehouseUsage(inv) { return (inv || []).filter((i) => !WALLET_TYPES.includes(i.type)).reduce((t, i) => t + (i.quantity || 0), 0); }
function sortedByName(list) { return [...(list || [])].sort((a, b) => itemName(a).localeCompare(itemName(b))); }

// xpLevels is the array of XP thresholds: level 1 is 0 XP, level 2 is xpLevels[0], and so on.
function derivedLevel(p) {
  const xp = p?.xp || 0;
  let level = 1;
  for (let i = 0; i < P.xpLevels.length; i++) { if (xp >= P.xpLevels[i]) level = i + 2; else break; }
  return level;
}
// Base backpack capacity plus every owned skill whose resource output is backpackCapacity.
function derivedBackpack(p) {
  const base = p?.backpackCapacity || 0;
  let bonus = 0;
  for (const s of p?.skills || []) {
    const r = P.resources.find((x) => x.type === s.type);
    if (r && r.output === 'backpackCapacity') bonus += r.qtycollected || 0;
  }
  return base + bonus;
}

function statusBadge(p) { const s = p.accountStatus || 'Free'; return el('span', { class: `badge pstatus ${s.toLowerCase()}` }, s); }
function roleBadge(p) { const r = p.role || 'Citizen'; return el('span', { class: `badge prole ${r.toLowerCase()}` }, r); }

function diagTable(f) {
  if (!f) return el('div', { class: 'note' }, 'No diagnostics recorded for this player.');
  return el('table', { class: 'sheet players' }, [el('tbody', {}, DIAG_ROWS.map(([label, fn]) => el('tr', {}, [el('td', { class: 'muted' }, label), el('td', {}, String(fn(f)))])))]);
}
function showDiagnostics(p) { modal({ title: `Diagnostics: ${p.username}`, body: diagTable(p.ftueFeedback) }); }

function failModal(title, errOrRes) {
  const message = errOrRes?.message || errOrRes?.error || 'The server did not report success.';
  const body = errOrRes?.body ?? errOrRes;
  modal({ title, body: el('div', {}, [el('p', {}, message), body ? el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap', maxHeight: '240px', overflow: 'auto' } }, typeof body === 'string' ? body : JSON.stringify(body, null, 2)) : null]) });
}

// ----------------------------------------------------------------------------- data
async function fetchPlayers() {
  P.loading = true; P.error = null;
  renderSelection(); renderEditor();
  try { P.players = (await game.get('/api/players')) || []; }
  catch (err) { P.error = err.message; }
  P.loading = false;
  renderSelection(); renderEditor();
}
async function loadSupport() {
  const [xp, res, fr, se] = await Promise.allSettled([local.tuning('xpLevels'), loadResources(), game.get('/api/frontiers'), game.get('/api/settlements')]);
  P.xpLevels = xp.status === 'fulfilled' ? (xp.value.data || []).map((l) => l.xp) : [];
  P.resources = res.status === 'fulfilled' ? res.value.list : [];
  P.frontiers = fr.status === 'fulfilled' && Array.isArray(fr.value) ? fr.value : [];
  P.settlements = se.status === 'fulfilled' && Array.isArray(se.value) ? se.value : [];
  if (fr.status === 'rejected' || se.status === 'rejected') toast('Frontier/settlement lists unavailable; scope filters are off', 'warn');
}

// ----------------------------------------------------------------------------- filter + sort
function scoped() {
  let list = P.players;
  if (P.frontier) {
    const ids = new Set(P.settlements.filter((s) => String(s.frontierId?._id || s.frontierId) === P.frontier).map((s) => String(s._id)));
    list = list.filter((p) => !p.settlementId || ids.has(String(p.settlementId)));
  }
  if (P.settlement) list = list.filter((p) => !p.settlementId || String(p.settlementId) === P.settlement);
  if (P.search) {
    const q = P.search.toLowerCase();
    list = list.filter((p) => (p.username || '').toLowerCase().includes(q) || String(p._id).includes(q));
  }
  return list;
}
function sortValue(p, key) {
  switch (key) {
    case 'created': case 'lastActive': return new Date(p[key] || 0).getTime();
    case 'netWorth': case 'ftuestep': case 'aspiration': return Number(p[key]) || 0;
    case 'money': return money(p);
    case 'browser': case 'os': return (p.ftueFeedback?.[key] || '').toLowerCase();
    case 'latency': return p.ftueFeedback?.latency ?? 99999;
    default: { const v = p[key]; return typeof v === 'string' ? v.toLowerCase() : v == null ? '' : v; }
  }
}
function sorted(list) {
  if (!P.sort.key) return list;
  const dir = P.sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => { const x = sortValue(a, P.sort.key), y = sortValue(b, P.sort.key); return x < y ? -dir : x > y ? dir : 0; });
}
function setSort(key) {
  if (P.sort.key === key) P.sort.dir = P.sort.dir === 'asc' ? 'desc' : 'asc';
  else P.sort = { key, dir: 'asc' };
  renderSelection(); renderEditor();
}

// ----------------------------------------------------------------------------- pending edits
function hasPending() { return Object.keys(P.pending.wallet).length > 0 || Object.keys(P.pending.inventory).length > 0 || P.pending.skills.size > 0 || P.pending.powers.size > 0; }
function clearPending() { P.pending = { wallet: {}, inventory: {}, skills: new Set(), powers: new Set() }; refreshDirty(); }
function refreshDirty() {
  const p = current();
  const dirty = !!p && hasPending();
  setDirty('players', p ? p.username : '', dirty);
  if (P.els.btnSave) P.els.btnSave.disabled = !dirty;
  if (P.els.btnDiscard) P.els.btnDiscard.disabled = !dirty;
  if (P.els.pendingBadge) P.els.pendingBadge.textContent = dirty ? 'unsaved edits' : '';
}

async function selectPlayer(id) {
  if (id !== P.selectedId && hasPending()) {
    const p = current();
    if (!(await confirm(`Discard unsaved edits for "${p?.username}"?`, { title: 'Unsaved edits', okLabel: 'Discard', danger: true }))) return;
    clearPending();
  }
  P.ctx.navigate(id ? `players/${id}` : 'players');
}

// ----------------------------------------------------------------------------- writes (all confirmed)
async function saveChanges() {
  const p = current();
  if (!p || !hasPending()) return;
  const { wallet, inventory, skills, powers } = P.pending;
  const ok = await confirm(el('div', {}, [
    el('p', {}, `Save all changes for "${p.username}"?`),
    el('ul', {}, [
      el('li', {}, `Wallet items: ${Object.keys(wallet).length} changes`),
      el('li', {}, `Inventory items: ${Object.keys(inventory).length} changes`),
      el('li', {}, `Skill deletions: ${skills.size}`),
      el('li', {}, `Power deletions: ${powers.size}`),
    ]),
    el('div', { class: 'note' }, 'POST /api/update-profile on the game server.'),
  ]), { title: 'Save changes', okLabel: 'Save' });
  if (!ok) return;

  const updates = {};
  if (Object.keys(wallet).length || Object.keys(inventory).length) {
    const inv = (p.inventory || []).map((i) => ({ ...i }));
    for (const [type, qty] of [...Object.entries(wallet), ...Object.entries(inventory)]) {
      const i = inv.findIndex((x) => x.type === type);
      if (i >= 0) inv[i].quantity = Number(qty);
    }
    updates.inventory = inv;
  }
  if (skills.size) updates.skills = (p.skills || []).filter((_, i) => !skills.has(i));
  if (powers.size) updates.powers = (p.powers || []).filter((_, i) => !powers.has(i));

  try {
    const res = await game.post('/api/update-profile', { playerId: p._id, updates });
    if (!res?.success) return failModal('Save failed', res);
    Object.assign(p, updates); // keep the local row in step; the response's full player doc (which carries the password hash) is not kept
    clearPending();
    toast(`Changes saved for "${p.username}"`);
    renderSelection(); renderEditor();
  } catch (err) { failModal('Save failed', err); }
}

async function sendHome(p) {
  const ok = await confirm(el('div', {}, [
    el('p', {}, `Send "${p.username}" back to their home grid?`),
    el('ul', {}, [el('li', {}, 'Move them to their home grid'), el('li', {}, 'Reset their position to the Signpost'), el('li', {}, 'Restore their HP to full')]),
  ]), { title: 'Send home', okLabel: 'Send home' });
  if (!ok) return;
  try {
    const res = await game.post('/api/send-player-home', { playerId: p._id });
    if (!res?.success) return failModal('Send home failed', res);
    toast(res.message || `"${p.username}" has been sent home`);
    await fetchPlayers(); // show the new location
  } catch (err) { failModal('Send home failed', err); }
}

async function resetPassword(p) {
  const ok = await confirm(el('div', {}, [
    el('p', {}, `Reset the password for "${p.username}"?`),
    el('ul', {}, [el('li', {}, 'Their password becomes the temporary password: temp'), el('li', {}, 'They will need to log in with it and change it')]),
  ]), { title: 'Reset password', okLabel: 'Reset password', danger: true });
  if (!ok) return;
  try {
    const res = await game.post('/api/reset-password', { playerId: p._id });
    if (!res?.success) return failModal('Reset password failed', res);
    toast(res.message || `Password reset to "temp" for "${p.username}"`);
  } catch (err) { failModal('Reset password failed', err); }
}

// Historic FTUE renumbering: step 4 advances to 5 once the player owns the Grower NPC; step 8 becomes 9.
async function migrateFTUE(p) {
  const step = p.ftuestep;
  const info = (text) => modal({ title: 'Migrate FTUE', body: el('div', { style: { whiteSpace: 'pre-wrap' } }, text) });
  if (!step || step < 4) return info(`"${p.username}" is at FTUE step ${step || 'none'}: no migration needed (only steps 4 and 8 need migration).`);
  let newStep = step, plan = '';
  if (step === 4) {
    const hasSkill = (p.skills || []).some((s) => s.type === 'Grower' || s.name === 'Grower');
    const hasItem = (p.inventory || []).some((i) => i.type === 'Grower');
    const hasQuest = (p.activeQuests || []).some((q) => q.questId === 'Grower' || (q.questId && q.questId.includes('Grower')));
    if (!(hasSkill || hasItem)) return info(`"${p.username}" is at step 4 but doesn't have the Grower NPC: no migration needed.\n\nGrower skill: ${hasSkill}\nGrower in inventory: ${hasItem}\nGrower quest: ${hasQuest}`);
    newStep = 5; plan = 'Step 4 to 5 (has Grower NPC, can advance to the feedback step)';
  } else if (step === 8) {
    newStep = 9; plan = 'Step 8 to 9 (simple renumbering)';
  } else {
    return info(`"${p.username}" is at step ${step}: no migration rule is defined for this step.`);
  }
  const ok = await confirm(el('div', {}, [
    el('p', {}, `Migrate FTUE for "${p.username}"?`),
    el('div', {}, `Current step: ${step}`), el('div', {}, `Migration: ${plan}`),
    el('div', { class: 'note' }, 'This updates ftuestep in the database (POST /api/update-profile).'),
  ]), { title: 'Migrate FTUE', okLabel: 'Migrate' });
  if (!ok) return;
  try {
    const res = await game.post('/api/update-profile', { playerId: p._id, updates: { ftuestep: newStep } });
    if (!res?.success) return failModal('FTUE migration failed', res);
    p.ftuestep = newStep;
    toast(`FTUE migrated for "${p.username}": ${plan}`);
    renderSelection(); renderEditor();
  } catch (err) { failModal('FTUE migration failed', err); }
}

async function deleteAccount(p) {
  const typed = await prompt(el('div', {}, [
    el('p', {}, `Permanently delete the account "${p.username}"? This deletes all player data, their homestead grid, every inventory item and all progress. It cannot be undone.`),
    el('p', {}, [`Type the username `, el('strong', { class: 'mono' }, p.username), ' to confirm.']),
  ]), { title: 'Delete account', placeholder: p.username });
  if (typed === null) return;
  if (typed !== p.username) return toast('Username did not match; nothing was deleted', 'warn');
  try {
    const res = await game.post('/api/delete-player', { playerId: p._id });
    if (!res?.success) return failModal('Delete failed', res);
    P.players = P.players.filter((x) => String(x._id) !== String(p._id));
    clearPending();
    toast(`Account "${p.username}" deleted`);
    P.ctx.navigate('players');
    renderSelection(); renderEditor();
  } catch (err) { failModal('Delete failed', err); }
}

// Bulk deletion: preview the matching profiles, then a typed final confirmation, then one
// POST /api/delete-player per profile (the same route the single delete uses).
const BULK = {
  unstarted: {
    title: 'Delete Unstarted Profiles',
    criteria: 'First-time users only: Last Active 7+ days ago (or never), FTUE Step 3 or less',
    match: (p) => { const la = p.lastActive ? new Date(p.lastActive) : null; return (!la || la <= new Date(Date.now() - 7 * DAY)) && (p.ftuestep || 0) <= 3 && p.firsttimeuser === true; },
  },
  inactive: {
    title: 'Delete Inactive Profiles',
    criteria: '(First-time users: Last Active 21+ days ago and FTUE Step 6 or less) OR (any profile: Last Active 30+ days ago or never)',
    match: (p) => {
      const la = p.lastActive ? new Date(p.lastActive) : null;
      const c1 = (!la || la <= new Date(Date.now() - 21 * DAY)) && (p.ftuestep || 0) <= 6 && p.firsttimeuser === true;
      const c2 = !la || la <= new Date(Date.now() - 30 * DAY);
      return c1 || c2;
    },
  },
};
function bulkPreview(kind) {
  const def = BULK[kind];
  const profiles = P.players.filter(def.match).sort((a, b) => new Date(a.lastActive || 0) - new Date(b.lastActive || 0));
  if (!profiles.length) return toast('No profiles match the criteria for deletion', 'warn');
  const table = el('table', { class: 'sheet players' }, [
    el('thead', {}, el('tr', {}, ['Username', 'Last Active', 'FTUE Step', 'Created', 'Settlement'].map((h) => el('th', {}, h)))),
    el('tbody', {}, profiles.slice(0, 50).map((p) => el('tr', {}, [
      el('td', {}, `${p.icon || '😀'} ${p.username}`),
      el('td', { class: 'err' }, p.lastActive ? `${daysAgo(p.lastActive)} days ago` : 'Never'),
      el('td', {}, String(p.ftuestep || 0)),
      el('td', {}, fmtDate(p.created)),
      el('td', {}, settlementName(p.settlementId)),
    ]))),
  ]);
  modal({
    title: `🗑 ${def.title}`,
    width: '720px',
    body: el('div', {}, [
      el('p', {}, [el('strong', {}, 'Total profiles to delete: '), String(profiles.length)]),
      el('div', { class: 'note' }, def.criteria),
      el('div', { style: { maxHeight: '50vh', overflow: 'auto' } }, table),
      profiles.length > 50 ? el('div', { class: 'note' }, `...and ${profiles.length - 50} more profiles`) : null,
    ]),
    buttons: [
      { label: 'Cancel' },
      { label: `Delete ${profiles.length} profiles`, danger: true, onClick: (close) => { close(); bulkDelete(profiles); } },
    ],
  });
}
async function bulkDelete(profiles) {
  const typed = await prompt(`FINAL CONFIRMATION. You are about to permanently delete ${profiles.length} player accounts. This cannot be undone. Type ${profiles.length} to proceed.`, { title: 'Bulk delete', placeholder: String(profiles.length) });
  if (typed === null) return;
  if (typed.trim() !== String(profiles.length)) return toast('Count did not match; nothing was deleted', 'warn');
  let ok = 0; const failed = [];
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    setStatus(`Deleting ${i + 1}/${profiles.length}: ${p.username}`);
    try {
      const res = await game.post('/api/delete-player', { playerId: p._id });
      if (res?.success) ok++; else failed.push(`${p.username}: ${res?.error || 'no success flag'}`);
    } catch (err) { failed.push(`${p.username}: ${err.message}`); }
  }
  setStatus('');
  const deleted = new Set(profiles.map((p) => String(p._id)));
  P.players = P.players.filter((p) => !deleted.has(String(p._id)));
  if (P.selectedId && deleted.has(P.selectedId)) { clearPending(); P.ctx.navigate('players'); }
  modal({ title: 'Bulk deletion completed', body: el('div', {}, [
    el('p', {}, `Successfully deleted: ${ok} profiles`),
    el('p', {}, `Failed to delete: ${failed.length} profiles`),
    failed.length ? el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap' } }, failed.join('\n')) : null,
  ]) });
  renderSelection(); renderEditor();
}

// ----------------------------------------------------------------------------- selection panel
function renderSelection() {
  const s = clear(P.els.selection);
  s.appendChild(el('h2', {}, '😀 Players'));
  const list = sorted(scoped());
  const scopedOn = P.frontier || P.settlement || P.search;
  s.appendChild(el('div', { class: 'note' }, [el('strong', {}, 'Total players: '), String(P.players.length), scopedOn ? ` (${list.length} in scope)` : '']));
  s.appendChild(el('div', { class: 'row' }, [
    el('button', { onclick: fetchPlayers, disabled: P.loading }, '🔄 Refresh'),
    el('button', { onclick: () => selectPlayer(null), disabled: !P.selectedId, title: 'Show the full player table' }, 'All players'),
  ]));

  s.appendChild(el('input', { placeholder: 'Search username or id…', value: P.search, style: { width: '100%', margin: '6px 0' }, oninput: (e) => { P.search = e.target.value; drawList(); renderEditorIfTable(); } }));

  if (P.frontiers.length || P.settlements.length) {
    const settlementsIn = P.settlements.filter((x) => !P.frontier || String(x.frontierId?._id || x.frontierId) === P.frontier);
    s.appendChild(el('div', { class: 'row', style: { margin: '4px 0' } }, [
      el('select', { style: { flex: 1 }, title: 'Frontier scope', onchange: (e) => { P.frontier = e.target.value; P.settlement = ''; renderSelection(); renderEditorIfTable(); } }, [
        el('option', { value: '' }, 'All frontiers'),
        ...P.frontiers.map((f) => el('option', { value: String(f._id), selected: P.frontier === String(f._id) }, f.name || String(f._id))),
      ]),
    ]));
    s.appendChild(el('div', { class: 'row', style: { margin: '4px 0' } }, [
      el('select', { style: { flex: 1 }, title: 'Settlement scope (players without a homestead are always included)', onchange: (e) => { P.settlement = e.target.value; renderSelection(); renderEditorIfTable(); } }, [
        el('option', { value: '' }, 'All settlements'),
        ...settlementsIn.map((x) => el('option', { value: String(x._id), selected: P.settlement === String(x._id) }, x.name || String(x._id))),
      ]),
    ]));
  }

  s.appendChild(el('div', { class: 'row', style: { margin: '4px 0' } }, [
    el('span', { class: 'muted' }, 'sort'),
    el('select', { style: { flex: 1 }, onchange: (e) => { P.sort = { key: e.target.value || null, dir: P.sort.dir }; renderSelection(); renderEditor(); } }, [
      el('option', { value: '', selected: !P.sort.key }, 'Server order (recent first)'),
      ...COLUMNS.filter((c) => c.sortable !== false).map((c) => el('option', { value: c.key, selected: P.sort.key === c.key }, c.label)),
    ]),
    el('button', { title: 'Toggle direction', disabled: !P.sort.key, onclick: () => { P.sort.dir = P.sort.dir === 'asc' ? 'desc' : 'asc'; renderSelection(); renderEditor(); } }, P.sort.dir === 'asc' ? '↑' : '↓'),
  ]));

  const ul = el('ul', { class: 'list players-list' });
  const drawList = () => {
    clear(ul);
    const rows = sorted(scoped());
    if (P.loading) ul.appendChild(el('li', { class: 'muted' }, 'loading…'));
    for (const p of rows) ul.appendChild(el('li', { class: P.selectedId === String(p._id) ? 'active' : '', title: `${p.username}: ${location(p)}`, onclick: () => selectPlayer(String(p._id)) }, [
      el('span', {}, `${p.icon || '😀'} ${p.username}`),
      el('small', { class: 'muted' }, ago(p.lastActive)),
    ]));
    if (!rows.length && !P.loading) ul.appendChild(el('li', { class: 'muted' }, P.error ? 'load failed' : 'no players'));
  };
  drawList();
  s.appendChild(ul);

  s.appendChild(el('h3', {}, 'Bulk deletion'));
  s.appendChild(el('div', { class: 'row', style: { flexDirection: 'column', alignItems: 'stretch' } }, [
    el('button', { class: 'danger', disabled: P.loading || !P.players.length, title: BULK.unstarted.criteria, onclick: () => bulkPreview('unstarted') }, '🗑 Delete Unstarted Profiles'),
    el('button', { class: 'danger', disabled: P.loading || !P.players.length, title: BULK.inactive.criteria, onclick: () => bulkPreview('inactive') }, '🗑 Delete Inactive Profiles'),
  ]));
  s.appendChild(el('div', { class: 'note' }, 'Both preview the matching profiles before anything is deleted, then require a typed count.'));
}
function renderEditorIfTable() { if (!current()) renderEditor(); }

// ----------------------------------------------------------------------------- editing space
function renderEditor() {
  const root = clear(P.els.editor);
  P.els.btnSave = P.els.btnDiscard = P.els.pendingBadge = null;
  if (P.loading && !P.players.length) { root.appendChild(el('div', { class: 'stub' }, 'Loading players…')); return; }
  if (P.error && !P.players.length) { root.appendChild(el('div', { class: 'stub' }, [el('p', {}, `Failed to fetch players from the game server: ${P.error}`), el('button', { onclick: fetchPlayers }, 'Retry')])); return; }
  const p = current();
  if (P.selectedId && !p) {
    root.appendChild(el('div', { class: 'toolbar' }, [el('button', { onclick: () => selectPlayer(null) }, '← All players')]));
    root.appendChild(el('div', { class: 'stub' }, `No player with id ${P.selectedId} in the list (deleted, or the list is stale: Refresh).`));
    return;
  }
  if (p) renderInspector(root, p); else renderTable(root);
}

function renderTable(root) {
  const rows = sorted(scoped());
  root.appendChild(el('div', { class: 'toolbar' }, [
    el('strong', {}, 'All players'),
    el('span', { class: 'muted' }, `${rows.length} shown of ${P.players.length}`),
    el('span', { class: 'spacer' }),
    el('span', { class: 'note' }, 'Click a column to sort, a row to inspect.'),
  ]));
  const thead = el('thead', {}, el('tr', {}, COLUMNS.map((c) => el('th', {
    class: [P.sort.key === c.key && 'sorted', P.sort.key === c.key && P.sort.dir === 'desc' && 'desc'].filter(Boolean).join(' '),
    style: c.sortable === false ? { cursor: 'default' } : undefined,
    onclick: c.sortable === false ? undefined : () => setSort(c.key),
  }, c.label))));
  const tbody = el('tbody', {}, rows.map((p) => el('tr', { class: P.selectedId === String(p._id) ? 'selected' : '', onclick: () => selectPlayer(String(p._id)) }, [
    el('td', {}, `${p.icon || '😀'} ${p.username}`),
    el('td', {}, p.language || 'Unknown'),
    el('td', { class: 'num' }, num(p.netWorth)),
    el('td', { class: 'num' }, num(money(p))),
    el('td', {}, statusBadge(p)),
    el('td', {}, roleBadge(p)),
    el('td', {}, p.ftueFeedback?.browser || ''),
    el('td', {}, p.ftueFeedback?.os || ''),
    el('td', { class: 'num' }, p.ftueFeedback?.latency != null ? `${p.ftueFeedback.latency}ms` : ''),
    el('td', {}, fmtDate(p.created)),
    el('td', { title: fmtDateTime(p.lastActive) }, ago(p.lastActive)),
    el('td', {}, location(p)),
    el('td', { class: 'num' }, p.ftuestep ? String(p.ftuestep) : ''),
    el('td', {}, ASPIRATION[p.aspiration] || ''),
    el('td', {}, p.ftueFeedback ? el('button', { class: 'diag-btn', title: DIAG_ROWS.map(([l, fn]) => `${l}: ${fn(p.ftueFeedback)}`).join('\n'), onclick: (e) => { e.stopPropagation(); showDiagnostics(p); } }, 'i') : ''),
  ])));
  const wrap = el('div', { class: 'players-table-wrap' }, el('table', { class: 'sheet players' }, [thead, tbody]));
  if (!rows.length) wrap.appendChild(el('div', { class: 'stub' }, P.settlement ? 'No players found in the selected settlement.' : P.frontier ? 'No players found in the selected frontier.' : 'No players found.'));
  root.appendChild(wrap);
}

function section(key, title, body, count) {
  const open = !P.collapsed[key];
  const head = el('div', { class: 'psection-head', onclick: () => { P.collapsed[key] = open; renderEditor(); } }, [el('span', {}, `${open ? '▼' : '▶'} ${title}`), count != null ? el('span', { class: 'badge' }, String(count)) : null]);
  return el('div', { class: 'psection' }, [head, open ? el('div', { class: 'psection-body' }, body) : null]);
}
function kv(label, value) { return [el('div', { class: 'k' }, label), el('div', { class: 'v' }, value)]; }

// One wallet/inventory row: a number input whose change is a pending edit until Save.
function qtyRow(sectionKey, item) {
  const pend = P.pending[sectionKey];
  const badge = el('span', { class: 'badge warn' }, '');
  const revert = el('button', { title: 'Revert this edit', onclick: () => { delete pend[item.type]; input.value = item.quantity; sync(); } }, '↶');
  const input = el('input', { type: 'number', min: 0, step: 1, value: pend[item.type] ?? item.quantity, style: { width: '90px' }, onchange: (e) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v) || v < 0) { toast('Enter a non-negative number', 'warn'); e.target.value = pend[item.type] ?? item.quantity; return; }
    if (v === Number(item.quantity)) delete pend[item.type]; else pend[item.type] = v;
    sync();
  } });
  const row = el('div', { class: 'row qty-edit' }, [el('span', { class: 'qty-name' }, item.type), input, badge, revert]);
  const sync = () => {
    const changed = pend[item.type] !== undefined;
    row.classList.toggle('pending', changed);
    badge.textContent = changed ? `was ${num(item.quantity)}` : '';
    revert.style.display = changed ? '' : 'none';
    refreshDirty();
  };
  sync();
  return row;
}
// One skill/power row: a toggle that marks the original index for deletion until Save.
function deleteRow(sectionKey, obj, originalIndex, text) {
  const set = P.pending[sectionKey];
  const label = el('span', {}, text);
  const btn = el('button', { onclick: () => { if (set.has(originalIndex)) set.delete(originalIndex); else set.add(originalIndex); sync(); } }, '');
  const row = el('div', { class: 'row qty-edit' }, [label, btn]);
  const sync = () => {
    const marked = set.has(originalIndex);
    row.classList.toggle('strike', marked);
    btn.textContent = marked ? '↶ undo' : '🗑';
    btn.title = marked ? 'Undo deletion' : 'Mark for deletion';
    refreshDirty();
  };
  sync();
  return row;
}

function renderInspector(root, p) {
  setStatus(`players/${p.username}`);
  P.els.btnSave = el('button', { class: 'primary', onclick: saveChanges }, '💾 Save Changes');
  P.els.btnDiscard = el('button', { onclick: () => { clearPending(); renderEditor(); } }, 'Discard');
  P.els.pendingBadge = el('span', { class: 'badge warn' }, '');
  root.appendChild(el('div', { class: 'toolbar' }, [
    el('button', { onclick: () => selectPlayer(null) }, '← All players'),
    el('strong', {}, `${p.icon || '😀'} ${p.username}`),
    statusBadge(p), roleBadge(p),
    el('span', { class: 'mono muted', title: 'Player id' }, String(p._id)),
    el('span', { class: 'spacer' }),
    P.els.pendingBadge, P.els.btnDiscard, P.els.btnSave,
  ]));
  root.appendChild(el('div', { class: 'toolbar' }, [
    el('button', { disabled: true, title: 'Not implemented (the Electron tab had this button disabled too)' }, 'Send Message'),
    el('button', { onclick: () => sendHome(p) }, '🏠 Send Home'),
    el('button', { onclick: () => resetPassword(p) }, '🔑 Reset Password'),
    el('button', { onclick: () => migrateFTUE(p) }, '🎓 Migrate FTUE'),
    el('span', { class: 'spacer' }),
    el('button', { class: 'danger', onclick: () => deleteAccount(p) }, '🗑 Delete Account'),
  ]));

  const body = el('div', { class: 'inspector' });
  const backpack = derivedBackpack(p);
  body.appendChild(el('div', { class: 'kv' }, [
    ...kv('First time user?', String(p.firsttimeuser === true)),
    ...kv('FTUE step', String(p.ftuestep || 0)),
    ...kv('Aspiration', p.aspiration ? `${ASPIRATION[p.aspiration] || ''} ${p.aspiration}` : 'none'),
    ...kv('Language', p.language || 'Unknown'),
    ...kv('XP', `${num(p.xp)} (Level ${derivedLevel(p)})`),
    ...kv('Net worth', num(p.netWorth)),
    ...kv('Warehouse level', String(p.warehouseLevel || 1)),
    ...kv('Warehouse capacity', p.warehouseCapacity ? `${num(p.warehouseCapacity)} (${num(warehouseUsage(p.inventory))} used)` : 'N/A'),
    ...kv('Backpack capacity', `${num(backpack)}${backpack !== (p.backpackCapacity || 0) ? ` (base: ${num(p.backpackCapacity)})` : ''}`),
    ...kv('Active quests', String(p.activeQuests?.length || 0)),
    ...kv('Completed quests', String(p.completedQuests?.length || 0)),
    ...kv('Created', fmtDateTime(p.created) || 'Unknown'),
    ...kv('Last active', p.lastActive ? `${fmtDateTime(p.lastActive)} (${ago(p.lastActive)})` : 'Never'),
    ...kv('Last location', location(p)),
    ...kv('Settlement', settlementName(p.settlementId)),
    ...kv('Browser / OS', `${p.ftueFeedback?.browser || '-'} / ${p.ftueFeedback?.os || '-'}`),
    ...kv('Latency', p.ftueFeedback?.latency != null ? `${p.ftueFeedback.latency}ms` : '-'),
  ]));

  body.appendChild(section('diagnostics', '🖥 Diagnostics', [diagTable(p.ftueFeedback)]));

  const wallet = walletItems(p.inventory);
  body.appendChild(section('wallet', '💰 Wallet', wallet.length ? wallet.map((i) => qtyRow('wallet', i)) : [el('div', { class: 'note' }, 'No currency.')], wallet.length));

  const inv = nonWalletItems(p.inventory);
  body.appendChild(section('inventory', '📦 Inventory', inv.length ? inv.map((i) => (i && i.type && i.quantity !== undefined) ? qtyRow('inventory', i) : el('div', { class: 'note' }, 'Invalid inventory item')) : [el('div', { class: 'note' }, 'Empty.')], inv.length));

  const skills = sortedByName(p.skills);
  body.appendChild(section('skills', '🔧 Skills', skills.length ? skills.map((s) => {
    const idx = (p.skills || []).indexOf(s);
    const level = (s && typeof s === 'object') ? (s.level || s.quantity || '') : '';
    return deleteRow('skills', s, idx, `${itemName(s)}${level ? `: ${level}` : ''}`);
  }) : [el('div', { class: 'note' }, 'No skills.')], skills.length));

  const powers = sortedByName(p.powers);
  body.appendChild(section('powers', '⚡ Powers', powers.length ? powers.map((s) => deleteRow('powers', s, (p.powers || []).indexOf(s), itemName(s))) : [el('div', { class: 'note' }, 'No powers.')], powers.length));

  const active = p.activeQuests || [], done = p.completedQuests || [];
  body.appendChild(section('quests', '📜 Quests (read only)', [
    el('h3', {}, `Active (${active.length})`),
    ...(active.length ? active.map((q) => el('div', { class: 'mono', style: { fontSize: '12px' } }, `${q.questId}${q.completed ? ' (completed)' : ''}${q.rewardCollected ? ' (reward collected)' : ''}  ${[1, 2, 3].filter((n) => q[`goal${n}item`]).map((n) => `${q[`goal${n}action`] || ''} ${q[`goal${n}item`]} ${q.progress?.[`goal${n}`] ?? 0}/${q[`goal${n}qty`] ?? '?'}`).join('; ')}`)) : [el('div', { class: 'note' }, 'none')]),
    el('h3', {}, `Completed (${done.length})`),
    ...(done.length ? done.map((q) => el('div', { class: 'mono', style: { fontSize: '12px' } }, `${q.questId}  ${q.timestamp ? new Date(q.timestamp).toLocaleDateString() : ''}`)) : [el('div', { class: 'note' }, 'none')]),
  ], active.length + done.length));

  root.appendChild(body);
  refreshDirty();
}

// ----------------------------------------------------------------------------- tab
export function playersTab() {
  return {
    id: 'players', label: 'Players', icon: '👥', group: 'admin',
    async mount(selectionEl, editorEl, ctx, route) {
      P.ctx = ctx; P.els.selection = selectionEl; P.els.editor = editorEl;
      const [, rawId] = route.split('/');
      const id = rawId ? decodeURIComponent(rawId.split('?')[0]) : null;
      if (id !== P.selectedId) { clearPending(); P.selectedId = id; }
      if (!P.loaded) {
        P.loaded = true;
        renderSelection(); renderEditor();
        await Promise.all([loadSupport(), fetchPlayers()]);
      }
      renderSelection(); renderEditor();
      if (!P.selectedId) setStatus('players');
    },
    unmount() { refreshDirty(); },
  };
}
