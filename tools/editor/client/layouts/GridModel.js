/**
 * Layout grid model: pure functions over a 64x64 grid of cells { type, resource }.
 *
 *   type      tile layoutkey ('GR', 'DI', ...) or '**' / '' for none
 *   resource  resource `type` (e.g. 'Oak Tree') or ''
 *
 * Indexing follows the layout files and the old GridEditor: grid[row][col], where row is
 * the first index (what the old editor called x) and col the second (its y). Everything that
 * mutates returns a new grid so the tab's history can snapshot states.
 *
 * Generation (clumps for deposit tiles, random fill, resource and enemy placement) is ported
 * from game-editor/src/GridEditor.jsx so the output distribution is unchanged.
 */
export const GRID_SIZE = 64;
export const TILE_KEYS = ['g', 's', 'd', 'w', 'p', 'l', 'n', 'o', 'x', 'y', 'z', 'c', 'v', 'u'];
export const DEFAULT_TILE_DISTRIBUTION = Object.fromEntries(TILE_KEYS.map((k) => [k, k === 'g' ? 100 : 0]));
export const DEFAULT_CLUMP = { clumpSize: 20, clumpVariation: 5, minClumpSize: 5, clumpTightness: 2.5 };
export const EDITOR_RESOURCE_CATEGORIES = ['source', 'editor', 'doober', 'reward', 'special', 'crafting', 'trainingAndShop', 'farmplot', 'training', 'shop', 'trading', 'station', 'deco', 'travel', 'stall', 'farmhouse'];

export const emptyGrid = () => Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => ({ type: '', resource: '' })));
export const cloneGrid = (grid) => grid.map((row) => row.map((c) => ({ ...c })));
export const isBlank = (type) => !type || type === '**';

/** Resource lookups the model needs, built once from resources.json. */
export function buildIndex(resources) {
  const tiles = resources.filter((r) => r.category === 'tile');
  return {
    all: resources,
    byType: new Map(resources.map((r) => [r.type, r])),
    tileByLayoutKey: new Map(tiles.map((r) => [r.layoutkey, r])),
    tileByType: new Map(tiles.map((r) => [r.type, r])),
    tileLayoutKeys: tiles.map((r) => r.layoutkey),
    byLayoutKey: new Map(resources.filter((r) => r.layoutkey).map((r) => [r.layoutkey, r])),
    placeable: resources.filter((r) => EDITOR_RESOURCE_CATEGORIES.includes(r.category)),
    npcs: resources.filter((r) => r.category === 'npc'),
    enemies: resources.filter((r) => r.category === 'npc' && (r.action === 'attack' || r.action === 'spawn')),
  };
}

// ----------------------------------------------------------------------------- file <-> model
export function fromLayout(layout, idx) {
  const grid = emptyGrid();
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const t = layout.tiles?.[r]?.[c];
      const res = layout.resources?.[r]?.[c];
      grid[r][c] = {
        type: idx.tileByLayoutKey.has(t) ? t : '**',
        resource: res && res !== '**' && idx.byLayoutKey.has(res) ? idx.byLayoutKey.get(res).type : '',
      };
    }
  }
  const tileDistribution = { ...DEFAULT_TILE_DISTRIBUTION, ...(layout.tileDistribution || {}) };
  const resourceDistribution = { ...(layout.resourceDistribution || {}) };
  const enemiesDistribution = { ...(layout.enemiesDistribution || {}) };
  return { grid, tileDistribution, resourceDistribution, enemiesDistribution };
}

export function toLayout({ grid, tileDistribution, resourceDistribution, enemiesDistribution }, idx) {
  const positive = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
  const out = {
    tiles: grid.map((row) => row.map((c) => (idx.tileByLayoutKey.has(c.type) ? c.type : '**'))),
    resources: grid.map((row) => row.map((c) => (c.resource && idx.byType.get(c.resource)?.layoutkey) || '**')),
    tileDistribution: { ...tileDistribution },
    resourceDistribution: positive(resourceDistribution),
  };
  const enemies = positive(enemiesDistribution);
  if (Object.keys(enemies).length) out.enemiesDistribution = enemies;
  return out;
}

// ----------------------------------------------------------------------------- brush
export function brushTiles(row, col, size, shape, scatterPct = 20) {
  const out = [];
  const inCircle = (dr, dc) => {
    const d = Math.sqrt(dr * dr + dc * dc);
    if (size === 1) return dr === 0 && dc === 0;
    if (size === 2) return (dr === 0 && dc === 0) || Math.abs(dr) + Math.abs(dc) === 1;
    if (size === 3) return d < 2.5;
    return d < size;
  };
  for (let dr = -size + 1; dr < size; dr++) {
    for (let dc = -size + 1; dc < size; dc++) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      let ok;
      if (shape === 'circle') ok = inCircle(dr, dc);
      else if (shape === 'scatter') ok = inCircle(dr, dc) && Math.random() * 100 < scatterPct;
      else ok = true;
      if (ok) out.push({ row: r, col: c });
    }
  }
  return out;
}

export function paintType(grid, cells, layoutkey) {
  const g = cloneGrid(grid);
  for (const { row, col } of cells) g[row][col].type = layoutkey;
  return g;
}
/** Delete key semantics: a cell with a resource loses the resource, otherwise its tile becomes none. */
export function eraseCells(grid, cells) {
  const g = cloneGrid(grid);
  for (const { row, col } of cells) { if (g[row][col].resource) g[row][col].resource = ''; else g[row][col].type = '**'; }
  return g;
}
export function setResource(grid, row, col, resourceType) {
  const g = cloneGrid(grid);
  g[row][col].resource = resourceType || '';
  return g;
}
export function cycleType(grid, row, col, idx) {
  const options = ['**', ...idx.tileLayoutKeys];
  const g = cloneGrid(grid);
  const i = options.indexOf(g[row][col].type);
  g[row][col].type = options[(i + 1) % options.length];
  return g;
}

/** Stamp a mini template with its top-left at (row, col); blank template cells leave the grid alone. */
export function placeTemplate(grid, row, col, template, idx) {
  const g = cloneGrid(grid);
  (template.tiles || []).forEach((trow, tr) => trow.forEach((key, tc) => {
    const r = row + tr, c = col + tc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE || isBlank(key)) return;
    if (idx.tileByLayoutKey.has(key)) g[r][c] = { type: key, resource: '' };
  }));
  (template.resources || []).forEach((trow, tr) => trow.forEach((key, tc) => {
    const r = row + tr, c = col + tc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE || isBlank(key)) return;
    const res = idx.byLayoutKey.get(key);
    if (res) g[r][c].resource = res.type;
  }));
  return g;
}

export const clearAll = () => emptyGrid();
export const clearResources = (grid) => grid.map((row) => row.map((c) => ({ ...c, resource: '' })));
export const clearResourcesOfTypes = (grid, types) => grid.map((row) => row.map((c) => (types.includes(c.resource) ? { ...c, resource: '' } : { ...c })));
export const clearEnemies = (grid, idx) => grid.map((row) => row.map((c) => (c.resource && idx.enemies.some((e) => e.type === c.resource) ? { ...c, resource: '' } : { ...c })));
/** Remove tiles whose single-letter type is in `letters` (sets them to none). */
export function clearTileTypes(grid, letters, idx) {
  const keys = letters.map((l) => idx.tileByType.get(l)?.layoutkey).filter(Boolean);
  return grid.map((row) => row.map((c) => (keys.includes(c.type) ? { ...c, type: '' } : { ...c })));
}

// ----------------------------------------------------------------------------- distributions
/** Slider adjust keeping the sum at 100 (proportional rescale of the others). */
export function adjustTileDistribution(dist, key, value) {
  const out = { ...dist, [key]: value };
  const remaining = 100 - value;
  const others = Object.keys(dist).filter((k) => k !== key);
  const otherTotal = others.reduce((s, k) => s + dist[k], 0);
  if (otherTotal > 0) for (const k of others) out[k] = Math.max(Math.round((dist[k] / otherTotal) * remaining), 0);
  return out;
}

/** Distributions from a randomValleyGridLayouts row (tile %, r1/r1qty.., e1/e1qty..). */
export function distributionsFromTemplateRow(rowData, idx) {
  const out = {};
  if (TILE_KEYS.some((k) => rowData[k] !== undefined)) {
    const tile = { ...DEFAULT_TILE_DISTRIBUTION };
    let total = 0;
    for (const k of TILE_KEYS) if (rowData[k] !== undefined) { tile[k] = rowData[k]; total += rowData[k]; }
    if (total < 100) tile.g = 100 - (total - (rowData.g || 0));
    out.tileDistribution = tile;
  }
  const res = Object.fromEntries(idx.placeable.map((r) => [r.type, 0]));
  let hasRes = false;
  for (let i = 1; i <= 15; i++) {
    const t = rowData[`r${i}`], q = rowData[`r${i}qty`];
    if (t && q !== undefined && t in res) { res[t] = q; hasRes = true; }
  }
  if (hasRes) out.resourceDistribution = res;
  const en = Object.fromEntries(idx.enemies.map((e) => [e.type, 0]));
  let hasEn = false;
  for (let i = 1; i <= 10; i++) {
    const t = rowData[`e${i}`], q = rowData[`e${i}qty`];
    if (t && q !== undefined && t in en) { en[t] = q; hasEn = true; }
  }
  if (hasEn) out.enemiesDistribution = en;
  return out;
}

// ----------------------------------------------------------------------------- generation
const shuffle = (a) => a.sort(() => Math.random() - 0.5);
const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

function generateClumps(grid, layoutkey, totalTiles, eligible, clump, weighted) {
  if (totalTiles <= 0 || !eligible.length) return eligible;
  const sizes = [];
  let remaining = totalTiles;
  while (remaining > 0) {
    const variation = Math.floor(Math.random() * (clump.clumpVariation * 2 + 1)) - clump.clumpVariation;
    const size = Math.min(remaining, Math.max(clump.minClumpSize, clump.clumpSize + variation));
    sizes.push(size); remaining -= size;
  }
  const key = (r, c) => `${r},${c}`;
  for (const target of sizes) {
    if (!eligible.length) break;
    const startIdx = Math.floor(Math.random() * eligible.length);
    const start = eligible[startIdx];
    eligible.splice(startIdx, 1);
    const tiles = [start];
    const set = new Set([key(start.row, start.col)]);
    const eligibleSet = new Map(eligible.map((p, i) => [key(p.row, p.col), p]));
    while (tiles.length < target && eligibleSet.size) {
      const candidates = new Map();
      for (const t of tiles) {
        for (const [dr, dc] of NEIGHBOURS) {
          const k = key(t.row + dr, t.col + dc);
          if (set.has(k) || candidates.has(k) || !eligibleSet.has(k)) continue;
          const p = eligibleSet.get(k);
          let weight = 1;
          if (weighted) {
            const adjacent = NEIGHBOURS.filter(([ar, ac]) => set.has(key(p.row + ar, p.col + ac))).length;
            weight = Math.pow(adjacent, clump.clumpTightness);
          }
          candidates.set(k, { ...p, weight });
        }
      }
      if (!candidates.size) break;
      const list = [...candidates.values()];
      let chosen = list[0];
      if (weighted) {
        let rnd = Math.random() * list.reduce((s, n) => s + n.weight, 0);
        for (const n of list) { rnd -= n.weight; if (rnd <= 0) { chosen = n; break; } }
      } else chosen = list[Math.floor(Math.random() * list.length)];
      tiles.push({ row: chosen.row, col: chosen.col });
      set.add(key(chosen.row, chosen.col));
      eligibleSet.delete(key(chosen.row, chosen.col));
    }
    for (const t of tiles) grid[t.row][t.col].type = layoutkey;
    eligible = [...eligibleSet.values()];
  }
  return eligible;
}

/** Fill `eligible` positions of `grid` (mutated) from the tile distribution. weighted = tightness-weighted clumps (the full generator; Quick Generate used uniform). */
export function generateTiles(grid, eligible, tileDistribution, idx, clump = DEFAULT_CLUMP, weighted = true) {
  if (!eligible.length) return grid;
  const total = eligible.length;
  const counts = {};
  for (const [letter, pct] of Object.entries(tileDistribution)) {
    const tile = idx.tileByType.get(letter);
    if (!tile || pct <= 0) continue;
    const count = Math.round((pct / 100) * total);
    if (count > 0) counts[letter] = { layoutkey: tile.layoutkey, count, isDeposit: tile.source === 'deposit' };
  }
  for (const data of Object.values(counts).filter((d) => d.isDeposit)) eligible = generateClumps(grid, data.layoutkey, data.count, eligible, clump, weighted);
  const regular = Object.values(counts).filter((d) => !d.isDeposit);
  if (regular.length && eligible.length) {
    let pool = [];
    for (const d of regular) for (let i = 0; i < d.count; i++) pool.push(d.layoutkey);
    pool = shuffle(pool);
    shuffle(eligible).forEach(({ row, col }, i) => { grid[row][col].type = pool[i % pool.length] || 'GR'; });
  }
  return grid;
}

export function generateTilesBlanksOnly(grid, tileDistribution, idx, clump) {
  const g = cloneGrid(grid);
  const eligible = [];
  g.forEach((row, r) => row.forEach((c, cI) => { if (isBlank(c.type)) eligible.push({ row: r, col: cI }); }));
  return generateTiles(g, eligible, tileDistribution, idx, clump, true);
}
export function generateTilesOverwriteAll(grid, tileDistribution, idx, clump) {
  const g = grid.map((row) => row.map((c) => ({ ...c, type: '' })));
  const eligible = [];
  g.forEach((row, r) => row.forEach((_, cI) => eligible.push({ row: r, col: cI })));
  return generateTiles(g, eligible, tileDistribution, idx, clump, true);
}

/** Place resources from the distribution on empty cells whose tile allows them (validon<letter>). Returns { grid, placed, unplaced }. */
export function generateResources(grid, resourceDistribution, idx, clearExisting) {
  const g = clearExisting ? clearResources(grid) : cloneGrid(grid);
  const byType = {};
  for (const [type, count] of Object.entries(resourceDistribution || {})) {
    const res = idx.byType.get(type);
    if (res && Number(count) > 0) byType[type] = { resource: res, remaining: parseInt(count, 10) };
  }
  const total = Object.values(byType).reduce((s, r) => s + r.remaining, 0);
  if (!total) return { grid: g, placed: 0, unplaced: 0 };
  const valid = [];
  g.forEach((row, r) => row.forEach((c, cI) => { if (!c.resource) { const t = idx.tileByLayoutKey.get(c.type); if (t) valid.push({ row: r, col: cI, letter: t.type }); } }));
  let placed = 0, attempts = 0;
  const maxAttempts = total * 3;
  while (placed < total && attempts < maxAttempts && valid.length) {
    attempts++;
    const ci = Math.floor(Math.random() * valid.length);
    const cell = valid[ci];
    const avail = Object.entries(byType).filter(([, d]) => d.remaining > 0);
    if (!avail.length) break;
    const [type, data] = avail[Math.floor(Math.random() * avail.length)];
    if (data.resource[`validon${cell.letter}`]) { g[cell.row][cell.col].resource = type; data.remaining--; placed++; valid.splice(ci, 1); }
  }
  return { grid: g, placed, unplaced: total - placed };
}

/** Place enemies from the distribution on empty cells whose tile allows them. Returns { grid, placed, requested }. */
export function generateEnemies(grid, enemiesDistribution, idx) {
  const g = cloneGrid(grid);
  let pool = [];
  for (const [type, count] of Object.entries(enemiesDistribution || {})) {
    const enemy = idx.enemies.find((e) => e.type === type);
    if (enemy) for (let i = 0; i < Number(count); i++) pool.push(enemy);
  }
  if (!pool.length) return { grid: g, placed: 0, requested: 0 };
  let valid = [];
  g.forEach((row, r) => row.forEach((c, cI) => { if (!c.resource) { const t = idx.tileByLayoutKey.get(c.type); if (t) valid.push({ row: r, col: cI, letter: t.type }); } }));
  pool = shuffle(pool);
  let placed = 0;
  for (const enemy of pool) {
    if (!valid.length) break;
    const cell = shuffle([...valid]).find((c) => enemy[`validon${c.letter}`]);
    if (!cell) continue;
    g[cell.row][cell.col].resource = enemy.type;
    valid = valid.filter((c) => !(c.row === cell.row && c.col === cell.col));
    placed++;
  }
  return { grid: g, placed, requested: pool.length };
}

/**
 * Quick Generate: random template row for the grid type, drop every tile except water and
 * pavement, drop all resources, fill blanks (uniform clumps, as the old editor did), place
 * resources, place enemies. Returns the new state and the template used.
 */
export function quickGenerate(state, templateRows, idx, clump = DEFAULT_CLUMP) {
  const rowData = templateRows[Math.floor(Math.random() * templateRows.length)];
  const d = distributionsFromTemplateRow(rowData, idx);
  const tileDistribution = d.tileDistribution || { ...DEFAULT_TILE_DISTRIBUTION };
  const resourceDistribution = d.resourceDistribution || Object.fromEntries(idx.placeable.map((r) => [r.type, 0]));
  const enemiesDistribution = d.enemiesDistribution || Object.fromEntries(idx.enemies.map((e) => [e.type, 0]));
  let grid = clearTileTypes(state.grid, TILE_KEYS.filter((k) => k !== 'w' && k !== 'p'), idx);
  grid = clearResources(grid);
  const eligible = [];
  grid.forEach((row, r) => row.forEach((c, cI) => { if (isBlank(c.type)) eligible.push({ row: r, col: cI }); }));
  generateTiles(grid, eligible, tileDistribution, idx, clump, false);
  grid = generateResources(grid, resourceDistribution, idx, false).grid;
  grid = generateEnemies(grid, enemiesDistribution, idx).grid;
  return { state: { grid, tileDistribution, resourceDistribution, enemiesDistribution }, template: rowData };
}
