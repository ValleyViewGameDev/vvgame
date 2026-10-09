import { getDerivedRange } from '../../Utils/worldHelpers';
import { getLocalizedString } from '../../Utils/stringLookup';
import { handleNPCClick } from './NPCUtils';
import playersInGridManager from '../../GridState/PlayersInGrid';
import FloatingTextManager from '../../UI/FloatingText';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { isWallBlocking } from '../../Utils/GridManagement';
import { getAttackCooldownStatus } from '../Combat/Combat';

// Shared global attack cooldown for consistency between DOM and Canvas modes


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
  setActiveStation,
  // Developer bypass for homestead restrictions
  isDeveloper = false
}) {
  // Check if NPC has an overlay that prevents clicking (DOM mode feature)
  if (getNPCOverlay) {
    const overlayData = getNPCOverlay(npc.id);
    if (overlayData && !overlayData.clickable) {
      return false; // Prevent clicking on non-clickable overlay NPCs
    }
  }

  // 🛡️ Prevent interaction with NPCs on another player's homestead (unless developer)
  const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
  if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead && !isDeveloper) {
    return false; // Cannot interact with NPCs on another player's homestead
  }
  
  // Clear any existing tooltip
  if (setHoverTooltip) {
    setHoverTooltip(null);
  }
  
  // Attack NPCs: reach, cooldown and feedback are Combat.handleAttackOnNPC's (below, via handleNPCClick)

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
      if (isWallBlocking(playerPos, npcPos, { trees: true })) {
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
 * Attack cooldown status (owned by GameFeatures/Combat/Combat.js)
 */
export { getAttackCooldownStatus } from '../Combat/Combat';

/**
 * Cursor class for an NPC by action (combat cursor reflects the swing cooldown)
 */
export function getNPCCursorClass(npc) {
  if (npc.action === 'heal' || npc.action === 'worker' || npc.action === 'trade' || npc.action === 'quest') {
    return 'cursor-help';
  } else if (npc.action === 'attack' || npc.action === 'spawn') {
    return getAttackCooldownStatus().isOnCooldown ? 'cursor-wait' : 'cursor-crosshair';
  }
  return 'cursor-pointer';
}
