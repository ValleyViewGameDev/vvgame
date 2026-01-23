import React, { useRef, useEffect, useCallback, useState } from 'react';
import SVGAssetManager from './SVGAssetManager';
import { getResourceOverlayStatus, OVERLAY_SVG_MAPPING } from '../Utils/ResourceOverlayUtils';
import { isResourceAnimating, getAnimationVersion, registerForceRender } from '../VFX/VFX';

// Helper function to get the filename for a resource type
const getResourceFilename = (resourceType, masterResources) => {
  if (!masterResources) return null;

  const masterResource = masterResources.find(r => r.type === resourceType);
  return masterResource?.filename || null;
};


// Canvas-based resource renderer component
export const RenderResourcesCanvas = ({
  resources,
  masterResources,
  globalTuning,
  TILE_SIZE,
  craftingStatus,
  tradingStatus,
  badgeState,
  electionPhase,
  currentPlayer,
  handleTileClick
}) => {
  const canvasRef = useRef(null);
  const lastRenderData = useRef(null);
  const renderingRef = useRef(false); // Track if rendering is in progress
  const renderVersionRef = useRef(0); // Track render version to detect stale renders
  const [renderTrigger, setRenderTrigger] = useState(0); // Used to force re-render when animations complete

  // Register force render callback with VFX system
  useEffect(() => {
    registerForceRender(() => {
      setRenderTrigger(prev => prev + 1);
    });
    return () => {
      registerForceRender(null); // Cleanup on unmount
    };
  }, []);

  // Update SVGAssetManager zoom tiers when globalTuning changes
  useEffect(() => {
    if (globalTuning) {
      SVGAssetManager.updateZoomTiers(globalTuning);
    }
  }, [globalTuning]);

  // Cleanup rendering flag on unmount
  useEffect(() => {
    return () => {
      renderingRef.current = false;
    };
  }, []);
  
  // Render resources to canvas
  const renderResources = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !resources) return;

    // Increment render version and capture it for this render
    renderVersionRef.current += 1;
    const thisRenderVersion = renderVersionRef.current;

    // Prevent concurrent renders - but allow new renders to cancel old ones
    if (renderingRef.current) {
      console.log('🚫 [RESOURCE RENDER] Another render in progress - this render will proceed and old one will be stale');
    }
    renderingRef.current = true;

    console.log(`🎨 [RESOURCE RENDER] Starting render v${thisRenderVersion} for ${resources.length} resources at TILE_SIZE: ${TILE_SIZE}`);

    // Log SVG cache state before rendering
    const cacheStats = SVGAssetManager.getCacheStats();
    console.log(`🎨 [RESOURCE RENDER] SVG Cache before render: SVGs=${cacheStats.svgFiles}, Textures=${cacheStats.textures}, Loading=${cacheStats.loading}`);

    // Add timeout to prevent stuck renders
    const renderTimeout = setTimeout(() => {
      console.warn('⏰ [RESOURCE RENDER] Render timed out after 10 seconds, resetting lock');
      renderingRef.current = false;
    }, 10000);

    try {
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error('❌ [RESOURCE RENDER] Failed to get 2d context');
        return;
      }

      // Get device pixel ratio for high-DPI support
      const devicePixelRatio = window.devicePixelRatio || 1;

      // Calculate display size and actual canvas size
      const displayWidth = 64 * TILE_SIZE;
      const displayHeight = 64 * TILE_SIZE;
      const actualWidth = displayWidth * devicePixelRatio;
      const actualHeight = displayHeight * devicePixelRatio;

      // Set actual canvas size (for high-DPI)
      canvas.width = actualWidth;
      canvas.height = actualHeight;

      // Set display size (CSS size)
      canvas.style.width = displayWidth + 'px';
      canvas.style.height = displayHeight + 'px';

      // Scale canvas context for high-DPI
      ctx.scale(devicePixelRatio, devicePixelRatio);

      // Clear canvas
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // Check if this render is still current before expensive operations
      if (thisRenderVersion !== renderVersionRef.current) {
        console.log(`🚫 [RESOURCE RENDER] Render v${thisRenderVersion} is stale (current: v${renderVersionRef.current}), aborting`);
        return;
      }

      // Render all resources (matching DOM behavior)
      for (const resource of resources) {
        // Check for stale render periodically during the loop
        if (thisRenderVersion !== renderVersionRef.current) {
          console.log(`🚫 [RESOURCE RENDER] Render v${thisRenderVersion} became stale during resource loop, aborting`);
          return;
        }

        // Skip resources that are currently animating (grow effect handles their visual)
        if (isResourceAnimating(resource.x, resource.y)) {
          continue;
        }
        // Only render once per resource at its anchor position (x,y)
        // Multi-tile resources span from (x,y) but are visually rendered from anchor
        await renderSingleResource(ctx, resource, TILE_SIZE, masterResources);
      }

      // Final stale check before overlays
      if (thisRenderVersion !== renderVersionRef.current) {
        console.log(`🚫 [RESOURCE RENDER] Render v${thisRenderVersion} became stale before overlays, aborting`);
        return;
      }

      // Render overlays for resources that need them
      // Filter out shadow, doober, source, and animating resources for overlays
      const overlayResources = resources.filter(resource =>
        resource.type !== 'shadow' &&
        resource.category !== 'doober' &&
        resource.category !== 'source' &&
        !isResourceAnimating(resource.x, resource.y)
      );

      for (const resource of overlayResources) {
        if (thisRenderVersion !== renderVersionRef.current) {
          console.log(`🚫 [RESOURCE RENDER] Render v${thisRenderVersion} became stale during overlay loop, aborting`);
          return;
        }
        await renderResourceOverlay(ctx, resource, TILE_SIZE);
      }

      // Log final render stats
      const finalCacheStats = SVGAssetManager.getCacheStats();
      console.log(`✅ [RESOURCE RENDER] Render v${thisRenderVersion} completed - ${resources.length} resources at TILE_SIZE: ${TILE_SIZE}`);
      console.log(`✅ [RESOURCE RENDER] SVG Cache after render: SVGs=${finalCacheStats.svgFiles}, Textures=${finalCacheStats.textures}, Loading=${finalCacheStats.loading}`);
    } finally {
      clearTimeout(renderTimeout);
      // Only clear the lock if this is still the current render
      if (thisRenderVersion === renderVersionRef.current) {
        renderingRef.current = false;
      }
    }
  }, [resources, TILE_SIZE, craftingStatus, tradingStatus, badgeState, electionPhase, masterResources]);

  // Render a single resource (SVG or emoji)
  const renderSingleResource = async (ctx, resource, TILE_SIZE, masterResources) => {
    const x = resource.x * TILE_SIZE;
    const y = resource.y * TILE_SIZE;
    // Use size for visual rendering (size is tile footprint, range is for NPC behavior)
    const tileSpan = resource.size || 1;
    const size = TILE_SIZE * tileSpan;

    // Multi-tile resources grow UPWARD from anchor (anchor is bottom-left of visual area)
    // For tileSpan > 1, we need to shift the visual up so it occupies the correct tiles
    // Visual should span from (resource.y - tileSpan + 1) to resource.y in tile coordinates
    const visualY = (tileSpan > 1) ? y - (tileSpan - 1) * TILE_SIZE : y;

    // Check if resource has custom SVG art from masterResources
    const filename = getResourceFilename(resource.type, masterResources);

    if (filename) {
      // Render custom SVG art
      //console.log(`🖼️ [SVG DEBUG] Loading SVG texture for ${resource.type}: ${filename} at size ${size}`);
      const texture = await SVGAssetManager.getSVGTexture(filename, size);
      if (texture) {
        //console.log(`✅ [SVG DEBUG] Successfully loaded SVG texture for ${resource.type}: ${filename}`);

        // if (tileSpan > 1) {
        //   console.log(`🗻 [MULTI-TILE DEBUG] Rendering ${resource.type} (size ${tileSpan}) at anchor (${resource.x}, ${resource.y}) -> visual position (${x}, ${visualY}) size ${size}x${size}`);
        //   console.log(`    Logical blocking tiles: (${resource.x}, ${resource.y - tileSpan + 1}) to (${resource.x + tileSpan - 1}, ${resource.y})`);
        //   console.log(`    Visual rendering tiles: (${Math.floor(x/TILE_SIZE)}, ${Math.floor(visualY/TILE_SIZE)}) to (${Math.floor((x+size)/TILE_SIZE)-1}, ${Math.floor((visualY+size)/TILE_SIZE)-1})`);
        // }

        ctx.drawImage(texture, x, visualY, size, size);
      } else {
        console.warn(`❌ [SVG DEBUG] Failed to load SVG for ${resource.type}: ${filename}`);
        // Fall back to emoji if SVG fails to load
        renderResourceEmoji(ctx, resource, x, visualY, TILE_SIZE, tileSpan);
      }
    } else if (resource.symbol) {
      // Render emoji symbol
      renderResourceEmoji(ctx, resource, x, visualY, TILE_SIZE, tileSpan);
    }
  };

  // Helper function to render emoji resources
  // Note: y parameter is already the corrected visualY (top of visual area for multi-tile resources)
  const renderResourceEmoji = (ctx, resource, x, y, TILE_SIZE, tileSpan) => {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Calculate font size based on resource type and size
    let fontSize;
    if (tileSpan > 1) {
      if (resource.action === 'wall') {
        fontSize = TILE_SIZE * 1.2 * tileSpan;  // Multi-tile walls
      } else {
        // Scale emoji font size more aggressively for larger multi-tile resources
        // to better fill the visual space
        const baseScale = tileSpan <= 2 ? 0.8 : (tileSpan === 3 ? 1.0 : 1.2);
        fontSize = TILE_SIZE * baseScale * tileSpan;
      }
    } else {
      fontSize = resource.action === 'wall'
        ? TILE_SIZE * 1.1  // Single-tile walls
        : TILE_SIZE * 0.7; // Other single-tile resources
    }

    ctx.font = `${fontSize}px sans-serif`;

    // Position text at center of resource visual area
    const size = TILE_SIZE * tileSpan;
    const centerX = x + size / 2;
    const centerY = y + size / 2;

    ctx.fillText(resource.symbol, centerX, centerY);
    ctx.restore();
  };

  // Render overlay for a resource (status indicators)
  const renderResourceOverlay = async (ctx, resource, TILE_SIZE) => {
    // Use shared overlay logic to determine what overlay to show
    const overlayInfo = getResourceOverlayStatus(
      resource, 
      craftingStatus, 
      tradingStatus, 
      badgeState, 
      electionPhase,
      currentPlayer
    );
    
    if (!overlayInfo) return; // No overlay needed
    
    const overlayType = overlayInfo.type;
    
    // Render overlay if one is determined
    if (overlayType && OVERLAY_SVG_MAPPING[overlayType]) {
      const x = resource.x * TILE_SIZE;
      const y = resource.y * TILE_SIZE;
      const size = TILE_SIZE * (resource.size || 1);
      
      // Position overlay in lower-left corner of the resource's primary tile
      // Scale overlay more appropriately for different zoom levels
      let overlaySize;
      if (TILE_SIZE <= 16) {
        // Far zoom: use smaller minimum and ratio
        overlaySize = Math.max(6, TILE_SIZE * 0.35);
      } else if (TILE_SIZE <= 30) {
        // Close zoom: standard sizing
        overlaySize = Math.max(10, TILE_SIZE * 0.35);
      } else {
        // Closer zoom: allow larger overlays
        overlaySize = Math.max(14, TILE_SIZE * 0.35);
      }
      
      const overlayX = x + 2; // Small offset from left edge
      const overlayY = y + TILE_SIZE - overlaySize - 2; // Lower corner of primary tile
      
      const overlayTexture = await SVGAssetManager.getOverlayTexture(
        OVERLAY_SVG_MAPPING[overlayType], 
        overlaySize
      );
      
      if (overlayTexture) {
        ctx.drawImage(overlayTexture, overlayX, overlayY, overlaySize, overlaySize);
      } else {
        console.warn(`Failed to load overlay texture for ${overlayType}`);
      }
    }
  };

  // Re-render when dependencies change
  useEffect(() => {
    console.log(`🔄 [RESOURCE USEEFFECT] useEffect triggered with TILE_SIZE: ${TILE_SIZE}, resources count: ${resources?.length || 0}`);
    
    const currentData = JSON.stringify({
      resources: resources?.map(r => ({
        x: r.x,
        y: r.y,
        type: r.type,
        symbol: r.symbol,
        size: r.size
      })),
      TILE_SIZE,
      craftingReady: craftingStatus?.ready,
      craftingInProgress: craftingStatus?.inProgress,
      tradingReady: tradingStatus?.ready,
      mailboxBadge: badgeState?.mailbox,
      electionPhase,
      playerId: currentPlayer?.id, // Include player ID for trade status changes
      animationVersion: getAnimationVersion() // Re-render when grow animations complete
    });
    
    if (currentData !== lastRenderData.current) {
      console.log(`✅ [RESOURCE USEEFFECT] Data changed, triggering render with TILE_SIZE: ${TILE_SIZE}`);
      renderResources().catch(error => {
        console.error('Error rendering resources:', error);
        renderingRef.current = false; // Reset flag on error
      });
      lastRenderData.current = currentData;
    } else {
      console.log(`🔄 [RESOURCE USEEFFECT] Data unchanged, skipping render with TILE_SIZE: ${TILE_SIZE}`);
    }
  }, [resources, TILE_SIZE, craftingStatus, tradingStatus, badgeState, electionPhase, currentPlayer, renderTrigger]);

  // Handle canvas clicks and convert to grid coordinates
  const handleCanvasClick = useCallback((event) => {
    if (!handleTileClick) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const colIndex = Math.floor(x / TILE_SIZE);
    const rowIndex = Math.floor(y / TILE_SIZE);
    
    handleTileClick(rowIndex, colIndex);
  }, [handleTileClick, TILE_SIZE]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${64 * TILE_SIZE}px`,
        height: `${64 * TILE_SIZE}px`,
        zIndex: 10, // Same as DOM resources
        pointerEvents: 'none' // Let mouse events pass through to RenderDynamicElements
      }}
    />
  );
};