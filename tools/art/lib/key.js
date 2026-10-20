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
async function keyMagenta(buf, { dropGrey = true, nearest = 60, farthest = 170, hue = false } = {}) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let d;
    if (hue) {
      const mx = Math.max(r, g, b, 1);
      d = Math.sqrt((1 - r / mx) ** 2 + (g / mx) ** 2 + (1 - b / mx) ** 2) * 255;
    } else d = Math.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2);
    let a = d <= nearest ? 0 : d >= farthest ? 255 : Math.round(((d - nearest) / (farthest - nearest)) * 255);
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
