/**
 * LoginScene: the living grid behind the Begin modal and the sign-in panel (docs/login-scene-plan.md).
 *
 * It fetches the fixed layout (GET /api/login-scene, layouts/gridLayouts/homestead/start-screen.json), draws it with
 * the game's own PixiRenderer in `scene` mode (look-only: no input, no player, camera pinned to the
 * grid's top-left corner), plays butterflies and clouds together (VFXMap.json gtype "loginScene"),
 * and runs sceneDriver.js for the animals and the Lumberjack. Plain grass (the wrapper's background)
 * shows until the first frame is ready, then the scene fades in. If anything fails it simply stays
 * on that grass. Begin and sign-in both reload the page, so the scene never shares the screen
 * with the game's own board.
 */
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import API_BASE from '../config';
import PixiRenderer from '../Render/PixiRenderer/PixiRenderer';
import PixiCamera from '../Render/PixiRenderer/PixiCamera';
import { loadAtlas, prepareAtlasForGrid, gridTypes, enterSceneAtlas } from '../Render/PixiRenderer/AtlasTextures';
import ambientVFXManager from '../VFX/AmbientVFXManager';
import { createSceneDriver } from './sceneDriver';
import { prefetchPanels } from '../UI/lazyPanels';
import './LoginScene.css';

const PHONE_MAX_WIDTH = 768;
const PHONE_ZOOM = 0.7;     // owner 2026-11-08: phones see ~12 x 22 tiles instead of ~9 x 15
const FADE_DELAY_MS = 250;  // let the first resource wave land before the fade starts

const zoomForViewport = () => (window.innerWidth < PHONE_MAX_WIDTH ? PHONE_ZOOM : 1);

// Start the scene's downloads as early as possible (owner 2026-11-16: the forest took seconds to
// appear): App calls this at the very start of its init for a visitor with no stored player, so
// the layout and the core sprite sheets load alongside the tuning instead of after it.
let layoutPromise = null;
export function prefetchLoginScene() {
  if (!layoutPromise) {
    layoutPromise = axios.get(`${API_BASE}/api/login-scene`).then(({ data }) => data);
    layoutPromise.catch(() => { layoutPromise = null; });
    enterSceneAtlas(); // the scene's own sheet (~400 KB), not the game's core sheets (build-atlas.js SCENE_LAYOUT)
    loadAtlas();
  }
  return layoutPromise;
}

export default function LoginScene({ masterResources, TILE_SIZE, strings }) {
  const [scene, setScene] = useState(null);   // { tiles, zones } once fetched
  const [world, setWorld] = useState(null);   // { resources, npcs } from the driver
  const [visible, setVisible] = useState(false);
  const driverRef = useRef(null);

  // 1. The layout
  useEffect(() => {
    let alive = true;
    // the still picture from index.html is covered by .keyart-wrapper's own copy from here on
    document.getElementById('scene-poster')?.remove();
    prefetchLoginScene()
      .then((data) => { if (alive && data?.tiles?.length) setScene(data); })
      .catch((err) => console.warn('Login scene unavailable, staying on grass:', err.message));
    return () => { alive = false; };
  }, []);

  // 2. The driver: animals and the Lumberjack (local only)
  useEffect(() => {
    if (!scene || !masterResources?.length) return undefined;
    const driver = createSceneDriver({
      tiles: scene.tiles,
      resources: scene.resources || [],
      npcs: scene.npcs || [],
      zones: scene.zones,
      masterResources,
      onChange: setWorld,
    });
    driverRef.current = driver;
    driver.start();
    return () => { driver.stop(); driverRef.current = null; };
  }, [scene, masterResources]);

  // 2b. The sheets this scene draws from, as soon as the layout and the tuning are known
  useEffect(() => {
    if (scene && masterResources?.length) prepareAtlasForGrid(gridTypes(scene.resources, scene.npcs), masterResources);
  }, [scene, masterResources]);

  // 3. Framing, ambient effects, and the fade-in once the renderer and the atlas are up
  const rendererMounted = !!(scene && world);
  useEffect(() => {
    if (!rendererMounted) return undefined;
    let alive = true;
    let fadeTimer = null;
    const frame = () => PixiCamera.setZoom(zoomForViewport());
    // the core sheets and the pages this scene draws from (AtlasTextures.js, BL-24), before the fade-in
    Promise.all([PixiCamera.whenReady(), loadAtlas(), prepareAtlasForGrid(gridTypes(scene?.resources, scene?.npcs), masterResources)]).then(() => {
      if (!alive) return;
      frame();
      ambientVFXManager.onGridEnter({ gtype: 'loginScene' }, 64, 64);
      fadeTimer = setTimeout(() => alive && setVisible(true), FADE_DELAY_MS);
      prefetchPanels(); // the scene is live: the game's panel code can load now without delaying it (UI/lazyPanels.js)
    });
    window.addEventListener('resize', frame);
    return () => {
      alive = false;
      clearTimeout(fadeTimer);
      window.removeEventListener('resize', frame);
    };
  }, [rendererMounted]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the scene first mounts

  if (!rendererMounted) return null;
  return (
    <div className={`login-scene${visible ? ' login-scene--visible' : ''}`} aria-hidden="true">
      <PixiRenderer
        scene
        grid={scene.tiles}
        tileTypes={scene.tiles}
        resources={world.resources}
        npcs={world.npcs}
        pcs={{}}
        currentPlayer={null}
        inventory={[]}
        backpack={[]}
        TILE_SIZE={TILE_SIZE}
        zoomScale={1}
        masterResources={masterResources}
        strings={strings}
        playersInGrid={{}}
        gridId="login-scene"
      />
    </div>
  );
}
