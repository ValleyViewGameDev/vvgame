// Mountain seams (phase 2, docs/making-original-grids.md §8d): where a range continues from one grid
// into the next, its mountains and their ground must run on across the shared edge with no strip
// of grass and resources between them. For every grid edge where a mountain covers the edge tile on
// one side and the other side's tile is open (not water), and the range really continues on that
// side (it has mountains within REACH tiles inward, up to 6 tiles along the edge), a 3x3 mountain is placed on the open side to
// cover the gap, on the same ground as the covered side. Fills are driven only by each grid's
// mountains as built (never by other seam fills), so a seam is exactly as wide as the range. Positions where the other side has no mountains near the edge are a range ENDING at the
// seam: reported, never invented.
//
// In owner grids only trees may be cleared (as phase2_owner_patch.mjs); generated grids may clear
// any tree, rock or doober. Exported for phase1_build.mjs (generated grids only); CLI:
//   node tools/gridgen/seam_fix.mjs [--owner] [--loose-owner] [--dry]
//   (--owner: also fix the owner's grids; --loose-owner: there, doobers and rocks may go too, reported)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED = path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const N = 64, REACH = 8;
const SIZE = { m1: 3, m2: 4 };
const TREES = new Set(['OT', 'PT', 'dt']);
const NEVER = new Set(['WA', 'PA', 'CB', 'OW']);   // no mountain on water, roads, cobbles or snow (towns, homes)
const OPEN = new Set(['GR', 'DI', 'SL']);          // only these take the range's ground
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);

export function fixSeams({ isGenerated, allowOwner = false, dry = false, resourcesByKey, ownerPatched = new Set(), cleared = [], looseOwner = false }) {
  const files = new Map();   // coord -> { L, pretty, cov, anchor, dirty }
  const load = (fr, fc) => {
    if (fr < 0 || fc < 0 || fr > 63 || fc > 63) return null;
    const c = coordOf(fr, fc);
    if (files.has(c)) return files.get(c);
    const f = path.join(FIXED, `${c}.json`);
    if (!fs.existsSync(f)) { files.set(c, null); return null; }
    const text = fs.readFileSync(f, 'utf8'), L = JSON.parse(text);
    const rec = { c, fr, fc, L, pretty: text.startsWith('{\n'), dirty: false };
    recompute(rec); rec.origCov = Uint8Array.from(rec.cov); files.set(c, rec); return rec;   // origCov: the range as built, before any seam fill
  };
  function recompute(rec) {
    rec.cov = new Uint8Array(N * N); rec.anchor = new Uint8Array(N * N);
    rec.L.resources.forEach((row, y) => row.forEach((k, x) => {
      const s = SIZE[k]; if (!s) return; rec.anchor[y * N + x] = 1;
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (y - dy >= 0 && x + dx < N) rec.cov[(y - dy) * N + x + dx] = 1;
    }));
  }
  const withMountains = [];
  for (let fr = 0; fr < 64; fr++) for (let fc = 0; fc < 64; fc++) { const r = load(fr, fc); if (r && r.cov.some((v) => v)) withMountains.push([fr, fc]); }
  const SIDES = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  // edge tile i on side (dr, dc) of a grid, and the tile `d` steps inward
  const at = (dr, dc, i, d = 0) => (dc === 1 ? [N - 1 - d, i] : dc === -1 ? [d, i] : dr === 1 ? [i, N - 1 - d] : [i, d]);
  let placed = 0; const ends = new Map();
  for (let round = 0; round < 8; round++) {
    let changed = 0; ends.clear();
    for (const [fr, fc] of withMountains.concat([...files.values()].filter((r) => r && r.dirty).map((r) => [r.fr, r.fc]))) {
      const A = load(fr, fc); if (!A) continue;
      for (const [dr, dc] of SIDES) {
        const B = load(fr + dr, fc + dc); if (!B) continue;
        const bGen = isGenerated(B.c); if (!bGen && !allowOwner) continue;
        for (let i = 0; i < N; i++) {
          const [ax, ay] = at(dr, dc, i), [bx, by] = at(-dr, -dc, i);
          // only the range as built drives a fill: a seam mountain never triggers another one, so a
          // seam stays as wide as the range instead of creeping along the whole edge
          if (!A.origCov[ay * N + ax] || B.cov[by * N + bx] || B.L.tiles[by][bx] === 'WA') continue;
          // does the range continue on B's side here? (mountains within REACH inward, +-2 along)
          let cont = false;
          for (let d = 0; d <= REACH && !cont; d++) for (let j = Math.max(0, i - 6); j <= Math.min(N - 1, i + 6); j++) { const [x, y] = at(-dr, -dc, j, d); if (B.cov[y * N + x]) { cont = true; break; } }
          if (!cont && !bGen && !ownerPatched.has(B.c)) { ends.set(`${A.c}->${B.c}`, (ends.get(`${A.c}->${B.c}`) || 0) + 1); continue; }   // in Claude's own grids (and the owner's grids opened to Claude's ranges) a range never ends at a seam
          // a 3x3 on B covering (bx, by): anchors (bx - dx, by + dy), footprint inside B, on clearable ground
          // generated grids and owner grids already opened to mountains (mountains.json ownerPatched)
          // may lose trees, rocks and doobers at a seam; other owner grids only trees
          const loose = bGen || ownerPatched.has(B.c) || looseOwner;   // looseOwner: owner asked for every gap closed (2026-10-09)
          const clearable = (k) => k === '**' || TREES.has(k) || (loose && ['source', 'doober'].includes(resourcesByKey.get(k)?.category));
          let best = null;
          for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) {
            const ax2 = bx - dx, ay2 = by + dy;
            if (ax2 < 0 || ax2 + 2 >= N || ay2 >= N || ay2 - 2 < 0 || B.anchor[ay2 * N + ax2] || !clearable(B.L.resources[ay2][ax2])) continue;
            let ok = true, gain = 0, over = 0;
            for (let ey = 0; ey < 3 && ok; ey++) for (let ex = 0; ex < 3; ex++) {
              const X = ax2 + ex, Y = ay2 - ey, k = B.L.resources[Y][X];
              // a newly covered tile ON this seam edge where the other side has no mountain = overhang
              const onEdge = (dc === 1 && X === 0) || (dc === -1 && X === N - 1) || (dr === 1 && Y === 0) || (dr === -1 && Y === N - 1);
              if (onEdge && !B.cov[Y * N + X]) { const j = (dc !== 0) ? Y : X, [px, py] = at(dr, dc, j); if (!A.origCov[py * N + px] && A.L.tiles[py][px] !== 'WA') over++; }
              if (NEVER.has(B.L.tiles[Y][X]) || (!B.cov[Y * N + X] && !clearable(k))) { ok = false; break; }   // covered tiles (anchors too) stay as they are
              if (!B.cov[Y * N + X]) gain++;
            }
            const score = gain - 4 * over;   // match the other side's edge exactly; avoid overhang
            if (ok && (!best || score > best.score)) best = { ax: ax2, ay: ay2, gain, score };
          }
          if (!best) continue;
          const ground = ['DI', 'SL', 'GR'].includes(A.L.tiles[ay][ax]) ? A.L.tiles[ay][ax] : 'DI';
          for (let ey = 0; ey < 3; ey++) for (let ex = 0; ex < 3; ex++) { const X = best.ax + ex, Y = best.ay - ey, k = B.L.resources[Y][X]; if (!B.cov[Y * N + X] && k !== '**' && !TREES.has(k) && !bGen) cleared.push(`${B.c} (${X},${Y}) ${resourcesByKey.get(k)?.type || k}`); }
          for (let ey = 0; ey < 3; ey++) for (let ex = 0; ex < 3; ex++) {
            const X = best.ax + ex, Y = best.ay - ey;
            if (!B.cov[Y * N + X]) { B.L.resources[Y][X] = '**'; if (OPEN.has(B.L.tiles[Y][X])) B.L.tiles[Y][X] = ground; }   // sand / lava keep their ground
          }
          B.L.resources[best.ay][best.ax] = 'm1';
          recompute(B); B.dirty = true; placed++; changed++;
        }
      }
    }
    if (!changed) break;
  }
  const written = [];
  for (const r of files.values()) {
    if (!r || !r.dirty) continue;
    written.push(r.c);
    if (!dry) fs.writeFileSync(path.join(FIXED, `${r.c}.json`), r.pretty ? JSON.stringify(r.L, null, 2) : JSON.stringify(r.L));
  }
  return { placed, written, ends: [...ends.entries()] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), 'utf8'));
  const res = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'game-server', 'tuning', 'resources.json'), 'utf8'));
  const ownerPatched = new Set(JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'mountains.json'), 'utf8')).ownerPatched?.grids || []);
  const cleared = [];
  const r = fixSeams({
    isGenerated: (c) => !!man[c] && !man[c].ownerEdited,
    allowOwner: process.argv.includes('--owner'), dry: process.argv.includes('--dry'),
    resourcesByKey: new Map(res.filter((x) => x.layoutkey).map((x) => [x.layoutkey, x])), ownerPatched, cleared,
    looseOwner: process.argv.includes('--loose-owner'),
  });
  // generated grids keep their fingerprints current, or phase1_build would take them for owner edits
  if (!process.argv.includes('--dry')) {
    const crypto = await import('crypto');
    for (const c of r.written) if (man[c] && !man[c].ownerEdited) man[c].sha1 = crypto.createHash('sha1').update(fs.readFileSync(path.join(FIXED, `${c}.json`))).digest('hex');
    fs.writeFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), JSON.stringify(man, null, 1));
  }
  if (cleared.length) console.log(`owner-grid resources cleared at seams (${cleared.length}): ${cleared.join('; ')}`);
  console.log(`seam mountains placed: ${r.placed}; grids ${process.argv.includes('--dry') ? 'that would change' : 'written'}: ${r.written.length} ${r.written.join(' ')}`);
  if (r.ends.length) console.log(`ranges ending at a seam (left as they are): ${r.ends.map(([k, n]) => `${k} (${n})`).join(', ')}`);
}
