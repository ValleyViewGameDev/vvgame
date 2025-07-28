import React, { createContext, useContext, useState } from 'react';

const NPCOverlayContext = createContext();

export const NPCOverlayProvider = ({ children }) => {
  // Map of npcId -> { overlay: 'hourglass'|'exclamation'|'attack'|etc, clickable: boolean }
  const [npcOverlays, setNpcOverlays] = useState({});
  
  const setNPCOverlay = (npcId, overlayType, clickable = true) => {
    console.log(`🎭 NPC ${npcId}: ${overlayType ? `setting overlay '${overlayType}'` : 'clearing overlay'} (clickable: ${clickable})`);
    setNpcOverlays(prev => ({
      ...prev,
      [npcId]: overlayType ? { overlay: overlayType, clickable } : undefined
    }));
  };
  
  const clearNPCOverlay = (npcId) => {
    setNPCOverlay(npcId, null);
  };
  
  const getNPCOverlay = (npcId) => {
    return npcOverlays[npcId];
  };
  
  // Helper methods for common overlay types
  const setBusyOverlay = (npcId) => setNPCOverlay(npcId, 'hourglass', false);
  const setQuestOverlay = (npcId) => setNPCOverlay(npcId, 'exclamation', true);
  const setAttackOverlay = (npcId) => setNPCOverlay(npcId, 'attack', true);
  
  return (
    <NPCOverlayContext.Provider value={{ 
      npcOverlays,
      setNPCOverlay,
      clearNPCOverlay,
      getNPCOverlay,
      setBusyOverlay,
      setQuestOverlay,
      setAttackOverlay
    }}>
      {children}
    </NPCOverlayContext.Provider>
  );
};

export const useNPCOverlay = () => useContext(NPCOverlayContext);