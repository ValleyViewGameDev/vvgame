// @refresh reset
// ^ Development only: remount on a hot reload instead of re-running effects on destroyed Pixi objects (see PixiRenderer.js).
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Container, Text, Sprite, Texture, Rectangle } from 'pixi.js-legacy';
import { renderPositions, getPlayerFacing, onPlayerFacingChange, isPlayerWalkingSideways } from '../../PlayerMovement';
import playersInGridManager from '../../GridState/PlayersInGrid';
import PixiCamera from './PixiCamera';
import playerIconsData from '../../Authentication/PlayerIcons.json';
import { getAtlasTexture } from './AtlasTextures';
import { emojiKey } from '../../Utils/emojiKey';
import CombatFX from './CombatFX';
import { actorZ } from './depthSort';
import { opaqueTopFraction } from './artHitTest';
import { breathLevel, breathSeed, breathingAllowed, isBlinking } from './breathing';
import BreathSprite from './BreathSprite';
import { cutRig, syncArmRig } from './ArmRig';
import { avatarRig, armFigure, weaponSrc } from './heldWeapon';
import { loadAvatarCatalogue } from '../../Utils/TuningManager';
import { lookFor, byId, specFor } from '../../Avatar/avatarLook';
import { renderLook } from '../../Avatar/avatarCompositor';

// The saved parts avatar on the board (docs/avatar-plan.md v2 P5): composed at 512 px (the figure
// square every part is drawn in), drawn 1.8 tiles tall like the figure icons, its head ending where
// its body's does (tools/art/parts.js eyes on the two faces)
const AVATAR_PX = 512;
const AVATAR_SPAN = 1.8;
// the boat the player turns into afloat: 1.8x the 0.9-tile state art, centred on the tile (owner 2026-11-12)
const BOAT_SPAN = 1.62;
// the tent the player turns into while camping (owner 2026-11-12): fills the tile and spills a little
// over it, standing on the tile's bottom edge so the spill goes up (item-tent art fills its square)
const TENT_SPAN = 1.4;
// Afloat, the saved avatar sits IN the boat (owner 2026-11-12): the avatar cut off at its waist,
// drawn at its usual size over the boat with the waist on the boat's near rim, so the rim reads
// as the boat's front edge. Both are fractions of their picture's square, measured on the art
// (item-boat.png: the near gunwale's top edge; new boat art = re-measure BOAT_RIM).
const BOAT_RIM = 0.445;
// One waist line for every avatar, whatever the clothes or body (owner 2026-11-12: reading it off
// each drawing cut different outfits at different heights): this fraction of the avatar's square.
const RIDER_WAIST = 0.56;
const AVATAR_BREATH_TOP = { female: 0.345, male: 0.294 };

// Normalize emoji by removing variation selectors (U+FE0F) for consistent matching
const normalizeEmoji = (emoji) => {
  if (!emoji) return emoji;
  return emoji.replace(/\uFE0F/g, '');
};

// Build a static lookup map from emoji value to SVG filename (created once at module load)
const iconToSvgMap = new Map();
// A full-body figure icon (docs/avatar-plan.md v2, the Phase 1 figures used wholesale) carries
// `artSpan` 1.5: its square is drawn that many tiles wide and tall, standing on the tile's
// bottom edge, like artSpan art on the world layer; the busts and emoji keep the 0.9 square
const iconToBreathTop = new Map(); // where a figure icon's head ends (PlayerIcons.json breathTop): the breath leaves it rigid
const iconToBlinkMap = new Map(); // a figure icon's blink frame (PlayerIcons.json blinkFilename: the same art, eyes closed)
const iconToSpanMap = new Map();
/** The art span of a player icon (0 for a bust or emoji). */
export const playerIconSpan = (icon) => iconToSpanMap.get(normalizeEmoji(icon)) || 0;
// Where the drawn player's head ends, in tiles below its tile's top edge (negative: above it),
// measured from the art the board shows NOW (the saved avatar, a figure icon, a state picture),
// as npcHeadTops.js measures an NPC's: the speech bubble's tail stops just above it (owner
// 2026-11-10: the bubble used the icon's span, 0 for the avatar, and sat on its chest)
let liveHeadTop = null;
/** The local player's measured head top (tiles below the tile's top edge), or null before the first draw. */
export const getPlayerHeadTop = () => liveHeadTop;
['free', 'paid', 'platinum'].forEach(tier => {
  (playerIconsData[tier] || []).forEach(icon => {
    if (icon.filename) {
      iconToSvgMap.set(normalizeEmoji(icon.value), icon.filename);
      if (Number(icon.artSpan) > 0) iconToSpanMap.set(normalizeEmoji(icon.value), Number(icon.artSpan));
      if (icon.blinkFilename) iconToBlinkMap.set(normalizeEmoji(icon.value), icon.blinkFilename);
      if (Number(icon.breathTop) > 0) iconToBreathTop.set(normalizeEmoji(icon.value), Number(icon.breathTop));
    }
  });
});

/**
 * PixiRendererPCs - Player Character rendering for PixiJS renderer
 *
 * Single-player: renders ONLY the local player's PC. Other players are never
 * drawn (the game is single-player with asynchronous multiplayer; see
 * docs/refactor-plan.md Phase 1).
 *
 * Handles rendering of:
 * - The local PC icon (emoji-based, with state modifications)
 * - State-based icon changes (dead, low health, camping, in boat)
 *
 * IMPORTANT: This component reuses one pooled Text and one pooled Sprite to
 * prevent IOSurface/GPU memory exhaustion. Never create Graphics/Text objects
 * in render loops without proper reuse.
 */
// Retiring a composed avatar pair: the sprite on the board still holds it (and the breath ticker
// swaps between its two frames every tick) until the next render pass, so the sprite is handed
// the pair that replaces it, or nothing, BEFORE the old textures are destroyed. Destroying first
// threw in the ticker and in BreathSprite on every save in the editor (2026-11-10).
function retireAvatarTex(old, sprite, next) {
  if (sprite && !sprite.destroyed && (sprite.__openTex === old.open || sprite.texture === old.open || sprite.texture === old.blink)) {
    sprite.__openTex = next ? next.open : null;
    sprite.__blinkTex = next ? next.blink : null;
    sprite.texture = next ? next.open : Texture.EMPTY; // nothing to draw for a frame: the render pass that follows puts the icon back
  }
  old.open.destroy(true); if (old.blink) old.blink.destroy(true);
}

const PixiRendererPCs = ({
  app,                    // PixiJS Application instance
  pcs,                    // Array of PC objects (single-player: at most the local PC)
  currentPlayer,          // Current player (for ID matching)
  TILE_SIZE,              // Tile size in pixels
  gridOffset = { x: 0, y: 0 },  // Offset for settlement zoom (current grid position in world)
  hidden = false,         // the Settlement and Frontier views draw no player (owner 2026-11-10)
  heldWeapon = null,      // the weapon in the avatar's hand (heldWeapon.heldFor of the equipped row), or null when none is out (PixiRenderer)
}) => {
  const pcContainerRef = useRef(null);

  // Pooled display objects (one of each; only the local PC is ever drawn)
  const textRef = useRef(null);             // Text object for PC icon (emoji fallback)
  const spriteRef = useRef(null);           // Sprite object for SVG icon
  const riderRef = useRef(null);            // afloat: the avatar's upper half sitting in the boat
  const riderTexRef = useRef(null);         // { src, waist, tex }: the waist-cropped avatar texture
  // the rider's cut shares the avatar's base texture: let go of it before that avatar is destroyed
  const releaseRider = (old) => {
    const cut = riderTexRef.current;
    if (!cut || cut.src !== old?.open) return;
    if (riderRef.current && !riderRef.current.destroyed) riderRef.current.texture = Texture.EMPTY;
    try { cut.tex.destroy(false); } catch (e) { /* already gone */ }
    riderTexRef.current = null;
  };

  // Per-instance SVG texture cache (destroyed on unmount). Atlas frames are kept apart
  // in atlasTextureCacheRef because they belong to the shared sheets and must not be destroyed here.
  const svgTextureCacheRef = useRef(new Map());
  const atlasTextureCacheRef = useRef(new Map());
  const svgLoadingPromisesRef = useRef(new Map());
  const isMountedRef = useRef(true);
  const blinkRequestedRef = useRef(new Set()); // blink frames already asked for

  // The player's avatar (player.avatar, written by the avatar editor): composed from the
  // catalogue's parts into two textures, eyes open and the blink frame, and drawn INSTEAD of the
  // icon. A player who has not made one (or whose saved one names a face the catalogue no longer
  // has) is drawn in the DEFAULT look (avatarLook.specFor), so the old icon only stands in while
  // the catalogue loads or if it cannot be read. The textures are rebuilt only when the look changes.
  const avatarTexRef = useRef(null); // { key, open, blink, body, outfit } | null
  const disarmTimerRef = useRef(null); // the re-render that takes the arm rig off once the weapon is put away
  const renderPCsRef = useRef(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const avatarKey = currentPlayer?.avatar && currentPlayer.avatar.skin ? JSON.stringify(currentPlayer.avatar) : '';
  useEffect(() => {
    let live = true;
    const drop = () => {
      const old = avatarTexRef.current;
      if (!old) return;
      avatarTexRef.current = null;
      releaseRider(old); retireAvatarTex(old, spriteRef.current, avatarTexRef.current);
      setAvatarVersion((v) => v + 1);
    };
    (async () => {
      const data = await loadAvatarCatalogue();
      if (!live) return;
      const spec = specFor(avatarKey ? JSON.parse(avatarKey) : null, data); // the saved look, or the default one
      const face = byId(data.catalogue, spec.skin);
      if (!face || !face.file) { drop(); return; } // no catalogue to draw from: the icon stands in
      const look = lookFor(spec, data, {});
      if (avatarTexRef.current?.key === look.key) return;
      try {
        const open = await renderLook(look.layers, { size: AVATAR_PX });
        const shut = look.blinkLayers ? await renderLook(look.blinkLayers, { size: AVATAR_PX }) : null;
        if (!live) return;
        const old = avatarTexRef.current;
        avatarTexRef.current = { key: look.key, open: Texture.from(open), blink: shut ? Texture.from(shut) : null, body: face.body || 'female', outfit: spec.top || null };
        if (old) { releaseRider(old); retireAvatarTex(old, spriteRef.current, avatarTexRef.current); }
        setAvatarVersion((v) => v + 1);
      } catch (e) { console.warn('avatar: could not compose the saved look', e); }
    })();
    return () => { live = false; };
  }, [avatarKey]);
  useEffect(() => () => { // unmount: the composed textures go with the renderer
    const old = avatarTexRef.current;
    if (old) { avatarTexRef.current = null; releaseRider(old); retireAvatarTex(old, spriteRef.current, null); }
  }, []);

  // Ref to track if animation ticker is running (on-demand pattern)
  const animationTickerRef = useRef(null);
  // Counter for consecutive frames with no animations (for ticker removal)
  const noAnimationFramesRef = useRef(0);

  /**
   * Get the display icon for a PC based on state
   * Priority: Dead > Low Health > Camping > In Boat > Normal
   */
  const getDisplayIcon = useCallback((pc) => {
    if (pc.hp === 0) return '💀';
    if (pc.hp < 100) return '🤢';
    if (pc.iscamping) return '🏕️';
    if (pc.isinboat) return '🛶';
    return pc.icon || '🧑';
  }, []);

  /**
   * The painted art a state wears instead of an emoji: camping is the Tent, afloat is the Boat
   * (resources.json item-tent / item-boat, the same pictures as the pickups; emoji audit pass 1).
   * A `resources:` name loads from the world atlas / public/assets/resources; the emoji above
   * stays the text fallback while it loads.
   */
  const getStateArt = useCallback((pc) => {
    if (pc.hp === 0 || pc.hp < 100) return null;
    if (pc.iscamping) return 'resources:item-tent.svg';
    if (pc.isinboat) return 'resources:item-boat.svg';
    return null;
  }, []);

  /**
   * Get SVG filename for an emoji icon (if available)
   */
  const getSvgFilename = useCallback((emoji) => {
    if (!emoji) return null;
    return iconToSvgMap.get(normalizeEmoji(emoji));
  }, []);

  /**
   * Cache key + loader for icons that have no SVG of their own (💀 🤢 🏕️ 🛶, or an emoji
   * icon the art set lacks): the atlas's Twemoji frame, keyed `emoji:<codepoints>`.
   */
  const getEmojiCacheKey = useCallback((emoji) => {
    const key = emojiKey(emoji);
    return key ? `emoji:${key}` : null;
  }, []);

  /**
   * Load an SVG texture (async, cached)
   * Fetches SVG, modifies dimensions, then rasterizes at target resolution for crisp display
   */
  const loadSvgTexture = useCallback(async (filename) => {
    const svgTextureCache = svgTextureCacheRef.current;
    const svgLoadingPromises = svgLoadingPromisesRef.current;
    const atlasTextureCache = atlasTextureCacheRef.current;
    if (atlasTextureCache.has(filename)) {
      return atlasTextureCache.get(filename);
    }
    if (svgTextureCache.has(filename)) {
      return svgTextureCache.get(filename);
    }
    if (svgLoadingPromises.has(filename)) {
      return svgLoadingPromises.get(filename);
    }

    const promise = (async () => {
      try {
        // Atlas first (scripts/build-atlas.js); the SVG rasterisation below is the fallback.
        // `emoji:<key>` names are Twemoji frames and have no SVG to fall back to.
        const isEmojiKey = filename.startsWith('emoji:');
        const isResourceArt = filename.startsWith('resources:'); // a state's painted art (getStateArt)
        const resourceFile = isResourceArt ? filename.slice('resources:'.length) : null;
        const atlasTexture = isEmojiKey
          ? await getAtlasTexture('emoji', filename.slice('emoji:'.length))
          : await getAtlasTexture(isResourceArt ? 'resources' : 'playerIcons', resourceFile || filename);
        if (atlasTexture) {
          if (isMountedRef.current) atlasTextureCache.set(filename, atlasTexture);
          return atlasTexture;
        }
        if (isEmojiKey) return null;

        // Fetch SVG text so we can modify its dimensions
        const response = await fetch(isResourceArt ? `/assets/resources/${resourceFile}` : `/assets/playerIcons/${filename}`);
        if (!response.ok) {
          console.warn(`Failed to load player icon SVG: ${filename}`);
          return null;
        }
        let svgText = await response.text();

        // Render at high resolution for crisp display when zoomed
        const renderSize = 512;

        // Modify SVG dimensions so browser rasterizes at target resolution
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const svgElement = svgDoc.documentElement;
        if (svgElement && svgElement.tagName === 'svg') {
          svgElement.setAttribute('width', renderSize);
          svgElement.setAttribute('height', renderSize);
          svgText = new XMLSerializer().serializeToString(svgDoc);
        }

        // Convert modified SVG to blob URL
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        // Load into Image and render to canvas
        const texture = await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = renderSize;
            canvas.height = renderSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, renderSize, renderSize);
            URL.revokeObjectURL(url);

            const tex = Texture.from(canvas);
            resolve(tex);
          };
          img.onerror = () => {
            console.warn(`Failed to load player icon SVG image: ${filename}`);
            URL.revokeObjectURL(url);
            resolve(null);
          };
          img.src = url;
        });

        if (!texture) return null;
        if (!isMountedRef.current) {
          // Component went away while the SVG was rasterizing; don't leak the texture
          texture.destroy(true);
          return null;
        }
        svgTextureCache.set(filename, texture);
        return texture;
      } catch (error) {
        console.error(`Error loading player icon SVG ${filename}:`, error);
        return null;
      } finally {
        svgLoadingPromises.delete(filename);
      }
    })();

    svgLoadingPromises.set(filename, promise);
    return promise;
  }, []);

  /**
   * Get (or lazily create) the single pooled Text object
   */
  const getText = useCallback(() => {
    if (textRef.current) {
      textRef.current.visible = true;
      return textRef.current;
    }
    const newText = new Text('', {
      fontSize: 32, // Will be updated per render
      fontFamily: 'sans-serif',
    });
    newText.resolution = 2;
    newText.anchor.set(0.5, 0.5);
    textRef.current = newText;
    if (pcContainerRef.current) {
      pcContainerRef.current.addChild(newText);
    }
    return newText;
  }, []);

  /**
   * Get (or lazily create) the single pooled Sprite object
   */
  const getSprite = useCallback(() => {
    if (spriteRef.current) {
      spriteRef.current.visible = true;
      return spriteRef.current;
    }
    const newSprite = new BreathSprite(); // a Sprite that can breathe (BreathSprite.js)
    newSprite.anchor.set(0.5, 0.5);
    spriteRef.current = newSprite;
    if (pcContainerRef.current) {
      pcContainerRef.current.addChild(newSprite);
    }
    return newSprite;
  }, []);

  const hideText = useCallback(() => {
    if (textRef.current) textRef.current.visible = false;
  }, []);

  const hideSprite = useCallback(() => {
    if (spriteRef.current) spriteRef.current.visible = false;
    if (riderRef.current) riderRef.current.visible = false;
  }, []);

  const hideRider = useCallback(() => {
    if (riderRef.current) riderRef.current.visible = false;
  }, []);

  /** The rider sprite (lazily made) wearing the avatar cut at its waist; null when there is no avatar. */
  const getRider = useCallback((avatarOpen) => {
    if (!avatarOpen || avatarOpen.valid === false || avatarOpen.baseTexture?.destroyed) return null;
    const waist = RIDER_WAIST;
    let cut = riderTexRef.current;
    if (!cut || cut.src !== avatarOpen || cut.waist !== waist) {
      if (cut?.tex) { try { cut.tex.destroy(false); } catch (e) { /* gone with its base */ } }
      const fr = avatarOpen.frame;
      const tex = new Texture(avatarOpen.baseTexture, new Rectangle(fr.x, fr.y, fr.width, Math.max(1, Math.round(fr.height * waist))));
      cut = riderTexRef.current = { src: avatarOpen, waist, tex };
    }
    let rider = riderRef.current;
    if (!rider) {
      rider = riderRef.current = new Sprite(cut.tex);
      rider.anchor.set(0.5, 1); // its waist (the cut) is its bottom edge
      if (pcContainerRef.current) pcContainerRef.current.addChild(rider);
    }
    if (!rider.parent && pcContainerRef.current) pcContainerRef.current.addChild(rider);
    rider.texture = cut.tex;
    rider.visible = true;
    return { rider, waist };
  }, []);

  // Initialize PC container and persistent graphics
  useEffect(() => {
    if (!app?.stage) return;

    // Find the world container (parent of all game layers)
    const worldContainer = app.stage.children.find(c => c.name === 'world');
    if (!worldContainer) return;

    // The player shares the y-sorted objects layer with the resources and the NPCs
    // (PixiRenderer.js): a wall post or a building south of the player draws over them
    let pcContainer = worldContainer.children.find(c => c.name === 'objects')
      || worldContainer.children.find(c => c.name === 'pcs');

    if (!pcContainer) {
      pcContainer = new Container();
      pcContainer.name = 'pcs';

      // Insert after overlays (or at end if not found)
      const overlayContainerIndex = worldContainer.children.findIndex(c => c.name === 'overlays');
      if (overlayContainerIndex >= 0) {
        worldContainer.addChildAt(pcContainer, overlayContainerIndex);
      } else {
        worldContainer.addChild(pcContainer);
      }
    }

    pcContainerRef.current = pcContainer;
    // CombatFX (lunge, hit flash, cooldown ring) reads the player's display object through this
    CombatFX.registerPC(() => {
      const s = spriteRef.current; if (s && s.visible && s.parent) return s;
      const t = textRef.current; return (t && t.visible && t.parent) ? t : null;
    });

    // Re-attach pooled objects if they already exist (app instance changed)
    if (textRef.current && !textRef.current.parent) {
      pcContainer.addChild(textRef.current);
    }
    if (spriteRef.current && !spriteRef.current.parent) {
      pcContainer.addChild(spriteRef.current);
    }
    if (riderRef.current && !riderRef.current.parent) {
      pcContainer.addChild(riderRef.current);
    }

    return () => {
      // Cleanup on unmount
      // NOTE: Don't destroy the Text/Sprite - parent PixiRenderer destroys the stage tree
      if (spriteRef.current) {
        spriteRef.current.texture = Texture.EMPTY;
      }
      if (riderRef.current) riderRef.current.texture = Texture.EMPTY;
      riderRef.current = null;
      if (riderTexRef.current?.tex) { try { riderTexRef.current.tex.destroy(false); } catch (e) { /* already gone */ } }
      riderTexRef.current = null;
      CombatFX.registerPC(null);
      textRef.current = null;
      spriteRef.current = null;
      pcContainerRef.current = null;
    };
  }, [app]);

  // Destroy this instance's SVG textures on unmount
  useEffect(() => {
    isMountedRef.current = true;
    const cache = svgTextureCacheRef.current;
    const atlasCache = atlasTextureCacheRef.current;
    const loading = svgLoadingPromisesRef.current;
    return () => {
      isMountedRef.current = false;
      cache.forEach(tex => {
        try { tex.destroy(true); } catch (e) { /* already destroyed */ }
      });
      cache.clear();
      atlasCache.clear(); // not destroyed: the sheets belong to AtlasTextures
      loading.clear();
    };
  }, []);

  /**
   * Get the render position for a PC, checking for animation overrides
   * Animation positions are stored in renderPositions by playerId during smooth movement
   */
  const getPCRenderPosition = useCallback((pc) => {
    const playerId = pc.playerId;
    // Check if there's an animated position for this player
    if (playerId && renderPositions[playerId]) {
      return renderPositions[playerId];
    }
    // The store is the live position: React's copy of the PC record is throttled while moving
    const live = playersInGridManager.getLocalRecord();
    if (live && String(live.playerId) === String(playerId) && live.position) {
      return live.position;
    }
    return pc.position;
  }, []);

  /**
   * The local player's PC record (the only one ever rendered)
   */
  const currentPC = useMemo(() => {
    if (!currentPlayer?._id || !pcs) return null;
    const list = Array.isArray(pcs) ? pcs : Object.values(pcs);
    return list.find(pc => pc && String(pc.playerId) === String(currentPlayer._id)) || null;
  }, [pcs, currentPlayer]);

  /**
   * Render function that updates the local PC's position/icon
   * Called both on state changes and during animations via ticker
   */
  const renderPCs = useCallback(() => {
    const container = pcContainerRef.current;
    if (!container) return;

    const pc = currentPC;
    const renderPos = pc ? getPCRenderPosition(pc) : null;
    const posX = renderPos?.x;
    const posY = renderPos?.y;

    if (!pc || posX === undefined || posY === undefined) {
      hideText();
      hideSprite();
      return;
    }

    // zoomed out to the Settlement or the Frontier: no player on the board
    if (hidden) { hideSprite(); hideText(); if (spriteRef.current) spriteRef.current.walking = false; return; }

    // Get display icon based on state
    const displayIcon = getDisplayIcon(pc);

    // A state's painted art (tent, boat), else the icon's SVG, else its Twemoji atlas frame
    const svgFilename = getStateArt(pc) || getSvgFilename(displayIcon) || getEmojiCacheKey(displayIcon);
    const svgTextureCache = svgTextureCacheRef.current;
    const atlasTextureCache = atlasTextureCacheRef.current;

    // Calculate position
    const xPos = gridOffset.x + posX * TILE_SIZE + TILE_SIZE / 2;
    const yPos = gridOffset.y + posY * TILE_SIZE + TILE_SIZE / 2;

    // The camera keeps the local player at the fixed screen point (PixiCamera.js)
    PixiCamera.follow(posX, posY);

    const cached = svgFilename ? (atlasTextureCache.get(svgFilename) || svgTextureCache.get(svgFilename)) : null;
    // the saved avatar stands in for the icon, except in the states that have their own picture
    // (dead, sick, camping, afloat), which stay whole-icon swaps (avatar-plan v1 decision 6)
    const av = avatarTexRef.current;
    const inState = pc.hp === 0 || pc.hp < 100 || pc.iscamping || pc.isinboat;
    const avatarTex = av && !inState && av.open.valid !== false && !av.open.baseTexture?.destroyed ? av.open : null;
    const texture = avatarTex || (cached && cached.valid !== false && !cached.baseTexture?.destroyed ? cached : null);

    if (texture) {
      // Use SVG sprite
      const sprite = getSprite();
      sprite.texture = texture;
      // a figure (the saved avatar or a figure icon) stands on the tile: its square's bottom edge is the tile's bottom edge
      const span = avatarTex ? AVATAR_SPAN : (!getStateArt(pc) && iconToSpanMap.get(normalizeEmoji(displayIcon)));
      const stateArt = !avatarTex ? getStateArt(pc) : null;
      const isTent = stateArt === 'resources:item-tent.svg';
      const flatSize = isTent ? TENT_SPAN : (stateArt && pc.isinboat ? BOAT_SPAN : 0.9); // non-figure art, drawn centred
      const flatDrop = isTent ? -((TENT_SPAN - 1) * TILE_SIZE) / 2 : 0; // the tent stands on the tile's bottom edge
      sprite.width = TILE_SIZE * (span || flatSize);
      sprite.height = TILE_SIZE * (span || flatSize);
      sprite.x = xPos;
      // a figure is anchored at its FEET (the square's bottom-centre on the tile's bottom edge), so the
      // idle breath (breathing.js) stretches it up from the ground; a bust or emoji stays centred
      if (span) { sprite.anchor.set(0.5, 1); sprite.y = yPos + TILE_SIZE / 2; }
      else { sprite.anchor.set(0.5, 0.5); sprite.y = yPos + flatDrop; }
      const artTop = opaqueTopFraction(app?.renderer, texture);
      liveHeadTop = span ? 1 - span * (1 - artTop) : 0.5 - flatSize / 2 + flatSize * artTop + flatDrop / TILE_SIZE;
      sprite.__artTop = artTop; // CombatFX centres the cooldown ring on the drawn figure, not its feet
      sprite.__breathes = !!span; // only a figure breathes (the ticker below sets sprite.breath)
      if (!span) sprite.breath = 0;
      else if (avatarTex) sprite.breathTop = AVATAR_BREATH_TOP[av.body] || AVATAR_BREATH_TOP.female;
      else if (iconToBreathTop.has(normalizeEmoji(displayIcon))) sprite.breathTop = iconToBreathTop.get(normalizeEmoji(displayIcon));
      // blinking: the ticker swaps between this texture and the blink frame (the avatar's own, or the icon's once it is loaded)
      const blinkFile = !avatarTex && span ? iconToBlinkMap.get(normalizeEmoji(displayIcon)) : null;
      sprite.__openTex = texture;
      sprite.__blinkTex = avatarTex ? av.blink : (blinkFile ? (atlasTextureCache.get(blinkFile) || svgTextureCache.get(blinkFile) || null) : null);
      // The weapon in the hand (docs/equipment-plan.md; heldWeapon.js): while it is out the figure is
      // drawn as its body with the sword arm cut away and that arm as an ArmRig holding the weapon in
      // the guard. Put away, the arm eases back to the drawing and the plain picture returns.
      const rig = avatarTex ? avatarRig(av.body, av.outfit) : null;
      const armed = !!(rig && heldWeapon);
      const cut = rig && (armed || sprite.armRig) ? cutRig(app?.renderer, av.open, rig) : null;
      if (cut && (armed || !sprite.armRig.atRest)) {
        const blinkCut = av.blink ? cutRig(app?.renderer, av.blink, rig) : null;
        sprite.texture = cut.body; sprite.__openTex = cut.body; sprite.__blinkTex = blinkCut ? blinkCut.body : null;
        const arm = syncArmRig(sprite, rig, cut, { attackClip: heldWeapon ? heldWeapon.clip : sprite.armRig?.attackClip });
        if (armed) {
          if (arm.__held !== heldWeapon) { armFigure(arm, heldWeapon, heldWeapon.art ? Texture.from(weaponSrc(heldWeapon.art)) : null, cut.w, AVATAR_SPAN); arm.__held = heldWeapon; }
          else arm.setStance(null, true);
        } else {
          arm.setStance(null, false); // put away: the arm eases down; the plain figure comes back when it has
          if (!disarmTimerRef.current) disarmTimerRef.current = setTimeout(() => { disarmTimerRef.current = null; renderPCsRef.current?.(); }, 280);
        }
      } else if (sprite.armRig) syncArmRig(sprite, null, null);
      if (blinkFile && !sprite.__blinkTex && !blinkRequestedRef.current.has(blinkFile)) {
        blinkRequestedRef.current.add(blinkFile);
        loadSvgTexture(blinkFile).then((tex) => { if (tex && spriteRef.current) spriteRef.current.__blinkTex = tex; });
      }
      // A figure icon is drawn turned a little to the viewer's right and mirrors when the player's
      // facing says so (PlayerMovement: set by horizontal steps and by facing an NPC; D1); busts
      // and emoji never flip. Sizing above leaves scale.x positive, so the sign is applied after it.
      if (span) sprite.scale.x = Math.abs(sprite.scale.x) * getPlayerFacing();
      else if (sprite.scale.x < 0) sprite.scale.x = Math.abs(sprite.scale.x);
      sprite.zIndex = actorZ(posY, 0.51); // by its feet (depthSort.js); wins a tie with an NPC on the same row
      sprite.alpha = 1.0;
      hideText();

      // Afloat with a saved avatar: the avatar's upper half sits in the boat, its waist on the rim
      const seated = pc.isinboat && getStateArt(pc) && pc.hp > 0 && !pc.iscamping ? getRider(av?.open) : null;
      if (seated) {
        const { rider, waist } = seated;
        const rimY = yPos - (BOAT_SPAN * TILE_SIZE) / 2 + BOAT_RIM * BOAT_SPAN * TILE_SIZE;
        rider.width = AVATAR_SPAN * TILE_SIZE;
        rider.height = AVATAR_SPAN * TILE_SIZE * waist;
        rider.scale.x = Math.abs(rider.scale.x) * getPlayerFacing();
        rider.x = xPos;
        rider.y = rimY;
        rider.zIndex = actorZ(posY, 0.511); // over the boat, so the cut sits on the rim
        rider.alpha = 1.0;
        // the speech bubble rides above the rider's head (tiles from the tile's top)
        const riderTop = opaqueTopFraction(app?.renderer, av.open);
        liveHeadTop = (rimY - (yPos - TILE_SIZE / 2)) / TILE_SIZE - AVATAR_SPAN * (waist - riderTop);
      } else {
        hideRider();
      }
    } else {
      // Use emoji text fallback
      const text = getText();
      text.text = displayIcon;
      text.style.fontSize = TILE_SIZE * 0.8;
      text.x = xPos;
      text.y = yPos;
      liveHeadTop = 0.1;
      text.zIndex = actorZ(posY, 0.51);
      text.alpha = 1.0;
      hideSprite();
      hideRider();

      // If SVG exists but not loaded, trigger load
      if (svgFilename && !svgTextureCache.has(svgFilename) && !atlasTextureCache.has(svgFilename)) {
        loadSvgTexture(svgFilename).then((tex) => {
          // Re-render after texture loads
          if (tex) renderPCs();
        });
      }
    }
  }, [currentPC, TILE_SIZE, gridOffset, getDisplayIcon, getStateArt, getSvgFilename, getEmojiCacheKey, getText, getSprite, hideText, hideSprite, hideRider, getRider, getPCRenderPosition, loadSvgTexture, avatarVersion, hidden, heldWeapon]);
  renderPCsRef.current = renderPCs;
  useEffect(() => () => { if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current); }, []);

  // Initial render and re-render on state changes
  useEffect(() => {
    renderPCs();
  }, [renderPCs]);

  // Start animation loop on-demand when animations are detected
  // IMPORTANT: Uses requestAnimationFrame instead of PixiJS ticker to ensure smooth
  // PC movement even when the main render is capped at 30fps. This decouples
  // PC position updates from the scene render rate.
  const startAnimationTicker = useCallback(() => {
    if (animationTickerRef.current) return; // Already running

    const onFrame = () => {
      // Check if the local PC has an active animation position
      const hasActiveAnimations = !!(currentPC?.playerId && renderPositions[currentPC.playerId]);

      if (hasActiveAnimations) {
        noAnimationFramesRef.current = 0;
        renderPCs();
        // Continue the animation loop
        animationTickerRef.current = requestAnimationFrame(onFrame);
      } else {
        // No animations - increment counter and stop after a few idle frames
        noAnimationFramesRef.current++;
        if (noAnimationFramesRef.current > 5) {
          // Stop the animation loop when idle to save CPU
          animationTickerRef.current = null;
          noAnimationFramesRef.current = 0;
        } else {
          // Keep checking for a few more frames
          animationTickerRef.current = requestAnimationFrame(onFrame);
        }
      }
    };

    animationTickerRef.current = requestAnimationFrame(onFrame);
  }, [currentPC, renderPCs]);

  // Check for animations on each render and start ticker if needed
  // This is triggered by parent re-renders when player moves
  useEffect(() => {
    if (currentPC?.playerId && renderPositions[currentPC.playerId]) {
      startAnimationTicker();
    }
  }, [currentPC, startAnimationTicker]);

  // Idle breathing: one ticker callback for the player's figure, standing still only (a step in
  // progress has an entry in renderPositions)
  useEffect(() => {
    const ticker = app?.ticker;
    if (!ticker || !breathingAllowed()) return undefined;
    const onBreath = () => {
      const sprite = spriteRef.current;
      if (!sprite || !sprite.visible || !sprite.__breathes) { if (sprite) sprite.walking = false; return; }
      const id = currentPC?.playerId;
      const moving = !!(id && renderPositions[id]);
      const now = performance.now();
      sprite.breath = moving ? 0 : breathLevel(now, breathSeed(id));
      sprite.walkSideways = isPlayerWalkingSideways(); // left or right: stride and arm swing; up or down: the feet only step
      sprite.walking = moving; // the legs step while it moves (walking.js; BreathSprite plays them)
      if (sprite.__blinkTex && sprite.__openTex) {
        const want = isBlinking(now, breathSeed(`${id}:blink`)) ? sprite.__blinkTex : sprite.__openTex;
        if (want.baseTexture && sprite.texture !== want) sprite.texture = want; // never a destroyed frame
      }
    };
    ticker.add(onBreath);
    return () => { try { ticker.remove(onBreath); } catch (e) { /* the ticker may be destroyed */ } };
  }, [app, currentPC?.playerId]);

  // A turn made while standing still (facing an NPC the player taps or walks up to) moves nothing,
  // so no render pass follows it: the figure is mirrored here, the moment the facing changes.
  useEffect(() => onPlayerFacingChange((dir) => {
    const sprite = spriteRef.current;
    if (sprite && !sprite.destroyed && sprite.visible && sprite.__breathes) sprite.scale.x = Math.abs(sprite.scale.x) * dir; // __breathes: a figure (busts and emoji never flip)
  }), []);

  // Cleanup animation loop on unmount
  useEffect(() => {
    return () => {
      if (animationTickerRef.current) {
        cancelAnimationFrame(animationTickerRef.current);
        animationTickerRef.current = null;
      }
    };
  }, []);

  // This component doesn't render any DOM elements
  return null;
};

export default PixiRendererPCs;
