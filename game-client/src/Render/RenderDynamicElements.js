import { getLocalizedString } from '../Utils/stringLookup';
import questCache from '../Utils/QuestCache';

/**
 * Generate tooltip content for a resource - shared between Canvas and DOM
 */
export function generateResourceTooltip(resource, strings, timers = null) {
  if (!resource || resource.category === 'doober' || resource.category === 'source') return '';

  const lines = [];
  const currentTime = Date.now();
  const localizedResourceType = getLocalizedString(resource.type, strings);

  // Special handling for Dungeon Entrance
  if (resource.type === 'Dungeon Entrance' && timers?.dungeon) {
    lines.push(`<p>${localizedResourceType}</p>`);
    
    const dungeonEndTime = timers.dungeon.endTime;
    
    if (dungeonEndTime) {
      const remainingTime = Math.max(0, dungeonEndTime - currentTime);
      
      // Determine actual phase based on whether timer has expired
      let actualPhase = timers.dungeon.phase;
      if (currentTime >= dungeonEndTime) {
        // Timer expired - phase should switch
        actualPhase = timers.dungeon.phase === 'open' ? 'resetting' : 'open';
      }
      
      const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
      
      const parts = [];
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
      const timeString = parts.join(' ');
      
      if (actualPhase === 'open') {
        lines.push(`<p>Open - Resets in ${timeString}</p>`);
      } else if (actualPhase === 'resetting') {
        lines.push(`<p>Closed - Opens in ${timeString}</p>`);
      }
    } else {
      // Fallback if no timer data
      lines.push(`<p>${timers.dungeon.phase === 'open' ? 'Open' : 'Closed'}</p>`);
    }
    
    return lines.join('');
  }

  switch (resource.category) {
    case 'farmplot':
      lines.push(`<p>${localizedResourceType}</p>`);
      if (resource.growEnd) {
        const remainingTime = Math.max(0, resource.growEnd - currentTime);
        const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
        if (remainingTime > 0) {
          const parts = [];
          if (days > 0) parts.push(`${days}d`);
          if (hours > 0) parts.push(`${hours}h`);
          if (minutes > 0) parts.push(`${minutes}m`);
          if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
          lines.push(`<p>${parts.join(' ')} remaining</p>`);
        }
      }
      break;

    case 'crafting':
      lines.push(`<p>${localizedResourceType}</p>`);
      if (resource.craftEnd) {
        const remainingTime = Math.max(0, resource.craftEnd - currentTime);
        const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
        if (remainingTime > 0) {
          const parts = [];
          if (days > 0) parts.push(`${days}d`);
          if (hours > 0) parts.push(`${hours}h`);
          if (minutes > 0) parts.push(`${minutes}m`);
          if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
          lines.push(`<p>⏳ ${parts.join(' ')} remaining</p>`);
        }
      }
      break;

    default:
      lines.push(`<p>${localizedResourceType}</p>`);
      break;
  }

  return lines.join('');
}

/**
 * Generate tooltip content for NPCs - shared between Canvas and DOM
 */
export function generateNPCTooltip(npc, strings) {
  const localizedNPCType = getLocalizedString(npc.type, strings);
  let tooltipContent = `<p>${localizedNPCType}</p>`;

  switch (npc.action) {
    case 'graze': {
      switch (npc.state) {
        case 'processing':
          tooltipContent = `<p>${localizedNPCType}</p><p>is ready.</p>`;
          break;
        case 'hungry': {
          const lookingFor = npc.type === 'Pig' ? 'dirt' : 'grass';
          tooltipContent = `<p>${localizedNPCType}</p><p>is hungry and</p><p>looking for ${lookingFor}.</p>`;
          break;
        }
        case 'grazing': {
          let countdownText = "";
          if (npc.grazeEnd) {
            const remainingTime = Math.max(0, npc.grazeEnd - Date.now());
            const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
            countdownText = `<p>${minutes}m ${seconds}s</p>`;
          }
          tooltipContent = `<p>${localizedNPCType}</p><p>is grazing.</p>${countdownText}`;
          break;
        }
        case 'idle':
          tooltipContent = `<p>Zzzz...</p>`;
          break;
        case 'roam':
          tooltipContent = `<p>${localizedNPCType}</p><p>is roaming.</p>`;
          break;
        case 'stall':
          tooltipContent = `<p>${localizedNPCType}</p><p>is looking for an Animal Stall.</p>`;
          break;
        default:
          tooltipContent = `<p>${localizedNPCType}</p>`;
          break;
      }
      break;
    }
    case 'quest':
      if (npc.type === 'Kent') {
        tooltipContent = `<p>${localizedNPCType}</p><p>"${strings?.[47] || 'I have special offers!'}"</p>`;
      } else {
        tooltipContent = `<p>${localizedNPCType}</p><p>"${strings?.[48] || 'I might have work for you.'}"</p>`;
      }
      break;
    case 'attack':
    case 'spawn':
      tooltipContent = `<p>${localizedNPCType}</p><p>HP: ${npc.hp}/${npc.maxhp}</p>`;
      // Add state info for enemy NPCs
      if (npc.state) {
        tooltipContent += `<p>State: ${npc.state}</p>`;
      }
      break;
    default:
      tooltipContent = `<p>${npc.type}</p>`;
      break;
  }

  return tooltipContent;
}

/**
 * Generate tooltip content for PCs - shared between Canvas and DOM
 */
export function generatePCTooltip(pc, strings) {
  const username = pc.username || 'Anonymous';
  let content = `<p>${username}</p><p>❤️‍🩹 HP: ${pc.hp}</p>`;
  if (pc.iscamping) content += `<p>🏕️ Camping</p>`;
  if (pc.isinboat) content += `<p>🛶 In a boat</p>`;
  
  return content;
}

/**
 * Check quest NPC status - shared logic for overlays
 */
export const checkQuestNPCStatus = async (npc, currentPlayer) => {
  if (!currentPlayer) return null;
  
  try {
    // Use cached quests instead of direct API call
    const allQuests = await questCache.getQuests();
    
    // Use same filtering logic as NPCPanel
    let npcQuests = allQuests
      .filter((quest) => quest.giver === npc.type)
      .filter((quest) => {
        const activeQuest = currentPlayer.activeQuests?.find(q => q.questId === quest.title);
        if (activeQuest) {
          return activeQuest.completed && !activeQuest.rewardCollected;
        }
        return (quest.repeatable === true || quest.repeatable === 'true') || !currentPlayer.completedQuests?.some(q => q.questId === quest.title);
      });

    // Check if any quests have completed rewards to collect
    const hasCompletedQuests = npcQuests.some(quest => {
      const activeQuest = currentPlayer.activeQuests?.find(q => q.questId === quest.title);
      return activeQuest && activeQuest.completed && !activeQuest.rewardCollected;
    });

    let status = null;
    if (hasCompletedQuests) {
      status = 'completed'; // Show checkmark
    } else if (npcQuests.length > 0) {
      status = 'available'; // Show question mark/hand
    }
    
    return status;
  } catch (error) {
    console.error('Error checking quest NPC status:', error);
    return null;
  }
};

/**
 * Check trade NPC status - shared logic for overlays
 */
export const checkTradeNPCStatus = (npc, masterResources) => {
  if (!npc.symbol || !masterResources) return null;
  
  const tradeResource = masterResources.find(r => 
    r.category === 'trader' && r.symbol === npc.symbol
  );
  
  if (!tradeResource) return null;
  
  // Trade NPCs show their trade item symbol as the overlay
  return tradeResource.input;
};

/**
 * Check Kent NPC status - shared logic for overlays
 */
export const checkKentNPCStatus = (npc, currentPlayer) => {
  if (npc.type !== 'Kent' || !currentPlayer) return null;

  try {
    const kentOffers = currentPlayer?.kentOffers?.offers || [];
    const now = Date.now();
    // Kent's own timer (set when offers refresh) and the per-card cooldowns Kent.js keeps in localStorage.
    if ((currentPlayer?.kentOffers?.endTime || 0) > now) return null;
    let cardCooldowns = {};
    try { cardCooldowns = JSON.parse(localStorage.getItem(`kentCardCooldowns_${currentPlayer?.playerId || currentPlayer?._id}`) || '{}'); } catch (_) { cardCooldowns = {}; }

    // Check if player can afford any of Kent's offers that are not cooling down
    const canAffordAny = kentOffers.some((offer, index) => {
      if ((cardCooldowns[index] || 0) > now) return false;
      // Handle multi-item offers (items array with multiple items)
      if (offer.items && offer.items.length > 0) {
        // Must be able to afford ALL items in the offer
        return offer.items.every(item => {
          const inventoryQty = currentPlayer?.inventory?.find(i => i.type === item.item)?.quantity || 0;
          const backpackQty = currentPlayer?.backpack?.find(i => i.type === item.item)?.quantity || 0;
          const playerQty = inventoryQty + backpackQty;
          return playerQty >= item.quantity;
        });
      }

      // Legacy single-item offer format
      const inventoryQty = currentPlayer?.inventory?.find(item => item.type === offer.item)?.quantity || 0;
      const backpackQty = currentPlayer?.backpack?.find(item => item.type === offer.item)?.quantity || 0;
      const playerQty = inventoryQty + backpackQty;

      return playerQty >= offer.quantity;
    });

    return canAffordAny ? 'completed' : null;
  } catch (error) {
    console.error('Error checking Kent status:', error);
    return null;
  }
};
