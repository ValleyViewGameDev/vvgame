import { useEffect, useRef, useCallback } from 'react';
import { Graphics, Container } from 'pixi.js-legacy';
import { getDerivedRange } from '../../Utils/worldHelpers';

/**
 * PixiRendererVFX - Visual effects layer for the PixiJS renderer
 *
 * Handles rendering of:
 * - Attack range indicators for NPCs
 * - Interaction range indicator for current player (gray filled circle)
 * - Attack range indicator for current player (red dotted circle)
 * - Future: Damage numbers, particle effects, skill animations, etc.
 *
 * IMPORTANT: This component uses object pooling and reuse to prevent
 * IOSurface/GPU memory exhaustion. Never create Graphics objects in
 * render loops without proper cleanup.
 */
const PixiRendererVFX = ({
  app,                    // PixiJS Application instance
  npcs,                   // Array of NPCs (for range indicators)
  pcs,                    // Array of PCs (for future effects)
  currentPlayer,          // Current player (for settings like rangeOn)
  TILE_SIZE,              // Current tile size
  masterResources,        // Master resources list (for getDerivedRange calculation)
}) => {
  const vfxContainerRef = useRef(null);

  // Persistent Graphics objects - reused across renders to prevent memory leaks
  // These are created once and cleared/redrawn rather than destroyed/recreated
  const playerInteractionGraphicRef = useRef(null);
  const playerAttackGraphicRef = useRef(null);
  const npcGraphicsPoolRef = useRef([]); // Pool of Graphics for NPC range indicators
  const activeNpcGraphicsCount = useRef(0);

  /**
   * Helper: Draw a dashed circle (for attack ranges)
   */
  const drawDashedCircle = useCallback((graphics, centerX, centerY, radius, color, alpha, lineWidth = 2) => {
    const dashLength = 8;
    const gapLength = 6;
    const circumference = 2 * Math.PI * radius;
    const totalSegments = Math.floor(circumference / (dashLength + gapLength));
    const anglePerDash = (dashLength / circumference) * 2 * Math.PI;
    const anglePerGap = (gapLength / circumference) * 2 * Math.PI;

    graphics.lineStyle(lineWidth, color, alpha);

    let currentAngle = 0;
    for (let i = 0; i < totalSegments; i++) {
      // Draw dash arc
      graphics.arc(centerX, centerY, radius, currentAngle, currentAngle + anglePerDash);
      currentAngle += anglePerDash + anglePerGap;

      // Move to next dash start point (creates the gap)
      if (i < totalSegments - 1) {
        const nextX = centerX + Math.cos(currentAngle) * radius;
        const nextY = centerY + Math.sin(currentAngle) * radius;
        graphics.moveTo(nextX, nextY);
      }
    }
  }, []);

  /**
   * Get or create a Graphics object from the NPC pool
   */
  const getNpcGraphicFromPool = useCallback((index) => {
    const pool = npcGraphicsPoolRef.current;

    if (index < pool.length) {
      // Reuse existing graphic
      const graphic = pool[index];
      graphic.visible = true;
      return graphic;
    }

    // Create new graphic and add to pool
    const newGraphic = new Graphics();
    pool.push(newGraphic);

    // Add to container if it exists
    if (vfxContainerRef.current) {
      vfxContainerRef.current.addChild(newGraphic);
    }

    return newGraphic;
  }, []);

  /**
   * Hide unused graphics in the pool
   */
  const hideUnusedPoolGraphics = useCallback((usedCount) => {
    const pool = npcGraphicsPoolRef.current;
    for (let i = usedCount; i < pool.length; i++) {
      pool[i].visible = false;
    }
  }, []);

  // Initialize VFX container and persistent graphics
  useEffect(() => {
    if (!app?.stage) return;

    // Find the world container (parent of all game layers)
    const worldContainer = app.stage.children.find(c => c.name === 'world');
    if (!worldContainer) return;

    // Check if container already exists
    let vfxContainer = worldContainer.children.find(c => c.name === 'vfx-range');

    if (!vfxContainer) {
      vfxContainer = new Container();
      vfxContainer.name = 'vfx-range';

      // Insert before NPCs layer
      const npcContainerIndex = worldContainer.children.findIndex(c => c.name === 'npcs');
      if (npcContainerIndex >= 0) {
        worldContainer.addChildAt(vfxContainer, npcContainerIndex);
      } else {
        worldContainer.addChildAt(vfxContainer, Math.min(2, worldContainer.children.length));
      }
    }

    vfxContainerRef.current = vfxContainer;

    // Create persistent player graphics (reused across renders)
    if (!playerInteractionGraphicRef.current) {
      playerInteractionGraphicRef.current = new Graphics();
      vfxContainer.addChild(playerInteractionGraphicRef.current);
    }

    if (!playerAttackGraphicRef.current) {
      playerAttackGraphicRef.current = new Graphics();
      vfxContainer.addChild(playerAttackGraphicRef.current);
    }

    // Add any existing pool graphics to the container
    npcGraphicsPoolRef.current.forEach(g => {
      if (!g.parent) {
        vfxContainer.addChild(g);
      }
    });

    return () => {
      // Cleanup on unmount
      // NOTE: We don't call .destroy() here because the parent PixiRenderer
      // calls app.destroy(true, { children: true }) which already destroys
      // all child graphics. Calling destroy again causes "refCount" errors.
      // We just null out our refs to allow garbage collection.
      playerInteractionGraphicRef.current = null;
      playerAttackGraphicRef.current = null;
      npcGraphicsPoolRef.current = [];
      activeNpcGraphicsCount.current = 0;
      vfxContainerRef.current = null;
    };
  }, [app]);

  // Render range indicators - reuses Graphics objects instead of creating new ones
  useEffect(() => {
    const container = vfxContainerRef.current;
    const playerInteractionGraphic = playerInteractionGraphicRef.current;
    const playerAttackGraphic = playerAttackGraphicRef.current;

    if (!container || !playerInteractionGraphic || !playerAttackGraphic) return;

    // Check if range indicators should be shown
    const showRangeIndicators = currentPlayer?.settings?.rangeOn !== false;

    // Clear all graphics (but don't destroy - we reuse them)
    playerInteractionGraphic.clear();
    playerInteractionGraphic.visible = false;
    playerAttackGraphic.clear();
    playerAttackGraphic.visible = false;

    let npcGraphicsUsed = 0;

    if (!showRangeIndicators) {
      hideUnusedPoolGraphics(0);
      return;
    }

    // === PLAYER RANGE INDICATORS ===
    const currentPC = pcs?.find(pc =>
      pc && String(pc.playerId) === String(currentPlayer?._id)
    );

    if (currentPC?.position) {
      const playerPosX = currentPC.position.x;
      const playerPosY = currentPC.position.y;
      const playerCenterX = (playerPosX + 0.5) * TILE_SIZE;
      const playerCenterY = (playerPosY + 0.5) * TILE_SIZE;

      // Check if player is on their own homestead
      const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;

      if (!isOnOwnHomestead) {
        // 1. Interaction range indicator (gray filled circle)
        const derivedRange = getDerivedRange(currentPlayer, masterResources);
        if (derivedRange > 1) {
          const interactionRadius = derivedRange * TILE_SIZE;

          playerInteractionGraphic.beginFill(0x808080, 0.2);
          playerInteractionGraphic.drawCircle(playerCenterX, playerCenterY, interactionRadius);
          playerInteractionGraphic.endFill();
          playerInteractionGraphic.visible = true;
        }

        // 2. Attack range indicator (red dotted circle)
        const attackRange = currentPC.attackrange || currentPlayer?.attackrange;
        if (attackRange && attackRange > 0) {
          const attackRadius = attackRange * TILE_SIZE;

          drawDashedCircle(playerAttackGraphic, playerCenterX, playerCenterY, attackRadius, 0xFF0000, 0.4, 3);
          playerAttackGraphic.visible = true;
        }
      }
    }

    // === NPC RANGE INDICATORS ===
    if (npcs) {
      const attackNPCs = npcs.filter(npc =>
        npc &&
        npc.position &&
        (npc.action === 'attack' || npc.action === 'spawn') &&
        npc.attackrange &&
        npc.attackrange > 0
      );

      for (const npc of attackNPCs) {
        const posX = npc.position?.x ?? npc.x;
        const posY = npc.position?.y ?? npc.y;

        if (posX === undefined || posY === undefined) continue;

        const centerX = (posX + 0.5) * TILE_SIZE;
        const centerY = (posY + 0.5) * TILE_SIZE;
        const radius = npc.attackrange * TILE_SIZE;

        // Get a graphics object from the pool (reused)
        const rangeGraphic = getNpcGraphicFromPool(npcGraphicsUsed);
        rangeGraphic.clear();
        drawDashedCircle(rangeGraphic, centerX, centerY, radius, 0xFFFF64, 0.4, 2);
        npcGraphicsUsed++;
      }
    }

    // Hide any unused pool graphics
    hideUnusedPoolGraphics(npcGraphicsUsed);
    activeNpcGraphicsCount.current = npcGraphicsUsed;

  }, [npcs, pcs, currentPlayer, masterResources, TILE_SIZE, drawDashedCircle, getNpcGraphicFromPool, hideUnusedPoolGraphics]);

  // This component doesn't render any DOM elements
  return null;
};

export default PixiRendererVFX;
