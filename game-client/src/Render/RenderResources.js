import React from 'react';
import { RenderResourcesCanvas } from './RenderResourcesCanvas';
import { RenderResourcesDOM } from './RenderResourcesDOM';

/**
 * Main resource rendering component that decides between Canvas and DOM rendering
 * Only handles the actual resource entities, not their overlays or tooltips
 */
export const RenderResources = ({ 
  resources,
  masterResources,
  globalTuning,
  TILE_SIZE,
  handleTileClick,
  setHoverTooltip,
  strings,
  useCanvasResources = false
}) => {
  // Simple decision: Canvas or DOM
  if (useCanvasResources) {
    return (
      <RenderResourcesCanvas
        resources={resources}
        masterResources={masterResources}
        globalTuning={globalTuning}
        TILE_SIZE={TILE_SIZE}
        handleTileClick={handleTileClick}
        setHoverTooltip={setHoverTooltip}
        strings={strings}
      />
    );
  } else {
    return (
      <RenderResourcesDOM
        resources={resources}
        TILE_SIZE={TILE_SIZE}
        handleTileClick={handleTileClick}
        setHoverTooltip={setHoverTooltip}
        strings={strings}
      />
    );
  }
};

export default RenderResources;