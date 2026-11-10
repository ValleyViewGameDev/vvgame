// Shared utility for determining resource overlay status
// Used by both DOM and Canvas rendering systems
import { skillOverlay, offersOverlay, OFFER_BUILDINGS } from './buildingStatus';

export const getResourceOverlayStatus = (
  resource, 
  craftingStatus, 
  tradingStatus, 
  badgeState, 
  electionPhase,
  currentPlayer,
  extra = null // { level, skillsBySource, buildingOffers, inventory, backpack, masterResources } (Utils/buildingStatus.js)
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
  // The Queen's statue once Feste has her song: she can be woken (GameFeatures/Story/gertrudeWaking.js)
  if (resource.type === "Gertrude's Statue" && currentPlayer && !currentPlayer.storyFlags?.gertrudeAwake
      && (currentPlayer.storyFlags?.festeHasSong || (currentPlayer.completedQuests || []).some((q) => q?.questId === 'If Music Be the Food of Love'))) {
    return { type: 'ready', priority: 1 };
  }

  if (badgeState?.mailbox && resource.type === 'Mailbox') {
    return { type: 'ready', priority: 1 };
  }
  
  
  // Courthouse/Election status: a sign for each phase (owner 2026-11-10); the clock is the
  // cooldown between elections (Administration, and the minute of Counting)
  if (resource.type === 'Courthouse') {
    if (electionPhase === 'Campaigning') return { type: 'campaign', priority: 3 };
    if (electionPhase === 'Voting') return { type: 'voting', priority: 1 };
    if (electionPhase === 'Administration' || electionPhase === 'Counting') return { type: 'cooldown', priority: 4 };
  }

  if (extra) {
    // Bank, Caravan, Harvest Festival: once the level unlocks them, ? for open offers, ✅ when one can be paid
    const offerKey = OFFER_BUILDINGS[resource.type];
    if (offerKey) {
      const row = extra.masterResources?.find((r) => r.type === resource.type);
      if (!row?.level || extra.level >= row.level) {
        const type = offersOverlay(extra.buildingOffers?.[offerKey], extra.inventory, extra.backpack);
        if (type) return { type, priority: type === 'ready' ? 1 : 3 };
      }
    }
    // A skill the player can take here now: the green ? when they can also pay for one
    const skillType = extra.skillsBySource && skillOverlay(resource.type, extra.skillsBySource, currentPlayer, extra.level, extra.inventory, extra.backpack);
    if (skillType) return { type: skillType, priority: skillType === 'question-ready' ? 2 : 3 };
  }

  // No overlay needed
  return null;
};

// Mapping from overlay types to SVG files
export const OVERLAY_SVG_MAPPING = {
  'ready': 'checkmark.svg',
  'completed': 'checkmark.svg', 
  // campaign and voting have no painted art yet: their emoji below draws them
  'inprogress': 'clock.svg',
  'cooldown': 'clock.svg',
  'available': 'hand.svg',
  'question': 'question.svg',
  'question-ready': 'question-green.svg', // a skill here is open AND affordable (checkmark green)
};

// Mapping from overlay types to emoji (for DOM fallback)
export const OVERLAY_EMOJI_MAPPING = {
  'ready': { emoji: '✅', color: 'green' },
  'completed': { emoji: '✅', color: '#32CD32' },
  'voting': { emoji: '🗳️', color: 'green' },
  'inprogress': { emoji: '🕑', color: 'orange' },
  'cooldown': { emoji: '🕑', color: 'orange' },
  'campaign': { emoji: '📣', color: '#FFD700' },
  'available': { emoji: '👋', color: '#FFD700' },
  'question': { emoji: '❓', color: '#f2b705' },
  'question-ready': { emoji: '❓', color: 'green' },
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

  // Check for graze NPCs (farm animals) that are ready for collection. collectPending: tapped,
  // the server is confirming; the ✅ goes at once (NPCUtils.handleProtectedFarmAnimalCollection)
  if (npc.action === 'graze' && npc.state === 'processing' && !npc.collectPending) {
    const currentTime = Date.now();
    if (npc.grazeEnd && currentTime >= npc.grazeEnd) {
      return { type: 'ready', priority: 1 };
    }
  }

  return null;
};