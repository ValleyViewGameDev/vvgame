/**
 * STEP STONES layer (tile type `k`, owner 2026-10-24): the stones of every step-stone path on the
 * grid, as sprites in a `step-stones` layer right above the ground tiles and under everything that
 * stands on them. A `k` cell's own texture is plain grass (PixiRendererTileTextures edgeType), so
 * the stones are free of the cell grid: stepStonesArt.layoutStepStones places them over the whole
 * path at once, biggest first, crossing from one path cell into the next and never onto the grass
 * beside the path, and the layout follows the tiles (same path, same stones).
 *
 * Cost: SHAPES stone textures drawn once (STONE_TEX_R px), reused at every size; one sprite per
 * stone, rebuilt only when the tile map changes. A grid with no step stones has an empty layer.
 */
import { useEffect, useRef } from 'react';
import { Container, Sprite, Texture } from 'pixi.js-legacy';
import { SHAPES, STONE_PAD, layoutStepStones, paintStone } from './stepStonesArt';

const STONE_TEX_R = 64; // drawn radius of the shared stone textures, px

let textures = null;
function stoneTextures() {
  if (textures && textures.every((t) => t.valid !== false && t.baseTexture?.valid !== false)) return textures;
  textures = [];
  const half = Math.ceil(STONE_TEX_R * STONE_PAD);
  for (let s = 0; s < SHAPES; s++) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = half * 2;
    paintStone(canvas.getContext('2d'), s, STONE_TEX_R);
    textures.push(Texture.from(canvas));
  }
  return textures;
}

const PixiRendererStepStones = ({ app, tileTypes, TILE_SIZE }) => {
  const layerRef = useRef(null);

  useEffect(() => {
    if (!app?.stage) return;
    const world = app.stage.children.find((c) => c.name === 'world');
    if (!world) return;
    let layer = world.children.find((c) => c.name === 'step-stones');
    if (!layer) {
      layer = new Container();
      layer.name = 'step-stones';
      const tilesIndex = world.children.findIndex((c) => c.name === 'tiles');
      world.addChildAt(layer, tilesIndex >= 0 ? tilesIndex + 1 : 0);
    }
    layerRef.current = layer;
  }, [app]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.removeChildren().forEach((c) => c.destroy());
    const stones = layoutStepStones(tileTypes);
    if (!stones.length) return;
    const tex = stoneTextures();
    for (const st of stones) {
      const sprite = new Sprite(tex[st.shape % tex.length]);
      sprite.anchor.set(0.5);
      sprite.x = st.x * TILE_SIZE;
      sprite.y = st.y * TILE_SIZE;
      sprite.scale.set((st.r * TILE_SIZE) / STONE_TEX_R);
      layer.addChild(sprite);
    }
  }, [app, tileTypes, TILE_SIZE]);

  return null;
};

export default PixiRendererStepStones;
