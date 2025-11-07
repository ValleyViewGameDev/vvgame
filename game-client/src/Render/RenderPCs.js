import React from 'react';
import { RenderPCsDOM } from './RenderPCsDOM';

/**
 * Main PC (Player Character) rendering component - TEMPORARILY USING DOM MODE
 * Canvas implementation not yet complete, using DOM for PCs only
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
}) => {
  // TEMPORARILY USING DOM MODE - Canvas implementation not complete
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