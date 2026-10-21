/**
 * The KERB: a border of dressed stones that a man-made ground type draws on its OWN cell
 * wherever it meets a different type, whatever that type is (owner 2026-10-21, Cobblestone:
 * "wherever this tile edges with a tile of a different type, we should have an edge"). It
 * replaces the edging system for that cell: no grass lip, no organic corner rounding; the
 * kerb IS the boundary, so the neighbour draws nothing onto it either.
 *
 * Pieces, composed from the cell's eight neighbours:
 *   side      a straight run of kerb stones along each side whose neighbour differs
 *   outer     a corner whose two sides both differ: the kerb curves (two arc stones) when both
 *             neighbours are the same type, the area outside the curve showing that neighbour's
 *             ground; a square corner otherwise
 *   inner     a corner whose two sides are kerbed ground but whose diagonal differs: one small
 *             corner stone, so the runs of the cells beside it join into an L
 * Out-of-grid neighbours count as the cell's own type (no kerb at the board edge). Stone joints
 * always fall on the cell edges, so runs continue seamlessly from cell to cell; the joints inside
 * a cell vary by the cell's variant. Light comes from the upper left, as in the cut tiles.
 *
 * KERB_STYLE is the one table: a type listed there gets the kerb.
 */

const KERB_STYLE = {
  x: { // cobblestone (tiles/x-*.png: khaki cobbles, mean ~#a59a72, dusty moss in the seams)
    stone: '#b2a883', light: '#cdc5a2', dark: '#857c5d', grout: '#625c43',
    moss: 'rgba(118, 138, 74, 0.75)',
  },
};

const DEPTH = 0.14;       // kerb width, share of the cell
const CURVE = 1.9;        // outer-corner curve radius, in kerb widths
const STONE_LEN = 0.19;   // target stone length along a run, share of the cell

export function hasKerb(tileType) {
  return !!KERB_STYLE[tileType];
}

/**
 * What the kerb draws on this cell, as a cache-key string: four sides (n e s w, '1' = kerbed),
 * four inner corners (ne se sw nw), four outer corners (nw ne sw se: the neighbour type that
 * fills outside the curve, '#' for a square corner, '-' for none). '' when the cell has no kerb.
 */
export function kerbSignature(tileType, row, col, tileTypes) {
  if (!KERB_STYLE[tileType] || !tileTypes) return '';
  const at = (r, c) => tileTypes[r]?.[c] ?? tileType;
  const n = at(row - 1, col), e = at(row, col + 1), s = at(row + 1, col), w = at(row, col - 1);
  const diff = (t) => t !== tileType;
  const sides = [n, e, s, w].map((t) => (diff(t) ? '1' : '0')).join('');
  const inner = (a, b, d) => (!diff(a) && !diff(b) && diff(d) ? '1' : '0');
  const innerSig = inner(n, e, at(row - 1, col + 1)) + inner(s, e, at(row + 1, col + 1))
    + inner(s, w, at(row + 1, col - 1)) + inner(n, w, at(row - 1, col - 1));
  const outer = (a, b) => (!diff(a) || !diff(b) ? '-' : a === b ? a : '#');
  const outerSig = outer(n, w) + outer(n, e) + outer(s, w) + outer(s, e);
  if (sides === '0000' && innerSig === '0000') return '';
  return sides + innerSig + outerSig;
}

// a small deterministic random stream per (variant, salt)
function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Fill the current path as one stone: lit from the upper left, rim light and shade, a few specks. */
function fillStone(ctx, style, bx, by, bw, bh, rand, size) {
  const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
  g.addColorStop(0, style.light);
  g.addColorStop(0.45, style.stone);
  g.addColorStop(1, style.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // a soft inner shade on the lower right, so each stone reads as raised
  ctx.strokeStyle = 'rgba(60, 55, 35, 0.35)';
  ctx.lineWidth = Math.max(1, size * 0.016);
  ctx.stroke();
  const specks = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255, 250, 225, 0.22)' : 'rgba(70, 62, 40, 0.22)';
    const r = size * (0.006 + rand() * 0.008);
    ctx.beginPath();
    ctx.arc(bx + rand() * bw, by + rand() * bh, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Joint positions for a run from a to b: the ends are joints, the inside ones jitter by variant. */
function joints(a, b, size, rand) {
  const len = b - a;
  const count = Math.max(1, Math.round(len / (size * STONE_LEN)));
  const out = [a];
  for (let i = 1; i < count; i++) out.push(a + (len * i) / count + (rand() - 0.5) * (len / count) * 0.35);
  out.push(b);
  return out;
}

/**
 * Draw the kerb for a signature over the cell's base. fillNeighbour(ctx, type) paints a
 * neighbour's ground over the whole canvas (the caller clips it to the corner outside a curve).
 */
export function drawKerb(ctx, size, tileType, signature, variant, fillNeighbour) {
  const style = KERB_STYLE[tileType];
  if (!style || !signature) return;
  const side = (i) => signature[i] === '1';             // n e s w
  const inner = (i) => signature[4 + i] === '1';        // ne se sw nw
  const outer = (i) => signature[8 + i];                // nw ne sw se
  const D = Math.round(size * DEPTH);
  const R = Math.round(D * CURVE);
  const gap = Math.max(1, size * 0.018);
  const rad = size * 0.03;
  const rand = rng(variant * 97 + 13);
  const curved = (i) => { const o = outer(i); return o !== '-' && o !== '#'; };

  // outer curves: the neighbour's ground outside the arc (cell corner -> arc -> back)
  const corners = [[0, 0, 0], [1, size, 0], [2, 0, size], [3, size, size]]; // index, corner x, y
  const ARC = { 0: [Math.PI, Math.PI * 1.5], 1: [Math.PI * 1.5, Math.PI * 2], 2: [Math.PI * 0.5, Math.PI], 3: [0, Math.PI * 0.5] };
  for (const [i, cx, cy] of corners) {
    if (!curved(i)) continue;
    const ox = cx === 0 ? R : size - R, oy = cy === 0 ? R : size - R;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(ox, oy, R, ARC[i][0], ARC[i][1]);
    ctx.closePath();
    ctx.clip();
    fillNeighbour(ctx, outer(i));
    ctx.restore();
  }

  // the grout under every straight run (stones are inset into it)
  ctx.fillStyle = style.grout;
  const runs = [];
  // north / south own the full width (their square corners); a curve shortens them by R
  if (side(0)) runs.push({ horiz: true, y: 0, a: curved(0) ? R : 0, b: curved(1) ? size - R : size });
  if (side(2)) runs.push({ horiz: true, y: size - D, a: curved(2) ? R : 0, b: curved(3) ? size - R : size });
  // east / west run between them
  if (side(3)) runs.push({ horiz: false, x: 0, a: side(0) ? (curved(0) ? R : D) : 0, b: side(2) ? (curved(2) ? size - R : size - D) : size });
  if (side(1)) runs.push({ horiz: false, x: size - D, a: side(0) ? (curved(1) ? R : D) : 0, b: side(2) ? (curved(3) ? size - R : size - D) : size });
  for (const run of runs) {
    if (run.b <= run.a) continue;
    if (run.horiz) ctx.fillRect(run.a, run.y, run.b - run.a, D);
    else ctx.fillRect(run.x, run.a, D, run.b - run.a);
  }

  // a faint cast shadow on the cobbles along the inside of each run
  ctx.fillStyle = 'rgba(40, 36, 20, 0.18)';
  const sh = Math.max(1, size * 0.025);
  for (const run of runs) {
    if (run.b <= run.a) continue;
    if (run.horiz) ctx.fillRect(run.a, run.y === 0 ? D : run.y - sh, run.b - run.a, sh);
    else ctx.fillRect(run.x === 0 ? D : run.x - sh, run.a, sh, run.b - run.a);
  }

  // the straight stones
  for (const run of runs) {
    if (run.b <= run.a) continue;
    const j = joints(run.a, run.b, size, rand);
    for (let k = 0; k < j.length - 1; k++) {
      const s0 = j[k] + gap / 2, s1 = j[k + 1] - gap / 2;
      const [x, y, w, h] = run.horiz ? [s0, run.y + gap / 2, s1 - s0, D - gap] : [run.x + gap / 2, s0, D - gap, s1 - s0];
      roundRectPath(ctx, x, y, w, h, rad);
      fillStone(ctx, style, x, y, w, h, rand, size);
      // moss in the odd joint
      if (k > 0 && rand() < 0.25) {
        ctx.fillStyle = style.moss;
        ctx.beginPath();
        const mx = run.horiz ? j[k] : run.x + D * (0.3 + rand() * 0.4);
        const my = run.horiz ? run.y + D * (0.3 + rand() * 0.4) : j[k];
        ctx.arc(mx, my, size * 0.012, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // the curved corners: a grout band and two arc stones
  for (const [i, cx, cy] of corners) {
    if (!curved(i)) continue;
    const ox = cx === 0 ? R : size - R, oy = cy === 0 ? R : size - R;
    const [t0, t1] = ARC[i];
    ctx.beginPath();
    ctx.arc(ox, oy, R, t0, t1);
    ctx.arc(ox, oy, R - D, t1, t0, true);
    ctx.closePath();
    ctx.fillStyle = style.grout;
    ctx.fill();
    const tg = gap / R;
    for (const [a0, a1] of [[t0, (t0 + t1) / 2], [(t0 + t1) / 2, t1]]) {
      ctx.beginPath();
      ctx.arc(ox, oy, R - gap / 2, a0 + tg, a1 - tg);
      ctx.arc(ox, oy, R - D + gap / 2, a1 - tg, a0 + tg, true);
      ctx.closePath();
      fillStone(ctx, style, Math.min(cx, ox), Math.min(cy, oy), R, R, rand, size);
    }
  }

  // inner corners: one small stone where two runs of the neighbouring cells meet
  const INNER = { 0: [size - D, 0], 1: [size - D, size - D], 2: [0, size - D], 3: [0, 0] }; // ne se sw nw
  for (let i = 0; i < 4; i++) {
    if (!inner(i)) continue;
    const [x, y] = INNER[i];
    ctx.fillStyle = style.grout;
    ctx.fillRect(x, y, D, D);
    roundRectPath(ctx, x + gap / 2, y + gap / 2, D - gap, D - gap, rad);
    fillStone(ctx, style, x, y, D, D, rand, size);
  }
}
