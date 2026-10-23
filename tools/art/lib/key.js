/**
 * Key pure magenta (#ff00ff) to alpha. gpt-image-2 refuses transparent output, so mask
 * panels are drawn on flat magenta and keyed here: a soft ramp on the distance from magenta
 * keeps the art's anti-aliased edge, partially covered pixels are un-mixed so edges do not
 * glow pink, and (optionally) low-saturation pixels such as drawn grid lines are dropped.
 */
const { sharp } = require('./common');

/**
 * `hue: true` keys by hue instead of by distance from pure magenta, so a shadow the model
 * painted ONTO the magenta (a dark purple) is background too; the ramp is then on the
 * normalised colour's distance from (1, 0, 1). Use it for walls and props that cast shadows;
 * the lip pieces keep the distance key (their shadow is pulled to green afterwards).
 */
async function keyMagenta(buf, { dropGrey = true, nearest = 60, farthest = 170, hue = false, flood = false, islands = false } = {}) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  const W = info.width, H = info.height, N = W * H;
  const dist = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    if (hue) {
      const mx = Math.max(r, g, b, 1);
      dist[p] = Math.sqrt((1 - r / mx) ** 2 + (g / mx) ** 2 + (1 - b / mx) ** 2) * 255;
    } else dist[p] = Math.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2);
  }
  // `flood: true`: the background is only the magenta that touches the image border (a flood
  // fill over near-magenta pixels from the edges). Art colours that happen to sit near magenta
  // in hue or distance, a purple roof, a pink wall, stay opaque when they are enclosed by the
  // art; without this the ramp made them half-transparent and the un-mixing turned them teal.
  // The flood crosses only background-like pixels (within `floodMax` of magenta: the flat
  // field and the shadows painted onto it), never the art: a purple roof is further from
  // magenta than that, so the flood stops at its edge. The soft ramp then applies only to
  // pixels that TOUCH the flood (the anti-aliased silhouette edge); every other pixel is art.
  let bg = null, edge = null;
  if (flood) {
    const floodMax = nearest + 30;
    bg = new Uint8Array(N);
    const stack = [];
    const push = (p) => { if (!bg[p] && dist[p] <= floodMax) { bg[p] = 1; stack.push(p); } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p - x) / W;
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
    edge = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
      if (bg[p]) continue;
      const x = p % W, y = (p - x) / W;
      for (let dy = -1; dy <= 1 && !edge[p]; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < W && yy >= 0 && yy < H && bg[yy * W + xx]) { edge[p] = 1; break; }
      }
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = dist[i / 4];
    let a = d <= nearest ? 0 : d >= farthest ? 255 : Math.round(((d - nearest) / (farthest - nearest)) * 255);
    if (bg) a = bg[i / 4] ? 0 : edge[i / 4] ? Math.max(a, 1) : 255; // flood: background, its soft edge, or art
    if (bg && islands && d <= nearest) a = 0; // islands: a pocket of flat magenta the flood could not reach (under an eave, inside a cupola) goes too; pinks and purples are never that close to magenta
    if (dropGrey && a > 0) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 0 && (mx - mn) / mx < 0.35 && a < 255) a = 0; // a faint grey line over magenta, not art
    }
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
    if (a > 0 && a < 255) {
      const k = a / 255;
      out[i] = Math.max(0, Math.min(255, Math.round((r - 255 * (1 - k)) / k)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(g / k)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round((b - 255 * (1 - k)) / k)));
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

module.exports = { keyMagenta };
