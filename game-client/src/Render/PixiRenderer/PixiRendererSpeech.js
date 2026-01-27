import { useEffect, useRef, useState, useCallback } from 'react';
import { Graphics, Container, Text } from 'pixi.js-legacy';
import ConversationManager from '../../GameFeatures/Relationships/ConversationManager';

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
  pcs,                    // Array of PCs (for position lookup by playerId)
  currentPlayer,          // Current player object
  TILE_SIZE,              // Tile size in pixels
}) => {
  const speechContainerRef = useRef(null);

  // Force re-render when ConversationManager updates
  const [conversationVersion, setConversationVersion] = useState(0);

  // Object pools for reuse
  const bubblePoolRef = useRef([]);      // Pool of { graphics, text } for bubbles
  const outcomePoolRef = useRef([]);     // Pool of { text, startTime, startY } for animations
  const activeBubblesRef = useRef(0);
  const activeOutcomesRef = useRef([]);  // Track active outcome animations
  const processedOutcomesRef = useRef(new Set());  // Track outcomes we've already animated (by key)

  // Animation ticker ref
  const tickerCallbackRef = useRef(null);

  /**
   * Get border color based on match state
   */
  const getBorderColor = useCallback((matchState) => {
    if (matchState === 'match') return 0x4CAF50;  // Green
    if (matchState === 'rival') return 0xF44336;  // Red
    return 0x333333;  // Default dark
  }, []);

  /**
   * Find entity position by speaker ID
   * NPCs are identified by type, PCs by playerId
   */
  const findEntityPosition = useCallback((speakerId) => {
    // Check if it's the current player
    if (currentPlayer && String(speakerId) === String(currentPlayer._id)) {
      // Find current player's PC
      const currentPC = pcs?.find(pc => String(pc.playerId) === String(currentPlayer._id));
      if (currentPC?.position) {
        return currentPC.position;
      }
    }

    // Check NPCs by type
    const npc = npcs?.find(n => n && n.type === speakerId);
    if (npc?.position) {
      return npc.position;
    }

    // Check PCs by playerId
    const pc = pcs?.find(p => p && String(p.playerId) === String(speakerId));
    if (pc?.position) {
      return pc.position;
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
      bubble.text.visible = true;
      return bubble;
    }

    // Create new bubble
    const graphics = new Graphics();
    const text = new Text('', {
      fontSize: 32,
      fontFamily: 'sans-serif',
    });
    text.resolution = 2;
    text.anchor.set(0.5, 0.5);

    const bubble = { graphics, text };
    pool.push(bubble);

    // Add to container
    if (speechContainerRef.current) {
      speechContainerRef.current.addChild(graphics);
      speechContainerRef.current.addChild(text);
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
   * Draw a speech bubble (circle with pointer tail)
   */
  const drawBubble = useCallback((graphics, centerX, centerY, radius, borderColor) => {
    graphics.clear();

    // Shadow (offset circle)
    graphics.beginFill(0x000000, 0.2);
    graphics.drawCircle(centerX + 2, centerY + 4, radius);
    graphics.endFill();

    // White fill
    graphics.beginFill(0xFFFFFF);
    graphics.drawCircle(centerX, centerY, radius);
    graphics.endFill();

    // Border
    const borderWidth = Math.max(2, TILE_SIZE * 0.06);
    graphics.lineStyle(borderWidth, borderColor);
    graphics.drawCircle(centerX, centerY, radius);

    // Pointer tail (triangle pointing down)
    const tailWidth = radius * 0.4;
    const tailHeight = radius * 0.5;
    const tailY = centerY + radius - borderWidth / 2;

    graphics.beginFill(0xFFFFFF);
    graphics.lineStyle(borderWidth, borderColor);
    graphics.moveTo(centerX - tailWidth / 2, tailY);
    graphics.lineTo(centerX, tailY + tailHeight);
    graphics.lineTo(centerX + tailWidth / 2, tailY);
    graphics.lineTo(centerX - tailWidth / 2, tailY);
    graphics.endFill();

    // Cover the line inside the circle where tail meets
    graphics.lineStyle(0);
    graphics.beginFill(0xFFFFFF);
    graphics.drawRect(centerX - tailWidth / 2 + 1, tailY - borderWidth, tailWidth - 2, borderWidth + 2);
    graphics.endFill();
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
      if (!b.graphics.parent) speechContainer.addChild(b.graphics);
      if (!b.text.parent) speechContainer.addChild(b.text);
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

      // Remove ticker callback
      if (tickerCallbackRef.current && app?.ticker) {
        app.ticker.remove(tickerCallbackRef.current);
        tickerCallbackRef.current = null;
      }
    };
  }, [app]);

  // Setup animation ticker for outcomes
  useEffect(() => {
    if (!app?.ticker) return;

    // Remove old callback if exists
    if (tickerCallbackRef.current) {
      app.ticker.remove(tickerCallbackRef.current);
    }

    const animateOutcomes = () => {
      const now = Date.now();
      const animationDuration = 2000; // 2 seconds

      activeOutcomesRef.current.forEach(outcome => {
        if (!outcome.active) return;

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
    };

    tickerCallbackRef.current = animateOutcomes;
    app.ticker.add(animateOutcomes);

    return () => {
      // Safely remove ticker callback - app.ticker may be null if app was destroyed
      if (tickerCallbackRef.current && app?.ticker) {
        app.ticker.remove(tickerCallbackRef.current);
      }
      tickerCallbackRef.current = null;
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

      // Calculate bubble position (above entity)
      const bubbleRadius = TILE_SIZE * 0.75;
      const centerX = (position.x + 0.5) * TILE_SIZE;
      const centerY = position.y * TILE_SIZE - TILE_SIZE * 0.2 - bubbleRadius;

      // Get bubble from pool
      const bubble = getBubbleFromPool(bubblesUsed);

      // Draw bubble shape
      const borderColor = getBorderColor(speech.matchState);
      drawBubble(bubble.graphics, centerX, centerY, bubbleRadius, borderColor);

      // Set text content (topic emoji)
      const displayText = speech.topic || speech.emoji || '💬';
      bubble.text.text = displayText;
      bubble.text.style.fontSize = TILE_SIZE * 0.9;
      bubble.text.x = centerX;
      bubble.text.y = centerY;

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
      const outcomeObj = getOutcomeFromPool();
      const startX = (position.x + 0.5) * TILE_SIZE;
      const startY = position.y * TILE_SIZE - TILE_SIZE * 0.5;

      outcomeObj.text.text = outcome.emoji || (outcome.type === 'positive' ? '👍' : '👎');
      outcomeObj.text.style.fontSize = TILE_SIZE * 1.2;
      outcomeObj.text.x = startX;
      outcomeObj.text.y = startY;
      outcomeObj.text.alpha = 1;
      outcomeObj.startTime = Date.now();
      outcomeObj.startY = startY;
      outcomeObj.speakerId = speakerId;
      outcomeObj.timestamp = outcome.timestamp;

      activeOutcomesRef.current.push(outcomeObj);
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

  }, [conversationVersion, npcs, pcs, currentPlayer, TILE_SIZE,
      findEntityPosition, getBubbleFromPool, hideUnusedBubbles,
      getBorderColor, drawBubble, getOutcomeFromPool]);

  // This component doesn't render any DOM elements
  return null;
};

export default PixiRendererSpeech;
