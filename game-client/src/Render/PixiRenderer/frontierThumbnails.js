/**
 * frontierThumbnails - tile thumbnails for visited grids at Frontier zoom, in every settlement
 * (the current settlement is drawn by PixiRendererSettlementGrids from full tiles instead).
 *
 * GET /api/frontier-thumbnails/:frontierId (game-server/utils/gridThumbnails.js) returns one
 * size x size thumbnail per visited town/valley grid, 4 bits per tile, keyed by gridCoord. Each
 * settlement becomes ONE small canvas image (8 grids x size px a side) painted behind its 8x8
 * mini-grid, so a fully visited frontier is ~63 images, not 4,096 DOM cells.
 */

import { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import { getTileColor, BITS_TO_TILE_TYPE } from '../../UI/Styles/tileColors';

// Last response per frontier, so re-entering Frontier zoom shows the thumbnails at once
const responseCache = new Map(); // frontierId -> { size, bySSGG: Map<SSGG, thumb> }
const imageCache = new Map();    // settlement key -> { url, cells: Set<'row-col'> }

const toBySSGG = (thumbs) => new Map(Object.entries(thumbs || {}).map(([coord, t]) => [Number(coord) % 10000, t]));

/** Fetch (and refetch when the visited bits change) the frontier's thumbnails while Frontier zoom is active. */
export function useFrontierThumbnails(isActive, currentPlayer) {
  const frontierId = currentPlayer?.location?.f;
  const playerId = currentPlayer?.playerId;
  const gridsVisited = currentPlayer?.gridsVisited;
  const [data, setData] = useState(() => (frontierId ? responseCache.get(frontierId) || null : null));

  useEffect(() => {
    if (!isActive || !frontierId || !playerId) return undefined;
    if (responseCache.has(frontierId)) setData(responseCache.get(frontierId));
    let cancelled = false;
    axios.get(`${API_BASE}/api/frontier-thumbnails/${frontierId}`, { params: { playerId } })
      .then(({ data: res }) => {
        if (cancelled || !res?.success) return;
        const next = { size: res.size, bySSGG: toBySSGG(res.thumbs) };
        responseCache.set(frontierId, next);
        setData(next);
      })
      .catch((err) => console.error('[FrontierThumbnails] fetch failed:', err));
    return () => { cancelled = true; };
  }, [isActive, frontierId, playerId, gridsVisited]);

  return data;
}

const rgbaCache = new Map();
function tileRGBA(bits) {
  if (rgbaCache.has(bits)) return rgbaCache.get(bits);
  const hex = (getTileColor(BITS_TO_TILE_TYPE[bits] || 'g') || '#82bb4d').replace('#', '');
  const rgba = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);
  rgbaCache.set(bits, rgba);
  return rgba;
}

/**
 * One image for a settlement's visited grids, plus which of its cells ('row-col') it covers.
 * Returns null when the settlement has no thumbnails.
 */
export function settlementThumbnailImage(data, settlementRow, settlementCol) {
  if (!data?.bySSGG?.size) return null;
  const { size, bySSGG } = data;
  const parts = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const t = bySSGG.get(settlementRow * 1000 + settlementCol * 100 + row * 10 + col);
      if (t) parts.push(`${row}${col}${t}`);
    }
  }
  if (!parts.length) return null;
  const key = `${settlementRow}-${settlementCol}:${parts.join('|')}`;
  if (imageCache.has(key)) return imageCache.get(key);

  const side = 8 * size;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(side, side);
  const cells = new Set();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const t = bySSGG.get(settlementRow * 1000 + settlementCol * 100 + row * 10 + col);
      if (!t) continue;
      cells.add(`${row}-${col}`);
      const bytes = atob(t);
      for (let i = 0; i < size * size; i++) {
        const byte = bytes.charCodeAt(i >> 1);
        const [r, g, b, a] = tileRGBA(i & 1 ? byte & 0x0f : byte >> 4);
        const x = col * size + (i % size);
        const y = row * size + Math.floor(i / size);
        const o = (y * side + x) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const result = { url: canvas.toDataURL(), cells };
  imageCache.set(key, result);
  return result;
}
