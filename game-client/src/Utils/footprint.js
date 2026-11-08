/**
 * A resource's footprint (BL-21, 2026-11-08): `size` is the square default, `sizeX` / `sizeY`
 * (tiles) make it a rectangle (a bed 1 wide and 2 deep, a market stall 2 wide and 1 deep). A
 * footprint is anchored at its lower-left tile (x, y) and covers x .. x+w-1, y-h+1 .. y (it
 * grows right and UP the screen, like the square one always did). Everything that blocks, hits,
 * highlights or centres on a resource goes through these; the server has the same helpers in
 * game-server/utils/footprint.js.
 */
export const footprintOf = (r) => {
  const s = Number(r?.size) > 1 ? Number(r.size) : 1;
  const w = Number(r?.sizeX) > 0 ? Number(r.sizeX) : s;
  const h = Number(r?.sizeY) > 0 ? Number(r.sizeY) : s;
  return { w, h };
};

/** Every tile of a footprint anchored at (x, y), as { x, y }. */
export const footprintCells = (x, y, w, h) => {
  const cells = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) cells.push({ x: x + dx, y: y - dy });
  return cells;
};

/** True when the resource's footprint covers the tile (col, row). */
export const coversTile = (r, col, row) => {
  if (!r) return false;
  const { w, h } = footprintOf(r);
  return col >= r.x && col < r.x + w && row <= r.y && row > r.y - h;
};

export const isMultiTile = (r) => { const { w, h } = footprintOf(r); return w * h > 1; };

/** The centre of the footprint in tile units (the anchor for a 1 x 1). */
export const footprintCenter = (r) => { const { w, h } = footprintOf(r); return { x: r.x + (w - 1) / 2, y: r.y - (h - 1) / 2 }; };
