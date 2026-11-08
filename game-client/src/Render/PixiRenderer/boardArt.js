import { footprintOf } from '../../Utils/footprint';
// How big a resource's art is drawn on its tile, shared by the board (PixiRenderer) and the DOM
// overlays that stand in for a sprite while it animates (VFX.js), so a plant that grows in or a
// crop that ripens lands exactly where its sprite is drawn.

// A painted doober's art (the 1 x 1 pickups in resources.json, category 'doober') is drawn this
// much of a tile wide and centred on its tile; the owner picked 0.9 (docs/art/doobers.md). A growing
// farmplot (the sprout, the young vine, shrub and sapling; emoji audit pass 3) draws the same way,
// so a plant is never bigger than the pickup it becomes.
export const DOOBER_TILE_SCALE = 0.9;

/**
 * The fraction of a tile a 1 x 1 row's art is drawn at, centred on its tile: the row's own
 * `artScale` when it has one (the Gem's 0.5, half a tile: a gem is small), else DOOBER_TILE_SCALE
 * for pickups and plots, else 1 (full tile). Rows with artSpan or a bigger footprint are 1.
 */
export const boardArtScale = (row) => {
  if (!row) return 1;
  const { w, h } = footprintOf(row);
  const oneTile = w === 1 && h === 1 && !(Number(row.artSpan) > 1);
  if (!oneTile) return 1;
  if (Number(row.artScale) > 0) return Number(row.artScale);
  return row.category === 'doober' || row.category === 'farmplot' ? DOOBER_TILE_SCALE : 1;
};
