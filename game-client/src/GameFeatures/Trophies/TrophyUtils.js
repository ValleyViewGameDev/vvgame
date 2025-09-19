import axios from 'axios';
import API_BASE from '../../config';
import { showNotification } from '../../UI/Notifications/Notifications';

/**
 * Earns a trophy for the player
 * @param {string} playerId - The player's ID
 * @param {string} trophyName - The name of the trophy to earn (must match trophies.json)
 * @param {number} progressIncrement - For Progress trophies, the amount to increment (default 1)
 * @returns {Promise<Object>} The result of the API call
 */
export async function earnTrophy(playerId, trophyName, progressIncrement = 1) {
    try {
        const response = await axios.post(`${API_BASE}/api/earn-trophy`, {
            playerId,
            trophyName,
            progressIncrement
        });
        
        if (response.data.success) {
            const { trophy, isNewMilestone } = response.data;
            
            if (isNewMilestone) {
                console.log(`🏆 Trophy milestone earned: ${trophyName}`, trophy);
                // Show trophy notification only for new milestones
                showNotification('Trophy', trophy);
            } else {
                console.log(`📈 Trophy progress: ${trophyName} - ${trophy.progress}/${trophy.nextMilestone}`);
            }
            
            return response.data;
        }
        
        return response.data;
    } catch (error) {
        console.error('Error earning trophy:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Checks if this is the player's first farm worker
 * @param {Object} currentPlayer - The current player object
 * @returns {boolean} True if this is the first worker
 */
export function isFirstFarmWorker(currentPlayer) {
    if (!currentPlayer?.npcsInGrid) return true;
    
    // Check all grids for any existing workers
    for (const gridId in currentPlayer.npcsInGrid) {
        const npcs = currentPlayer.npcsInGrid[gridId] || [];
        const hasWorker = npcs.some(npc => 
            npc.action === 'worker' && 
            ['Farmer', 'Farm Hand', 'Rancher', 'Lumberjack', 'Crafter'].includes(npc.type)
        );
        if (hasWorker) return false;
    }
    
    return true;
}