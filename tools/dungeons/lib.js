/**
 * Dungeon drafting kit (docs/dungeons-plan.md, 2026-11-11). A dungeon is DRAWN in code (rooms,
 * water, doors, props, enemies, loot by coordinate), checked, and written as the editor's layout
 * file: game-server/layouts/gridLayouts/dungeon/<name>.json. It is a one-way first draft: once
 * the owner edits a dungeon in the VVGame Editor, the file is the truth and its script is history.
 *
 *   const d = new Dungeon('d006_ghosts');
 *   d.floor(x0, y0, x1, y1[, tile])   a room or a corridor (inclusive; tile CB by default)
 *   d.water(x0, y0, x1, y1)           water inside a room (players cannot cross; Ghosts can)
 *   d.tile(x, y, key)                 one tile (ZZ moss, SL slate, ...)
 *   d.wall(x, y) / d.door(x, y[, type])  a pillar inside a room; a door in a wall (Dungeon Door by default)
 *   d.put(x, y, 'Ghost')              anything from resources.json, by its type
 *   d.island(x, y)                    a cell meant to be out of reach (exempt from the reach check)
 *   d.stamp(x0, y0, rows[, legend])   a hand-drawn patch, one character a cell (see STAMP below):
 *                                     organic water, mud banks, moss, a room's broken outline
 *   d.build()                         walls round everything, then the checks; throws on a problem
 *   d.write()                         the layout file; d.print() the map as text
 *
 * x is the column, y the row (0..63, north at the top). Checks: every key exists; a thing stands
 * only on a tile its validon flag allows; multi-tile props have their footprint free; no floor
 * touches the void; no room is floored with the bare dungeon tile (that tile is the rock OUTSIDE
 * the walls, the owner's rule); every door has open floor on both sides (nothing stands in a
 * doorway); the exit exists; every piece of loot, every door and every enemy that is not
 * over water can be reached on foot from the exit (through doors, and through Rocks, which a
 * player mines: what needs mining is listed).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const RES = require(path.join(ROOT, 'game-server', 'tuning', 'resources.json'));
const byType = new Map(RES.filter((r) => r.category !== 'tile').map((r) => [r.type, r]));
const tileByKey = new Map(RES.filter((r) => r.category === 'tile').map((r) => [r.layoutkey, r]));
const N = 64;
const VOID = 'DU';

/** stamp characters: a tile, or [tile, thing], or [tile, thing, 'island']; '#' a pillar, 'x' solid rock, ' ' leave alone */
const STAMP = { '.': 'CB', '~': 'WA', ',': 'DI', '"': 'ZZ', ';': 'GR', ':': 'SL', '_': 'SA' };

class Dungeon {
  constructor(name) {
    this.name = name;
    this.tiles = Array.from({ length: N }, () => Array(N).fill(VOID));
    this.res = Array.from({ length: N }, () => Array(N).fill(null)); // resource TYPE or null
    this.inside = Array.from({ length: N }, () => Array(N).fill(false)); // floor or water: part of the dungeon
    this.problems = [];
    this.islands = new Set(); // cells meant to be out of reach (an island in the water)
  }
  /** a cell that is MEANT to be out of reach on foot (the well's island): the reach check lets it be */
  island(x, y) { this.islands.add(`${x},${y}`); return this; }
  _in(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
  floor(x0, y0, x1, y1, tile = 'CB') { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { this.tiles[y][x] = tile; this.inside[y][x] = true; } return this; }
  water(x0, y0, x1, y1) { return this.floor(x0, y0, x1, y1, 'WA'); }
  tile(x, y, key) { this.tiles[y][x] = key; this.inside[y][x] = true; return this; }
  /** back to solid rock: a notch in a room's outline */
  fill(x0, y0, x1 = x0, y1 = y0) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { this.tiles[y][x] = VOID; this.inside[y][x] = false; this.res[y][x] = null; } return this; }
  /** a hand-drawn patch: rows of equal length, one character a cell, top-left at (x0, y0) */
  stamp(x0, y0, rows, legend = {}) {
    rows.forEach((row, j) => {
      if (row.length !== rows[0].length) throw new Error(`stamp at (${x0},${y0}): row ${j} is ${row.length} long, not ${rows[0].length}: "${row}"`);
      [...row].forEach((ch, i) => {
        const x = x0 + i, y = y0 + j;
        if (ch === ' ') return;
        if (ch === 'x') return void this.fill(x, y);
        if (ch === '#') return void this.wall(x, y);
        const def = legend[ch] || STAMP[ch];
        if (!def) throw new Error(`stamp at (${x0},${y0}): unknown character "${ch}"`);
        const [tile, type, island] = Array.isArray(def) ? def : [def];
        this.tile(x, y, tile); this.res[y][x] = null;
        if (type) this.put(x, y, type);
        if (island) this.island(x, y);
      });
    });
    return this;
  }
  put(x, y, type) {
    if (!byType.has(type)) throw new Error(`unknown resource type "${type}"`);
    if (this.res[y][x]) this.problems.push(`(${x},${y}): ${type} placed on ${this.res[y][x]}`);
    this.res[y][x] = type; return this;
  }
  wall(x, y) { this.tiles[y][x] = 'CB'; this.inside[y][x] = false; this.res[y][x] = 'Stone Wall'; return this; }
  door(x, y, type = 'Dungeon Door') { this.tiles[y][x] = 'CB'; this.inside[y][x] = true; this.res[y][x] = type; return this; }

  build() {
    // walls: every void cell that touches the dungeon (8 neighbours)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (this.inside[y][x] || this.res[y][x]) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) if (this._in(x + dx, y + dy) && this.inside[y + dy][x + dx]) { touch = true; break; }
      if (touch) { this.tiles[y][x] = 'CB'; this.res[y][x] = 'Stone Wall'; }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (this.inside[y][x] && (x === 0 || y === 0 || x === N - 1 || y === N - 1)) this.problems.push(`(${x},${y}): the dungeon touches the grid's edge`);
    this._check();
    if (this.problems.length) throw new Error(`${this.name}: ${this.problems.length} problem(s)\n  ` + this.problems.slice(0, 40).join('\n  '));
    return this;
  }

  _solidFootprints() { // cells covered by a multi-tile prop (anchor = bottom-left; it reaches right and up)
    const cover = new Map();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = this.res[y][x]; if (!t) continue; const r = byType.get(t);
      const sx = r.sizeX || r.size || 1, sy = r.sizeY || r.size || 1;
      for (let dy = 0; dy < sy; dy++) for (let dx = 0; dx < sx; dx++) { if (!dx && !dy) continue; cover.set(`${x + dx},${y - dy}`, t); }
    }
    return cover;
  }

  _check() {
    const cover = this._solidFootprints();
    let exit = null;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = this.res[y][x]; const tile = tileByKey.get(this.tiles[y][x]);
      if (!tile) { this.problems.push(`(${x},${y}): unknown tile ${this.tiles[y][x]}`); continue; }
      if (this.inside[y][x] && this.tiles[y][x] === VOID) this.problems.push(`(${x},${y}): a room floored with the bare dungeon tile (it belongs outside the walls)`);
      if (cover.has(`${x},${y}`) && (t || !this.inside[y][x])) this.problems.push(`(${x},${y}): ${cover.get(`${x},${y}`)}'s footprint is not free`);
      if (!t) continue;
      const r = byType.get(t);
      if (r[`validon${tile.type}`] !== true) this.problems.push(`(${x},${y}): ${t} may not stand on ${tile.action}`);
      if (t === 'Dungeon Exit') exit = { x, y };
    }
    if (!exit) { this.problems.push('no Dungeon Exit'); return; }
    // reach on foot from beside the exit: 4 neighbours; doors open; passable doobers are walked over
    const walk = (x, y, mine) => {
      if (!this._in(x, y) || !this.inside[y][x]) return false;
      if (tileByKey.get(this.tiles[y][x]).passable === false) return false;
      if (cover.has(`${x},${y}`)) return false;
      const t = this.res[y][x]; if (!t) return true;
      const r = byType.get(t);
      return r.passable === true || r.action === 'door' || r.category === 'npc' || (mine && r.category === 'source'); // an enemy moves: it is not a wall
    };
    const flood = (mine) => {
      const seen = new Set(); const q = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (walk(exit.x + dx, exit.y + dy, mine)) { q.push([exit.x + dx, exit.y + dy]); seen.add(`${exit.x + dx},${exit.y + dy}`); }
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + dx},${y + dy}`; if (!seen.has(k) && walk(x + dx, y + dy, mine)) { seen.add(k); q.push([x + dx, y + dy]); } } }
      return seen;
    };
    const free = flood(false), mined = flood(true);
    if (!free.size) this.problems.push('the exit has no open tile beside it');
    const beside = (set, x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => set.has(`${x + dx},${y + dy}`));
    // a doorway is clear: open floor on both sides, north and south or east and west
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = this.res[y][x]; if (!t || byType.get(t).action !== 'door') continue;
      const open = (a, b) => walk(a, b, false) && byType.get(this.res[b][a] || 'Fern').action !== 'door';
      if (!((open(x, y - 1) && open(x, y + 1)) || (open(x - 1, y) && open(x + 1, y)))) this.problems.push(`(${x},${y}): ${t} is blocked or leads nowhere`);
    }
    this.needsMining = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = this.res[y][x];
      if (this.inside[y][x] && !t && tileByKey.get(this.tiles[y][x]).passable !== false && !cover.has(`${x},${y}`) && !mined.has(`${x},${y}`) && !this.islands.has(`${x},${y}`)) this.problems.push(`(${x},${y}): floor no one can reach`);
      if (!t) continue; const r = byType.get(t);
      const wanted = r.action === 'collect' || r.action === 'door' || (r.category === 'npc' && this.tiles[y][x] !== 'WA');
      if (!wanted || this.islands.has(`${x},${y}`)) continue;
      if (!beside(mined, x, y)) this.problems.push(`(${x},${y}): ${t} cannot be reached`);
      else if (!beside(free, x, y)) this.needsMining.push(`${t} (${x},${y})`);
    }
  }

  counts() { const c = {}; for (const row of this.res) for (const t of row) if (t && t !== 'Stone Wall') c[t] = (c[t] || 0) + 1; return c; }

  layout() {
    return {
      tiles: this.tiles.map((row) => row.slice()),
      resources: this.res.map((row) => row.map((t) => (t ? byType.get(t).layoutkey : '**'))),
      tileDistribution: { g: 0, s: 0, d: 0, w: 0, p: 0, l: 0, n: 0, o: 0, x: 0, y: 100, z: 0, c: 0, v: 0, u: 0, k: 0 },
      resourceDistribution: {},
    };
  }
  write() {
    const file = path.join(ROOT, 'game-server', 'layouts', 'gridLayouts', 'dungeon', `${this.name}.json`);
    // one-way: a layout the owner has edited in the Editor is the truth. Never draw over it by accident.
    const text = JSON.stringify(this.layout(), null, 2) + '\n';
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== text && !process.argv.includes('--overwrite')) {
      throw new Error(`${file} exists and differs from this draft (edited in the Editor?). Pass --overwrite to replace it.`);
    }
    fs.writeFileSync(file, JSON.stringify(this.layout(), null, 2) + '\n'); // the editor's own formatting (tools/editor/server.js writeJSONFile)
    return file;
  }
  print() {
    const T = { CB: '.', DU: ' ', SL: ':', WA: '~', ZZ: '"', LV: '^', DI: ',', GR: ';', SA: '_' };
    const lines = ['    ' + Array.from({ length: N }, (_, x) => (x % 10 === 0 ? String(x / 10) : ' ')).join(''), '    ' + Array.from({ length: N }, (_, x) => x % 10).join('')];
    const glyph = {}; let next = 0; const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const FIX = { 'Stone Wall': '#', 'Dungeon Door': '+', 'Arena Door': '+', 'Locked Door': '+', 'Dungeon Exit': '@' };
    for (let y = 0; y < N; y++) lines.push(String(y).padStart(2, '0') + '  ' + this.res[y].map((t, x) => { if (!t) return T[this.tiles[y][x]] || '?'; if (FIX[t]) return FIX[t]; if (!glyph[t]) glyph[t] = pool[next++]; return glyph[t]; }).join(''));
    lines.push('', Object.entries(glyph).map(([t, g]) => `${g}=${t}`).join('  '));
    return lines.join('\n');
  }
}
module.exports = { Dungeon };
