/**
 * viewCulling - skip drawing ground tiles and resources that are well outside the view
 * (2026-11-13: a valley holds 4,096 tiles and 2,000-2,800 resources, and Pixi 7 draws every one of
 * them every frame unless told not to; the view shows a few hundred).
 *
 * Right before each frame is drawn (the renderer's `prerender`, so a camera that jumped this frame
 * is already in place) it works out the visible rectangle in tiles from the world container's transform (the
 * camera's pan and zoom, PixiCamera.js) and, only when that rectangle changes, sets `renderable` on
 * every pooled tile sprite and every resource sprite. `renderable`, not `visible`: other code hides
 * and fades resource sprites with `visible` / `alpha` (Move's ghost, StoryFX, harvest), and nothing
 * else touches `renderable`, so the two never fight. Hit tests that read the sprites
 * (artHitTest.js) are unaffected, and anything off screen cannot be tapped anyway.
 *
 * A resource is placed by its tile (`obj.__res`, set by PixiRenderer's addResource), not by its
 * sprite's x/y: a wall or a composed object can be a container whose own position says nothing.
 * MARGIN covers art that stands taller or wider than its tile (a Pine's artSpan is ~3, buildings
 * up to 4 or 5) and a step or two of walking before the next check.
 *
 * Actors (NPCs, the player) are never culled: there are few of them and they move.
 *
 * Returns { detach, invalidate }: call invalidate() after re-placing the tile sprites (the pool is
 * one array reused across grids, so its identity says nothing).
 */
import { footprintOf } from '../../Utils/footprint';

const TILE_MARGIN = 2;      // ground tiles: a plain square each
const RESOURCE_MARGIN = 6;  // resources: tall and wide art reaches well past its anchor tile

export function attachViewCulling({ app, worldContainer, tileSize, getTileSprites, getResourceSprites }) {
  let last = '';
  let lastTiles = null;
  let lastResources = null;
  let lastResourceCount = -1;

  const tick = () => {
    if (!worldContainer || worldContainer.destroyed) return;
    const scale = worldContainer.scale.x || 1;
    const size = tileSize * scale;
    const left = Math.floor(-worldContainer.x / size);
    const top = Math.floor(-worldContainer.y / size);
    const right = Math.ceil((app.screen.width - worldContainer.x) / size);
    const bottom = Math.ceil((app.screen.height - worldContainer.y) / size);

    const tiles = getTileSprites() || [];
    const resources = getResourceSprites() || [];
    const key = `${left},${top},${right},${bottom}`;
    // the same view over the same sprites: nothing to do (the usual frame)
    if (key === last && tiles === lastTiles && resources === lastResources && resources.length === lastResourceCount) return;
    last = key; lastTiles = tiles; lastResources = resources; lastResourceCount = resources.length;

    for (const sprite of tiles) {
      if (!sprite || sprite.destroyed) continue;
      const col = Math.round(sprite.x / tileSize);
      const row = Math.round(sprite.y / tileSize);
      sprite.renderable = col >= left - TILE_MARGIN && col <= right + TILE_MARGIN && row >= top - TILE_MARGIN && row <= bottom + TILE_MARGIN;
    }
    for (const obj of resources) {
      if (!obj || obj.destroyed) continue;
      const res = obj.__res;
      if (!res || !Number.isFinite(res.x) || !Number.isFinite(res.y)) { obj.renderable = true; continue; }
      const { w, h } = footprintOf(res);
      // the footprint runs x .. x+w-1 and y-h+1 .. y (anchored at its lower-left tile)
      obj.renderable = res.x + w - 1 >= left - RESOURCE_MARGIN && res.x <= right + RESOURCE_MARGIN
        && res.y >= top - RESOURCE_MARGIN && res.y - h + 1 <= bottom + RESOURCE_MARGIN;
    }
  };

  app.renderer.on('prerender', tick);
  return {
    detach: () => { try { app.renderer?.off('prerender', tick); } catch (e) { /* the renderer may be destroyed */ } },
    invalidate: () => { last = ''; },
  };
}
