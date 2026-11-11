/**
 * VVGame Editor shell: tab registry, hash routing, top bar. Tabs are modules exporting
 * { id, label, icon, group, mount(selectionEl, editorEl, ctx, route), unmount() }.
 * See docs/tools-plan.md §2.
 */
import { el, clear, $ } from './core/dom.js';
import { local } from './core/api.js';
import { toast, setStatus, modal } from './core/ui.js';
import { sheetTab, sheetsTab } from './tabs/sheetTab.js';
import { layoutsTab } from './tabs/layouts.js';
import { worldTab } from './tabs/world.js';
import { dungeonsTab } from './tabs/dungeons.js';
import { eventsTab } from './tabs/events.js';
import { playersTab } from './tabs/players.js';
import { feedbackTab } from './tabs/feedback.js';
import { avatarLabTab } from './tabs/avatarlab.js';
import { progressionTab } from './tabs/progression.js';
import { questForHopeTab } from './tabs/questForHope.js';

const TABS = [
  layoutsTab(),
  worldTab(),
  dungeonsTab(),
  playersTab(),
  feedbackTab(),
  sheetTab('resources', '💰'),
  progressionTab(),
  sheetTab('quests', '📜'),
  questForHopeTab(),
  sheetTab('traders', '🤝'),
  eventsTab(),
  avatarLabTab(),
  sheetTab('avatarParts', '🧩'),
  sheetsTab(),
];

const navEl = $('#nav');
const selectionEl = $('#selection');
const editorEl = $('#editor');
let active = null;

// ---------------------------------------------------------------- leaving unsaved work (owner 2026-11-10)
// A tab may offer pendingChanges() -> null, or { route, label, save: async () => boolean, discard }:
// work not yet saved, living at `route`. Leaving that route (another layout, another tab, the
// browser's Back) asks Save / Discard / Cancel first; Cancel puts the address back.
let currentHash = location.hash.replace(/^#/, '');
let restoring = false;
const pathOf = (h) => (h || '').split('?')[0];

function askLeave(pending) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (!answered) { answered = true; resolve(v); } };
    modal({
      title: 'Unsaved changes',
      body: el('p', {}, `${pending.label} has changes that are not saved.`),
      buttons: [
        { label: 'Cancel', onClick: (close) => { answer('cancel'); close(); } },
        { label: 'Discard', danger: true, onClick: (close) => { answer('discard'); close(); } },
        { label: 'Save', primary: true, onClick: (close) => { answer('save'); close(); } },
      ],
      onClose: () => answer('cancel'),
    });
  });
}

/** True when it is fine to leave for `nextHash` (nothing unsaved there, or saved / discarded now). */
async function confirmLeave(nextHash) {
  const pending = active?.pendingChanges?.();
  if (!pending || pathOf(nextHash) === pathOf(pending.route)) return true;
  const choice = await askLeave(pending);
  if (choice === 'cancel') return false;
  if (choice === 'save') return !!(await pending.save());
  pending.discard();
  return true;
}

const ctx = {
  navigate(route) { location.hash = '#' + route; },
  confirmLeave: () => confirmLeave(null),
  toast, setStatus,
};

// Cmd+Left / Cmd+Right (and Cmd+[ / Cmd+]) are the browser's Back / Forward on a Mac: outside a
// text field they would leave the layout in the middle of editing, so the editor swallows them
window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
  if (!['ArrowLeft', 'ArrowRight', '[', ']'].includes(e.key)) return;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return; // text navigation
  e.preventDefault();
}, true);

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
  const raw = location.hash.replace(/^#/, '');
  if (restoring) { restoring = false; return; } // Cancel put the old address back: stay put
  if (raw !== currentHash && !(await confirmLeave(raw))) {
    restoring = true;
    location.hash = '#' + currentHash;
    return;
  }
  currentHash = raw;
  const hash = raw || TABS[0].id;
  const id = hash.split('/')[0];
  const tab = TABS.find((t) => t.id === id) || (id === 'atlas' ? TABS.find((t) => t.id === 'world') : null) || TABS[0]; // #atlas lives on as World's Tile view
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
