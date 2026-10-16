/**
 * PROGRESSION: read-only "Level Unlocks" (the old VVGame - ECONOMY sheet tab of that name), for
 * tuning judgments. One column per level; under it, everything that unlocks at that level, in
 * bands: Crafting Stations, Skills, Powers, Farmplots, Doobers (resources.json `category` +
 * `level`) and Quests (quests `level`). Within a level, items keep their file order, as the
 * sheet's FILTER did. Reads the ECONOMY / QUESTS sheets' live rows when they are open (so unsaved
 * edits show), else the files on disk. Nothing here writes.
 */
import { el, clear } from '../core/dom.js';
import { local } from '../core/api.js';
import { liveRows } from './sheetTab.js';

const BANDS = [
  { key: 'crafting', label: 'Crafting Stations', pick: (r) => r.category === 'crafting' },
  { key: 'skill', label: 'Skills', pick: (r) => r.category === 'skill' },
  { key: 'power', label: 'Powers', pick: (r) => r.category === 'power' },
  { key: 'farmplot', label: 'Farmplots', pick: (r) => r.category === 'farmplot' },
  { key: 'doober', label: 'Doobers', pick: (r) => r.category === 'doober' },
  { key: 'quest', label: 'Quests' },
];
const PREF_KEY = 'vvEditor.progression';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; }
}
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } }

const levelOf = (row) => {
  const n = Number(row.level);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
};

function describe(r) {
  const ings = [1, 2, 3, 4].map((i) => r[`ingredient${i}`] && `${r[`ingredient${i}qty`] || 1} ${r[`ingredient${i}`]}`).filter(Boolean);
  return [r.type, r.source && `from ${r.source}`, ings.length && `needs ${ings.join(', ')}`, r.requires && `requires ${r.requires}`].filter(Boolean).join('\n');
}
function describeQuest(q) {
  const goals = [1, 2, 3].map((i) => q[`goal${i}item`] && `${q[`goal${i}action`] || ''} ${q[`goal${i}qty`] || ''} ${q[`goal${i}item`]}`.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return [q.title, q.giver && `from ${q.giver}`, goals.length && goals.join('; '), q.reward && `reward ${q.rewardqty || 1} ${q.reward}`].filter(Boolean).join('\n');
}

export function progressionTab() {
  let prefs = loadPrefs();
  const on = (key) => prefs[key] !== false;

  return {
    id: 'progression', label: 'PROGRESSION', icon: '📈', group: 'economy',
    async mount(selectionEl, editorEl) {
      clear(selectionEl).appendChild(el('div', { class: 'note' }, 'Loading…'));
      clear(editorEl);
      const resources = liveRows('resources') || (await local.tuning('resources')).data;
      let quests = liveRows('quests');
      if (!quests) { try { quests = (await local.tuning('quests')).data; } catch (e) { quests = []; } }

      // band key -> level -> [{ name, symbol, tip }]
      const byBand = new Map(BANDS.map((b) => [b.key, new Map()]));
      const unlevelled = new Map(BANDS.map((b) => [b.key, 0]));
      const add = (band, lvl, entry) => {
        if (lvl === null) { unlevelled.set(band, unlevelled.get(band) + 1); return; }
        const m = byBand.get(band);
        if (!m.has(lvl)) m.set(lvl, []);
        m.get(lvl).push(entry);
      };
      for (const r of resources) {
        const band = BANDS.find((b) => b.pick && b.pick(r));
        if (band) add(band.key, levelOf(r), { name: r.type, symbol: r.symbol || '', tip: describe(r) });
      }
      for (const q of quests || []) add('quest', levelOf(q), { name: q.title, symbol: q.symbol || '📜', tip: describeQuest(q) });

      const maxLevel = Math.max(1, ...[...byBand.values()].flatMap((m) => [...m.keys()]));
      const countIn = (band) => [...byBand.get(band).values()].reduce((n, list) => n + list.length, 0);

      const s = clear(selectionEl);
      s.appendChild(el('h2', {}, 'PROGRESSION'));
      s.appendChild(el('div', { class: 'note' }, 'Level Unlocks: what each level opens. Read-only; it follows ECONOMY (resources.json) and QUESTS, including unsaved edits in those tabs. Hover an item for its source and recipe.'));
      s.appendChild(el('h3', {}, 'Show'));
      const filters = el('div', { class: 'progression-filters' });
      for (const b of BANDS) {
        const box = el('input', { type: 'checkbox', checked: on(b.key), onchange: (e) => { prefs = { ...prefs, [b.key]: e.target.checked }; savePrefs(prefs); draw(); } });
        filters.appendChild(el('label', {}, [box, ` ${b.label} `, el('span', { class: 'muted' }, `(${countIn(b.key)})`)]));
      }
      const hideEmpty = el('input', { type: 'checkbox', checked: prefs.hideEmpty === true, onchange: (e) => { prefs = { ...prefs, hideEmpty: e.target.checked }; savePrefs(prefs); draw(); } });
      s.appendChild(filters);
      s.appendChild(el('h3', {}, 'Levels'));
      s.appendChild(el('label', {}, [hideEmpty, ' Hide levels with nothing shown']));
      const missing = BANDS.filter((b) => unlevelled.get(b.key) > 0).map((b) => `${unlevelled.get(b.key)} ${b.label.toLowerCase()}`);
      if (missing.length) s.appendChild(el('div', { class: 'note' }, `No level set (not shown): ${missing.join(', ')}.`));

      const wrap = el('div', { class: 'progression-wrap' });
      editorEl.appendChild(wrap);

      function draw() {
        clear(wrap);
        const bands = BANDS.filter((b) => on(b.key));
        let levels = Array.from({ length: maxLevel }, (_, i) => i + 1);
        if (prefs.hideEmpty) levels = levels.filter((l) => bands.some((b) => byBand.get(b.key).has(l)));
        if (!bands.length || !levels.length) { wrap.appendChild(el('div', { class: 'stub' }, 'Nothing to show: tick a category on the left.')); return; }

        const table = el('table', { class: 'progression' });
        const total = (l) => bands.reduce((n, b) => n + (byBand.get(b.key).get(l)?.length || 0), 0);
        table.appendChild(el('thead', {}, el('tr', {}, [
          el('th', { class: 'band-head' }, 'Level'),
          ...levels.map((l) => el('th', {}, [String(l), el('div', { class: 'count' }, total(l) ? `${total(l)}` : '')])),
        ])));
        const body = el('tbody');
        for (const b of bands) {
          body.appendChild(el('tr', { class: `band band-${b.key}` }, [
            el('th', { class: 'band-head' }, b.label),
            ...levels.map((l) => {
              const list = byBand.get(b.key).get(l) || [];
              return el('td', {}, list.map((it) => el('div', { class: 'unlock', title: it.tip }, [it.symbol ? `${it.symbol} ` : '', it.name])));
            }),
          ]));
        }
        table.appendChild(body);
        wrap.appendChild(table);
      }
      draw();
    },
    unmount() {},
  };
}
