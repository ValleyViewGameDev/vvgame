/**
 * Events tab: the frontier scheduler timers and their phase durations
 * (parity with game-editor/src/Events.jsx + components/ShowLogs.jsx).
 *
 * Selection panel: frontier + settlement pickers, the nine frontier timers with live
 * countdowns. Editing space: toolbar (refresh, End current phase), the timer detail, the
 * phase durations from tuning/globalTuning.json (edited LOCALLY through the tool server's
 * PATCH, as the Electron tab wrote the file with fs), and the settlement-side panel with its
 * log viewers. Route: #events/<frontierId>[/<settlementId>[/<event>]]
 *
 * Polling: a 1 s interval drives the countdowns client-side; when a timer passes zero the
 * frontiers are re-fetched once (read only). Live writes (force-end-phase) are behind
 * confirm() and never run on mount.
 */
import { el, clear } from '../core/dom.js';
import { local, game } from '../core/api.js';
import { modal, confirm, toast, setStatus } from '../core/ui.js';

const EVENTS = ['seasons', 'taxes', 'elections', 'train', 'carnival', 'bank', 'messages', 'networth', 'dungeon'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const E = {
  ctx: null, els: {}, active: false, timer: null,
  loaded: false,
  frontiers: [], settlements: [],
  tuning: null,                 // local tuning/globalTuning.json (what the phase editor writes)
  liveTuning: null,             // GET /api/tuning from the game server (read only, for comparison)
  frontierId: null, settlementId: null, event: 'seasons',
  phaseEdits: {},               // `${event}.${phase}` -> string being typed
  refreshing: false, expiredRefreshDone: false,
  busy: false,
};

// ----------------------------------------------------------------------------- helpers
const idOf = (v) => String(v?._id || v || '');
const fmtDate = (d) => (d ? new Date(d).toLocaleString() : 'n/a');
function activeFrontier() { return E.frontiers.find((f) => idOf(f) === String(E.frontierId)) || null; }
function activeSettlement() { return E.settlements.find((s) => idOf(s) === String(E.settlementId)) || null; }
function settlementsOfFrontier() {
  return E.settlements.filter((s) => idOf(s.frontierId) === String(E.frontierId))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
}
function timerFor(key) { return activeFrontier()?.[key] || {}; }

/** "1d 2h 3m 4s" from milliseconds (clamped at zero). */
function dhms(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}
function countdown(key) {
  const end = timerFor(key).endTime ? new Date(timerFor(key).endTime).getTime() : 0;
  return end ? dhms(end - Date.now()) : 'n/a';
}
function minutesToDhms(min) { const n = Number(min); return Number.isFinite(n) ? dhms(n * 60 * 1000) : ''; }

function showError(title, err) {
  const body = err?.body && typeof err.body === 'object' ? JSON.stringify(err.body, null, 2) : (err?.body || '');
  modal({ title, body: el('div', {}, [el('p', {}, err?.message || String(err)), body ? el('pre', { class: 'mono' }, body) : null]) });
}

// ----------------------------------------------------------------------------- data (reads)
async function loadAll() {
  const [frontiers, settlements, tuning] = await Promise.all([game.get('/api/frontiers'), game.get('/api/settlements'), local.tuning('globalTuning')]);
  E.frontiers = frontiers || [];
  E.settlements = settlements || [];
  E.tuning = tuning?.data || {};
  if (!E.frontierId && E.frontiers.length) E.frontierId = idOf(E.frontiers[0]);
  if (!E.settlementId || !settlementsOfFrontier().some((s) => idOf(s) === String(E.settlementId))) E.settlementId = idOf(settlementsOfFrontier()[0]) || null;
  E.loaded = true;
  // live tuning is informational only; a failure must not block the tab
  game.get('/api/tuning').then((t) => { E.liveTuning = t || null; if (E.active) renderEditor(); }).catch(() => { E.liveTuning = null; });
}
async function refreshFrontiers() {
  if (E.refreshing) return;
  E.refreshing = true;
  setStatus('Refreshing frontiers…');
  try {
    const [frontiers, settlements] = await Promise.all([game.get('/api/frontiers'), game.get('/api/settlements')]);
    E.frontiers = frontiers || [];
    E.settlements = settlements || [];
    E.expiredRefreshDone = false;
    setStatus(`Frontiers refreshed ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    setStatus('');
    toast(`Refresh failed: ${err.message}`, 'error');
  }
  E.refreshing = false;
  if (E.active) { renderSelection(); renderEditor(); }
}

/** Once per second: redraw countdown texts in place; re-fetch once when any timer expires. */
function tick() {
  if (!E.active) return;
  let expired = false;
  for (const key of EVENTS) {
    const text = countdown(key);
    const nodes = (E.els.countdowns[key] || []).filter((n) => n.isConnected); // drop spans from previous renders
    E.els.countdowns[key] = nodes;
    for (const node of nodes) node.textContent = text;
    const end = timerFor(key).endTime ? new Date(timerFor(key).endTime).getTime() : 0;
    if (end && end - Date.now() <= 0) expired = true;
  }
  if (expired && !E.expiredRefreshDone) { E.expiredRefreshDone = true; refreshFrontiers(); }
}
function cd(key) { const span = el('span', { class: 'mono' }, countdown(key)); (E.els.countdowns[key] ||= []).push(span); return span; }

// ----------------------------------------------------------------------------- live write (behind confirm)
async function endCurrentPhase() {
  const key = E.event;
  const f = activeFrontier();
  if (!f || !key) return;
  const ok = await confirm(`End the current "${timerFor(key).phase || 'unknown'}" phase of ${key} on frontier "${f.name}"? The server sets ${key}.endTime to one minute from now; the scheduler then advances the phase for every player.`, { title: 'End current phase', okLabel: 'End phase', danger: true });
  if (!ok) return;
  E.busy = true; renderEditor();
  try {
    const res = await game.post('/api/force-end-phase', { frontierId: E.frontierId, event: key });
    toast(res?.message || `${key} phase will end shortly`);
    E.expiredRefreshDone = false;
    await refreshFrontiers();
  } catch (err) { showError('End phase failed', err); }
  E.busy = false; renderEditor();
}

// ----------------------------------------------------------------------------- local tuning write (globalTuning.json via the tool server)
async function savePhase(event, phase) {
  const key = `${event}.${phase}`;
  const raw = E.phaseEdits[key];
  const minutes = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(minutes) || minutes < 0) return toast('Enter a duration in minutes (0 or more)', 'warn');
  const current = E.tuning?.[event]?.phases?.[phase];
  const ok = await confirm(`Write ${key} = ${minutes} min (${minutesToDhms(minutes)}) to game-server/tuning/globalTuning.json? Currently ${current} min. This is a local file edit; the game server reads it at boot, so it takes effect on the next restart or deploy.`, { title: 'Save phase duration', okLabel: 'Write file' });
  if (!ok) return;
  try {
    const res = await local.patchPhase(event, phase, minutes);
    const w = res?.written?.[0];
    E.tuning[event].phases[phase] = minutes;
    delete E.phaseEdits[key];
    toast(w ? (w.changed ? `Wrote ${w.path}: ${key} = ${minutes} min. Restart the game server to apply.` : `${w.path} unchanged`) : `Saved ${key}`);
  } catch (err) { showError('Save phase duration failed', err); }
  renderEditor();
}

// ----------------------------------------------------------------------------- logs (reads, modal tables)
function table(headers, rows) {
  return el('table', { class: 'plain' }, [
    el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.length ? rows.map((r) => el('tr', {}, r.map((c) => el('td', {}, c)))) : [el('tr', {}, el('td', { colspan: String(headers.length), class: 'muted' }, 'No entries.'))]),
  ]);
}
const lines = (items) => el('div', {}, items.map((t) => el('div', {}, t)));
const newestFirst = (arr) => [...(arr || [])].reverse();

const LOGS = {
  tax: { label: 'Tax log', path: (s) => `/api/settlement/${s}/taxlog`, pick: (r) => r.taxlog, render: (log) => table(['Date', 'Total collected', 'Current mayor', 'Mayor take'], newestFirst(log).map((e) => [fmtDate(e.date), e.totalcollected, e.currentmayor, e.mayortake])) },
  bank: { label: 'Bank log', path: (s) => `/api/settlement/${s}/banklog`, pick: (r) => r.banklog, render: (log) => table(['Date', 'Season level', 'Offers'], newestFirst(log).map((e) => [fmtDate(e.date), e.seasonlevel, lines((e.offers || []).map((o) => `${o.qty} → ${o.offer}`))])) },
  train: { label: 'Train log', path: (s) => `/api/settlement/${s}/trainlog`, pick: (r) => r.trainlog, render: (log) => table(['Date', 'Train #', 'Status', 'All offers filled', 'Winners', 'Rewards'], newestFirst(log).map((e) => [fmtDate(e.date), e.trainnumber, e.status, e.alloffersfilled ? 'Yes' : 'No', e.totalwinners, lines((e.rewards || []).map((r) => `${r.qty} × ${r.item}`))])) },
  carnival: { label: 'Carnival log', path: (s) => `/api/settlement/${s}/carnivallog`, pick: (r) => r.carnivallog, render: (log) => table(['Date', 'Carnival #', 'Status', 'All offers filled', 'Winners', 'Rewards'], newestFirst(log).map((e) => [fmtDate(e.date), e.carnivalnumber, e.status, e.alloffersfilled ? 'Yes' : 'No', e.totalwinners, lines((e.rewards || []).map((r) => `${r.qty} × ${r.item}`))])) },
  election: { label: 'Election log', path: (s) => `/api/settlement/${s}/electionlog`, pick: (r) => r.electionlog, render: (log) => table(['Date', 'Candidates', 'Elected mayor'], newestFirst(log).map((e) => [fmtDate(e.date), e.candidates?.length ? lines(e.candidates.map((c) => `${c.username}: ${c.votes} votes`)) : el('em', {}, 'No candidates'), e.electedmayor || 'None'])) },
  season: { label: 'Season log', frontier: true, path: (f) => `/api/frontier/${f}/seasonlog`, pick: (r) => r.seasonlog, render: (log) => table(['Date', 'Season', 'Winners', 'Top settlement', 'Players relocated', 'Grids reset'], newestFirst(log).map((e) => [fmtDate(e.date), `${e.seasonnumber} (${e.seasontype})`, e.seasonwinners?.length ? lines(e.seasonwinners.map((w) => `${w.username}: ${Number(w.networth || 0).toLocaleString()}`)) : el('em', {}, 'No winners'), e.winningsettlement || 'Unknown', e.playersrelocated ?? 'n/a', e.gridsreset ?? 'n/a'])) },
};
async function showLog(kind) {
  const def = LOGS[kind];
  const target = def.frontier ? E.frontierId : E.settlementId;
  if (!target) return toast(def.frontier ? 'Pick a frontier first' : 'Pick a settlement first', 'warn');
  const who = def.frontier ? activeFrontier()?.name : (activeSettlement()?.displayName || activeSettlement()?.name);
  try {
    const res = await game.get(def.path(target));
    const log = def.pick(res) || [];
    modal({ title: `${def.label}: ${who} (${log.length})`, body: def.render(log), width: '760px' });
  } catch (err) { showError(`${def.label} failed to load`, err); }
}

// ----------------------------------------------------------------------------- selection panel
function renderSelection() {
  const s = clear(E.els.selection);
  E.els.countdowns = {};
  s.appendChild(el('h2', {}, 'Events'));
  const frontierSel = el('select', { onchange: (e) => { E.frontierId = e.target.value; E.settlementId = idOf(settlementsOfFrontier()[0]) || null; E.ctx.navigate(`events/${E.frontierId}/${E.settlementId || ''}/${E.event}`); } },
    E.frontiers.length ? E.frontiers.map((f) => el('option', { value: idOf(f), selected: idOf(f) === String(E.frontierId) }, f.name)) : [el('option', { value: '' }, 'no frontiers')]);
  const stls = settlementsOfFrontier();
  const settlementSel = el('select', { onchange: (e) => { E.settlementId = e.target.value || null; E.ctx.navigate(`events/${E.frontierId}/${E.settlementId || ''}/${E.event}`); } },
    stls.length ? stls.map((st) => el('option', { value: idOf(st), selected: idOf(st) === String(E.settlementId) }, st.displayName && st.displayName !== st.name ? `${st.name} (${st.displayName})` : st.name)) : [el('option', { value: '' }, 'no settlements')]);
  s.appendChild(el('div', { class: 'row' }, [el('label', {}, 'Frontier'), frontierSel]));
  s.appendChild(el('div', { class: 'row', style: { marginTop: '4px' } }, [el('label', {}, 'Settlement'), settlementSel]));

  s.appendChild(el('h3', {}, 'Frontier timers'));
  const list = el('ul', { class: 'list ev-list' });
  for (const key of EVENTS) {
    const t = timerFor(key);
    list.appendChild(el('li', { class: E.event === key ? 'active' : '', onclick: () => E.ctx.navigate(`events/${E.frontierId}/${E.settlementId || ''}/${key}`) }, [
      el('span', {}, [el('strong', {}, cap(key)), ' ', el('span', { class: 'ev-phase' }, key === 'seasons' && t.seasonType ? `${t.seasonType} · ${t.phase || '?'}` : (t.phase || '?'))]),
      cd(key),
    ]));
  }
  s.appendChild(list);
  s.appendChild(el('div', { class: 'note' }, 'Countdowns tick locally; the frontiers are re-fetched once when a timer reaches zero.'));
}

// ----------------------------------------------------------------------------- editor space
function renderEditor() {
  const root = clear(E.els.editor);
  const key = E.event;
  const f = activeFrontier();
  const t = timerFor(key);
  const tb = el('div', { class: 'toolbar' }, [
    el('strong', {}, `${cap(key)}`),
    el('span', { class: 'badge' }, `phase: ${t.phase || 'unknown'}`),
    el('span', { class: 'muted' }, 'ends in'), cd(key),
    el('span', { class: 'spacer' }),
    el('button', { onclick: refreshFrontiers, disabled: E.refreshing }, E.refreshing ? 'Refreshing…' : '↻ Refresh'),
    el('button', { class: 'danger', disabled: E.busy || !f, onclick: endCurrentPhase, title: 'POST /api/force-end-phase: sets endTime to one minute from now' }, '⏹ End current phase'),
  ]);
  const body = el('div', { class: 'tab-body' });
  root.append(tb, body);
  if (!f) { body.appendChild(el('div', { class: 'stub' }, 'No frontier selected.')); return; }

  // frontier timer detail
  body.appendChild(el('h3', {}, `Frontier timer: ${f.name}`));
  const kv = [
    'phase', t.phase || 'unknown',
    'startTime', fmtDate(t.startTime),
    'endTime', fmtDate(t.endTime),
  ];
  if (key === 'seasons') kv.push('seasonType', t.seasonType || 'unknown', 'seasonNumber', t.seasonNumber ?? 'n/a');
  body.appendChild(el('div', { class: 'kv mono' }, kv.map((v) => el('span', {}, String(v)))));
  if (key === 'bank' && Array.isArray(t.offers)) {
    body.appendChild(el('div', { class: 'note' }, t.offers.length ? `Frontier bank offers: ${t.offers.map((o) => `${o.qtyBought}× ${o.itemBought} → ${o.qtyGiven}× ${o.itemGiven}`).join(',  ')}` : 'No frontier bank offers.'));
  }

  // phase durations (local globalTuning.json)
  body.appendChild(el('h3', {}, 'Phase durations (minutes, tuning/globalTuning.json)'));
  const phases = E.tuning?.[key]?.phases;
  if (!phases) body.appendChild(el('div', { class: 'note' }, 'No tuning data found for this event.'));
  else {
    body.appendChild(el('div', { class: 'note' }, 'Edits write the local file through the tool server (not the live game server). The scheduler reads these values at boot, so restart or deploy to apply.'));
    for (const [phase, duration] of Object.entries(phases)) {
      const k = `${key}.${phase}`;
      const edited = E.phaseEdits[k];
      const value = edited ?? duration;
      const live = E.liveTuning?.[key]?.phases?.[phase];
      const human = el('span', { class: 'muted mono' }, minutesToDhms(value));
      const btn = el('button', { class: 'primary', disabled: edited === undefined || edited === '' || Number(edited) === Number(duration), onclick: () => savePhase(key, phase) }, 'Save');
      const input = el('input', { type: 'number', min: '0', step: 'any', value: String(value), style: { width: '110px' }, oninput: (e) => {
        E.phaseEdits[k] = e.target.value;
        human.textContent = minutesToDhms(e.target.value);
        btn.disabled = e.target.value === '' || Number(e.target.value) === Number(duration);
      } });
      body.appendChild(el('div', { class: 'row ev-phase-row' }, [
        el('label', { class: 'mono ev-phase-name' }, phase),
        input, el('span', { class: 'muted' }, 'min'), human, btn,
        t.phase === phase ? el('span', { class: 'badge' }, 'current') : null,
        live !== undefined && Number(live) !== Number(duration) ? el('span', { class: 'badge warn', title: 'The running game server has a different value (its globalTuning.json at boot)' }, `live: ${live} min`) : null,
      ]));
    }
  }

  // settlement panel
  const st = activeSettlement();
  body.appendChild(el('h3', {}, `${cap(key)} in this settlement${st ? `: ${st.displayName || st.name}` : ''}`));
  if (!st) { body.appendChild(el('div', { class: 'note' }, 'No settlement selected.')); return; }
  const offers = (arr) => (Array.isArray(arr) && arr.length ? arr.map((o) => `${o.qtyBought}× ${o.itemBought} → ${o.qtyGiven}× ${o.itemGiven}${o.filled ? ' (filled)' : ''}`).join(',  ') : null);
  const logBtn = (kind) => el('button', { onclick: () => showLog(kind) }, `View ${LOGS[kind].label.toLowerCase()}`);
  const p = (text) => el('div', { class: 'ev-line' }, text);
  switch (key) {
    case 'taxes':
      body.append(p(`Tax rate: ${st.taxrate ?? 'unknown'}%`), logBtn('tax'));
      break;
    case 'seasons':
      body.append(p(`Population: ${st.population ?? 'unknown'}`), logBtn('season'));
      break;
    case 'elections': {
      const mayor = st.roles?.find((r) => String(r.roleName || '').toLowerCase() === 'mayor')?.playerId;
      body.append(p(`Mayor: ${mayor ? idOf(mayor) : 'No current Mayor.'}`), p(`Votes cast: ${st.votes?.length || 0}`), p(`Campaign promises: ${st.campaignPromises?.length || 0}`), logBtn('election'));
      break;
    }
    case 'train':
      body.append(p(`Next train number: ${st.nextTrainNumber ?? 'n/a'}`), el('div', { class: 'note' }, 'Train rewards are not stored on the settlement document; the train log records the rewards of each departed train.'), logBtn('train'));
      break;
    case 'carnival':
      body.append(p(offers(st.carnival?.currentoffers) || 'No current carnival offers.'), p(`Next carnival number: ${st.carnival?.nextCarnivalNumber ?? 'n/a'}`), logBtn('carnival'));
      break;
    case 'bank':
      body.append(p(offers(st.currentoffers) || 'No current bank offers.'), logBtn('bank'));
      break;
    case 'messages':
      body.append(p(`Last messages phase started: ${fmtDate(t.startTime)}`), el('div', { class: 'note' }, 'Messages are sent per player on the frontier timer; nothing settlement-specific is stored.'));
      break;
    case 'networth':
      body.append(p(`Last networth phase started: ${fmtDate(t.startTime)}`), el('div', { class: 'note' }, 'Networth is calculated per player on the frontier timer; nothing settlement-specific is stored.'));
      break;
    case 'dungeon':
      body.append(p(`Last dungeon phase started: ${fmtDate(t.startTime)}`), el('div', { class: 'note' }, 'Dungeon resets run per frontier; manage instances in the Dungeons tab.'));
      break;
    default:
      body.append(p('Nothing settlement-specific for this event.'));
  }
}

// ----------------------------------------------------------------------------- tab
export function eventsTab() {
  return {
    id: 'events', label: 'Events', icon: '⏱', group: 'admin',
    async mount(selectionEl, editorEl, ctx, route) {
      E.ctx = ctx; E.els.selection = selectionEl; E.els.editor = editorEl; E.els.countdowns = {}; E.active = true;
      clear(editorEl).appendChild(el('div', { class: 'stub' }, 'Loading events…'));
      try {
        if (!E.loaded) await loadAll();
      } catch (err) {
        clear(editorEl).appendChild(el('div', { class: 'stub' }, `Events failed to load: ${err.message}`));
        return;
      }
      const [, frontierId, settlementId, event] = route.split('/');
      if (frontierId && E.frontiers.some((f) => idOf(f) === frontierId)) E.frontierId = frontierId;
      if (settlementId && E.settlements.some((s) => idOf(s) === settlementId)) E.settlementId = settlementId;
      else if (!E.settlementId || !settlementsOfFrontier().some((s) => idOf(s) === String(E.settlementId))) E.settlementId = idOf(settlementsOfFrontier()[0]) || null;
      if (event && EVENTS.includes(event)) E.event = event;
      renderSelection();
      renderEditor();
      setStatus(`${E.frontiers.length} frontiers, ${E.settlements.length} settlements`);
      clearInterval(E.timer);
      E.timer = setInterval(tick, 1000);
    },
    unmount() { E.active = false; clearInterval(E.timer); E.timer = null; },
  };
}
