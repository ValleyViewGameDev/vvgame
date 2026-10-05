// Shared utility for determining resource overlay status
// Used by both DOM and Canvas rendering systems

export const getResourceOverlayStatus = (
  resource, 
  craftingStatus, 
  tradingStatus, 
  badgeState, 
  electionPhase,
  currentPlayer
) => {
  if (!resource) return null;

  const resourceKey = `${resource.x}-${resource.y}`;
  const currentTime = Date.now();
  
  // Check various status conditions
  const isCraftReady = craftingStatus?.ready?.includes(resourceKey);
  const isCraftInProgress = craftingStatus?.inProgress?.includes(resourceKey);
  const isTradingReady = tradingStatus?.ready?.includes(resourceKey);
  
  // Determine overlay type based on priority (most important first)
  
  // Crafting status (highest priority)
  if (isCraftReady) {
    return { type: 'ready', priority: 1 };
  }
  
  if (isCraftInProgress) {
    return { type: 'inprogress', priority: 2 };
  }
  
  // Trade Stall: a sale to collect or a listing ready to sell (PixiRenderer computes the keys)
  if (isTradingReady && (resource.type === 'Trading Post' || resource.type === 'Trade Stall' || resource.type === 'Trade')) {
    return { type: 'ready', priority: 1 };
  }
  
  // Mailbox status
  if (badgeState?.mailbox && resource.type === 'Mailbox') {
    return { type: 'ready', priority: 1 };
  }
  
  
  // Courthouse/Election status
  if (resource.type === 'Courthouse') {
    if (electionPhase === 'Campaigning') {
      return { type: 'campaign', priority: 3 };
    } else if (electionPhase === 'Voting') {
      return { type: 'voting', priority: 1 };
    }
  }
  
  // No overlay needed
  return null;
};

// Mapping from overlay types to SVG files
export const OVERLAY_SVG_MAPPING = {
  'ready': 'checkmark.svg',
  'completed': 'checkmark.svg', 
  'voting': 'checkmark.svg',
  'inprogress': 'clock.svg',
  'campaign': 'clock.svg',
  'available': 'hand.svg',
};

// Mapping from overlay types to emoji (for DOM fallback)
export const OVERLAY_EMOJI_MAPPING = {
  'ready': { emoji: '✅', color: 'green' },
  'completed': { emoji: '✅', color: '#32CD32' },
  'voting': { emoji: '✅', color: 'green' },
  'inprogress': { emoji: '🕑', color: 'orange' },
  'campaign': { emoji: '🕐', color: '#FFD700' },
  'available': { emoji: '👋', color: '#FFD700' },
  'exclamation': { emoji: '❗', color: '#FF6B35' },
  'attack': { emoji: '⚔️', color: '#DC143C' },
};

/**
 * Determine overlay status for NPCs (e.g., farm animals ready for collection)
 * @param {Object} npc - The NPC object
 * @returns {Object|null} - Overlay info with type and priority, or null if no overlay needed
 */
export const getNPCOverlayStatus = (npc) => {
  if (!npc) return null;

  // Check for graze NPCs (farm animals) that are ready for collection
  if (npc.action === 'graze' && npc.state === 'processing') {
    const currentTime = Date.now();
    if (npc.grazeEnd && currentTime >= npc.grazeEnd) {
      return { type: 'ready', priority: 1 };
    }
  }

  return null;
};