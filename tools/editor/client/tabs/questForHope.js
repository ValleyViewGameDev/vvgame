/**
 * QUEST FOR HOPE: read-only. For each of the seven artifacts the Oracle trades for Hope, a short
 * description and every step a player has to take to get it, with the level, relationship and
 * door (key) gates on each step. Derived on the editor server from tuning + layouts
 * (tools/editor/questForHope.js); which valley grids lead into each dungeon is live data, read
 * from the game server's frontier when it answers.
 */
import { el, clear } from '../core/dom.js';
import { local, game } from '../core/api.js';

const TOWN_RE = /^town\/town[NESW]$/;

async function dungeonEntrances() {
  // templateUsed (e.g. "dPhoenix.json") -> [entrance gridCoords], from every frontier's registry
  const out = new Map();
  try {
    const frontiers = await game.get('/api/frontiers');
    for (const f of (Array.isArray(frontiers) ? frontiers : [])) {
      const full = await game.get(`/api/get-frontier/${f._id}`);
      for (const entry of Object.values(full?.dungeons || {})) {
        const key = String(entry.templateUsed || '').replace(/\.json$/, '');
        if (!key) continue;
        out.set(key, [...(out.get(key) || []), ...(entry.entranceGrids || []).map(Number)]);
      }
    }
  } catch (e) { /* game server unreachable: dungeons show without their entrances */ }
  return out;
}

export function questForHopeTab() {
  return {
    id: 'questforhope', label: 'QUEST FOR HOPE', icon: '🕯️', group: 'quests',
    async mount(selectionEl, editorEl) {
      clear(selectionEl).appendChild(el('div', { class: 'note' }, 'Working out every route (reads all layouts, a few seconds)…'));
      clear(editorEl);
      const [data, entrances] = await Promise.all([local.questForHope(), dungeonEntrances()]);

      const keyName = new Set(data.keys.map((k) => k.key).filter(Boolean));

      // ---- formatting helpers
      const placeLabel = (p) => {
        if (p.dir === 'valleyFixedCoord') return `valley ${p.name}`;
        if (p.dir === 'dungeon') {
          const from = entrances.get(p.name);
          return `dungeon ${p.name}${from?.length ? ` (entered from valley ${from.join(', ')})` : entrances.size ? ' (no entrance registered)' : ''}`;
        }
        return `${p.dir} ${p.name}`;
      };
      const gateText = (p) => {
        if (p.unreachable) return ' (no way in found on this grid: walled off, or reached from a neighbouring grid)';
        if (!p.doors?.length) return '';
        return ' behind ' + p.doors.map((d) => `the ${d.door}${d.key ? ` (needs ${d.key})` : ''}`).join(', then ');
      };
      function placesNode(places) {
        if (!places?.length) return el('span', { class: 'muted' }, 'not placed on any layout');
        const town = places.filter((p) => p.dir === 'town' && TOWN_RE.test(p.grid));
        const rest = places.filter((p) => !(p.dir === 'town' && TOWN_RE.test(p.grid)));
        const parts = [];
        if (town.length) {
          // the four town layouts usually agree; say so once, or list them when they differ
          const texts = [...new Set(town.map(gateText))];
          parts.push(texts.length === 1 ? `the Town${texts[0]}` : town.map((p) => `${p.name}${gateText(p)}`).join('; '));
        }
        for (const p of rest) parts.push(`${placeLabel(p)}${p.count > 1 ? ` (x${p.count})` : ''}${gateText(p)}`);
        if (parts.length <= 6) return el('span', {}, parts.join('; '));
        return el('span', {}, [parts.slice(0, 6).join('; '), el('details', { class: 'qfh-more' }, [el('summary', {}, `and ${parts.length - 6} more`), parts.slice(6).join('; ')])]);
      }
      const who = (f) => `${f.symbol ? f.symbol + ' ' : ''}${f.type}${f.level ? ` (level ${f.level})` : ''}`;
      const qty = (n) => `${n.qty} ${n.item}`;
      const linkKey = (name) => (keyName.has(name) ? el('a', { href: `#questforhope/key-${encodeURIComponent(name)}`, onclick: (e) => { e.preventDefault(); document.getElementById(`qfh-key-${name}`)?.scrollIntoView({ behavior: 'smooth' }); } }, name) : name);

      function steps(way) {
        const li = (label, body) => el('li', {}, [el('b', {}, label + ' '), ...[].concat(body)]);
        switch (way.kind) {
          case 'quest': return [
            li('Find', [who(way.giver), ' in ', placesNode(way.giver.places), '.']),
            way.gates.length && li('Gate', way.gates.join('; ') + '.'),
            li('Quest', `"${way.title}": ` + way.goals.map((g) => (g.self ? `${g.action} the ${g.item} (the reward itself)` : `${g.action} ${g.qty} ${g.item}`)).join('; ') + '.'),
            ...way.enemies.map((e) => li('Hunt', [who(e), ' in ', placesNode(e.places), '.'])),
            li('Reward', `${way.rewardQty} x ${way.reward || ''}`.replace(/ x $/, '') ),
          ];
          case 'trade': return [
            li('Find', [who(way.trader), ' in ', placesNode(way.trader.places), '.']),
            way.gates.length && li('Gate', way.gates.join('; ') + '.'),
            li('Trade', [...way.needs.flatMap((n, i) => [i ? ', ' : '', `${n.qty} `, linkKey(n.item)]), '.']),
          ];
          case 'shop': return [
            li('Find', [who(way.shop), ' in ', placesNode(way.shop.places), '.']),
            way.gates.length && li('Gate', way.gates.join('; ') + '.'),
            li('Use', [...way.needs.flatMap((n, i) => [i ? ', ' : '', `${n.qty} `, linkKey(n.item)]), ' there.']),
          ];
          case 'drop': return [
            li('Defeat', [who(way.enemy), way.action === 'spawn' ? ' (a spawner)' : '', ' in ', placesNode(way.enemy.places), '.']),
          ];
          case 'lying': return [li('Pick up', ['lying on ', placesNode(way.places), '.'])];
          case 'scroll': return [li('Scroll', `can come out of a Reveal Scroll (${way.chance}, ${way.qty} at a time).`)];
          case 'pets': return [li('Pets', 'a pet can bring one home.')];
          default: return [li(way.kind, '')];
        }
      }
      const WAY_TITLE = { quest: 'Quest', trade: 'Trade', shop: 'Exchange', drop: 'Drop', lying: 'Found', scroll: 'Scroll', pets: 'Pets' };

      function waysNode(item, ways, depth = 0) {
        if (!ways.length) return el('div', { class: 'note' }, 'No way to get this was found in the data.');
        return el('div', { class: 'qfh-ways' }, ways.map((w, i) => el('div', { class: 'qfh-way' }, [
          el('div', { class: 'qfh-way-title' }, `${ways.length > 1 ? `Way ${i + 1}: ` : ''}${WAY_TITLE[w.kind] || w.kind}`),
          el('ol', {}, steps({ ...w, reward: item }).filter(Boolean)),
          ...(w.prereqs || []).filter((p) => !(keyName.has(p.item) && depth > 0)).map((p) => el('div', { class: 'qfh-prereq' }, [
            el('div', { class: 'qfh-prereq-title' }, keyName.has(p.item) ? ['First get the ', linkKey(p.item), ':'] : `First get ${p.item}:`),
            waysNode(p.item, p.ways, depth + 1),
          ])),
        ])));
      }

      // ---- selection: jump list
      const s = clear(selectionEl);
      s.appendChild(el('h2', {}, 'QUEST FOR HOPE'));
      s.appendChild(el('div', { class: 'note' }, 'Read-only. The seven artifacts the Oracle trades for Hope, and every step to each, worked out from traders, quests, resources and the grid layouts. Door gates come from walking each layout from its edges (a dungeon from its exit).'));
      const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      const list = el('ul', { class: 'list' });
      if (data.oracle) list.appendChild(el('li', { onclick: () => jump('qfh-oracle') }, [el('span', {}, `${data.oracle.trader.symbol} The Oracle`)]));
      data.items.forEach((it, i) => list.appendChild(el('li', { onclick: () => jump(`qfh-item-${i}`) }, [el('span', {}, `${it.symbol} ${it.name}`)])));
      list.appendChild(el('li', { onclick: () => jump('qfh-keys') }, [el('span', {}, '🗝️ Keys and doors')]));
      s.appendChild(list);
      if (!entrances.size) s.appendChild(el('div', { class: 'note' }, 'Game server not reached: dungeons show without the valley grids that lead into them.'));

      // ---- main
      const page = el('div', { class: 'qfh-page' });
      editorEl.appendChild(page);
      if (data.oracle) {
        page.appendChild(el('section', { id: 'qfh-oracle', class: 'qfh-card' }, [
          el('h2', {}, `${data.oracle.trader.symbol} The Oracle`),
          el('p', {}, `Trades all seven artifacts (one of each) for ${data.oracle.gives}${data.oracle.xp ? `, worth ${data.oracle.xp} XP` : ''}.`),
          el('p', {}, ['Found in ', placesNode(data.oracle.trader.places), '.']),
          data.oracle.gates.length ? el('p', {}, `Gate: ${data.oracle.gates.join('; ')}.`) : null,
        ]));
      }
      data.items.forEach((it, i) => {
        page.appendChild(el('section', { id: `qfh-item-${i}`, class: 'qfh-card' }, [
          el('h2', {}, `${i + 1}. ${it.symbol} ${it.name}`),
          it.hint ? el('p', { class: 'qfh-hint' }, [el('b', {}, 'In-game hint: '), it.hint]) : null,
          waysNode(it.name, it.ways),
        ]));
      });
      page.appendChild(el('section', { id: 'qfh-keys', class: 'qfh-card' }, [
        el('h2', {}, '🗝️ Keys and doors'),
        el('p', { class: 'note' }, 'Every door the steps above mention, the key it takes, and how to get that key.'),
        ...data.keys.filter((k) => k.key).map((k) => el('div', { id: `qfh-key-${k.key}`, class: 'qfh-key' }, [
          el('h3', {}, `${k.symbol} ${k.door}: needs ${k.keySymbol} ${k.key}`),
          waysNode(k.key, k.ways, 1),
        ])),
      ]));
    },
    unmount() {},
  };
}
