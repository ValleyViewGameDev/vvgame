import React from 'react';
import { RenderResourcesCanvas } from './RenderResourcesCanvas';

/**
 * Main resource rendering component - FORCED TO CANVAS MODE ONLY
 * Only handles the actual resource entities, not their overlays or tooltips
 */
export const RenderResources = ({
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
  // useCanvasResources removed - always Canvas mode now
}) => {
  // FORCED TO CANVAS MODE - no decision tree
  return (
    <RenderResourcesCanvas
      resources={resources}
      masterResources={masterResources}
      globalTuning={globalTuning}
      TILE_SIZE={TILE_SIZE}
      craftingStatus={craftingStatus}
      tradingStatus={tradingStatus}
      badgeState={badgeState}
      electionPhase={electionPhase}
      currentPlayer={currentPlayer}
      handleTileClick={handleTileClick}
    />
  );
};

export default RenderResources;