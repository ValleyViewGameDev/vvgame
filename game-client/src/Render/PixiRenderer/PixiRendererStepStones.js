/**
 * STEP STONES (tile type `k`, owner 2026-10-24): flat stones set into grass, four or five per cell,
 * in the cobblestone's colours and rounded shapes, each sitting a little sunken with a faint
 * shadow and a few blades of grass leaning over its rim. Drawn over the grass base (the cell is
 * grass for every edging rule, PixiRendererTileTextures), so a run of them reads as a path of
 * stepping stones across a lawn.
 *
 * Tiling: no stone comes within EDGE_MARGIN of the cell's edge, so neighbouring cells meet on plain
 * grass and repeat without seams; the layout is seeded by the cell's variant (16), so a long run
 * does not show the same cell twice in a row (getRasterVariant is a position hash).
 */

const STONE = { light: '#cbc29d', base: '#ada27a', dark: '#93896a', side: '#6e6548', rim: 'rgba(58, 50, 30, 0.5)' };
const GRASS_BLADES = ['rgba(74, 118, 22, 0.9)', 'rgba(104, 150, 34, 0.9)', 'rgba(132, 178, 48, 0.85)'];
const EDGE_MARGIN = 0.05; // share of the cell kept clear at every edge

function rng(seed) {
  let s = ((seed + 1) * 2654435761) >>> 0;
  return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
}

/**
 * Where the stones go for this variant: four main stones, one in each quarter of the cell, pushed
 * about inside it so a run never reads as a grid, and on about half the variants a smaller fifth
 * between them. All kept inside EDGE_MARGIN and apart from each other.
 */
function layout(variant, size) {
  const rand = rng(variant * 131 + 7);
  const m = size * EDGE_MARGIN;
  const stones = [];
  const fits = (x, y, r) => x - r >= m && y - r >= m && x + r <= size - m && y + r <= size - m
    && stones.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r + size * 0.03);
  const add = (cx, cy, rMin, rMax, wander) => {
    for (let t = 0; t < 40; t++) {
      const r = size * (rMin + rand() * (rMax - rMin));
      const x = cx * size + (rand() - 0.5) * wander * size;
      const y = cy * size + (rand() - 0.5) * wander * size;
      if (fits(x, y, r)) { stones.push({ x, y, r, rot: rand() * Math.PI * 2, squash: 0.72 + rand() * 0.22, seed: Math.floor(rand() * 1e6) }); return; }
    }
  };
  for (const [cx, cy] of [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]]) add(cx, cy, 0.135, 0.17, 0.12);
  if (rand() < 0.5) add(0.5, 0.5, 0.09, 0.11, 0.06);
  return stones;
}

/** An irregular rounded stone outline: a ring of points with jittered radius, joined by curves. */
function stonePath(ctx, st, dx = 0, dy = 0) {
  const rand = rng(st.seed);
  const n = 7; // few points and a strong jitter: a cobble's blunt, uneven outline, not an egg
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = st.rot + ((i + (rand() - 0.5) * 0.35) / n) * Math.PI * 2;
    const k = 0.8 + rand() * 0.32;
    pts.push({ x: st.x + dx + Math.cos(a) * st.r * k, y: st.y + dy + Math.sin(a) * st.r * k * st.squash });
  }
  ctx.beginPath();
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1], pts[0]);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], md = mid(p, q);
    ctx.quadraticCurveTo(p.x, p.y, md.x, md.y);
  }
  ctx.closePath();
  return pts;
}

function drawStone(ctx, st, size) {
  const rand = rng(st.seed + 17);
  // sunken: a soft shadow under and to the lower right, on the grass
  ctx.save();
  ctx.shadowColor = 'rgba(28, 46, 10, 0.5)';
  ctx.shadowBlur = size * 0.035;
  ctx.shadowOffsetX = size * 0.006;
  ctx.shadowOffsetY = size * 0.014;
  stonePath(ctx, st);
  ctx.fillStyle = STONE.base;
  ctx.fill();
  ctx.restore();

  // its thickness: a flat slab shows a dark sliver of side below its face at this camera angle
  stonePath(ctx, st, 0, size * 0.022);
  ctx.fillStyle = STONE.side;
  ctx.fill();

  // the face: flat, lit from the upper left as the cut tiles are
  const pts = stonePath(ctx, st);
  const g = ctx.createLinearGradient(st.x - st.r, st.y - st.r, st.x + st.r, st.y + st.r);
  g.addColorStop(0, STONE.light);
  g.addColorStop(0.5, STONE.base);
  g.addColorStop(1, STONE.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // a highlight band on the upper-left inside edge, a shade on the lower right
  ctx.lineWidth = size * 0.02;
  ctx.strokeStyle = 'rgba(255, 249, 222, 0.28)';
  stonePath(ctx, st, size * 0.012, size * 0.012);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(52, 44, 24, 0.22)';
  stonePath(ctx, st, -size * 0.012, -size * 0.012);
  ctx.stroke();
  // mottling, like the cobbles' grain
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255, 250, 228, 0.16)' : 'rgba(70, 62, 38, 0.16)';
    ctx.beginPath();
    ctx.arc(st.x + (rand() - 0.5) * st.r * 1.5, st.y + (rand() - 0.5) * st.r * 1.2, size * (0.006 + rand() * 0.01), 0, Math.PI * 2);
    ctx.fill();
  }
  // now and then a fleck of moss, as on the cobblestone
  if (rand() < 0.35) {
    ctx.fillStyle = 'rgba(112, 136, 66, 0.55)';
    ctx.beginPath();
    ctx.arc(st.x + (rand() - 0.2) * st.r * 0.8, st.y + (rand() - 0.2) * st.r * 0.6, size * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // a thin rim where stone meets earth
  stonePath(ctx, st);
  ctx.lineWidth = Math.max(1, size * 0.008);
  ctx.strokeStyle = STONE.rim;
  ctx.stroke();

  // grass edging: small blades rooted just outside the rim, leaning in over the stone
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    if (rand() < 0.35) continue;
    const p = pts[i];
    const ox = p.x - st.x, oy = p.y - st.y, len = Math.hypot(ox, oy) || 1;
    const ux = ox / len, uy = oy / len; // outward
    const blades = 2 + Math.floor(rand() * 2);
    for (let b = 0; b < blades; b++) {
      const along = (rand() - 0.5) * size * 0.04;
      const bx = p.x + ux * size * 0.012 + -uy * along, by = p.y + uy * size * 0.012 + ux * along;
      const h = size * (0.022 + rand() * 0.026);
      const lean = (rand() - 0.5) * 0.9;
      const tx = bx - (ux * Math.cos(lean) - uy * Math.sin(lean)) * h;
      const ty = by - (uy * Math.cos(lean) + ux * Math.sin(lean)) * h;
      const w = size * 0.007;
      ctx.fillStyle = GRASS_BLADES[Math.floor(rand() * GRASS_BLADES.length)];
      ctx.beginPath();
      ctx.moveTo(bx - uy * w, by + ux * w);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx + uy * w, by - ux * w);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Draw this variant's step stones over the grass already on the canvas. */
export function drawStepStones(ctx, size, variant) {
  for (const st of layout(variant, size)) drawStone(ctx, st, size);
}
