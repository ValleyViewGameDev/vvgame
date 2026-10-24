/**
 * STEP STONES, the pure part (no Pixi, no React; the editor-free preview uses it too).
 *
 * Owner 2026-10-24, second pass, after a reference photo of a garden path: flat, pale stones of
 * every size, from small fillers to big slabs, laid loosely along the path with grass between
 * them, never a grid. So the stones are not drawn into the tile texture (a `k` cell is plain
 * grass there); they are laid out over the WHOLE path at once:
 *
 *   layoutStepStones(tileTypes) -> [{ x, y, r, shape }]   (x, y, r in tiles)
 *     Each `k` cell seeds candidate stones of mixed sizes from a hash of its position. All
 *     candidates are placed biggest first; one is kept when it does not touch a kept stone and its
 *     whole outline lies on path cells (`k`), so stones cross from one path cell into the next
 *     freely but never spill onto the grass beside the path. Same tiles, same stones, every visit.
 *   paintStone(ctx, shape, R) -> draws stone `shape` (0..SHAPES-1) centred in a 2R... canvas
 *     (see STONE_PAD), radius R px: soft sunken shadow, a thin dark side, a flat pale face lit from
 *     the upper left, grain, a rim, and a few blades of grass leaning over the edge.
 */

export const SHAPES = 24;          // distinct outlines, pre-drawn once and reused at any size
export const STONE_PAD = 1.35;     // canvas half-size = R * STONE_PAD (room for the shadow and grass)

const CANDIDATES_PER_CELL = 40;
const STONE_R = [0.15, 0.2];      // medium stones, a narrow range (owner 2026-10-25: about three a cell)
const GAP = 0.035;                 // grass between stones, in tiles
const EDGE = 0.025;                // grass kept between a stone and a non-path cell, in tiles

const STONE = { light: '#d8d1b6', base: '#c2b998', dark: '#aaa080', side: '#837a5d', rim: 'rgba(70, 62, 40, 0.42)' };
const GRASS_BLADES = ['rgba(74, 118, 22, 0.85)', 'rgba(104, 150, 34, 0.85)', 'rgba(132, 178, 48, 0.8)'];

function hash32(a, b, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
}

export function layoutStepStones(tileTypes) {
  if (!Array.isArray(tileTypes)) return [];
  const isPath = (x, y) => tileTypes[Math.floor(y)]?.[Math.floor(x)] === 'k';
  const candidates = [];
  for (let row = 0; row < tileTypes.length; row++) {
    const line = tileTypes[row] || [];
    for (let col = 0; col < line.length; col++) {
      if (line[col] !== 'k') continue;
      const rand = rng(hash32(row, col, 7));
      const add = (x, y, [lo, hi]) => candidates.push({ x, y, r: lo + (hi - lo) * rand(), shape: Math.floor(rand() * SHAPES), order: rand() });
      // many candidate spots anywhere in the cell, all medium sized: placed biggest first, the
      // ones that fit settle in single file, side by side or staggered, about three to a cell
      for (let i = 0; i < CANDIDATES_PER_CELL; i++) add(col + rand(), row + rand(), STONE_R);
    }
  }
  candidates.sort((a, b) => b.r - a.r || a.order - b.order);
  const kept = [];
  const fitsOnPath = (c) => {
    const rr = c.r + EDGE;
    if (!isPath(c.x, c.y)) return false;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (!isPath(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr)) return false;
    }
    return true;
  };
  for (const c of candidates) {
    if (!fitsOnPath(c)) continue;
    if (kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < k.r + c.r + GAP)) continue;
    kept.push({ x: c.x, y: c.y, r: c.r, shape: c.shape });
  }
  return kept;
}

/** The outline of `shape` at radius R around (cx, cy): a blunt, uneven, flat-stone ring. */
function stonePath(ctx, shape, cx, cy, R, dx = 0, dy = 0) {
  const rand = rng(hash32(shape, 11, 3));
  const n = 7 + Math.floor(rand() * 3);
  const rot = rand() * Math.PI * 2;
  const squash = 0.72 + rand() * 0.24;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + ((i + (rand() - 0.5) * 0.4) / n) * Math.PI * 2;
    const k = 0.84 + rand() * 0.16; // never beyond R: the layout reserved exactly R
    pts.push({ x: cx + dx + Math.cos(a) * R * k, y: cy + dy + Math.sin(a) * R * k * squash });
  }
  ctx.beginPath();
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1], pts[0]);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], m = mid(p, q); ctx.quadraticCurveTo(p.x, p.y, m.x, m.y); }
  ctx.closePath();
  return pts;
}

export function paintStone(ctx, shape, R) {
  const c = R * STONE_PAD;
  const rand = rng(hash32(shape, 29, 5));
  // sunken in the lawn: a soft shadow below and to the lower right
  ctx.save();
  ctx.shadowColor = 'rgba(30, 48, 12, 0.45)';
  ctx.shadowBlur = R * 0.22;
  ctx.shadowOffsetX = R * 0.04;
  ctx.shadowOffsetY = R * 0.09;
  stonePath(ctx, shape, c, c, R);
  ctx.fillStyle = STONE.base;
  ctx.fill();
  ctx.restore();
  // a thin dark side showing below the face (it is a flat slab, set low)
  stonePath(ctx, shape, c, c, R, 0, R * 0.06);
  ctx.fillStyle = STONE.side;
  ctx.fill();
  // the face: flat and pale, lit from the upper left
  const pts = stonePath(ctx, shape, c, c, R);
  const g = ctx.createLinearGradient(c - R, c - R, c + R, c + R);
  g.addColorStop(0, STONE.light); g.addColorStop(0.55, STONE.base); g.addColorStop(1, STONE.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.lineWidth = R * 0.08;
  ctx.strokeStyle = 'rgba(255, 250, 230, 0.22)';
  stonePath(ctx, shape, c, c, R, R * 0.05, R * 0.05); ctx.stroke();
  ctx.strokeStyle = 'rgba(60, 52, 32, 0.16)';
  stonePath(ctx, shape, c, c, R, -R * 0.05, -R * 0.05); ctx.stroke();
  for (let i = 0; i < 14; i++) { // grain
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255, 252, 235, 0.14)' : 'rgba(80, 72, 48, 0.13)';
    ctx.beginPath();
    ctx.arc(c + (rand() - 0.5) * R * 1.6, c + (rand() - 0.5) * R * 1.3, R * (0.025 + rand() * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  stonePath(ctx, shape, c, c, R);
  ctx.lineWidth = Math.max(1, R * 0.035);
  ctx.strokeStyle = STONE.rim;
  ctx.stroke();
  // grass leaning over the rim here and there
  for (const p of pts) {
    if (rand() < 0.45) continue;
    const ox = p.x - c, oy = p.y - c, len = Math.hypot(ox, oy) || 1, ux = ox / len, uy = oy / len;
    const blades = 2 + Math.floor(rand() * 2);
    for (let b = 0; b < blades; b++) {
      const along = (rand() - 0.5) * R * 0.25;
      const bx = p.x + ux * R * 0.06 - uy * along, by = p.y + uy * R * 0.06 + ux * along;
      const h = R * (0.13 + rand() * 0.14), lean = (rand() - 0.5) * 0.9, w = R * 0.035;
      const tx = bx - (ux * Math.cos(lean) - uy * Math.sin(lean)) * h;
      const ty = by - (uy * Math.cos(lean) + ux * Math.sin(lean)) * h;
      ctx.fillStyle = GRASS_BLADES[Math.floor(rand() * GRASS_BLADES.length)];
      ctx.beginPath(); ctx.moveTo(bx - uy * w, by + ux * w); ctx.lineTo(tx, ty); ctx.lineTo(bx + uy * w, by - ux * w); ctx.closePath(); ctx.fill();
    }
  }
}
