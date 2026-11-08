import React from 'react';
import { tileColors } from '../Styles/tileColors';
import './TileSwatch.css';

/**
 * TileSwatch: a square of the ground a tool lays (the Tools panel, owner 2026-11-08: "square
 * tiles that reflect what actually gets placed on the game board, rather than an emoji").
 * A type with cut ground art (public/assets/tiles/<type>-<i>.png, sixteen variants of the same
 * look) shows its first cut; the shader and placeholder tiles (water, lava, snow, dungeon, moss,
 * clay) show their flat colour from UI/Styles/tileColors.js, which is what the board draws
 * under their effects; step stones are the grass cut with three pale stones set in it, as
 * PixiRendererStepStones lays them.
 *   <TileSwatch type="g" />            1.25em square, inline with text (like ResourceIcon)
 *   tileSwatchSrc(type)                the image URL (a cut, or a data-URL colour square) for the cursor
 */
const RASTER_TYPES = new Set(['g', 'd', 's', 'p', 'n', 'x']);
const STONE = '#d9d6b4';

export function tileImage(type) {
  return RASTER_TYPES.has(type) ? `/assets/tiles/${type}-0.png` : null;
}

/** The picture of a tile for a canvas cursor: its cut when it has one, else a flat colour square. */
export function tileSwatchSrc(type) {
  const base = type === 'k' ? 'g' : type;
  const img = tileImage(base);
  if (img) return img;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = tileColors[base] || '#888';
  ctx.fillRect(0, 0, 32, 32);
  return c.toDataURL();
}

export default function TileSwatch({ type, size, className = '', title }) {
  const base = type === 'k' ? 'g' : type;
  const img = tileImage(base);
  const style = {
    ...(size ? { width: size, height: size } : null),
    ...(img ? { backgroundImage: `url(${img})` } : { backgroundColor: tileColors[base] || '#888' }),
  };
  return (
    <span className={`tile-swatch ${className}`.trim()} style={style} title={title} aria-hidden="true">
      {type === 'k' && <><i className="tile-swatch-stone" style={{ left: '14%', top: '18%' }} /><i className="tile-swatch-stone" style={{ left: '52%', top: '40%' }} /><i className="tile-swatch-stone" style={{ left: '20%', top: '62%' }} /></>}
    </span>
  );
}
export { STONE };
