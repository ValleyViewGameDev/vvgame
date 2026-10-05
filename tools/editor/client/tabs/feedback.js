/**
 * Feedback tab (parity with game-editor/src/Feedback.jsx): FTUE feedback aggregation.
 *
 * Selection panel: registration date range, refresh, developer toggle, summary and the
 * positive/negative option counts. Editing space: the sortable per-player feedback table;
 * a row opens a detail modal (answers + device diagnostics) with a jump to the Players tab.
 * Read only: GET /api/feedback-data on the game server, nothing is written.
 */
import { el, clear } from '../core/dom.js';
import { game, local } from '../core/api.js';
import { modal, toast, setStatus } from '../core/ui.js';

// String ids of the FTUE feedback options (game-client strings 784-793).
const FEEDBACK_STRINGS = {
  784: 'Looks fun',
  785: 'I like the visuals',
  786: 'I like farming',
  787: 'I look forward to collaborating with others',
  788: 'I want to explore the world',
  790: "I couldn't figure it out",
  791: "I don't like the visuals",
  792: 'I had a technical issue',
  793: "It's just not for me",
};
const POSITIVE_IDS = Object.keys(FEEDBACK_STRINGS).map(Number).filter((k) => k >= 784 && k <= 788);
const NEGATIVE_IDS = Object.keys(FEEDBACK_STRINGS).map(Number).filter((k) => k > 788);

const COLUMNS = [
  { key: 'username', label: 'Username' },
  { key: 'lastActive', label: 'Last Played' },
  { key: 'language', label: 'Language' },
  { key: 'ftuestep', label: 'FTUE Step' },
  { key: 'browser', label: 'Browser' },
  { key: 'os', label: 'OS' },
  { key: 'created', label: 'Created' },
  { key: 'positive', label: 'Positive Feedback', sortable: false },
  { key: 'negative', label: 'Negative Feedback', sortable: false },
];

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
  ['Mobile', (f) => (f.isMobile == null ? '-' : f.isMobile ? 'Yes' : 'No')],
  ['Touch', (f) => (f.isTouchDevice == null ? '-' : f.isTouchDevice ? 'Yes' : 'No')],
  ['WebGL', (f) => (f.webglSupported == null ? '-' : f.webglSupported ? 'Yes' : 'No')],
  ['Timezone', (f) => f.timezone || '-'],
];

const today = () => new Date().toISOString().split('T')[0];

// ----------------------------------------------------------------------------- state
const F = {
  loaded: false, loading: false, error: null,
  players: [], developers: [], includeDevs: false,
  startDate: '2026-01-09', endDate: today(),
  sort: { key: 'username', dir: 'asc' },
  ctx: null, els: {},
};

// ----------------------------------------------------------------------------- helpers
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : 'Unknown');
function lastActive(d) {
  if (!d) return 'Never';
  const days = Math.floor(Math.abs(Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
const hasAnswers = (p) => !!p.ftueFeedback && ((p.ftueFeedback.positive?.length || 0) > 0 || (p.ftueFeedback.negative?.length || 0) > 0);
const isDev = (p) => F.developers.includes(p.username);
const answers = (ids) => (ids || []).map((i) => FEEDBACK_STRINGS[i] || `#${i}`);

function respondents() { return F.players.filter((p) => hasAnswers(p) && (F.includeDevs || !isDev(p))); }

function aggregate() {
  const agg = { positive: Object.fromEntries(POSITIVE_IDS.map((k) => [k, 0])), negative: Object.fromEntries(NEGATIVE_IDS.map((k) => [k, 0])), total: 0, positiveResponses: 0, negativeResponses: 0 };
  for (const p of F.players) {
    if (!F.includeDevs && isDev(p)) continue;
    const f = p.ftueFeedback;
    if (!f) continue;
    const pos = (f.positive?.length || 0) > 0, neg = (f.negative?.length || 0) > 0;
    if (pos) for (const i of f.positive) if (agg.positive[i] !== undefined) agg.positive[i]++;
    if (neg) for (const i of f.negative) if (agg.negative[i] !== undefined) agg.negative[i]++;
    if (pos || neg) { agg.total++; if (pos) agg.positiveResponses++; if (neg) agg.negativeResponses++; }
  }
  return agg;
}

function sortValue(p, key) {
  switch (key) {
    case 'username': return (p.username || '').toLowerCase();
    case 'lastActive': case 'created': return new Date(p[key] || 0).getTime();
    case 'language': return p.language || 'en';
    case 'ftuestep': return p.ftuestep || 999;
    case 'browser': case 'os': return p.ftueFeedback?.[key] || 'Unknown';
    default: return p[key] || '';
  }
}
function sortedRespondents() {
  const dir = F.sort.dir === 'asc' ? 1 : -1;
  return respondents().sort((a, b) => { const x = sortValue(a, F.sort.key), y = sortValue(b, F.sort.key); return x < y ? -dir : x > y ? dir : 0; });
}
function setSort(key) {
  if (F.sort.key === key) F.sort.dir = F.sort.dir === 'asc' ? 'desc' : 'asc';
  else F.sort = { key, dir: 'asc' };
  renderEditor();
}

// ----------------------------------------------------------------------------- data
async function fetchFeedback() {
  F.loading = true; F.error = null;
  renderSelection(); renderEditor();
  try {
    const q = new URLSearchParams({ createdStartDate: F.startDate, createdEndDate: F.endDate });
    F.players = (await game.get(`/api/feedback-data?${q}`)) || [];
  } catch (err) { F.error = err.message; }
  F.loading = false;
  renderSelection(); renderEditor();
}
async function loadDevelopers() {
  try { F.developers = (await local.tuning('developerUsernames')).data || []; }
  catch (err) { F.developers = []; toast(`Developer list unavailable (${err.message}); developers are not excluded`, 'warn'); }
}

// ----------------------------------------------------------------------------- selection panel
function renderSelection() {
  const s = clear(F.els.selection);
  s.appendChild(el('h2', {}, '✅ FTUE Feedback'));
  s.appendChild(el('div', { class: 'note' }, 'Players whose account was created in the date range (GET /api/feedback-data).'));
  const start = el('input', { type: 'date', value: F.startDate, max: F.endDate, style: { width: '100%' }, onchange: (e) => { F.startDate = e.target.value; fetchFeedback(); } });
  const end = el('input', { type: 'date', value: F.endDate, min: F.startDate, max: today(), style: { width: '100%' }, onchange: (e) => { F.endDate = e.target.value; fetchFeedback(); } });
  s.appendChild(el('label', { class: 'fb-field' }, ['Registration start', start]));
  s.appendChild(el('label', { class: 'fb-field' }, ['Registration end', end]));
  s.appendChild(el('div', { class: 'row', style: { margin: '6px 0' } }, [
    el('button', { onclick: fetchFeedback, disabled: F.loading }, '🔄 Refresh'),
    el('label', { class: 'mini', title: 'developerUsernames.json' }, [el('input', { type: 'checkbox', checked: F.includeDevs, onchange: (e) => { F.includeDevs = e.target.checked; renderSelection(); renderEditor(); } }), ' include developers']),
  ]));

  if (F.loading) { s.appendChild(el('div', { class: 'note' }, 'Loading feedback data…')); return; }
  if (F.error) { s.appendChild(el('div', { class: 'note', style: { color: 'var(--error)' } }, `Error: ${F.error}`)); return; }

  const agg = aggregate();
  s.appendChild(el('h3', {}, 'Summary'));
  s.appendChild(el('div', { class: 'kv fb-kv' }, [
    el('div', { class: 'k' }, 'Players in range'), el('div', { class: 'v' }, String(F.players.length)),
    el('div', { class: 'k' }, 'With feedback'), el('div', { class: 'v' }, String(agg.total)),
    el('div', { class: 'k' }, 'Positive responses'), el('div', { class: 'v' }, String(agg.positiveResponses)),
    el('div', { class: 'k' }, 'Negative responses'), el('div', { class: 'v' }, String(agg.negativeResponses)),
  ]));
  const counts = (title, cls, ids, table) => {
    s.appendChild(el('h3', {}, title));
    s.appendChild(el('div', { class: `fb-counts ${cls}` }, ids.map((id) => el('div', { class: 'fb-item' }, [el('span', { class: 'fb-text' }, FEEDBACK_STRINGS[id]), el('span', { class: 'badge' }, String(table[id]))]))));
  };
  counts('Positive feedback counts', 'positive', POSITIVE_IDS, agg.positive);
  counts('Negative feedback counts', 'negative', NEGATIVE_IDS, agg.negative);
}

// ----------------------------------------------------------------------------- editing space
function renderEditor() {
  const root = clear(F.els.editor);
  if (F.loading && !F.players.length) { root.appendChild(el('div', { class: 'stub' }, 'Loading feedback data…')); return; }
  if (F.error && !F.players.length) { root.appendChild(el('div', { class: 'stub' }, [el('p', {}, `Failed to load feedback data: ${F.error}`), el('button', { onclick: fetchFeedback }, 'Retry')])); return; }
  const rows = sortedRespondents();
  root.appendChild(el('div', { class: 'toolbar' }, [
    el('strong', {}, 'Player feedback details'),
    el('span', { class: 'muted' }, `${rows.length} players with answers, registered ${F.startDate} to ${F.endDate}${F.includeDevs ? '' : ', developers excluded'}`),
    el('span', { class: 'spacer' }),
    el('span', { class: 'note' }, 'Click a column to sort, a row for detail.'),
  ]));
  const thead = el('thead', {}, el('tr', {}, COLUMNS.map((c) => el('th', {
    class: [F.sort.key === c.key && 'sorted', F.sort.key === c.key && F.sort.dir === 'desc' && 'desc'].filter(Boolean).join(' '),
    style: c.sortable === false ? { cursor: 'default' } : undefined,
    onclick: c.sortable === false ? undefined : () => setSort(c.key),
  }, c.label))));
  const tbody = el('tbody', {}, rows.map((p) => el('tr', { onclick: () => showDetail(p) }, [
    el('td', {}, [p.username, isDev(p) ? el('span', { class: 'badge', style: { marginLeft: '4px' } }, 'dev') : null]),
    el('td', { title: p.lastActive ? new Date(p.lastActive).toLocaleString() : '' }, lastActive(p.lastActive)),
    el('td', {}, p.language || 'en'),
    el('td', {}, p.ftuestep ? String(p.ftuestep) : 'Completed'),
    el('td', {}, p.ftueFeedback?.browser || 'Unknown'),
    el('td', {}, p.ftueFeedback?.os || 'Unknown'),
    el('td', {}, fmtDate(p.created)),
    el('td', { class: 'fb-pos' }, answers(p.ftueFeedback?.positive).join(', ') || 'None'),
    el('td', { class: 'fb-neg' }, answers(p.ftueFeedback?.negative).join(', ') || 'None'),
  ])));
  const wrap = el('div', { class: 'players-table-wrap' }, el('table', { class: 'sheet players' }, [thead, tbody]));
  if (!rows.length) wrap.appendChild(el('div', { class: 'stub' }, 'No feedback answers in this range.'));
  root.appendChild(wrap);
}

function showDetail(p) {
  const f = p.ftueFeedback || {};
  const list = (ids, cls) => (ids?.length ? el('ul', { class: cls }, answers(ids).map((t) => el('li', {}, t))) : el('div', { class: 'note' }, 'None'));
  modal({
    title: `${p.username}${isDev(p) ? ' (developer)' : ''}`,
    width: '560px',
    body: el('div', {}, [
      el('div', { class: 'kv fb-kv' }, [
        el('div', { class: 'k' }, 'Created'), el('div', { class: 'v' }, fmtDate(p.created)),
        el('div', { class: 'k' }, 'Last played'), el('div', { class: 'v' }, `${lastActive(p.lastActive)}${p.lastActive ? ` (${new Date(p.lastActive).toLocaleString()})` : ''}`),
        el('div', { class: 'k' }, 'Language'), el('div', { class: 'v' }, p.language || 'en'),
        el('div', { class: 'k' }, 'FTUE step'), el('div', { class: 'v' }, p.ftuestep ? String(p.ftuestep) : 'Completed'),
        el('div', { class: 'k' }, 'Aspiration'), el('div', { class: 'v' }, p.aspiration ? String(p.aspiration) : 'none'),
      ]),
      el('h3', {}, 'Positive'), list(f.positive, 'fb-pos'),
      el('h3', {}, 'Negative'), list(f.negative, 'fb-neg'),
      el('h3', {}, 'Diagnostics'),
      el('table', { class: 'sheet players' }, [el('tbody', {}, DIAG_ROWS.map(([label, fn]) => el('tr', {}, [el('td', { class: 'muted' }, label), el('td', {}, String(fn(f)))])))]),
    ]),
    buttons: [
      { label: 'Open in Players', onClick: (close) => { close(); F.ctx.navigate(`players/${p._id}`); } },
      { label: 'Close', primary: true },
    ],
  });
}

// ----------------------------------------------------------------------------- tab
export function feedbackTab() {
  return {
    id: 'feedback', label: 'Feedback', icon: '💬', group: 'admin',
    async mount(selectionEl, editorEl, ctx) {
      F.ctx = ctx; F.els.selection = selectionEl; F.els.editor = editorEl;
      setStatus('feedback');
      if (!F.loaded) {
        F.loaded = true;
        renderSelection(); renderEditor();
        await Promise.all([loadDevelopers(), fetchFeedback()]);
      }
      renderSelection(); renderEditor();
    },
    unmount() {},
  };
}
