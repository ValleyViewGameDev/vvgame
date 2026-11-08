/**
 * A resource's footprint (BL-21, 2026-11-08), the server twin of game-client/src/Utils/footprint.js:
 * `size` is the square default, `sizeX` / `sizeY` (tiles) make it a rectangle; anchored at the
 * lower-left tile (x, y), covering x .. x+w-1, y-h+1 .. y.
 */
function footprintOf(r) {
  const s = Number(r?.size) > 1 ? Number(r.size) : 1;
  const w = Number(r?.sizeX) > 0 ? Number(r.sizeX) : s;
  const h = Number(r?.sizeY) > 0 ? Number(r.sizeY) : s;
  return { w, h };
}
/** The footprint's tiles as "x,y" keys (the occupancy sets the routes build). */
function footprintKeys(x, y, w, h) {
  const out = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) out.push(`${x + dx},${y - dy}`);
  return out;
}
/** The footprint of a placed record, taking the shape from the record, else the master row. */
function recordFootprint(r, def) {
  const shaped = (r && (r.sizeX || r.sizeY || r.size)) ? r : def;
  return footprintOf(shaped || r);
}
function coversTile(r, def, col, row) {
  const { w, h } = recordFootprint(r, def);
  return col >= r.x && col < r.x + w && row <= r.y && row > r.y - h;
}
module.exports = { footprintOf, footprintKeys, recordFootprint, coversTile };
