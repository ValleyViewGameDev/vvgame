// @refresh reset
// ^ Development only: remount on a hot reload instead of re-running effects on destroyed Pixi objects (see PixiRenderer.js).
import { useEffect, useRef, useState, useCallback } from 'react';
import { Graphics, Container, Text, Sprite } from 'pixi.js-legacy';
import ConversationManager from '../../GameFeatures/Relationships/ConversationManager';
import { playerIconSpan } from './PixiRendererPCs';
import { getNpcHeadTop } from './npcHeadTops';
import { topicArt } from './speechTopicArt';

/** How much higher than a one-tile sprite's a figure's bubble sits: (span - 1) tiles. */
const headLift = (position, T) => (position.span ? (position.span - 1) * T : 0);

// The bubble (owner 2026-11-10): a cream body in the painted header / HUD icons' tones (a light
// face shading to tan at the lower right), the avatar circles' white ring and soft drop shadow,
// and a curved, hooked tail hanging off the bottom whose tip points at the speaker's head.
// In a back-and-forth the reply is mirrored (ConversationManager.addSpeech `flip`), so the
// bubbles alternate sides; the light stays where it is (the cream face up and to the left).
const SIZE = 0.85;    // the whole bubble, against the first cut (owner 2026-11-10: a little big)
const BUBBLE = {
  face: 0xfff1cc,     // the icons' lightest cream
  shade: 0xf6d996,    // their tan, showing as a rim at the lower right
  ring: 0xffffff,     // the avatar ring (App.css .header-desk-avatar)
  rx: 0.8 * SIZE, ry: 0.6 * SIZE, // tiles: a little wider than tall
  tail: 0.36 * SIZE,  // tiles from the body's bottom to the tail's tip
  emoji: 0.72 * SIZE, // the topic emoji's font size, tiles
  tipDx: 0.22,        // the tip sits this far right of the body's centre (x rx): the hook
  gap: 0.06,          // tiles of air between the tip and the head
  portrait: 0xbaee66, // a character's head crop sits in the avatar circle: white ring on the button green (--brand-leaf, NPCPortrait)
  portraitR: 0.33 * SIZE, // tiles: the portrait circle's radius
  art: 0.66 * SIZE,   // tiles: the box a resource's painted art or a Twemoji fits in
};

/** Trace the bubble's outline (body + tail as one path) with its body centred on (cx, cy); sx -1 mirrors it. */
function traceBubble(g, cx, cy, rx, ry, tailLen, sx = 1) {
  const at = (deg) => { const a = (deg * Math.PI) / 180; return { x: cx + sx * rx * Math.cos(a), y: cy + ry * Math.sin(a) }; };
  // angles clockwise on screen (y down): the tail's base runs from 58° (lower right) to 96° (just past the bottom)
  const A0 = 96; const A1 = 58 + 360;
  const start = at(A0);
  g.moveTo(start.x, start.y);
  for (let d = A0 + 6; d < A1; d += 6) { const p = at(d); g.lineTo(p.x, p.y); }
  const right = at(A1);
  g.lineTo(right.x, right.y);
  const tip = { x: cx + sx * rx * BUBBLE.tipDx, y: cy + ry + tailLen };
  // the outer edge bows out and sweeps down to the tip; the inner edge comes back concave: a hook
  g.bezierCurveTo(right.x + sx * tailLen * 0.05, right.y + tailLen * 0.45, tip.x + sx * tailLen * 0.3, tip.y - tailLen * 0.3, tip.x, tip.y);
  g.bezierCurveTo(tip.x - sx * tailLen * 0.02, tip.y - tailLen * 0.55, start.x + sx * rx * 0.12, start.y + tailLen * 0.3, start.x, start.y);
  g.closePath();
  return tip;
}

/**
 * PixiRendererSpeech - Speech bubbles and relationship outcomes for PixiJS renderer
 *
 * Handles rendering of:
 * - Speech bubbles with topic emoji (during conversations)
 * - Match state visual feedback (green/red borders)
 * - Relationship outcome animations (thumbs up/down float-up)
 *
 * IMPORTANT: Uses object pooling to prevent GPU memory exhaustion.
 * Subscribes to ConversationManager for real-time updates.
 */
const PixiRendererSpeech = ({
  app,                    // PixiJS Application instance
  npcs,                   // Array of NPCs (for position lookup by type)
  pcs,                    // Array of PCs (single-player: at most the local PC)
  currentPlayer,          // Current player object
  TILE_SIZE,              // Tile size in pixels
  gridOffset = { x: 0, y: 0 },  // Offset for settlement zoom (current grid position in world)
  hidden = false,         // the Settlement and Frontier views draw no player and no NPCs, so no speech either
}) => {
  const speechContainerRef = useRef(null);
  useEffect(() => { if (speechContainerRef.current) speechContainerRef.current.visible = !hidden; });

  // Force re-render when ConversationManager updates
  const [conversationVersion, setConversationVersion] = useState(0);

  // Object pools for reuse
  const bubblePoolRef = useRef([]);      // Pool of { graphics, text } for bubbles
  const outcomePoolRef = useRef([]);     // Pool of { text, startTime, startY } for animations
  const activeBubblesRef = useRef(0);
  const activeOutcomesRef = useRef([]);  // Track active outcome animations
  const processedOutcomesRef = useRef(new Set());  // Track outcomes we've already animated (by key)

  // Animation ticker ref (on-demand pattern)
  const tickerCallbackRef = useRef(null);
  // Counter for consecutive frames with no animations
  const noAnimationFramesRef = useRef(0);

  /**
   * Get border color based on match state
   */
  const getBorderColor = useCallback((matchState) => {
    if (matchState === 'match') return 0x4CAF50;  // Green
    if (matchState === 'rival') return 0xF44336;  // Red
    return BUBBLE.ring;  // the avatar circles' white ring
  }, []);

  /**
   * Find entity position by speaker ID
   * NPCs are identified by type; the only PC speaker is the local player (by playerId)
   */
  // The speaker's tile position plus `span`: a full-body figure (resources.json artSpan, or the
  // player's figure icon) stands span tiles tall on its tile, so its bubble sits (span - 1) tiles
  // higher than a one-tile sprite's (docs/avatar-plan.md v2; owner 2026-11-09)
  const findEntityPosition = useCallback((speakerId) => {
    // Check if it's the current player (the only PC that can speak)
    if (currentPlayer && String(speakerId) === String(currentPlayer._id)) {
      const list = Array.isArray(pcs) ? pcs : Object.values(pcs || {});
      const currentPC = list.find(pc => pc && String(pc.playerId) === String(currentPlayer._id));
      if (currentPC?.position) {
        return { ...currentPC.position, span: playerIconSpan(currentPC.icon || currentPlayer.icon) };
      }
    }

    // Check NPCs by type
    const npc = npcs?.find(n => n && n.type === speakerId);
    if (npc?.position) {
      // headTop: the measured top of its head (npcHeadTops.js), in tiles below the tile's top edge
      return { ...npc.position, span: Number(npc.artSpan) > 0 ? Number(npc.artSpan) : 0, headTop: getNpcHeadTop(npc.id) };
    }

    return null;
  }, [npcs, pcs, currentPlayer]);

  /**
   * Get or create a bubble from the pool
   */
  const getBubbleFromPool = useCallback((index) => {
    const pool = bubblePoolRef.current;

    if (index < pool.length) {
      const bubble = pool[index];
      bubble.graphics.visible = true;
      return bubble; // the topic's text, art or portrait is shown by the caller
    }

    // Create new bubble
    const graphics = new Graphics();
    const text = new Text('', {
      fontSize: 32,
      fontFamily: 'sans-serif',
    });
    text.resolution = 2;
    text.anchor.set(0.5, 0.5);

    // the topic's picture (speechTopicArt.js): a portrait's circle + its mask, and the sprite
    const portrait = new Graphics();
    const mask = new Graphics();
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 0.5);
    portrait.visible = false; sprite.visible = false; mask.visible = false;

    const bubble = { graphics, text, portrait, mask, sprite };
    pool.push(bubble);

    // Add to container
    if (speechContainerRef.current) {
      speechContainerRef.current.addChild(graphics, portrait, sprite, mask, text);
    }

    return bubble;
  }, []);

  /**
   * Hide unused bubbles in the pool
   */
  const hideUnusedBubbles = useCallback((usedCount) => {
    const pool = bubblePoolRef.current;
    for (let i = usedCount; i < pool.length; i++) {
      pool[i].graphics.visible = false;
      pool[i].text.visible = false;
      pool[i].portrait.visible = false;
      pool[i].sprite.visible = false;
    }
  }, []);

  /**
   * Get or create an outcome text from the pool
   */
  const getOutcomeFromPool = useCallback(() => {
    const pool = outcomePoolRef.current;

    // Find an inactive one
    const inactive = pool.find(o => !o.active);
    if (inactive) {
      inactive.active = true;
      inactive.text.visible = true;
      return inactive;
    }

    // Create new outcome
    const text = new Text('', {
      fontSize: 32,
      fontFamily: 'sans-serif',
    });
    text.resolution = 2;
    text.anchor.set(0.5, 0.5);

    const outcome = { text, active: true, startTime: 0, startY: 0 };
    pool.push(outcome);

    // Add to container
    if (speechContainerRef.current) {
      speechContainerRef.current.addChild(text);
    }

    return outcome;
  }, []);

  /**
   * Draw a speech bubble whose tail's tip is at (tipX, tipY); returns its body's centre (for the topic emoji)
   */
  const drawBubble = useCallback((graphics, tipX, tipY, ringColor, flip = false) => {
    const T = TILE_SIZE;
    const rx = T * BUBBLE.rx; const ry = T * BUBBLE.ry; const tailLen = T * BUBBLE.tail;
    const sx = flip ? -1 : 1;
    const cx = tipX - sx * rx * BUBBLE.tipDx;
    const cy = tipY - tailLen - ry;
    const ringW = Math.max(2, T * 0.05);
    graphics.clear();

    // Soft drop shadow, like the avatar circles' (0 2px 4px): two offset passes, the wider one fainter
    const sh = Math.max(2, T * 0.05);
    graphics.lineStyle(ringW * 2.2, 0x000000, 0.1);
    graphics.beginFill(0x000000, 0.1);
    traceBubble(graphics, cx, cy + sh * 1.3, rx, ry, tailLen, sx);
    graphics.endFill();
    graphics.lineStyle(ringW, 0x000000, 0.18);
    graphics.beginFill(0x000000, 0.18);
    traceBubble(graphics, cx, cy + sh * 0.7, rx, ry, tailLen, sx);
    graphics.endFill();

    // The body in the tan, then the light cream face set up and to the left: a painted rim at the lower right
    graphics.lineStyle(0);
    graphics.beginFill(BUBBLE.shade);
    traceBubble(graphics, cx, cy, rx, ry, tailLen, sx);
    graphics.endFill();
    graphics.beginFill(BUBBLE.face);
    graphics.drawEllipse(cx - rx * 0.05, cy - ry * 0.07, rx * 0.9, ry * 0.86);
    graphics.endFill();

    // The ring: white, or green / red for a match / rival topic
    graphics.lineStyle({ width: ringW, color: ringColor, alpha: 1, alignment: 0.5, join: 'round' });
    traceBubble(graphics, cx, cy, rx, ry, tailLen, sx);
    graphics.lineStyle(0);
    return { cx, cy };
  }, [TILE_SIZE]);

  // Subscribe to ConversationManager
  useEffect(() => {
    const unsubscribe = ConversationManager.subscribe(() => {
      setConversationVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

  // Initialize speech container
  useEffect(() => {
    if (!app?.stage) return;

    // Find the world container (parent of all game layers)
    const worldContainer = app.stage.children.find(c => c.name === 'world');
    if (!worldContainer) return;

    // Check if container already exists
    let speechContainer = worldContainer.children.find(c => c.name === 'speech');

    if (!speechContainer) {
      speechContainer = new Container();
      speechContainer.name = 'speech';

      // Add at the end of world container (highest z-order within world)
      worldContainer.addChild(speechContainer);
    }

    speechContainerRef.current = speechContainer;

    // Add existing pool items to container
    bubblePoolRef.current.forEach(b => {
      for (const part of [b.graphics, b.portrait, b.sprite, b.mask, b.text]) if (!part.parent) speechContainer.addChild(part);
    });
    outcomePoolRef.current.forEach(o => {
      if (!o.text.parent) speechContainer.addChild(o.text);
    });

    return () => {
      // Cleanup on unmount - don't destroy, parent handles that
      bubblePoolRef.current = [];
      outcomePoolRef.current = [];
      activeOutcomesRef.current = [];
      processedOutcomesRef.current.clear();
      speechContainerRef.current = null;

      // Remove ticker callback - wrapped in try-catch for grid transition safety
      try {
        if (tickerCallbackRef.current && app?.ticker) {
          app.ticker.remove(tickerCallbackRef.current);
          tickerCallbackRef.current = null;
        }
      } catch (e) {
        // Ticker may already be destroyed during grid transition
        tickerCallbackRef.current = null;
      }
    };
  }, [app]);

  // Start animation ticker on-demand when outcome animations are active
  // This prevents continuous 60fps polling when no outcomes are animating
  const startOutcomeAnimationTicker = useCallback(() => {
    if (tickerCallbackRef.current) return; // Already running
    if (!app?.ticker) return;

    const ticker = app.ticker;

    const animateOutcomes = () => {
      const now = Date.now();
      const animationDuration = 2000; // 2 seconds
      let hasActiveAnimations = false;

      activeOutcomesRef.current.forEach(outcome => {
        if (!outcome.active) return;

        hasActiveAnimations = true;
        const elapsed = now - outcome.startTime;
        const progress = Math.min(elapsed / animationDuration, 1);

        // Float up (40px over duration)
        outcome.text.y = outcome.startY - (progress * 40);

        // Fade out
        outcome.text.alpha = 1 - progress;

        // Deactivate when done
        if (progress >= 1) {
          outcome.active = false;
          outcome.text.visible = false;
        }
      });

      // Clean up inactive outcomes from active list
      activeOutcomesRef.current = activeOutcomesRef.current.filter(o => o.active);

      // PERFORMANCE: Remove ticker when no active animations
      if (!hasActiveAnimations) {
        noAnimationFramesRef.current++;
        if (noAnimationFramesRef.current > 5) {
          try {
            ticker.remove(animateOutcomes);
          } catch (e) {
            // Ticker may be destroyed
          }
          tickerCallbackRef.current = null;
          noAnimationFramesRef.current = 0;
        }
      } else {
        noAnimationFramesRef.current = 0;
      }
    };

    tickerCallbackRef.current = animateOutcomes;
    ticker.add(animateOutcomes);
  }, [app]);

  // Cleanup animation ticker on unmount
  useEffect(() => {
    return () => {
      if (tickerCallbackRef.current && app?.ticker) {
        try {
          app.ticker.remove(tickerCallbackRef.current);
        } catch (e) {
          // Ticker may be destroyed
        }
        tickerCallbackRef.current = null;
      }
    };
  }, [app]);

  // Render speech bubbles and outcomes
  useEffect(() => {
    const container = speechContainerRef.current;
    if (!container) return;

    let bubblesUsed = 0;

    // Get all active speeches
    const allSpeeches = ConversationManager.getAllSpeeches();
    const allOutcomes = ConversationManager.getAllOutcomes();

    // Render speech bubbles
    for (const [speakerId, speech] of allSpeeches) {
      const position = findEntityPosition(speakerId);
      if (!position) continue;

      // The tail's tip just above the speaker's head (the measured head of an NPC, else the
      // figure's span); grid offset for settlement zoom
      const tileTop = gridOffset.y + position.y * TILE_SIZE;
      const headY = position.headTop != null ? tileTop + position.headTop * TILE_SIZE : tileTop - headLift(position, TILE_SIZE);
      const tipX = gridOffset.x + (position.x + 0.5) * TILE_SIZE;
      const tipY = headY - TILE_SIZE * BUBBLE.gap;

      // Get bubble from pool
      const bubble = getBubbleFromPool(bubblesUsed);

      // Draw bubble shape
      const borderColor = getBorderColor(speech.matchState);
      const { cx: centerX, cy: centerY } = drawBubble(bubble.graphics, tipX, tipY, borderColor, !!speech.flip);

      // The topic: its art (a character's headshot in the avatar ring, the player's face, a
      // resource's painted art, a Twemoji), else the emoji as text (speechTopicArt.js)
      const displayText = speech.topic || speech.emoji || '💬';
      const art = topicArt(displayText, () => setConversationVersion((v) => v + 1));
      const { text, portrait, mask, sprite } = bubble;
      portrait.visible = false; sprite.visible = false; sprite.mask = null; mask.visible = false;
      if (art?.kind === 'portrait') {
        const r = TILE_SIZE * BUBBLE.portraitR;
        const ringW = Math.max(1.5, TILE_SIZE * 0.035);
        portrait.clear();
        portrait.beginFill(BUBBLE.portrait);
        portrait.lineStyle(ringW, BUBBLE.ring, 1, 0);
        portrait.drawCircle(centerX, centerY, r);
        portrait.endFill();
        portrait.visible = true;
        mask.clear();
        mask.beginFill(0xffffff);
        mask.drawCircle(centerX, centerY, r - ringW);
        mask.endFill();
        mask.visible = true;
        sprite.texture = art.texture;
        sprite.width = r * 2; sprite.height = r * 2;
        sprite.position.set(centerX, centerY);
        sprite.mask = mask;
        sprite.visible = true;
        text.visible = false;
      } else if (art) {
        const box = TILE_SIZE * BUBBLE.art;
        const w = art.texture.orig?.width || art.texture.width; const h = art.texture.orig?.height || art.texture.height;
        const k = box / Math.max(w, h, 1);
        sprite.texture = art.texture;
        sprite.width = w * k; sprite.height = h * k;
        sprite.position.set(centerX, centerY);
        sprite.visible = true;
        text.visible = false;
      } else {
        text.text = displayText;
        text.style.fontSize = TILE_SIZE * BUBBLE.emoji;
        text.x = centerX;
        text.y = centerY;
        text.visible = true;
      }

      bubblesUsed++;
    }

    // Hide unused bubbles
    hideUnusedBubbles(bubblesUsed);
    activeBubblesRef.current = bubblesUsed;

    // Process new outcomes (create float-up animations)
    for (const [speakerId, outcome] of allOutcomes) {
      // Create a unique key for this outcome
      const outcomeKey = `${speakerId}-${outcome.timestamp}`;

      // Skip if we've already processed this outcome (even if animation is done)
      if (processedOutcomesRef.current.has(outcomeKey)) continue;

      // Mark as processed immediately to prevent duplicates
      processedOutcomesRef.current.add(outcomeKey);

      const position = findEntityPosition(speakerId);
      if (!position) continue;

      // Create new outcome animation
      // Apply grid offset for settlement zoom
      const outcomeObj = getOutcomeFromPool();
      const startX = gridOffset.x + (position.x + 0.5) * TILE_SIZE;
      const startY = gridOffset.y + position.y * TILE_SIZE - TILE_SIZE * 0.5 - headLift(position, TILE_SIZE);

      outcomeObj.text.text = outcome.emoji || (outcome.type === 'positive' ? '👍' : '👎');
      // A small badge over the head, not a second NPC: ~half a tile (it was 1.2 tiles, cartoonishly big)
      outcomeObj.text.style.fontSize = TILE_SIZE * 0.55;
      outcomeObj.text.x = startX;
      outcomeObj.text.y = startY;
      outcomeObj.text.alpha = 1;
      outcomeObj.startTime = Date.now();
      outcomeObj.startY = startY;
      outcomeObj.speakerId = speakerId;
      outcomeObj.timestamp = outcome.timestamp;

      activeOutcomesRef.current.push(outcomeObj);
      // Start the animation ticker (on-demand pattern)
      startOutcomeAnimationTicker();
    }

    // Clean up processedOutcomes for outcomes that are no longer in ConversationManager
    // This prevents memory leaks from the Set growing indefinitely
    const currentOutcomeKeys = new Set(
      Array.from(allOutcomes).map(([id, o]) => `${id}-${o.timestamp}`)
    );
    processedOutcomesRef.current.forEach(key => {
      if (!currentOutcomeKeys.has(key)) {
        processedOutcomesRef.current.delete(key);
      }
    });

  }, [conversationVersion, npcs, pcs, currentPlayer, TILE_SIZE, gridOffset,
      findEntityPosition, getBubbleFromPool, hideUnusedBubbles,
      getBorderColor, drawBubble, getOutcomeFromPool, startOutcomeAnimationTicker]);

  // This component doesn't render any DOM elements
  return null;
};

export default PixiRendererSpeech;
