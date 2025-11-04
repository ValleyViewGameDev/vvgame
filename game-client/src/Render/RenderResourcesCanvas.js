import React, { useRef, useEffect, useCallback } from 'react';
import SVGAssetManager from './SVGAssetManager';

// Test resource art mapping - easy to add/remove for testing
const CUSTOM_ART_MAPPING = {
  'Farmhouse': 'farmhouse.svg',
  'Oak Tree': 'oak-tree.svg',
  // Add more test assets here as you create them
};

// Canvas-based resource renderer component
export const RenderResourcesCanvas = ({ 
  resources,
  masterResources, 
  globalTuning,
  TILE_SIZE, 
  handleTileClick,
  onMouseEnter,
  onMouseLeave 
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
    
    // Only render resources that have custom SVG art
    const svgResources = resources.filter(resource => 
      resource.type !== 'shadow' && CUSTOM_ART_MAPPING[resource.type]
    );
    
    // Render each SVG resource - only at anchor positions for multi-tile resources
    for (const resource of svgResources) {
      // Only render once per resource at its anchor position (x,y)
      // Multi-tile resources span from (x,y) but are visually rendered from anchor
      await renderSingleResource(ctx, resource, TILE_SIZE);
    }
  }, [resources, TILE_SIZE]);

  // Render a single SVG resource
  const renderSingleResource = async (ctx, resource, TILE_SIZE) => {
    const x = resource.x * TILE_SIZE;
    const y = resource.y * TILE_SIZE;
    const size = TILE_SIZE * (resource.range || 1);
    
    // Get the SVG art (we know it exists since we filtered for it)
    const customArt = CUSTOM_ART_MAPPING[resource.type];
    
    // Render custom SVG art
    const texture = await SVGAssetManager.getSVGTexture(customArt, size);
    if (texture) {
      // Debug: log texture vs target size
      console.log(`Rendering ${resource.type}: texture=${texture.width}x${texture.height}, target=${size}x${size}`);
      ctx.drawImage(texture, x, y, size, size);
    } else {
      console.warn(`Failed to load SVG for ${resource.type}: ${customArt}`);
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
      TILE_SIZE 
    });
    
    if (currentData !== lastRenderData.current) {
      renderResources();
      lastRenderData.current = currentData;
    }
  }, [renderResources, resources, TILE_SIZE]);

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

  // Handle mouse events for tooltips
  const handleCanvasMouseMove = useCallback((event) => {
    if (!onMouseEnter) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const colIndex = Math.floor(x / TILE_SIZE);
    const rowIndex = Math.floor(y / TILE_SIZE);
    
    // Find resource at this position
    const resource = resources?.find(r => 
      colIndex >= r.x && colIndex < r.x + (r.range || 1) &&
      rowIndex >= r.y && rowIndex < r.y + (r.range || 1)
    );
    
    if (resource) {
      onMouseEnter(event, resource, rowIndex, colIndex);
    }
  }, [onMouseEnter, resources, TILE_SIZE]);

  const handleCanvasMouseLeave = useCallback((event) => {
    if (onMouseLeave) {
      onMouseLeave(event);
    }
  }, [onMouseLeave]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      onMouseMove={handleCanvasMouseMove}
      onMouseLeave={handleCanvasMouseLeave}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 5, // Above tiles (1) but below overlays (10+)
        cursor: 'pointer',
        pointerEvents: 'auto'
      }}
    />
  );
};