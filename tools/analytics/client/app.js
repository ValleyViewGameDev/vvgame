// Secrets of Elsinore Analytics dashboard client. Vanilla JS, no build step.
// A copy of House's tools/analytics/client/app.js adapted to VVGame's data.
//
// Seven tabs share one app-wide filter row (date range + Hide developers):
//   - Site Traffic: the anonymous pageview -> account funnel.
//   - DAU & Retention: DAU/New/Returning + D1/D3/D7/D30 retention + Source.
//   - Users: today's actives, the exclusion roster, new accounts, the players table.
//   - Engagement: last-seen vs DAU, activity flags, the FTUE funnel, Home Deed,
//     quests, trophies, grids visited.
//   - Events: Train / Carnival / elections per day, the season leaderboard.
//   - Monetization: the purchases ledger + Gold accounts.
//   - Demographics: device / OS / browser / timezone / screen / language.
// Only the active tab fetches/renders. Day math is the viewer's LOCAL day; the
// server buckets with the tz we send.

const $ = (id) => document.getElementById(id);
const fromEl = $('from');
const toEl = $('to');
const hideDevsEl = $('hideDevs');
const statusEl = $('status');
const KEY = (k) => `vv-analytics-${k}`;

let activeTab = 'traffic';
const charts = {};   // canvasId -> Chart instance (destroy + recreate on every render)
function chart(canvasId, config, plugins) {
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart($(canvasId), plugins ? { ...config, plugins } : config);
  return charts[canvasId];
}

// Retention lag colors, shared by all three retention charts. One per hue
// family (green / cyan / gold / pink) so lines stay distinguishable.
const LAG_COLORS = { 1: '#8bbf6a', 3: '#56b6c2', 7: '#d8a657', 30: '#e46ba5' };
const PIE_COLORS = ['#d8a657', '#7aa2f7', '#8bbf6a', '#e06c75', '#c678dd', '#56b6c2', '#d19a66', '#b7ab95', '#5c6370'];

let visitSrcMode = 'new';
let lastSiteTraffic = null;
let dauMode = 'stacked';
let lastDauSeries = null;
let sourceMode = 'all';
let lastSourceData = null;
let retentionMode = 'opened';
let retentionSelectedSources = null;
let retentionAvailableSources = [];
let subDauMode = 'stacked';
let lastSubDauSeries = null;

// ---- LOCAL day helpers ----
const pad2 = (n) => String(n).padStart(2, '0');
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDaysLocal(dayStr, n) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
// Shared query string for a date-range request: local day labels (from/to),
// the local-day instant bounds (start/end) and the IANA tz.
function rangeQS(hideDevs) {
  const from = fromEl.value;
  const to = toEl.value;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString();
  const end = new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString();
  return `?from=${from}&to=${to}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    + `&tz=${encodeURIComponent(tz)}${hideDevs ? '&hideDevs=1' : ''}`;
}
const devQS = (hideDevs) => (hideDevs ? '?hideDevs=1' : '');

function setStatus(msg, isError) {
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('error', !!isError);
}
async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}
function setNote(id, text, warn) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
  el.classList.toggle('warn', !!warn);
}

// Shared axis/legend styling.
const AXES = {
  y: { beginAtZero: true, ticks: { precision: 0, color: '#b7ab95' }, grid: { color: '#3a312855' } },
  x: { ticks: { color: '#b7ab95', maxRotation: 0, autoSkip: true }, grid: { display: false } },
};
const STACKED_AXES = {
  y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: '#b7ab95' }, grid: { color: '#3a312855' } },
  x: { stacked: true, ticks: { color: '#b7ab95', maxRotation: 0, autoSkip: true }, grid: { display: false } },
};
const PCT_AXIS = (extra = {}) => ({ beginAtZero: true, ticks: { callback: (v) => `${v}%`, color: '#b7ab95' }, grid: { color: '#3a312855' }, ...extra });
const LEGEND = { legend: { labels: { color: '#efe7d8' } } };
const BASE = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false } };
const line = (label, data, color, extra = {}) => ({
  type: 'line', label, data, borderColor: color, backgroundColor: color,
  tension: 0.25, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, fill: false, spanGaps: false, ...extra,
});
const bar = (label, data, color, extra = {}) => ({ type: 'bar', label, data, backgroundColor: color, borderColor: color, borderWidth: 0, ...extra });
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '-');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDelta(v) {
  if (v == null) return { text: 'n/a', cls: 'flat' };
  if (v > 0) return { text: `▲ ${v}%`, cls: 'up' };
  if (v < 0) return { text: `▼ ${Math.abs(v)}%`, cls: 'down' };
  return { text: 'no change', cls: 'flat' };
}
function setDelta(id, v, unit = '%') {
  const el = $(id);
  if (!el) return;
  if (unit === 'pp') {
    if (v == null) { el.textContent = 'n/a'; el.className = 'metric-delta flat'; }
    else if (v > 0) { el.textContent = `▲ ${v} pp`; el.className = 'metric-delta up'; }
    else if (v < 0) { el.textContent = `▼ ${Math.abs(v)} pp`; el.className = 'metric-delta down'; }
    else { el.textContent = 'no change'; el.className = 'metric-delta flat'; }
    return;
  }
  const d = fmtDelta(v);
  el.textContent = d.text; el.className = `metric-delta ${d.cls}`;
}

// ======================= SITE TRAFFIC =======================
function renderSiteTraffic(payload) {
  const m = payload.metrics || {};
  setNote('site-start-note', payload.pageview_start_day
    ? `Pageview beacon recording began ${payload.pageview_start_day}; earlier days show a gap.`
    : 'No pageviews recorded yet: the beacon starts with the deploy that ships analytics. View series show gaps until then; accounts have history.', !payload.pageview_start_day);
  $('st-views').textContent = m.views_yesterday != null ? m.views_yesterday.toLocaleString() : '-';
  setDelta('st-views-delta', m.views_delta_pct);
  $('st-newvis').textContent = m.new_visitors_yesterday != null ? m.new_visitors_yesterday.toLocaleString() : '-';
  setDelta('st-newvis-delta', m.new_visitors_delta_pct);
  $('st-accounts').textContent = m.accounts_yesterday != null ? m.accounts_yesterday : '-';
  setDelta('st-accounts-delta', m.accounts_delta_pct);
  $('st-conversion').textContent = m.conversion_yesterday != null ? `${m.conversion_yesterday}%` : '-';
  setDelta('st-conversion-delta', m.conversion_delta_pp, 'pp');

  const series = payload.series || [];
  const labels = series.map((p) => p.day);
  chart('pageviewsChart', {
    type: 'line',
    data: { labels, datasets: [line('Pageviews', series.map((p) => p.views), '#7aa2f7', { backgroundColor: '#7aa2f755', fill: true })] },
    options: { ...BASE, scales: AXES, plugins: { ...LEGEND, tooltip: { callbacks: {
      afterTitle: (items) => {
        const p = series[items[0].dataIndex] || {};
        if (p.visitors == null) return 'pre-beacon (no view data)';
        return `unique visitors: ${p.visitors} (${p.new_visitors || 0} new, ${p.visitors - (p.new_visitors || 0)} returning)`;
      },
      label: (c) => (c.raw == null ? 'Pageviews: n/a' : `Pageviews: ${c.raw}`),
    } } } },
  });
  chart('funnelChart', {
    type: 'line',
    data: { labels, datasets: [
      line('New visitors', series.map((p) => p.new_visitors), '#56b6c2'),
      line('Accounts created', series.map((p) => p.accounts), '#8bbf6a'),
      line('of which, same-day', series.map((p) => p.converted), '#5f7a4a', { borderDash: [4, 3], pointRadius: 0 }),
    ] },
    options: { ...BASE, scales: AXES, plugins: { ...LEGEND, tooltip: { callbacks: {
      afterTitle: (items) => {
        const p = series[items[0].dataIndex] || {};
        if (p.new_visitors == null) return 'pre-beacon (no view data)';
        if (!p.new_visitors) return 'no new visitors';
        return `conversion: ${pct(p.accounts, p.new_visitors)}%  /  same-day cohort: ${pct(p.converted || 0, p.new_visitors)}%`;
      },
      label: (c) => (c.raw == null ? `${c.dataset.label}: n/a` : `${c.dataset.label}: ${c.raw}`),
    } } } },
  });
  const convData = series.map((p) => (p.new_visitors ? pct(p.accounts || 0, p.new_visitors) : null));
  const convCohort = series.map((p) => (p.new_visitors && p.converted != null ? pct(p.converted, p.new_visitors) : null));
  const ROLL = 7;
  const convRoll = series.map((_, i) => {
    let accounts = 0, visitors = 0;
    for (let j = Math.max(0, i - (ROLL - 1)); j <= i; j++) {
      const p = series[j];
      if (!p || p.new_visitors == null) continue;
      accounts += p.accounts || 0; visitors += p.new_visitors || 0;
    }
    return visitors > 0 ? pct(accounts, visitors) : null;
  });
  const convMax = Math.max(1, ...[...convData, ...convRoll, ...convCohort].filter((v) => v != null));
  const convAxisMax = Math.ceil(convMax / 10) * 10;
  chart('conversionChart', {
    type: 'line',
    data: { labels, datasets: [
      line('Conversion rate', convData, '#d8a657', { yAxisID: 'y', order: 2 }),
      line('Same-day cohort', convCohort, '#5f7a4a', { borderDash: [4, 3], pointRadius: 0, yAxisID: 'y', order: 3 }),
      line(`Rolling ${ROLL}d Avg.`, convRoll, '#56b6c2', { tension: 0.35, borderWidth: 3, pointRadius: 0, yAxisID: 'y2', order: 1 }),
    ] },
    options: { ...BASE, scales: {
      y: PCT_AXIS({ max: convAxisMax }),
      y2: { position: 'right', beginAtZero: true, max: convAxisMax, ticks: { callback: (v) => `${v}%`, color: '#56b6c2' }, grid: { display: false } },
      x: AXES.x,
    }, plugins: { ...LEGEND, tooltip: { callbacks: {
      afterTitle: (items) => {
        const p = series[items[0].dataIndex] || {};
        if (p.visitors == null) return 'pre-beacon (no view data)';
        return `${p.accounts} accounts / ${p.new_visitors} new visitors / ${p.views} raw views`;
      },
      label: (c) => (c.raw == null ? `${c.dataset.label}: n/a` : `${c.dataset.label}: ${c.raw}%`),
    } } } },
  });
  const vsRows = (visitSrcMode === 'new' ? payload.new_visits_by_source : payload.visits_by_source) || [];
  const vsKeys = payload.visit_sources || [];
  chart('visitSourceChart', {
    type: 'bar',
    data: { labels: vsRows.map((r) => r.day), datasets: vsKeys.map((s) => bar(sourceLabel(s), vsRows.map((r) => r[s]), sourceColor(s), { stack: 'visits' })) },
    options: { ...BASE, scales: STACKED_AXES, plugins: { ...LEGEND, tooltip: { callbacks: {
      afterTitle: (items) => `${visitSrcMode === 'new' ? 'new visitors' : 'total visits'}: ${items.reduce((s, it) => s + (it.parsed.y || 0), 0)}`,
    } } } },
  });
}

// ======================= DAU & RETENTION =======================
function renderTrafficMetrics(m) {
  $('tm-total-accounts').textContent = m.total_accounts != null ? m.total_accounts.toLocaleString() : '-';
  $('tm-dau').textContent = m.dau_yesterday != null ? m.dau_yesterday : '-';
  $('tm-subdau').textContent = m.sub_dau_yesterday != null ? m.sub_dau_yesterday : '-';
  setDelta('tm-dau-delta', m.dau_delta_pct);
  setDelta('tm-subdau-delta', m.sub_dau_delta_pct);
  setNote('traffic-start-note', m.activity_start_day
    ? `Live activity recording began ${m.activity_start_day}. DAU before that is a floor (signups only); retention cohorts before it have no data.`
    : 'No live activity recorded yet: DAU, retention and Source start with the deploy that ships analytics. Until then DAU equals New Users (backfilled signups) and retention is a gap, not zero.', !m.activity_start_day);
}

function renderDau(series, mode = dauMode) {
  const labels = series.map((p) => p.day);
  const newU = series.map((p) => p.newUsers);
  const returning = series.map((p) => Math.max(0, p.dau - p.newUsers));
  let datasets, scales;
  if (mode === 'stacked') {
    datasets = [
      line('Returning', returning, '#8bbf6a', { backgroundColor: '#8bbf6a55', fill: true }),
      line('New Users', newU, '#7aa2f7', { backgroundColor: '#7aa2f755', fill: true }),
    ];
    scales = STACKED_AXES;
  } else {
    datasets = [
      line('DAU', series.map((p) => p.dau), '#d8a657', { backgroundColor: '#d8a65733', fill: true, order: 3 }),
      line('Returning', returning, '#8bbf6a', { order: 1 }),
      line('New Users', newU, '#7aa2f7', { order: 2 }),
    ];
    scales = AXES;
  }
  chart('dauChart', { type: 'line', data: { labels, datasets }, options: { ...BASE, scales, plugins: LEGEND } });
}

// Stable colors + labels per known source; unknown keys hash to a hue.
const SOURCE_COLORS = {
  'itch.io': '#ffffff', reddit: '#ff4500', redditads: '#b5341a', pinterest: '#e60023', facebook: '#4267b2',
  instagram: '#c13584', tiktok: '#69c9d0', twitter: '#1da1f2', youtube: '#c4302b', google: '#34a853',
  googleads: '#4285f4', discord: '#5865f2', search: '#8a98a8', email: '#56b6c2', web: '#d8a657', Unknown: '#6b6256',
};
const SOURCE_LABELS = {
  'itch.io': 'itch.io', reddit: 'Reddit', redditads: 'Reddit Ads', pinterest: 'Pinterest', facebook: 'Facebook',
  instagram: 'Instagram', tiktok: 'TikTok', twitter: 'Twitter/X', youtube: 'YouTube', google: 'Google',
  googleads: 'Google Ads', discord: 'Discord', search: 'Search', email: 'Email',
  // web = seen, but no channel signal (direct OR a stripped referrer).
  // Unknown = no client_info at all (pre-capture account / deleted).
  web: 'Direct / Untagged', Unknown: 'Unknown',
};
function sourceColor(key) {
  if (SOURCE_COLORS[key]) return SOURCE_COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h}, 45%, 55%)`;
}
const sourceLabel = (key) => SOURCE_LABELS[key] || key;
const sourceRows = (payload, mode) => (mode === 'new' ? payload.new : mode === 'returning' ? payload.returning : payload.all) || [];

function renderSource(payload, mode = sourceMode) {
  const rows = sourceRows(payload, mode);
  const sources = payload.sources || [];
  chart('sourceChart', {
    type: 'bar',
    data: { labels: rows.map((r) => r.day), datasets: sources.map((s) => bar(sourceLabel(s), rows.map((r) => r[s] || 0), sourceColor(s), { stack: 'src' })) },
    options: { ...BASE, scales: STACKED_AXES, plugins: LEGEND },
  });
}
function renderSourceLine(payload, mode = sourceMode) {
  const rows = sourceRows(payload, mode);
  const sources = payload.sources || [];
  chart('sourceLineChart', {
    type: 'line',
    data: { labels: rows.map((r) => r.day), datasets: sources.map((s) => line(sourceLabel(s), rows.map((r) => r[s] || 0), sourceColor(s))) },
    options: { ...BASE, scales: AXES, plugins: LEGEND },
  });
}

function renderRetention(cohorts) {
  const labels = cohorts.map((c) => c.cohortDay);
  const sizes = cohorts.map((c) => c.cohortSize);
  const lags = cohorts.length
    ? Object.keys(cohorts[0]).filter((k) => /^d\d+$/.test(k)).map((k) => +k.slice(1)).sort((a, b) => a - b)
    : [1, 3, 7, 30];
  chart('retentionChart', {
    type: 'line',
    data: { labels, datasets: lags.map((n) => line(`D${n}`, cohorts.map((c) => (c[`d${n}`] == null ? null : Math.round(c[`d${n}`] * 1000) / 10)), LAG_COLORS[n] || '#b7ab95', { lag: n, tension: 0.2 })) },
    options: { ...BASE, scales: { y: PCT_AXIS({ max: 100 }), x: AXES.x }, plugins: { ...LEGEND, tooltip: { mode: 'index', intersect: false, callbacks: {
      title: (items) => {
        const day = items[0].label;
        const [y, m, d] = day.split('-').map(Number);
        return `Cohort ${day} (${new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' })})`;
      },
      afterTitle: (items) => { const n = sizes[items[0].dataIndex]; return `${n} account${n === 1 ? '' : 's'} signed up`; },
      label: (item) => {
        const c = cohorts[item.dataIndex] || {};
        const n = item.dataset.lag;
        const target = addDaysLocal(item.label, n);
        if (item.raw == null) return `D${n}: not yet mature or no data (needs ${target})`;
        const ret = c[`c${n}`];
        return `D${n}: ${item.raw}%${ret == null ? '' : `  (${ret} of ${c.cohortSize || 0} active on ${target})`}`;
      },
      footer: (items) => {
        const c = cohorts[items[0].dataIndex] || {};
        const hits = lags.filter((n) => c[`c${n}`] > 0);
        return hits.length ? `returned on: ${hits.map((n) => `D${n}`).join(', ')}` : '';
      },
    } } } },
  });
}

function renderRetentionAvg(series, canvasId, suffix) {
  const labels = series.map((p) => p.day);
  const lags = series.length
    ? Object.keys(series[0]).filter((k) => /^d\d+$/.test(k)).map((k) => +k.slice(1)).sort((a, b) => a - b)
    : [1, 3, 7, 30];
  chart(canvasId, {
    type: 'line',
    data: { labels, datasets: lags.map((n) => line(`D${n} ${suffix}`, series.map((p) => (p[`d${n}`] == null ? null : Math.round(p[`d${n}`] * 1000) / 10)), LAG_COLORS[n] || '#b7ab95', { lag: n, pointRadius: 1 })) },
    options: { ...BASE, scales: { y: PCT_AXIS(), x: AXES.x }, plugins: { ...LEGEND, tooltip: { callbacks: {
      afterTitle: (items) => {
        const p = series[items[0].dataIndex] || {};
        return p.cohorts ? `${p.cohorts} cohorts / ${(p.pop1 || 0).toLocaleString()} players (D1 basis)` : 'no lag has matured for this day yet';
      },
      label: (item) => {
        if (item.raw == null) return `${item.dataset.label}: not yet mature`;
        const n = (series[item.dataIndex] || {})[`pop${item.dataset.lag}`];
        return `${item.dataset.label}: ${item.raw}%` + (n ? ` (n=${n.toLocaleString()})` : '');
      },
    } } } },
  });
}

function renderRetentionSourceToggles() {
  const boxes = [...document.querySelectorAll('.retention-src-toggles')];
  boxes.forEach((box) => { box.innerHTML = ''; });
  if (!retentionAvailableSources.length) return;
  const allSelected = retentionSelectedSources.size === retentionAvailableSources.length;
  boxes.forEach((box) => {
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'src-toggle' + (allSelected ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => { retentionSelectedSources = allSelected ? new Set() : new Set(retentionAvailableSources); loadRetention(); });
    box.appendChild(allBtn);
    for (const s of retentionAvailableSources) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'src-toggle' + (retentionSelectedSources.has(s) ? ' active' : '');
      const dot = document.createElement('span'); dot.className = 'src-dot'; dot.style.background = sourceColor(s);
      const label = document.createElement('span'); label.textContent = sourceLabel(s);
      b.append(dot, label);
      b.addEventListener('click', () => { if (retentionSelectedSources.has(s)) retentionSelectedSources.delete(s); else retentionSelectedSources.add(s); loadRetention(); });
      box.appendChild(b);
    }
  });
}

async function loadRetention() {
  if (!rangeValid()) return 0;
  const hideDevs = hideDevsEl.checked;
  let qs = rangeQS(hideDevs);
  if (retentionSelectedSources !== null) qs += `&sources=${encodeURIComponent([...retentionSelectedSources].join(','))}`;
  if (retentionMode === 'played') qs += '&played=1';
  const [ret, avg] = await Promise.all([getJSON(`/api/retention${qs}`), getJSON(`/api/retention-avg${qs}`)]);
  retentionAvailableSources = ret.available_sources || [];
  if (retentionSelectedSources === null) retentionSelectedSources = new Set(retentionAvailableSources);
  renderRetentionSourceToggles();
  renderRetention(ret.cohorts);
  renderRetentionAvg(avg.series || [], 'retentionAvgChart', 'avg');
  const win = avg.window_days || 14;
  $('retention-rolling-title').textContent = `Retention: Rolling ${win}-day Avg.`;
  renderRetentionAvg(avg.rolling || [], 'retentionRollingChart', `${win}d`);
  setNote('retention-mode-note', ret.played
    ? `"Played" = harvested or collected a craft that day. ${ret.played_start_day ? `Tracking began ${ret.played_start_day}; earlier cohorts show no data.` : 'Nothing recorded yet: every cohort shows no data until the deploy.'}`
    : '');
  return ret.cohorts.length;
}

// ======================= USERS =======================
const userPopoverData = new WeakMap();
function appendUserRow(ul, row, meta) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = row.username ? 'uname' : 'deleted';
  // textContent (never innerHTML): usernames are user-controlled.
  name.textContent = (row.username || '(unknown)')
    + (row.subscribed ? ' \u{1F4B0}' : '')
    + (row.played ? ' \u{1F33F}' : '')
    + (row.deleted ? ' \u{1F5D1}️' : '');
  const right = document.createElement('span');
  right.className = 'time';
  right.textContent = meta || '';
  li.append(name, right);
  userPopoverData.set(li, row);
  li.addEventListener('mouseenter', (e) => { const r = userPopoverData.get(e.currentTarget); if (r) showUserPopover(e.currentTarget, r); });
  li.addEventListener('mouseleave', () => { $('user-popover').hidden = true; });
  ul.appendChild(li);
}
function showUserPopover(anchor, row) {
  const el = $('user-popover');
  el.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'pop-title';
  title.textContent = row.username || '(unknown)';
  el.appendChild(title);
  const d = row.device || {};
  const ci = row.client_info || {};
  const acq = ci.acquisition || {};
  const lines = [];
  if (row.deleted) lines.push('Deleted account');
  if (row.subscribed) lines.push('Gold account');
  if (row.played) lines.push('Played today (harvest / craft)');
  if (d.is_mobile === true) lines.push('Device: Mobile');
  else if (d.is_mobile === false) lines.push('Device: Desktop');
  if (d.os) lines.push(`OS: ${d.os}`);
  if (d.browser) lines.push(`Browser: ${d.browser}`);
  if (d.screen) lines.push(`Screen: ${d.screen}`);
  if (d.timezone) lines.push(`Timezone: ${d.timezone}`);
  if (d.latency_ms != null) lines.push(`Ping at signup: ${d.latency_ms} ms${d.connection ? ` (${d.connection})` : ''}`);
  if (ci.surface) lines.push(`Surface: ${ci.surface}`);
  if (acq.utm_source) lines.push(`Source: ${acq.utm_source}${acq.utm_campaign ? ` / ${acq.utm_campaign}` : ''}`);
  else if (acq.referrer_host) lines.push(`Referrer: ${acq.referrer_host}`);
  if (row.created_at) lines.push(`Signed up ${fmtDate(row.created_at)}`);
  if (!lines.length) lines.push('No client info captured.');
  for (const l of lines) { const r = document.createElement('div'); r.className = 'pop-row'; r.textContent = l; el.appendChild(r); }
  el.hidden = false;
  const rect = anchor.getBoundingClientRect();
  let top = rect.top - el.offsetHeight - 8;
  if (top < 8) top = rect.bottom + 8;
  let left = rect.right - el.offsetWidth;
  if (left < 8) left = 8;
  el.style.left = `${left}px`; el.style.top = `${top}px`;
}
function appendEmpty(ul, text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  ul.appendChild(li);
}
function renderUsers(data, label) {
  $('users-title').textContent = `Today's active users: ${data.users.length} (${label})`;
  const ul = $('users-list');
  ul.innerHTML = '';
  if (!data.users.length) { appendEmpty(ul, 'No active users recorded today.'); return; }
  for (const u of data.users) appendUserRow(ul, u, u.ts ? new Date(u.ts).toLocaleTimeString() : '');
}
function renderIgnoredUsers(data) {
  const on = data.rows.filter((r) => r.applied).length;
  $('ignored-title').textContent = `Ignored by analytics: ${on} of ${data.rows.length} active`;
  const ul = $('ignored-list');
  ul.innerHTML = '';
  if (!data.rows.length) { appendEmpty(ul, 'Nothing is being excluded.'); return; }
  for (const r of data.rows) {
    const li = document.createElement('li');
    if (!r.applied) li.classList.add('ignored-off');
    const name = document.createElement('span');
    name.className = r.deleted ? 'deleted' : 'uname';
    name.textContent = r.username || '(unknown)';
    if (r.accounts > 1) { const c = document.createElement('span'); c.className = 'icount'; c.textContent = ` x${r.accounts}` + (r.deleted_accounts ? ` (${r.deleted_accounts} deleted)` : ''); name.appendChild(c); }
    else if (r.no_account) { const c = document.createElement('span'); c.className = 'icount'; c.textContent = ' (no account)'; name.appendChild(c); }
    else if (r.deleted) name.textContent += ' \u{1F5D1}️';
    const chip = document.createElement('span');
    chip.className = `ignored-reason r-${r.reason}`;
    chip.textContent = r.applied ? r.reason.replace('-', ' ') : `${r.reason.replace('-', ' ')} / off`;
    li.append(name, chip);
    ul.appendChild(li);
  }
}
function renderNewAccounts(data, label) {
  $('accounts-title').textContent = `All new accounts: ${data.accounts.length} (${label})`;
  const ul = $('accounts-list');
  ul.innerHTML = '';
  if (!data.accounts.length) { appendEmpty(ul, 'No new accounts in range.'); return; }
  for (const a of data.accounts) appendUserRow(ul, a, a.firstSeenAt ? fmtDate(a.firstSeenAt) : (a.firstSeenDay || ''));
}

// Generic click-sortable table: headers carry data-key + data-type (str|num).
// First click sorts (strings A-Z, numbers high-low); same header flips.
const tableState = {};
function sortableTable(tableId, rows, renderRow, defaultSort) {
  const st = tableState[tableId] || (tableState[tableId] = { ...defaultSort, wired: false });
  st.rows = rows;
  const draw = () => {
    const ths = document.querySelectorAll(`#${tableId} thead th`);
    ths.forEach((h) => {
      h.classList.toggle('sort-asc', h.dataset.key === st.key && st.dir === 'asc');
      h.classList.toggle('sort-desc', h.dataset.key === st.key && st.dir === 'desc');
    });
    const isNum = [...ths].find((h) => h.dataset.key === st.key)?.dataset.type === 'num';
    const sorted = st.rows.slice().sort((a, b) => {
      let cmp;
      const av = a[st.key], bv = b[st.key];
      if (av == null && bv == null) cmp = 0;
      else if (av == null) return 1;
      else if (bv == null) return -1;
      else if (isNum) cmp = Number(av) - Number(bv);
      else cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      return st.dir === 'asc' ? cmp : -cmp;
    });
    document.querySelector(`#${tableId} tbody`).innerHTML = sorted.map(renderRow).join('');
  };
  if (!st.wired) {
    document.querySelectorAll(`#${tableId} thead th[data-key]`).forEach((h) => {
      h.addEventListener('click', () => {
        const key = h.dataset.key;
        if (st.key === key) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
        else { st.key = key; st.dir = h.dataset.type === 'num' ? 'desc' : 'asc'; }
        draw();
      });
    });
    st.wired = true;
  }
  draw();
}
function renderPlayersTable(data) {
  $('players-title').textContent = `Players: ${data.total} account${data.total === 1 ? '' : 's'}`;
  const rows = data.players.map((p) => ({
    ...p,
    created_at: p.created_at ? new Date(p.created_at).getTime() : null,
    last_active: p.last_active ? new Date(p.last_active).getTime() : null,
    // Done sorts above any in-progress step.
    ftue_sort: p.in_ftue ? (p.ftue_step ?? 0) : 999,
  }));
  sortableTable('playersTable', rows, (p) => `
    <tr>
      <td>${esc(p.username || '(unknown)')}${p.subscribed ? ' \u{1F4B0}' : ''}</td>
      <td>${fmtDate(p.created_at)}</td>
      <td>${p.last_active ? new Date(p.last_active).toLocaleString() : '-'}</td>
      <td class="num">${p.level}</td>
      <td class="num">${(p.xp || 0).toLocaleString()}</td>
      <td class="num">${p.net_worth != null ? p.net_worth.toLocaleString() : '-'}</td>
      <td>${p.in_ftue ? `Step ${p.ftue_step ?? 0}` : 'Done'}</td>
      <td>${p.home_deed ? 'yes' : '-'}</td>
      <td>${p.subscribed ? 'Gold' : '-'}</td>
      <td>${esc(p.language || '-')}</td>
      <td>${esc(sourceLabel(p.source || 'Unknown'))}</td>
    </tr>`, { key: 'last_active', dir: 'desc' });
}

// ======================= ENGAGEMENT =======================
function renderLastSeen(lastSeen, dau) {
  const labels = lastSeen.map((p) => p.day);
  const dauBy = Object.fromEntries(dau.series.map((p) => [p.day, p.dau]));
  const start = dau.activity_start_day;
  chart('lastSeenChart', {
    type: 'bar',
    data: { labels, datasets: [
      bar('Players last seen (lastActive)', lastSeen.map((p) => p.lastSeen), '#d8a657', { order: 2 }),
      line('DAU (analytics_activity)', labels.map((d) => (start && d >= start ? (dauBy[d] || 0) : null)), '#7aa2f7', { order: 1 }),
    ] },
    options: { ...BASE, scales: AXES, plugins: { ...LEGEND, tooltip: { callbacks: {
      label: (c) => (c.raw == null ? `${c.dataset.label}: no data (pre-deploy)` : `${c.dataset.label}: ${c.raw}`),
    } } } },
  });
}

function renderFlags(payload) {
  const s = payload.series || [];
  setNote('flags-note', payload.start_day ? `Recording began ${payload.start_day}.` : 'Nothing recorded yet: every day is a gap until the deploy that ships analytics.');
  const share = (k) => s.map((p) => (p.dau == null ? null : (p.dau ? pct(p[k], p.dau) : null)));
  chart('flagsChart', {
    type: 'line',
    data: { labels: s.map((p) => p.day), datasets: [
      line('% played (harvest / craft)', share('played'), '#8bbf6a', { yAxisID: 'y' }),
      line('% turned in a quest', share('quest'), '#7aa2f7', { yAxisID: 'y' }),
      line('% bought something', share('purchase'), '#e46ba5', { yAxisID: 'y' }),
      bar('Grid entries per active player', s.map((p) => (p.dau ? Math.round((p.moves / p.dau) * 10) / 10 : null)), '#d8a65766', { yAxisID: 'y1', order: 3 }),
    ] },
    options: { ...BASE, scales: {
      x: AXES.x,
      y: PCT_AXIS({ max: 100, position: 'left', title: { display: true, text: '% of DAU', color: '#b7ab95' } }),
      y1: { beginAtZero: true, position: 'right', ticks: { color: '#b7ab95' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'grids / player', color: '#b7ab95' } },
    }, plugins: { ...LEGEND, tooltip: { callbacks: {
      afterTitle: (items) => { const p = s[items[0].dataIndex] || {}; return p.dau == null ? 'no data (pre-deploy)' : `DAU ${p.dau}: ${p.played} played, ${p.quest} quests, ${p.purchase} bought, ${p.moves} grid entries by ${p.movers}`; },
      label: (c) => (c.raw == null ? `${c.dataset.label}: n/a` : `${c.dataset.label}: ${c.raw}${c.dataset.yAxisID === 'y' ? '%' : ''}`),
    } } } },
  });
}

// ---- FTUE funnel: filter chips + client-side funnel (as the retired editor did) ----
let ftueData = null;
const FTUE_DIMS = [
  ['os', 'OS'], ['browser', 'Browser'], ['timezone', 'Timezone'], ['language', 'Language'], ['aspiration', 'Aspiration'], ['source', 'Source'],
];
const ftueSelected = {};   // dim -> Set of selected values (null = all)
const ftueVal = (p, dim) => (p[dim] == null || p[dim] === '' ? 'Unknown' : String(p[dim]));

function renderFtueChips() {
  const box = $('ftue-filters');
  box.innerHTML = '';
  box.className = 'chip-groups';
  for (const [dim, label] of FTUE_DIMS) {
    const values = [...new Set(ftueData.players.map((p) => ftueVal(p, dim)))].sort();
    if (values.length < 2) continue;
    if (!ftueSelected[dim]) ftueSelected[dim] = new Set(values);
    const row = document.createElement('div');
    row.className = 'chip-group';
    const lab = document.createElement('span'); lab.className = 'chip-label'; lab.textContent = label; row.appendChild(lab);
    const allOn = ftueSelected[dim].size === values.length;
    const all = document.createElement('button');
    all.type = 'button'; all.className = 'src-toggle' + (allOn ? ' active' : ''); all.textContent = 'All';
    all.addEventListener('click', () => { ftueSelected[dim] = allOn ? new Set() : new Set(values); renderFtue(); });
    row.appendChild(all);
    for (const v of values) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'src-toggle' + (ftueSelected[dim].has(v) ? ' active' : '');
      b.textContent = v;
      b.addEventListener('click', () => { if (ftueSelected[dim].has(v)) ftueSelected[dim].delete(v); else ftueSelected[dim].add(v); renderFtue(); });
      row.appendChild(b);
    }
    box.appendChild(row);
  }
}
function ftueFiltered() {
  return ftueData.players.filter((p) => FTUE_DIMS.every(([dim]) => !ftueSelected[dim] || ftueSelected[dim].has(ftueVal(p, dim))));
}
// Cumulative funnel: "reached at least step i" = currently at step >= i, or
// completed. Mirrors the retired route's stepProgression exactly.
function computeFunnel(rows, steps) {
  const total = rows.length;
  const maxStep = steps.reduce((m, s) => Math.max(m, s.step), 0);
  const atStep = {};
  let completed = 0;
  for (const p of rows) {
    if (p.completed) completed++;
    else atStep[p.ftue_step ?? 0] = (atStep[p.ftue_step ?? 0] || 0) + 1;
  }
  const out = [];
  for (const s of steps) {
    let cum = completed;
    for (let j = s.step; j <= maxStep; j++) cum += atStep[j] || 0;
    out.push({ id: s.step, label: `Step ${s.step}: ${s.trigger}`, count: cum, percent: total ? Math.round((cum / total) * 1000) / 10 : 0, at: atStep[s.step] || 0 });
  }
  out.push({ id: 'completed', label: 'Completed FTUE', count: completed, percent: total ? Math.round((completed / total) * 1000) / 10 : 0, at: completed });
  return { total, rows: out };
}
function renderFtue() {
  renderFtueChips();
  const rows = ftueFiltered();
  const f = computeFunnel(rows, ftueData.steps);
  const done = f.rows[f.rows.length - 1];
  $('ftue-funnel-title').textContent = `FTUE funnel: ${f.total} account${f.total === 1 ? '' : 's'} created in range`
    + (f.total !== ftueData.cohort_total ? ` (filtered from ${ftueData.cohort_total})` : '')
    + (f.total ? `, ${done.percent}% completed` : '');
  chart('ftueFunnelChart', {
    type: 'bar',
    data: { labels: f.rows.map((r) => r.label), datasets: [{ label: '% of cohort', data: f.rows.map((r) => r.percent), backgroundColor: f.rows.map((r) => (r.id === 'completed' ? '#8bbf6a' : '#d8a657')) }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: PCT_AXIS({ max: 100 }), y: { ticks: { color: '#efe7d8' }, grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: (item) => { const r = f.rows[item.dataIndex]; return `${r.count} of ${f.total} reached (${item.raw}%)${r.id !== 'completed' && r.at ? `, ${r.at} currently here` : ''}`; },
      } } } },
  });
  document.querySelector('#ftueTable tbody').innerHTML = rows.map((p) => `
    <tr>
      <td>${esc(p.username || '(unknown)')}</td>
      <td>${p.completed ? 'Completed' : 'In progress'}</td>
      <td>${p.completed ? 'Done' : `Step ${p.ftue_step ?? 0}`}</td>
      <td>${p.aspiration ?? '-'}</td>
      <td>${p.home_deed ? 'yes' : '-'}</td>
      <td>${esc(p.language || '-')}</td>
      <td>${esc(p.os || 'Unknown')}</td>
      <td>${esc(p.browser || 'Unknown')}</td>
      <td>${esc(p.timezone || 'Unknown')}</td>
      <td>${fmtDate(p.created_at)}</td>
      <td>${fmtDate(p.last_active)}</td>
    </tr>`).join('') || '<tr><td colspan="11">No accounts created in range.</td></tr>';
}

function renderHomeDeed(payload) {
  const s = payload.series || [];
  const lt = payload.lifetime || {};
  $('home-deed-title').textContent = `Home Deed bought: ${lt.deeds} of ${lt.accounts} accounts hold one (${pct(lt.deeds, lt.accounts) ?? 0}%)`;
  chart('homeDeedChart', {
    type: 'bar',
    data: { labels: s.map((p) => p.day), datasets: [
      bar('Deeds bought (Homesteader trophy)', s.map((p) => p.bought), '#d8a657', { yAxisID: 'y', order: 2 }),
      line('% of that day\'s signups holding a deed', s.map((p) => (p.accounts ? pct(p.deeds, p.accounts) : null)), '#7aa2f7', { yAxisID: 'y1', order: 1 }),
    ] },
    options: { ...BASE, scales: { x: AXES.x, y: { ...AXES.y, position: 'left' }, y1: PCT_AXIS({ max: 100, position: 'right', grid: { drawOnChartArea: false } }) },
      plugins: { ...LEGEND, tooltip: { callbacks: {
        afterTitle: (items) => { const p = s[items[0].dataIndex] || {}; return `${p.accounts} signed up, ${p.deeds} of them hold a deed today`; },
        label: (c) => (c.raw == null ? `${c.dataset.label}: n/a` : `${c.dataset.label}: ${c.raw}${c.dataset.yAxisID === 'y1' ? '%' : ''}`),
      } } } },
  });
}

function renderHorizontalTop(canvasId, rows, labelKey, color) {
  chart(canvasId, {
    type: 'bar',
    data: { labels: rows.map((r) => r[labelKey]), datasets: [{ label: 'Count', data: rows.map((r) => r.count), backgroundColor: color }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: { beginAtZero: true, ticks: { precision: 0, color: '#b7ab95' }, grid: { color: '#3a312855' } }, y: { ticks: { color: '#efe7d8' }, grid: { display: false } } },
      plugins: { legend: { display: false } } },
  });
}
function renderQuests(payload) {
  const s = payload.series || [];
  chart('questsChart', {
    type: 'bar',
    data: { labels: s.map((p) => p.day), datasets: [
      bar('Quests turned in', s.map((p) => p.completed), '#d8a657', { order: 2 }),
      line('Players turning in', s.map((p) => p.players), '#7aa2f7', { order: 1 }),
    ] },
    options: { ...BASE, scales: AXES, plugins: LEGEND },
  });
  renderHorizontalTop('questsTopChart', payload.top || [], 'quest', '#8bbf6a');
}
function renderTrophies(payload) {
  const s = payload.series || [];
  chart('trophiesChart', { type: 'bar', data: { labels: s.map((p) => p.day), datasets: [bar('Trophies earned', s.map((p) => p.earned), '#c678dd')] }, options: { ...BASE, scales: AXES, plugins: LEGEND } });
  renderHorizontalTop('trophiesTopChart', payload.top || [], 'trophy', '#c678dd');
}
function renderGrids(payload) {
  $('grids-title').textContent = `Grids visited per player: ${payload.total} players, median ${payload.median}, mean ${payload.mean}, max ${payload.max}`;
  const b = payload.buckets || [];
  chart('gridsChart', {
    type: 'bar',
    data: { labels: b.map((x) => x.bucket), datasets: [{ label: 'Players', data: b.map((x) => x.count), backgroundColor: b.map((x, i) => (i === 0 ? '#6b6256' : '#56b6c2')) }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#efe7d8' }, grid: { display: false }, title: { display: true, text: 'distinct grids visited', color: '#b7ab95' } }, y: AXES.y }, plugins: { legend: { display: false } } },
  });
}

// ======================= EVENTS =======================
function renderSettlementEvents(payload) {
  const s = payload.series || [];
  $('settlement-events-title').textContent = `Train & Carnival: ${payload.populated_settlements} of ${payload.settlements} settlements populated`;
  chart('settlementEventsChart', {
    type: 'bar',
    data: { labels: s.map((p) => p.day), datasets: [
      bar('Train departures', s.map((p) => p.train), '#7aa2f7', { stack: 'ev', yAxisID: 'y', order: 3 }),
      bar('Carnival departures', s.map((p) => p.carnival), '#c678dd', { stack: 'ev', yAxisID: 'y', order: 3 }),
      bar('Elections', s.map((p) => p.elections), '#d19a66', { stack: 'ev', yAxisID: 'y', order: 3 }),
      line('Train winners', s.map((p) => p.train_winners), '#56b6c2', { yAxisID: 'y1', order: 1 }),
      line('Carnival winners', s.map((p) => p.carnival_winners), '#e46ba5', { yAxisID: 'y1', order: 2 }),
    ] },
    options: { ...BASE, scales: {
      x: STACKED_AXES.x,
      y: { ...STACKED_AXES.y, position: 'left', title: { display: true, text: 'events', color: '#b7ab95' } },
      y1: { beginAtZero: true, position: 'right', ticks: { precision: 0, color: '#b7ab95' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'winners', color: '#b7ab95' } },
    }, plugins: { ...LEGEND, tooltip: { callbacks: {
      afterTitle: (items) => { const p = s[items[0].dataIndex] || {}; return `all offers filled: train ${p.train_filled} of ${p.train}, carnival ${p.carnival_filled} of ${p.carnival}`; },
    } } } },
  });
}
function renderSeasonLog(payload) {
  const seasons = payload.seasons || [];
  $('season-log-title').textContent = `Season leaderboard: ${seasons.length} finished season${seasons.length === 1 ? '' : 's'}`;
  const cur = (payload.current || [])[0];
  $('season-current').textContent = cur && cur.seasonNumber
    ? `Current: ${cur.frontier} season ${cur.seasonNumber} (${cur.seasonType}), ${cur.phase}, ends ${cur.endTime ? new Date(cur.endTime).toLocaleString() : '-'}.`
    : '';
  const who = (w) => (w ? `${esc(w.username)}${w.excluded ? '<span class="tag">excluded</span>' : ''}` : '-');
  document.querySelector('#seasonTable tbody').innerHTML = seasons.map((s) => `
    <tr>
      <td>${s.season_number} (${esc(s.season_type)})</td>
      <td>${fmtDate(s.date)}</td>
      <td>${who(s.winners[0])}</td>
      <td class="num">${s.winners[0] ? s.winners[0].net_worth.toLocaleString() : '-'}</td>
      <td>${who(s.winners[1])}</td>
      <td>${who(s.winners[2])}</td>
      <td>${esc(s.winning_settlement || '-')}</td>
      <td class="num">${s.players_relocated ?? '-'}</td>
    </tr>`).join('') || '<tr><td colspan="8">No finished seasons in the log.</td></tr>';
}

// ======================= MONETIZATION =======================
const dollars = (cents) => `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function renderMonetization(p) {
  const m = p.metrics || {};
  setNote('mon-start-note', p.ledger_start_day
    ? `Purchases ledger began ${p.ledger_start_day}; earlier purchases were never recorded.`
    : 'No purchases recorded yet: the ledger starts with the deploy that ships analytics. Gold accounts come from the live players collection and have history.', !p.ledger_start_day);
  $('metric-gold').textContent = m.gold_accounts ?? '-';
  $('metric-revenue').textContent = dollars(m.lifetime_cents);
  $('metric-purchases').textContent = m.lifetime_purchases ?? '-';
  $('metric-purchases-label').textContent = `Lifetime Purchases (${m.lifetime_buyers || 0} buyer${m.lifetime_buyers === 1 ? '' : 's'})`;
  $('metric-yesterday').textContent = dollars(m.cents_yesterday);
  $('metric-yesterday-label').textContent = `Revenue Yesterday (${m.purchases_yesterday || 0} purchase${m.purchases_yesterday === 1 ? '' : 's'}, ${m.yesterday || ''})`;
  const s = p.series || [];
  chart('revenueChart', {
    type: 'bar',
    data: { labels: s.map((r) => r.day), datasets: [
      bar('Revenue ($)', s.map((r) => r.cents / 100), '#8bbf6a', { yAxisID: 'y', order: 2 }),
      line('Purchases', s.map((r) => r.purchases), '#d8a657', { yAxisID: 'y1', order: 1 }),
    ] },
    options: { ...BASE, scales: {
      x: AXES.x,
      y: { beginAtZero: true, position: 'left', ticks: { color: '#b7ab95', callback: (v) => `$${v}` }, grid: { color: '#3a312855' } },
      y1: { beginAtZero: true, position: 'right', ticks: { precision: 0, color: '#b7ab95' }, grid: { drawOnChartArea: false } },
    }, plugins: { ...LEGEND, tooltip: { callbacks: {
      afterTitle: (items) => { const r = s[items[0].dataIndex] || {}; return `${r.buyers} buyer${r.buyers === 1 ? '' : 's'}, ${r.gems} gems sold`; },
      label: (c) => (c.dataset.yAxisID === 'y' ? `Revenue: ${dollars(c.raw * 100)}` : `Purchases: ${c.raw}`),
    } } } },
  });
  const offers = p.by_offer || [];
  chart('offersChart', {
    type: 'bar',
    data: { labels: offers.map((o) => o.title), datasets: [{ label: 'Purchases', data: offers.map((o) => o.purchases), backgroundColor: '#d8a657' }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: { beginAtZero: true, ticks: { precision: 0, color: '#b7ab95' }, grid: { color: '#3a312855' } }, y: { ticks: { color: '#efe7d8' }, grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw} purchase${c.raw === 1 ? '' : 's'}, ${dollars(offers[c.dataIndex].cents)}` } } } },
  });
}
function renderSubActivePct(series) {
  const daily = series.map((p) => (p.subs ? pct(p.dau, p.subs) : null));
  const ROLL = 7;
  const rolling = series.map((_, i) => {
    let active = 0, base = 0;
    for (let j = Math.max(0, i - (ROLL - 1)); j <= i; j++) { const p = series[j]; if (!p) continue; active += p.dau || 0; base += p.subs || 0; }
    return base > 0 ? pct(active, base) : null;
  });
  chart('subActivePctChart', {
    type: 'line',
    data: { labels: series.map((p) => p.day), datasets: [
      line('% of Gold active', daily, '#d8a657', { order: 2 }),
      line(`Rolling ${ROLL}d Avg.`, rolling, '#56b6c2', { tension: 0.35, borderWidth: 3, pointRadius: 0, order: 1 }),
    ] },
    options: { ...BASE, scales: { x: AXES.x, y: PCT_AXIS({ max: 100 }) }, plugins: { ...LEGEND, tooltip: { callbacks: {
      label: (c) => `${c.dataset.label}: ${c.raw == null ? 'no data' : `${c.raw}%`}`,
      afterBody: (items) => { const p = series[items[0].dataIndex]; return p ? `${p.dau} of ${p.subs} Gold accounts active` : ''; },
    } } } },
  });
}
function renderSubDau(series, mode = subDauMode) {
  const labels = series.map((p) => p.day);
  const newU = series.map((p) => p.newUsers);
  const returning = series.map((p) => Math.max(0, p.dau - p.newUsers));
  let datasets, scales;
  if (mode === 'stacked') {
    datasets = [line('Returning Gold', returning, '#8bbf6a', { backgroundColor: '#8bbf6a55', fill: true }), line('New Gold', newU, '#7aa2f7', { backgroundColor: '#7aa2f755', fill: true })];
    scales = STACKED_AXES;
  } else {
    datasets = [line('Gold DAU', series.map((p) => p.dau), '#d8a657', { backgroundColor: '#d8a65733', fill: true, order: 3 }), line('Returning Gold', returning, '#8bbf6a', { order: 1 }), line('New Gold', newU, '#7aa2f7', { order: 2 })];
    scales = AXES;
  }
  chart('subDauChart', { type: 'line', data: { labels, datasets }, options: { ...BASE, scales, plugins: LEGEND } });
}

// ======================= DEMOGRAPHICS =======================
// Inline Chart.js plugin: draw each bar's "% of total" just past the bar end.
const pctOfTotalLabels = {
  id: 'pctOfTotalLabels',
  afterDatasetsDraw(c) {
    const { ctx } = c;
    const datasets = c.data.datasets || [];
    const n = (c.data.labels || []).length;
    if (!datasets.length || !n) return;
    const horizontal = c.options.indexAxis === 'y';
    const barTotal = new Array(n).fill(0);
    for (let d = 0; d < datasets.length; d++) {
      if (c.getDatasetMeta(d).hidden) continue;
      (datasets[d].data || []).forEach((v, i) => { barTotal[i] += Number(v) || 0; });
    }
    const grand = barTotal.reduce((a, b) => a + b, 0);
    if (!grand) return;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px system-ui, sans-serif';
    for (let i = 0; i < n; i++) {
      if (!barTotal[i]) continue;
      const label = `${Math.round((barTotal[i] / grand) * 100)}%`;
      if (horizontal) {
        let rightX = -Infinity, y = null;
        for (let d = 0; d < datasets.length; d++) {
          const meta = c.getDatasetMeta(d);
          if (meta.hidden) continue;
          const el = meta.data[i];
          if (el && el.x > rightX) { rightX = el.x; y = el.y; }
        }
        if (y == null) continue;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(label, rightX + 6, y);
      } else {
        let topY = Infinity, x = null;
        for (let d = 0; d < datasets.length; d++) {
          const meta = c.getDatasetMeta(d);
          if (meta.hidden) continue;
          const el = meta.data[i];
          if (el && el.y < topY) { topY = el.y; x = el.x; }
        }
        if (x == null) continue;
        ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
        ctx.fillText(label, x, topY - 4);
      }
    }
    ctx.restore();
  },
};
function renderDemoBar(canvasId, rows) {
  chart(canvasId, {
    type: 'bar',
    data: { labels: rows.map((r) => r.label), datasets: [{ label: 'Players', data: rows.map((r) => r.count), backgroundColor: '#d8a657' }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', layout: { padding: { right: 46 } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0, color: '#b7ab95' }, grid: { color: '#3a312855' } }, y: { ticks: { color: '#efe7d8' }, grid: { display: false } } },
      plugins: { legend: { display: false } } },
  }, [pctOfTotalLabels]);
}
function renderDeviceStacked(data) {
  const labels = (data.device || []).map((r) => r.label);
  const sources = data.deviceSources || [];
  const matrix = data.deviceMatrix || {};
  chart('demoDevice', {
    type: 'bar',
    data: { labels, datasets: sources.map((s) => bar(sourceLabel(s), labels.map((dev) => (matrix[dev] && matrix[dev][s]) || 0), sourceColor(s))) },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', layout: { padding: { right: 46 } },
      scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: '#b7ab95' }, grid: { color: '#3a312855' } }, y: { stacked: true, ticks: { color: '#efe7d8' }, grid: { display: false } } },
      plugins: LEGEND },
  }, [pctOfTotalLabels]);
}
// Vertical "% of total" chart with a long tail rolled into "Other".
const TOP_N = 20;
function renderTailChart(canvasId, allRows) {
  let rows = allRows;
  if (allRows.length > TOP_N + 1) {
    const tail = allRows.slice(TOP_N);
    rows = allRows.slice(0, TOP_N).concat([{ label: `Other (${tail.length})`, count: tail.reduce((a, r) => a + r.count, 0) }]);
  }
  const data = rows.map((r) => r.count);
  const grand = data.reduce((a, b) => a + b, 0) || 1;
  chart(canvasId, {
    type: 'bar',
    data: { labels: rows.map((r) => r.label), datasets: [{ label: 'Players', data, backgroundColor: '#d8a657' }] },
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } },
      scales: { x: { ticks: { color: '#efe7d8', autoSkip: false, maxRotation: 90 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#b7ab95', callback: (v) => `${Math.round((v / grand) * 100)}%` }, grid: { color: '#3a312855' } } },
      plugins: { legend: { display: false } } },
  }, [pctOfTotalLabels]);
}
function renderDemographics(data) {
  const cic = data.clientInfoCoverage || {};
  $('demo-note').textContent = `${data.total} new account${data.total === 1 ? '' : 's'} in range. Device, OS, browser, timezone and screen come from ftueFeedback (captured at signup); `
    + `${cic.with_client_info || 0} of ${cic.accounts || 0} carry client_info (acquisition), which only accounts created after the deploy have.`;
  renderDeviceStacked(data);
  renderDemoBar('demoOs', data.os || []);
  renderDemoBar('demoBrowser', data.browser || []);
  renderDemoBar('demoBrowserMobile', data.browserMobile || []);
  renderDemoBar('demoBrowserDesktop', data.browserDesktop || []);
  renderDemoBar('demoConnection', data.connection || []);
  renderDemoBar('demoScreen', data.screen || []);
  const cov = data.screenCoverage || {};
  $('demoScreenNote').textContent = cov.mobile
    ? `${cov.measured} of ${cov.mobile} mobile signups carry a screen measurement.`
    : 'No mobile signups in this range.';
  renderTailChart('demoTimezone', data.timezone || []);
  const dau = data.timezoneDauYesterday || {};
  renderTailChart('demoTimezoneDau', dau.timezone || []);
  $('demoTzDauSub').textContent = dau.day ? `(${dau.total || 0} active users on ${dau.day})` : '';
}
const LANGUAGE_LABELS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian', english: 'English' };
function languageColor(key) {
  const fixed = { en: '#d8a657', es: '#8bbf6a', fr: '#7aa2f7', de: '#c678dd', Unknown: '#6b6256' };
  if (fixed[key]) return fixed[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h}, 45%, 55%)`;
}
const languageLabel = (key) => LANGUAGE_LABELS[String(key).toLowerCase()] || key;
function renderLanguage(payload) {
  const rows = payload.all || [];
  const languages = payload.languages || [];
  const dayTotals = rows.map((r) => languages.reduce((sum, l) => sum + (r[l] || 0), 0));
  chart('demoLanguage', {
    type: 'bar',
    data: { labels: rows.map((r) => r.day), datasets: languages.map((lang) => bar(languageLabel(lang), rows.map((r, i) => (dayTotals[i] > 0 ? ((r[lang] || 0) / dayTotals[i]) * 100 : 0)), languageColor(lang), { stack: 'lang' })) },
    options: { ...BASE, scales: { x: STACKED_AXES.x, y: { ...PCT_AXIS({ max: 100 }), stacked: true } },
      plugins: { ...LEGEND, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } } },
  });
  const lt = payload.lifetime || [];
  const total = lt.reduce((s, r) => s + r.count, 0) || 1;
  chart('demoLanguagePie', {
    type: 'doughnut',
    data: { labels: lt.map((r) => languageLabel(r.label)), datasets: [{ data: lt.map((r) => r.count), backgroundColor: lt.map((r) => languageColor(r.label)), borderColor: '#1a1714', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#efe7d8', font: { size: 11 } } },
      tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed} (${Math.round((c.parsed / total) * 100)}%)` } } } },
  });
}

// ======================= fetch + render the active tab =======================
function rangeValid() {
  const from = fromEl.value, to = toEl.value;
  return from && to && from <= to;
}

async function refresh() {
  const hideDevs = hideDevsEl.checked;
  localStorage.setItem(KEY('hideDevs'), hideDevs ? '1' : '0');
  const devSuffix = hideDevs ? ' / devs hidden' : '';
  const from = fromEl.value, to = toEl.value;
  if (!rangeValid()) return setStatus('Pick a valid date range.', true);
  const qs = rangeQS(hideDevs);
  setStatus('Loading...');
  try {
    if (activeTab === 'site') {
      const st = await getJSON(`/api/site-traffic${qs}`);
      lastSiteTraffic = st;
      renderSiteTraffic(st);
      const totViews = st.series.reduce((s, p) => s + (p.views || 0), 0);
      const totAccounts = st.series.reduce((s, p) => s + (p.accounts || 0), 0);
      setStatus(`${from} to ${to} / ${totViews.toLocaleString()} pageviews / ${totAccounts} accounts created${devSuffix}`);
    } else if (activeTab === 'traffic') {
      const [dau, source, trafficM] = await Promise.all([getJSON(`/api/dau${qs}`), getJSON(`/api/source${qs}`), getJSON(`/api/traffic-metrics${qs}`)]);
      lastDauSeries = dau.series;
      lastSourceData = source;
      renderTrafficMetrics(trafficM);
      renderDau(dau.series, dauMode);
      renderSource(source, sourceMode);
      renderSourceLine(source, sourceMode);
      retentionSelectedSources = null;
      const nCohorts = await loadRetention();
      const totalNew = dau.series.reduce((s, p) => s + p.newUsers, 0);
      const peakDau = dau.series.reduce((m, p) => Math.max(m, p.dau), 0);
      setStatus(`${from} to ${to} / peak DAU ${peakDau} / ${totalNew} new users / ${nCohorts} cohorts${devSuffix}`);
    } else if (activeTab === 'users') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const todayLabel = now.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      const activeQs = `?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}${hideDevs ? '&hideDevs=1' : ''}`;
      const [active, ignored, accounts, players] = await Promise.all([
        getJSON(`/api/active-users${activeQs}`), getJSON(`/api/ignored-users${devQS(hideDevs)}`),
        getJSON(`/api/new-accounts${qs}`), getJSON(`/api/players${devQS(hideDevs)}`),
      ]);
      renderUsers(active, todayLabel);
      renderIgnoredUsers(ignored);
      renderNewAccounts(accounts, `${from} to ${to}`);
      renderPlayersTable(players);
      setStatus(`Today (${todayLabel}) / ${active.users.length} active / ${accounts.accounts.length} new in ${from} to ${to} / ${players.total} accounts${devSuffix}`);
    } else if (activeTab === 'engagement') {
      const [lastSeen, dau, flags, ftue, deed, quests, trophies, grids] = await Promise.all([
        getJSON(`/api/last-seen${qs}`), getJSON(`/api/dau${qs}`), getJSON(`/api/activity-flags${qs}`),
        getJSON(`/api/ftue-funnel${qs}`), getJSON(`/api/home-deed${qs}`), getJSON(`/api/quests${qs}`),
        getJSON(`/api/trophies${qs}`), getJSON(`/api/grids-visited${devQS(hideDevs)}`),
      ]);
      renderLastSeen(lastSeen.series, dau);
      renderFlags(flags);
      ftueData = ftue;
      for (const [dim] of FTUE_DIMS) delete ftueSelected[dim];   // a new cohort resets the chips to All
      renderFtue();
      renderHomeDeed(deed);
      renderQuests(quests);
      renderTrophies(trophies);
      renderGrids(grids);
      const nQuests = quests.series.reduce((s, p) => s + p.completed, 0);
      setStatus(`${from} to ${to} / ${ftue.cohort_total} accounts created / ${nQuests} quests turned in / ${deed.lifetime.deeds} of ${deed.lifetime.accounts} hold a Home Deed${devSuffix}`);
    } else if (activeTab === 'events') {
      const [ev, seasons] = await Promise.all([getJSON(`/api/settlement-events${qs}`), getJSON(`/api/season-log${devQS(hideDevs)}`)]);
      renderSettlementEvents(ev);
      renderSeasonLog(seasons);
      const trains = ev.series.reduce((s, p) => s + p.train, 0);
      const carnivals = ev.series.reduce((s, p) => s + p.carnival, 0);
      setStatus(`${from} to ${to} / ${trains} train departures / ${carnivals} carnival departures / ${seasons.seasons.length} finished seasons`);
    } else if (activeTab === 'monetization') {
      const [purchases, subDau] = await Promise.all([getJSON(`/api/purchases${qs}`), getJSON(`/api/sub-dau${qs}`)]);
      renderMonetization(purchases);
      lastSubDauSeries = subDau.series;
      renderSubDau(subDau.series, subDauMode);
      renderSubActivePct(subDau.series);
      const cents = purchases.series.reduce((s, p) => s + p.cents, 0);
      const n = purchases.series.reduce((s, p) => s + p.purchases, 0);
      setStatus(`${from} to ${to} / ${n} purchases / ${dollars(cents)} / ${purchases.metrics.gold_accounts} Gold accounts${devSuffix}`);
    } else if (activeTab === 'demographics') {
      const [data, language] = await Promise.all([getJSON(`/api/demographics${qs}`), getJSON(`/api/language${qs}`)]);
      renderDemographics(data);
      renderLanguage(language);
      setStatus(`${from} to ${to} / ${data.total} new account${data.total === 1 ? '' : 's'} in range${devSuffix}`);
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tabpanel').forEach((p) => { p.hidden = p.id !== `tab-${tab}`; });
  refresh();
}
function setRange(days) {
  const to = todayLocal();
  toEl.value = to;
  fromEl.value = addDaysLocal(to, -(days - 1));
}

// ---- wiring ----
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.querySelectorAll('.quick button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.quick button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    setRange(parseInt(b.dataset.days, 10));
    refresh();
  });
});
$('apply').addEventListener('click', refresh);
hideDevsEl.addEventListener('change', refresh);

// Mode toggles: each persists to localStorage and re-renders from cache where
// the payload already carries both views (DAU, Source, Visits, Gold DAU);
// Retention refetches because the mode changes what the SERVER counts.
function wireSeg(id, key, get, set, onChange) {
  const saved = localStorage.getItem(KEY(key));
  if (saved) set(saved);
  document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('active', b.dataset.mode === get()));
  document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener('click', () => {
    set(b.dataset.mode);
    localStorage.setItem(KEY(key), b.dataset.mode);
    document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle('active', x.dataset.mode === b.dataset.mode));
    onChange();
  }));
}
wireSeg('dau-mode', 'dauMode', () => dauMode, (m) => { dauMode = m; }, () => { if (lastDauSeries) renderDau(lastDauSeries, dauMode); });
wireSeg('source-mode', 'sourceMode', () => sourceMode, (m) => { sourceMode = m; }, () => { if (lastSourceData) { renderSource(lastSourceData, sourceMode); renderSourceLine(lastSourceData, sourceMode); } });
wireSeg('visitsrc-mode', 'visitSrcMode', () => visitSrcMode, (m) => { visitSrcMode = m; }, () => { if (lastSiteTraffic) renderSiteTraffic(lastSiteTraffic); });
wireSeg('subdau-mode', 'subDauMode', () => subDauMode, (m) => { subDauMode = m; }, () => { if (lastSubDauSeries) renderSubDau(lastSubDauSeries, subDauMode); });
wireSeg('retention-mode', 'retentionMode', () => retentionMode, (m) => { retentionMode = m; }, () => loadRetention());

hideDevsEl.checked = localStorage.getItem(KEY('hideDevs')) === '1';
setRange(30);
setTab('traffic');
