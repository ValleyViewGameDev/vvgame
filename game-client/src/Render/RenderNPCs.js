import React from 'react';
import { RenderNPCsCanvas } from './RenderNPCsCanvas';

/**
 * Main NPC rendering component - FORCED TO CANVAS MODE ONLY
 * Only handles the actual NPC entities, not their overlays or tooltips
 */
export const RenderNPCs = ({ 
  npcs,
  TILE_SIZE,
  currentPlayer,
  globalTuning,
  gridId,
  onNPCClick,
  
  // NPC status checking functions (shared logic)
  checkQuestNPCStatus,
  checkTradeNPCStatus,
  checkKentNPCStatus,
  
  // Props for NPC interactions
  strings,
  masterResources,
  playersInGrid,
  setInventory,
  setBackpack,
  setResources,
  setCurrentPlayer,
  masterSkills,
  setModalContent,
  setIsModalOpen,
  updateStatus,
  openPanel,
  setActiveStation,
  masterTrophies,
  setHoverTooltip,
  isDeveloper = false,

  // useCanvasNPCs removed - always Canvas mode now
}) => {
  // FORCED TO CANVAS MODE - no decision tree
  return (
    <RenderNPCsCanvas
        npcs={npcs}
        TILE_SIZE={TILE_SIZE}
        currentPlayer={currentPlayer}
        globalTuning={globalTuning}
        gridId={gridId}
        onNPCClick={onNPCClick}
        checkQuestNPCStatus={checkQuestNPCStatus}
        checkTradeNPCStatus={checkTradeNPCStatus}
        checkKentNPCStatus={checkKentNPCStatus}
        strings={strings}
        masterResources={masterResources}
        playersInGrid={playersInGrid}
        setInventory={setInventory}
        setBackpack={setBackpack}
        setResources={setResources}
        setCurrentPlayer={setCurrentPlayer}
        masterSkills={masterSkills}
        setModalContent={setModalContent}
        setIsModalOpen={setIsModalOpen}
        updateStatus={updateStatus}
        openPanel={openPanel}
        setActiveStation={setActiveStation}
        masterTrophies={masterTrophies}
        setHoverTooltip={setHoverTooltip}
        isDeveloper={isDeveloper}
      />
  );
};

export default RenderNPCs;