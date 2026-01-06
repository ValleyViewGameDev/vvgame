import { getDerivedRange } from '../../Utils/worldHelpers';
import { getLocalizedString } from '../../Utils/stringLookup';
import { handleNPCClick } from './NPCUtils';
import playersInGridManager from '../../GridState/PlayersInGrid';
import FloatingTextManager from '../../UI/FloatingText';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { isWallBlocking, getLineOfSightTiles } from '../../Utils/GridManagement';

// Shared global attack cooldown for consistency between DOM and Canvas modes
let globalAttackCooldown = 0;


/**
 * Generates tooltip content for NPCs - shared between DOM and Canvas modes
 * This ensures identical tooltip behavior across rendering modes
 */
export function generateNPCTooltipContent(npc, strings) {
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
        tooltipContent = `<p>${localizedNPCType}</p><p>"${strings?.[47] || 'Kent says hi!'}"</p>`;
      } else {
        tooltipContent = `<p>${localizedNPCType}</p><p>"${strings?.[48] || 'I have quests!'}"</p>`;
      }
      break;
    case 'trade':
    case 'heal':
    case 'worker':
      tooltipContent = `<p>${localizedNPCType}</p>`;
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
 * Handles NPC clicks with full parity to DOM mode logic - shared between DOM and Canvas
 * This ensures identical click behavior across rendering modes
 */
export function handleNPCClickShared(npc, {
  currentPlayer,
  playersInGrid,
  gridId,
  TILE_SIZE,
  masterResources,
  masterSkills,
  masterTrophies,
  globalTuning,
  strings,
  // Overlay checking function (optional - only used by DOM mode)
  getNPCOverlay,
  // Event handlers
  onNPCClick,
  setHoverTooltip,
  setInventory,
  setBackpack,
  setResources,
  setCurrentPlayer,
  setModalContent,
  setIsModalOpen,
  updateStatus,
  openPanel,
  setActiveStation
}) {
  // Check if NPC has an overlay that prevents clicking (DOM mode feature)
  if (getNPCOverlay) {
    const overlayData = getNPCOverlay(npc.id);
    if (overlayData && !overlayData.clickable) {
      return false; // Prevent clicking on non-clickable overlay NPCs
    }
  }
  
  // 🛡️ Prevent interaction with NPCs on another player's homestead
  const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
  if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead) {
    return false; // Cannot interact with NPCs on another player's homestead
  }
  
  // Clear any existing tooltip
  if (setHoverTooltip) {
    setHoverTooltip(null);
  }
  
  const currentTime = Date.now();
  
  // Handle attack NPCs with cooldown
  if (npc.action === 'attack' || npc.action === 'spawn') {
    // Get player state from playersInGridManager like Combat.js does
    const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
    const pcState = playersInGrid?.[String(currentPlayer._id)];
    const speed = pcState?.speed ?? 5;
    console.log('⚔️ Attack cooldown check:');
    console.log('  Speed being used:', speed);
    console.log('  pcState?.speed:', pcState?.speed);
    if (currentTime < globalAttackCooldown) {
      return false; // Still on cooldown
    }
    // New cooldown formula: speed 5 = 3.5s, speed 1 = 0.5s
    // Formula: cooldown = 0.5 + (speed - 1) * 0.75
    // This gives us: speed 1 = 0.5s, speed 2 = 1.25s, speed 3 = 2s, speed 4 = 2.75s, speed 5 = 3.5s
    const cooldownSeconds = 0.5 + (speed - 1) * 0.75;
    const cooldownDuration = cooldownSeconds * 1000;
    globalAttackCooldown = currentTime + cooldownDuration;
    console.log(`⚔️ Setting new cooldown: ${cooldownDuration}ms (${cooldownSeconds} seconds for speed ${speed})`);
    // Continue to handleNPCClick below for attack NPCs
  }
  
  // Handle quest/heal/worker/trade NPCs with range checking
  if (npc.action === 'quest' || npc.action === 'heal' || npc.action === 'worker' || npc.action === 'trade') {
    // Check range for helper NPCs (skip on own homestead)
    const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
    const playerPos = playersInGridManager.getPlayerPosition(currentPlayer?.location?.g, String(currentPlayer._id));
    const npcPos = { x: Math.round(npc.position?.x || 0), y: Math.round(npc.position?.y || 0) };

    if (!isOnOwnHomestead && playerPos && typeof playerPos.x === 'number' && typeof playerPos.y === 'number') {
      const distance = Math.sqrt(Math.pow(playerPos.x - npcPos.x, 2) + Math.pow(playerPos.y - npcPos.y, 2));
      const playerRange = getDerivedRange(currentPlayer, masterResources);

      if (distance > playerRange) {
        // Show "Out of range" message
        FloatingTextManager.addFloatingText(24, npcPos.x, npcPos.y, TILE_SIZE);
        return false;
      }

      // Check for walls blocking line of sight
      if (isWallBlocking(playerPos, npcPos)) {
        FloatingTextManager.addFloatingText(40, npcPos.x, npcPos.y, TILE_SIZE); // string[40] for wall blocking
        console.log('Wall blocking interaction from player to NPC');
        return false;
      }
    }
    
    // Use onNPCClick for these special NPCs (opens panels/dialogs)
    if (onNPCClick) {
      onNPCClick(npc);
    }
    return true;
  }
  
  // Use handleNPCClick for all other NPCs (combat, grazing, etc.)
  handleNPCClick(
      npc,
      Math.round(npc.position?.y || 0),
      Math.round(npc.position?.x || 0),
      setInventory,
      setBackpack,
      setResources,
      currentPlayer,
      setCurrentPlayer,
      TILE_SIZE,
      masterResources,
      masterSkills,
      currentPlayer?.location?.g,
      setModalContent,
      setIsModalOpen,
      updateStatus,
      openPanel,
      setActiveStation,
      strings,
      masterTrophies,
      globalTuning
    );
    return true;
}

/**
 * Gets the current attack cooldown status
 */
export function getAttackCooldownStatus() {
  return {
    cooldownEnd: globalAttackCooldown,
    isOnCooldown: Date.now() < globalAttackCooldown
  };
}

/**
 * Determines cursor class for NPC based on action and cooldown status
 */
export function getNPCCursorClass(npc) {
  if (npc.action === 'heal' || npc.action === 'worker' || npc.action === 'trade' || npc.action === 'quest') {
    return 'cursor-help';
  } else if (npc.action === 'attack' || npc.action === 'spawn') {
    // For attack NPCs, check reload status
    const currentTime = Date.now();
    return currentTime < globalAttackCooldown ? 'cursor-wait' : 'cursor-crosshair';
  }
  return 'cursor-pointer';
}

/**
 * Sets the shared global attack cooldown (used by DOM mode to sync with shared state)
 */
export function setGlobalAttackCooldown(cooldownEnd) {
  globalAttackCooldown = cooldownEnd;
}