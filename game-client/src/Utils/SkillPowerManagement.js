import axios from 'axios';
import API_BASE from '../config';
import { refreshPlayerAfterInventoryUpdate } from './InventoryManagement';
import { trackQuestProgress } from '../GameFeatures/Quests/QuestGoalTracker';
import { earnTrophy } from '../GameFeatures/Trophies/TrophyUtils';
import { incrementFTUEStep } from '../GameFeatures/FTUE/FTUE';
import playersInGridManager from '../GridState/PlayersInGrid';
import { getLocalizedString } from './stringLookup';

/**
 * Shared utility for adding skills, upgrades, or powers to a player
 * Handles all the necessary API calls and state updates
 * 
 * @param {Object} params - Parameters object
 * @param {Object} params.item - The skill/upgrade/power resource object to add
 * @param {Object} params.currentPlayer - Current player object
 * @param {Function} params.setCurrentPlayer - Function to update player state
 * @param {Function} params.updateStatus - Function to update status bar
 * @param {Object} params.strings - Localized strings object
 * @param {string} params.gridId - Current grid ID (needed for combat stats)
 * @param {number} params.quantity - Quantity to add (default 1)
 * @returns {Promise<boolean>} - Success status
 */
export async function gainSkillOrPower({
  item,
  currentPlayer,
  setCurrentPlayer,
  updateStatus,
  strings,
  gridId,
  quantity = 1
}) {
  try {
    if (!item || !item.type || !item.category) {
      console.error('Invalid item provided to gainSkillOrPower:', item);
      return false;
    }

    console.log(`🎯 Adding ${item.category}: ${item.type} x${quantity}`);

    // Handle different categories
    if (item.category === 'skill' || item.category === 'upgrade') {
      // Skills and upgrades are stored together in the skills array
      const currentSkills = currentPlayer.skills || [];
      const updatedSkills = [...currentSkills];
      
      // Check if already owned
      const existingIndex = updatedSkills.findIndex(s => s.type === item.type);
      if (existingIndex >= 0) {
        // Update quantity if already owned
        updatedSkills[existingIndex].quantity = (updatedSkills[existingIndex].quantity || 1) + quantity;
      } else {
        // Add new skill/upgrade
        updatedSkills.push({ 
          type: item.type, 
          category: item.category, 
          quantity: quantity 
        });
      }

      // Update on server
      await axios.post(`${API_BASE}/api/update-skills`, {
        playerId: currentPlayer.playerId,
        skills: updatedSkills
      });

      // Update local state
      setCurrentPlayer(prev => ({
        ...prev,
        skills: updatedSkills
      }));

      // Track quest progress
      await trackQuestProgress(currentPlayer, 'Gain skill with', item.type, quantity, setCurrentPlayer);
      
      // Earn trophy for skills
      if (item.category === 'skill') {
        await earnTrophy(currentPlayer.playerId, 'Skill Builder', 1);
      }

      // Check for FTUE progress (Axe skill)
      if (currentPlayer.firsttimeuser === true && item.type === 'Axe') {
        console.log('🎓 First-time user acquired Axe skill, advancing FTUE step');
        await incrementFTUEStep(currentPlayer.playerId, currentPlayer, setCurrentPlayer);
      }

      updateStatus(`💪 ${getLocalizedString(item.type, strings)} ${item.category} acquired!`);

    } else if (item.category === 'power') {
      // Powers are stored separately
      const currentPowers = currentPlayer.powers || [];
      const updatedPowers = [...currentPowers];
      
      // Check if already owned
      const existingIndex = updatedPowers.findIndex(p => p.type === item.type);
      if (existingIndex >= 0) {
        updatedPowers[existingIndex].quantity = (updatedPowers[existingIndex].quantity || 1) + quantity;
      } else {
        updatedPowers.push({ 
          type: item.type, 
          quantity: quantity 
        });
      }

      // Update on server
      await axios.post(`${API_BASE}/api/update-powers`, {
        playerId: currentPlayer.playerId,
        powers: updatedPowers
      });

      // Update local state
      setCurrentPlayer(prev => ({
        ...prev,
        powers: updatedPowers
      }));

      // Handle combat stat modifications if the power has output
      if (item.output && typeof item.qtycollected === 'number') {
        if (item.output === 'range') {
          // Range is stored on the player document
          const updatedRange = (currentPlayer.range || 0) + item.qtycollected;
          
          await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { range: updatedRange }
          });

          // Update local player state and localStorage
          const updatedPlayer = {
            ...currentPlayer,
            range: updatedRange
          };
          setCurrentPlayer(updatedPlayer);
          localStorage.setItem('player', JSON.stringify(updatedPlayer));
          
          console.log(`🎯 Updated range on player document: ${updatedRange}`);
        } else {
          // Other combat stats updated in playersInGrid
          const gridPlayer = playersInGridManager.getAllPCs(gridId)?.[currentPlayer.playerId];
          if (gridPlayer) {
            const oldValue = gridPlayer[item.output] || 0;
            const newValue = oldValue + item.qtycollected;
            
            await playersInGridManager.updatePC(gridId, currentPlayer.playerId, {
              [item.output]: newValue
            });
            
            console.log(`🧠 Updated ${item.output} for player ${currentPlayer.playerId}: ${oldValue} -> ${newValue}`);
          }
        }
      }

      updateStatus(`⚡ ${getLocalizedString(item.type, strings)} power acquired!`);

    } else {
      console.error('Unknown item category:', item.category);
      return false;
    }

    // Refresh player data to ensure consistency
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

    return true;

  } catch (error) {
    console.error('Error in gainSkillOrPower:', error);
    updateStatus(`Failed to acquire ${item.type}`);
    return false;
  }
}

/**
 * Check if player has a specific skill, upgrade, or power
 * @param {Object} player - Player object
 * @param {string} requirementType - Type of skill/upgrade/power to check for
 * @returns {boolean}
 */
export function hasSkillOrPower(player, requirementType) {
  if (!requirementType) return true;
  
  return (
    player.skills?.some(skill => skill.type === requirementType) ||
    player.powers?.some(power => power.type === requirementType)
  );
}