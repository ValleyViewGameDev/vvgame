// gridThumbnails.js
// Frontier-view thumbnails: a grid's 64x64 tiles shrunk to THUMB_SIZE x THUMB_SIZE (the most common
// tile type in each block), packed 4 bits per tile like TileEncoder (high nibble first) and Base64'd.
// A 16x16 thumbnail is 128 bytes, so a fully visited frontier (4,096 grids) is ~700 KB before gzip.

const Grid = require('../models/grid');
const { isGridVisited } = require('./gridsVisitedUtils');

const GRID_SIZE = 64;
const THUMB_SIZE = 16;
const BLOCK = GRID_SIZE / THUMB_SIZE;
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map(); // String(gridId) -> { thumb, at }

/** 64x64 packed Base64 tiles -> THUMB_SIZE x THUMB_SIZE packed Base64 thumbnail. */
function downsampleTiles(encodedTiles) {
  if (typeof encodedTiles !== 'string') return null;
  const src = Buffer.from(encodedTiles, 'base64');
  if (src.length < (GRID_SIZE * GRID_SIZE) / 2) return null;
  const tileAt = (i) => (i & 1 ? src[i >> 1] & 0x0f : src[i >> 1] >> 4);
  const out = Buffer.alloc((THUMB_SIZE * THUMB_SIZE) / 2);
  const counts = new Uint8Array(16);
  for (let by = 0; by < THUMB_SIZE; by++) {
    for (let bx = 0; bx < THUMB_SIZE; bx++) {
      counts.fill(0);
      for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
        for (let x = bx * BLOCK; x < (bx + 1) * BLOCK; x++) counts[tileAt(y * GRID_SIZE + x)]++;
      }
      let best = 0;
      for (let t = 1; t < 16; t++) if (counts[t] > counts[best]) best = t;
      const i = by * THUMB_SIZE + bx;
      out[i >> 1] |= i & 1 ? best : best << 4;
    }
  }
  return out.toString('base64');
}

function cached(gridId) {
  const hit = cache.get(String(gridId));
  return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.thumb : undefined;
}

/**
 * Thumbnails for every visited town/valley cell in the given settlements, as { [gridCoord]: thumb }.
 * Source per cell, like /api/grids-tiles: the viewer's own copy, else the template instance the copy
 * would be created from (Settlement.grids[].gridId). Homestead cells keep their icon, so are skipped.
 */
async function buildFrontierThumbnails(player, settlements) {
  const cells = [];
  for (const s of settlements) {
    for (const cell of (s.grids || []).flat()) {
      if (!cell || cell.gridCoord == null || cell.gridType === 'homestead') continue;
      if (!isGridVisited(player.gridsVisited, cell.gridCoord)) continue;
      cells.push(cell);
    }
  }
  if (!cells.length) return {};

  const coords = cells.map((c) => Number(c.gridCoord));
  const copies = await Grid.find({ ownerId: player._id, gridCoord: { $in: coords } }).select('_id gridCoord').lean();
  const sourceByCoord = new Map(copies.map((g) => [Number(g.gridCoord), String(g._id)]));
  for (const c of cells) {
    const coord = Number(c.gridCoord);
    if (!sourceByCoord.has(coord) && c.gridId) sourceByCoord.set(coord, String(c.gridId));
  }

  const misses = [...new Set([...sourceByCoord.values()].filter((id) => cached(id) === undefined))];
  if (misses.length) {
    const grids = await Grid.find({ _id: { $in: misses } }).select('tiles').lean();
    const now = Date.now();
    for (const g of grids) cache.set(String(g._id), { thumb: downsampleTiles(g.tiles), at: now });
  }

  const thumbs = {};
  for (const [coord, id] of sourceByCoord) {
    const thumb = cached(id);
    if (thumb) thumbs[coord] = thumb;
  }
  return thumbs;
}

module.exports = { buildFrontierThumbnails, downsampleTiles, THUMB_SIZE };
