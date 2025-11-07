import React, { useCallback } from 'react';
import { RenderDynamicElementsCanvas } from './RenderDynamicElementsCanvas';
import { getLocalizedString } from '../Utils/stringLookup';
import questCache from '../Utils/QuestCache';

/**
 * Generate tooltip content for a resource - shared between Canvas and DOM
 */
export function generateResourceTooltip(resource, strings) {
  if (!resource || resource.category === 'doober' || resource.category === 'source') return '';

  const lines = [];
  const currentTime = Date.now();
  const localizedResourceType = getLocalizedString(resource.type, strings);

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
          lines.push(`<p>🌱 ${parts.join(' ')} remaining</p>`);
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

    // Apply FTUE filtering for first-time users
    if (currentPlayer.firsttimeuser === true) {
      npcQuests = npcQuests.filter((quest) => {
        const hasFtuestep = quest.ftuestep != null && 
                           quest.ftuestep !== undefined && 
                           quest.ftuestep !== '' && 
                           quest.ftuestep !== 0;
        
        if (!hasFtuestep) {
          return false;
        } else if (quest.ftuestep > (currentPlayer.ftuestep || 0)) {
          return false;
        } else {
          return true;
        }
      });
    }

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
    
    // Check if player can afford any of Kent's offers
    const canAffordAny = kentOffers.some(offer => {
      // Calculate player's total quantity from inventory and backpack
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

/**
 * Main dynamic elements rendering component - FORCED TO CANVAS MODE ONLY
 * Handles tooltips, overlays, badges, attack ranges, VFX, etc.
 */
export const RenderDynamicElements = ({ 
  // Grid data
  resources,
  npcs,
  pcs,
  
  // Status data for overlays
  badgeState,
  electionPhase,
  currentPlayer,
  masterResources,
  
  // UI state
  hoverTooltip,
  setHoverTooltip,
  
  // Click handlers
  handleTileClick,
  onNPCClick,
  onPCClick,
  
  // Configuration
  TILE_SIZE,
  strings,
  
  // Additional props for NPC interactions
  setInventory,
  setBackpack,
  setResources,
  setCurrentPlayer,
  masterSkills,
  masterTrophies,
  setModalContent,
  setIsModalOpen,
  updateStatus,
  openPanel,
  setActiveStation,
  globalTuning,
  gridId
}) => {
  // Calculate crafting and trading status for dynamic overlays
  const currentTime = Date.now();
  
  const craftingStatus = React.useMemo(() => {
    if (!resources) return { ready: [], searching: [], hungry: [] };
    
    return resources.reduce((acc, res) => {
      if ((res.category === 'crafting' || res.category === 'farmhouse') && res.craftEnd) {
        const key = `${res.x}-${res.y}`;
        if (res.craftEnd < currentTime) {
          acc.ready.push(key);
        }
      } else if (res.category === 'farmplot' && res.isSearching) {
        const key = `${res.x}-${res.y}`;
        acc.searching.push(key);
      } else if (res.category === 'farmplot' && res.growEnd) {
        const key = `${res.x}-${res.y}`;
        if (res.growEnd < currentTime) {
          acc.ready.push(key);
        }
      } else if (res.category === 'pet' && res.needsFeeding) {
        const key = `${res.x}-${res.y}`;
        if (res.foodTimer < currentTime) {
          acc.hungry.push(key);
        }
      }
      return acc;
    }, { ready: [], searching: [], hungry: [] });
  }, [resources, currentTime]);

  // Check for completed trades at Trading Post
  const tradingStatus = React.useMemo(() => {
    if (!resources || !currentPlayer?.tradeStall) return { completed: [] };
    
    return resources.reduce((acc, res) => {
      if (res.type === 'Trading Post' && currentPlayer.tradeStall) {
        const hasCompletedTrades = currentPlayer.tradeStall.some(trade => 
          trade && (
            (trade.sellTime && new Date(trade.sellTime) < currentTime) ||
            (trade.boughtBy !== null && trade.boughtBy !== undefined)
          )
        );
        if (hasCompletedTrades) {
          const key = `${res.x}-${res.y}`;
          acc.completed.push(key);
        }
      }
      return acc;
    }, { completed: [] });
  }, [resources, currentPlayer?.tradeStall, currentTime]);

  // FORCED TO CANVAS MODE - no decision tree
  return (
    <RenderDynamicElementsCanvas
        resources={resources}
        npcs={npcs}
        pcs={pcs}
        craftingStatus={craftingStatus}
        tradingStatus={tradingStatus}
        badgeState={badgeState}
        electionPhase={electionPhase}
        currentPlayer={currentPlayer}
        masterResources={masterResources}
        hoverTooltip={hoverTooltip}
        setHoverTooltip={setHoverTooltip}
        handleTileClick={handleTileClick}
        onNPCClick={onNPCClick}
        onPCClick={onPCClick}
        TILE_SIZE={TILE_SIZE}
        strings={strings}
        generateResourceTooltip={generateResourceTooltip}
        generateNPCTooltip={generateNPCTooltip}
        generatePCTooltip={generatePCTooltip}
        checkQuestNPCStatus={checkQuestNPCStatus}
        checkTradeNPCStatus={checkTradeNPCStatus}
        checkKentNPCStatus={checkKentNPCStatus}
        // Additional props for NPC interactions
        setInventory={setInventory}
        setBackpack={setBackpack}
        setResources={setResources}
        setCurrentPlayer={setCurrentPlayer}
        masterSkills={masterSkills}
        masterTrophies={masterTrophies}
        setModalContent={setModalContent}
        setIsModalOpen={setIsModalOpen}
        updateStatus={updateStatus}
        openPanel={openPanel}
        setActiveStation={setActiveStation}
        globalTuning={globalTuning}
        gridId={gridId}
    />
  );
};

export default RenderDynamicElements;