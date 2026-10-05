/**
 * VVGame Editor shell: tab registry, hash routing, top bar. Tabs are modules exporting
 * { id, label, icon, group, mount(selectionEl, editorEl, ctx, route), unmount() }.
 * See docs/tools-plan.md §2.
 */
import { el, clear, $ } from './core/dom.js';
import { local } from './core/api.js';
import { toast, setStatus } from './core/ui.js';
import { sheetTab, sheetsTab } from './tabs/sheetTab.js';
import { stubTab } from './tabs/stub.js';
import { layoutsTab } from './tabs/layouts.js';

const TABS = [
  layoutsTab(),
  stubTab('world', 'World', '🌍', 'world'),
  stubTab('atlas', 'Atlas', '🧭', 'world'),
  stubTab('dungeons', 'Dungeons', '🏰', 'admin'),
  stubTab('events', 'Events', '⏱', 'admin'),
  stubTab('players', 'Players', '👥', 'admin'),
  stubTab('feedback', 'Feedback', '💬', 'admin'),
  sheetTab('resources', '💰'),
  sheetTab('quests', '📜'),
  sheetTab('traders', '🤝'),
  sheetsTab(),
];

const navEl = $('#nav');
const selectionEl = $('#selection');
const editorEl = $('#editor');
let active = null;

const ctx = {
  navigate(route) { location.hash = '#' + route; },
  toast, setStatus,
};

function renderNav() {
  clear(navEl);
  let lastGroup = null;
  for (const t of TABS) {
    if (lastGroup && t.group !== lastGroup) navEl.appendChild(el('div', { class: 'group-gap' }));
    lastGroup = t.group;
    navEl.appendChild(el('button', { class: active?.id === t.id ? 'active' : '', title: t.label, onclick: () => ctx.navigate(t.id) }, [t.icon, el('small', {}, t.label.length > 9 ? t.label.slice(0, 8) + '…' : t.label)]));
  }
}

async function route() {
  const hash = location.hash.replace(/^#/, '') || TABS[0].id;
  const id = hash.split('/')[0];
  const tab = TABS.find((t) => t.id === id) || TABS[0];
  if (active && active.id !== tab.id) { try { active.unmount(); } catch (e) { console.warn(e); } }
  active = tab;
  renderNav();
  document.title = `${tab.label} · VVGame Editor`;
  try { await tab.mount(selectionEl, editorEl, ctx, hash); }
  catch (err) { console.error(err); clear(editorEl).appendChild(el('div', { class: 'stub' }, `${tab.label} failed to load: ${err.message}`)); }
}

async function init() {
  try {
    const info = await local.info();
    const t = $('#target');
    t.textContent = `game server: ${info.gameServer}`;
    if (info.isProduction) { t.classList.add('prod'); t.title = 'PRODUCTION. Live writes from World, Dungeons, Events and Players hit real player data.'; }
  } catch (e) { $('#target').textContent = 'game server: (unknown)'; }
  window.addEventListener('hashchange', route);
  await route();
}
init();
