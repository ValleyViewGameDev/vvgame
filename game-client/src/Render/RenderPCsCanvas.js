import React from 'react';

/**
 * Canvas-based PC (Player Character) renderer
 * TODO: Implement canvas rendering for PCs
 */
export const RenderPCsCanvas = ({
  pcs,
  TILE_SIZE,
  currentPlayer,
  onPCClick,
  setCurrentPlayer,
  setInventory,
  setBackpack,
  masterResources,
  strings
}) => {
  // TODO: Implement canvas rendering for PCs
  console.warn('RenderPCsCanvas not yet implemented - falling back to DOM');
  return null;
};

export default RenderPCsCanvas;