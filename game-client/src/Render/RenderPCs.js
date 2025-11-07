import React from 'react';
import { RenderPCsCanvas } from './RenderPCsCanvas';

/**
 * Main PC (Player Character) rendering component - FORCED TO CANVAS MODE ONLY
 * Only handles the actual PC entities, not their overlays or tooltips
 */
export const RenderPCs = ({ 
  pcs,
  TILE_SIZE,
  currentPlayer,
  onPCClick,
  setCurrentPlayer,
  setInventory,
  setBackpack,
  masterResources,
  strings,
  // useCanvasPCs removed - always Canvas mode now
}) => {
  // FORCED TO CANVAS MODE - no decision tree
  return (
    <RenderPCsCanvas
      pcs={pcs}
      TILE_SIZE={TILE_SIZE}
      currentPlayer={currentPlayer}
      onPCClick={onPCClick}
      setCurrentPlayer={setCurrentPlayer}
      setInventory={setInventory}
      setBackpack={setBackpack}
      masterResources={masterResources}
      strings={strings}
    />
  );
};

export default RenderPCs;