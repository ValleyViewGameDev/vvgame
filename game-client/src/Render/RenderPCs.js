import React from 'react';
import { RenderPCsCanvas } from './RenderPCsCanvas';
import { RenderPCsDOM } from './RenderPCsDOM';

/**
 * Main PC (Player Character) rendering component that decides between Canvas and DOM rendering
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
  useCanvasPCs = false
}) => {
  // Always use DOM for PCs since Canvas doesn't provide performance benefits
  // and we want to maintain parity with the original system
  return (
    <RenderPCsDOM
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