import React, { useRef, useEffect, useCallback } from 'react';
import SVGAssetManager from './SVGAssetManager';
import { getResourceOverlayStatus, OVERLAY_SVG_MAPPING } from '../Utils/ResourceOverlayUtils';
import { getResourceCursorClass, setCanvasCursor } from '../Utils/CursorUtils';
import { generateResourceTooltip } from './RenderDynamicElements';
import { calculateTooltipPosition } from '../Utils/TooltipUtils';

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
  handleTileClick,
  setHoverTooltip,
  strings
}) => {
  const canvasRef = useRef(null);
  const lastRenderData = useRef(null);
  
  
  // Update SVGAssetManager zoom tiers when globalTuning changes
  useEffect(() => {
    if (globalTuning) {
      SVGAssetManager.updateZoomTiers(globalTuning);
    }
  }, [globalTuning]);
  
  // Render resources to canvas
  const renderResources = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !resources) return;
    
    const ctx = canvas.getContext('2d');
    
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
    
    // Render all resources (matching DOM behavior)
    for (const resource of resources) {
      // Only render once per resource at its anchor position (x,y)
      // Multi-tile resources span from (x,y) but are visually rendered from anchor
      await renderSingleResource(ctx, resource, TILE_SIZE, masterResources);
    }
    
    // Render overlays for resources that need them
    // Filter out shadow, doober, and source for overlays (they don't get status overlays)
    const overlayResources = resources.filter(resource => 
      resource.type !== 'shadow' && resource.category !== 'doober' && resource.category !== 'source'
    );
    
    for (const resource of overlayResources) {
      await renderResourceOverlay(ctx, resource, TILE_SIZE);
    }
  }, [resources, TILE_SIZE, craftingStatus, tradingStatus, badgeState, electionPhase, masterResources]);

  // Render a single resource (SVG or emoji)
  const renderSingleResource = async (ctx, resource, TILE_SIZE, masterResources) => {
    const x = resource.x * TILE_SIZE;
    const y = resource.y * TILE_SIZE;
    const range = resource.range || 1;
    const size = TILE_SIZE * range;
    
    // Check if resource has custom SVG art from masterResources
    const filename = getResourceFilename(resource.type, masterResources);
    
    if (filename) {
      // Render custom SVG art
      const texture = await SVGAssetManager.getSVGTexture(filename, size);
      if (texture) {
        // For multi-tile resources, adjust Y position so bottom-left aligns with anchor
        let adjustedY = y;
        if (range > 1) {
          adjustedY = y - (size - TILE_SIZE);
        }
        ctx.drawImage(texture, x, adjustedY, size, size);
      } else {
        console.warn(`Failed to load SVG for ${resource.type}: ${filename}`);
        // Fall back to emoji if SVG fails to load
        renderResourceEmoji(ctx, resource, x, y, TILE_SIZE, range);
      }
    } else if (resource.symbol) {
      // Render emoji symbol
      renderResourceEmoji(ctx, resource, x, y, TILE_SIZE, range);
    }
  };
  
  // Helper function to render emoji resources
  const renderResourceEmoji = (ctx, resource, x, y, TILE_SIZE, range) => {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Calculate font size based on resource type and range
    let fontSize;
    if (range > 1) {
      fontSize = resource.action === 'wall' 
        ? TILE_SIZE * 1.2 * range  // Multi-tile walls
        : TILE_SIZE * 0.8 * range; // Other multi-tile resources
    } else {
      fontSize = resource.action === 'wall'
        ? TILE_SIZE * 1.1  // Single-tile walls
        : TILE_SIZE * 0.7; // Other single-tile resources
    }
    
    ctx.font = `${fontSize}px Arial`;
    
    // Position text at center of resource
    const size = TILE_SIZE * range;
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    
    // For multi-tile resources that grow upward, adjust the visual position
    let adjustedY = centerY;
    if (range > 1) {
      // Multi-tile resources are anchored at bottom-left, position emoji in the lower portion
      adjustedY = y + TILE_SIZE * 0.1;
      if (resource.action === 'wall') {
        adjustedY += 3; // Multi-tile walls shifted down 3px
      }
    }
    
    ctx.fillText(resource.symbol, centerX, adjustedY);
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
      const size = TILE_SIZE * (resource.range || 1);
      
      // Position overlay in lower-left corner of the resource's primary tile
      const overlaySize = Math.max(12, TILE_SIZE * 0.3); // Based on single tile size, not resource size
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
    const currentData = JSON.stringify({ 
      resources: resources?.map(r => ({ 
        x: r.x, 
        y: r.y, 
        type: r.type, 
        symbol: r.symbol, 
        range: r.range 
      })), 
      TILE_SIZE,
      craftingReady: craftingStatus?.ready,
      craftingInProgress: craftingStatus?.inProgress,
      tradingReady: tradingStatus?.ready,
      mailboxBadge: badgeState?.mailbox,
      electionPhase,
      playerId: currentPlayer?.id // Include player ID for trade status changes
    });
    
    if (currentData !== lastRenderData.current) {
      renderResources();
      lastRenderData.current = currentData;
    }
  }, [resources, TILE_SIZE, craftingStatus, tradingStatus, badgeState, electionPhase, currentPlayer]);

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

  // Handle mouse move for tooltips and cursor
  const handleCanvasMouseMove = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas || !setHoverTooltip) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const colIndex = Math.floor(x / TILE_SIZE);
    const rowIndex = Math.floor(y / TILE_SIZE);
    
    // Find resource at this position
    const resource = resources?.find(r => {
      if (r.type === 'shadow') return false;
      const range = r.range || 1;
      return colIndex >= r.x && colIndex < r.x + range &&
             rowIndex <= r.y && rowIndex > r.y - range;
    });
    
    if (resource && resource.category !== 'doober' && resource.category !== 'source') {
      const tooltipPosition = calculateTooltipPosition(event.clientX, event.clientY);
      setHoverTooltip({
        x: tooltipPosition.x,
        y: tooltipPosition.y,
        content: generateResourceTooltip(resource, strings),
      });
      const cursorClass = getResourceCursorClass(resource);
      setCanvasCursor(canvas, cursorClass);
    } else if (resource) {
      // Doober or source - show cursor but no tooltip
      setHoverTooltip(null);
      const cursorClass = resource.category === 'doober' ? 'cursor-pointer' : getResourceCursorClass(resource);
      setCanvasCursor(canvas, cursorClass);
    } else {
      setHoverTooltip(null);
      setCanvasCursor(canvas, null);
    }
  }, [resources, TILE_SIZE, setHoverTooltip, strings]);

  const handleCanvasMouseLeave = useCallback(() => {
    if (setHoverTooltip) {
      setHoverTooltip(null);
    }
    const canvas = canvasRef.current;
    if (canvas) {
      setCanvasCursor(canvas, null);
    }
  }, [setHoverTooltip]);

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
        pointerEvents: 'auto'
      }}
    />
  );
};