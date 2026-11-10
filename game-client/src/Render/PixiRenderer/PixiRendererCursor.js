// @refresh reset
// ^ Development only: remount on a hot reload instead of re-running effects on destroyed Pixi objects (see PixiRenderer.js).
import { useEffect, useRef, useState } from 'react';
import { Graphics, Container, Sprite, Texture } from 'pixi.js-legacy';
import { TILES_PER_GRID } from './UnifiedCamera';
import { footprintOf, footprintCells } from '../../Utils/footprint';
import { pickArtFile } from '../../Utils/artVariants';
import { emojiKey } from '../../Utils/emojiKey';
import { getAtlasTexture } from './AtlasTextures';
import { boardArtScale } from './boardArt';
import { indexWalls, wallMask, wallTexture, wallSpan } from './PixiRendererWalls';

/**
 * PixiRendererCursor: the placement preview (owner, 2026-11-08).
 *
 * While a panel has armed a placement (cursorMode: build, plant, move, terraform) and the mouse is
 * over the board, the tile under it shows:
 *   - the FOOTPRINT, white, or RED when the thing cannot go there (a cell off the grid, a cell
 *     taken by another resource or its shadow tiles, or, for a farm plot, ground it cannot be
 *     planted on), drawn under the objects layer;
 *   - the thing itself (for terraform, the ground's swatch, `cursorMode.src`), translucent, at exactly the size and place the board will draw it
 *     (the same art box as PixiRenderer's resource and NPC sprites: artSpan, artScale, the 0.9
 *     doober and plot scale, a wall joined to its neighbours), drawn ABOVE the objects layer so
 *     it is never hidden.
 * The mouse cursor stays the ordinary pointer (App.js no longer turns it into the item). Leaving
 * the board (onto a panel or any UI) clears hoveredTile, so the preview stops until the mouse is
 * back. Touch screens have no hover: a tap places as before.
 *
 * The blocked rule mirrors the client's own refusals (BuildAndBuy.js, Move/moveMode.js,
 * Farming.js) on the full footprint, like the server's /action/place; it only colours the preview,
 * the click still goes through the same checks.
 */

const PREVIEW_ALPHA = 0.7;
const OK = 0xffffff;
const BLOCKED = 0xe53935;

/** The resources.json row a cursor mode places, or null (terraform places ground, not a thing). */
function rowFor(cursorMode, masterResources) {
  if (!cursorMode || cursorMode.type === 'terraform') return null;
  const type = typeof cursorMode.item === 'string' ? cursorMode.item : cursorMode.item?.type;
  if (!type) return null;
  return (masterResources || []).find((r) => r.type === type) || (typeof cursorMode.item === 'object' ? cursorMode.item : null);
}

/** Whether `row` cannot be put down with its anchor at (col, rowY). */
function isBlocked(cursorMode, row, col, rowY, resources, tileTypes) {
  const { w, h } = footprintOf(row || cursorMode);
  const cells = footprintCells(col, rowY, w, h);
  if (cells.some((c) => c.x < 0 || c.y < 0 || c.x >= TILES_PER_GRID || c.y >= TILES_PER_GRID)) return true;
  if (row?.category === 'npc') return false; // an animal is spawned, not laid on tiles
  if (cursorMode.type === 'terraform') return false; // ground changes under whatever stands on it
  // a Move ignores the cells the picked-up thing already covers
  const own = new Set();
  if (cursorMode.type === 'move' && cursorMode.from) {
    for (const c of footprintCells(cursorMode.from.x, cursorMode.from.y, w, h)) own.add(`${c.x},${c.y}`);
  }
  const taken = new Set();
  for (const r of resources || []) {
    if (!r || !r.type) continue;
    const key = `${r.x},${r.y}`;
    if (!own.has(key)) taken.add(key);
  }
  if (cells.some((c) => taken.has(`${c.x},${c.y}`))) return true;
  if (cursorMode.type === 'plant' && row) {
    return cells.some((c) => row[`validon${tileTypes?.[c.y]?.[c.x]}`] !== true);
  }
  return false;
}

/**
 * Where and how big the board draws `row` anchored at (col, rowY), in px: { x, y, w, h }.
 * `span` is a wall's or artSpan's square size in tiles (undefined when the footprint is the box).
 */
function artBox(row, col, rowY, TILE_SIZE, span, emoji) {
  const { w: fw, h: fh } = footprintOf(row);
  if (row.category === 'npc') {
    const s = (emoji ? 0.8 : 1) * (Number(row.artScale) > 0 ? Number(row.artScale) : 1) * TILE_SIZE;
    return { x: (col + 0.5) * TILE_SIZE - s / 2, y: (rowY + 0.5) * TILE_SIZE - s / 2, w: s, h: s };
  }
  if (span && span !== fw && !emoji) {
    return { x: (col - (span - fw) / 2) * TILE_SIZE, y: (rowY - (span - 1)) * TILE_SIZE, w: span * TILE_SIZE, h: span * TILE_SIZE };
  }
  const x = col * TILE_SIZE;
  const y = (rowY - fh + 1) * TILE_SIZE;
  if (emoji) {
    const tileSpan = Math.max(fw, fh);
    const f = tileSpan > 1 ? TILE_SIZE * (tileSpan <= 2 ? 0.8 : tileSpan === 3 ? 1.0 : 1.2) * tileSpan
      : TILE_SIZE * (row.action === 'wall' ? 1.1 : 0.7);
    return { x: x + (fw * TILE_SIZE - f) / 2, y: y + (fh * TILE_SIZE - f) / 2, w: f, h: f };
  }
  const s = fw === 1 && fh === 1 ? boardArtScale(row) : 1;
  if (s !== 1) return { x: x + (TILE_SIZE * (1 - s)) / 2, y: y + (TILE_SIZE * (1 - s)) / 2, w: TILE_SIZE * s, h: TILE_SIZE * s };
  return { x, y, w: fw * TILE_SIZE, h: fh * TILE_SIZE };
}

const PixiRendererCursor = ({
  app,              // PixiJS Application instance
  hoveredTile,      // { row, col } or null: the tile under the mouse (null off the board)
  cursorMode,       // { type, item, size, ... } or null: the armed placement
  TILE_SIZE,
  gridOffset = { x: 0, y: 0 },  // the current grid's position in the world (settlement zoom)
  masterResources,
  resources,        // the grid's resources (with shadow tiles), for the blocked check
  tileTypes,        // [row][col] ground letters, for a farm plot's validon check
}) => {
  const highlightRef = useRef(null);
  const previewRef = useRef(null);
  const [textureTick, setTextureTick] = useState(0);
  const textureRef = useRef({ key: null, texture: null, emoji: false });

  // the two layers: the footprint under the objects, the thing itself above them
  useEffect(() => {
    if (!app?.stage) return undefined;
    const world = app.stage.children.find((c) => c.name === 'world');
    if (!world) return undefined;
    let under = world.children.find((c) => c.name === 'cursor-highlight');
    if (!under) {
      under = new Container();
      under.name = 'cursor-highlight';
      const objectsIndex = world.children.findIndex((c) => c.name === 'objects');
      world.addChildAt(under, objectsIndex >= 0 ? objectsIndex : Math.min(1, world.children.length));
    }
    let over = world.children.find((c) => c.name === 'placement-preview');
    if (!over) {
      over = new Container();
      over.name = 'placement-preview';
      const objectsIndex = world.children.findIndex((c) => c.name === 'objects');
      world.addChildAt(over, objectsIndex >= 0 ? objectsIndex + 1 : world.children.length);
    }
    if (!highlightRef.current) { highlightRef.current = new Graphics(); under.addChild(highlightRef.current); }
    if (!previewRef.current) {
      previewRef.current = new Sprite();
      previewRef.current.alpha = PREVIEW_ALPHA;
      previewRef.current.visible = false;
      over.addChild(previewRef.current);
    }
    return () => {
      // take our two display objects off the stage: a remount (hot reload, a scene toggle) would
      // otherwise leave the old preview frozen on the board beside the new one
      for (const ref of [highlightRef, previewRef]) {
        const obj = ref.current;
        if (obj && !obj.destroyed) { obj.parent?.removeChild(obj); obj.destroy(); }
        ref.current = null;
      }
    };
  }, [app]);

  const row = rowFor(cursorMode, masterResources);
  const anchorCol = hoveredTile?.col;
  const anchorRow = hoveredTile?.row;
  // the art file at this cell (artVariants pick per cell, like the board)
  const filename = row && hoveredTile ? pickArtFile(row, anchorCol, anchorRow) : null;
  const wallSet = row?.wallSet || null;

  // load the thing's texture (the atlas resolves at once once loaded); an emoji row falls back;
  // terraform previews the ground's swatch (UI/Icons/TileSwatch.js, the picture its button shows)
  const swatch = cursorMode?.type === 'terraform' ? cursorMode.src || null : null;
  useEffect(() => {
    const key = row ? `${row.type}|${filename || ''}` : swatch ? `swatch|${swatch}` : null;
    if (textureRef.current.key === key) return undefined;
    textureRef.current = { key, texture: null, emoji: false };
    if (swatch && !row) {
      const texture = Texture.from(swatch);
      textureRef.current = { key, texture, emoji: false };
      if (!texture.baseTexture.valid) texture.baseTexture.once('loaded', () => setTextureTick((t) => t + 1));
      setTextureTick((t) => t + 1);
      return undefined;
    }
    if (!row) return undefined;
    let live = true;
    (async () => {
      let texture = filename ? await getAtlasTexture('resources', filename) : null;
      let emoji = false;
      if (!texture && row.symbol) {
        const k = emojiKey(row.symbol);
        texture = k ? await getAtlasTexture('emoji', k) : null;
        emoji = !!texture;
      }
      if (!live || textureRef.current.key !== key) return;
      textureRef.current = { key, texture, emoji };
      setTextureTick((t) => t + 1);
    })();
    return () => { live = false; };
  }, [row, filename, swatch]);

  useEffect(() => {
    const g = highlightRef.current;
    const sprite = previewRef.current;
    if (!g || !sprite) return;
    g.clear();
    const on = hoveredTile && cursorMode
      && anchorRow >= 0 && anchorRow < TILES_PER_GRID && anchorCol >= 0 && anchorCol < TILES_PER_GRID;
    if (!on) { g.visible = false; sprite.visible = false; return; }

    const blocked = isBlocked(cursorMode, row, anchorCol, anchorRow, resources, tileTypes);
    const colour = blocked ? BLOCKED : OK;
    const { w: fw, h: fh } = footprintOf(row || cursorMode);
    g.visible = true;
    for (const c of footprintCells(anchorCol, anchorRow, fw, fh)) {
      if (c.x < 0 || c.x >= TILES_PER_GRID || c.y < 0 || c.y >= TILES_PER_GRID) continue;
      const x = gridOffset.x + c.x * TILE_SIZE;
      const y = gridOffset.y + c.y * TILE_SIZE;
      g.beginFill(colour, blocked ? 0.35 : 0.25);
      g.drawRect(x, y, TILE_SIZE, TILE_SIZE);
      g.endFill();
      g.lineStyle(2, colour, 0.85);
      g.drawRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      g.lineStyle(1, colour, 0.4);
      g.drawRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      g.lineStyle(0);
    }

    // the thing itself, at its board size
    let { texture, emoji } = textureRef.current;
    let span = Number(row?.artSpan) > 0 ? Number(row.artSpan) : undefined;
    if (row && wallSet && fw === 1 && fh === 1) {
      // a wall joins the walls already beside the spot, as it will once placed
      const index = indexWalls(resources, masterResources);
      const composed = wallTexture(wallSet, wallMask(index, wallSet, anchorCol, anchorRow));
      if (composed) { texture = composed; emoji = false; span = wallSpan(wallSet); }
    }
    if (!texture || texture.valid === false || (!row && !swatch)) { sprite.visible = false; return; }
    const box = row ? artBox(row, anchorCol, anchorRow, TILE_SIZE, span, emoji)
      : { x: anchorCol * TILE_SIZE, y: anchorRow * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }; // a ground swatch fills its tile
    sprite.texture = texture;
    sprite.x = gridOffset.x + box.x;
    sprite.y = gridOffset.y + box.y;
    sprite.width = box.w;
    sprite.height = box.h;
    sprite.tint = blocked ? 0xff9a9a : 0xffffff;
    sprite.visible = true;
  }, [hoveredTile, cursorMode, row, anchorCol, anchorRow, wallSet, TILE_SIZE, gridOffset, resources, tileTypes, masterResources, swatch, textureTick]);

  return null;
};

export default PixiRendererCursor;
