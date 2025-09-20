import axios from 'axios';
import API_BASE from '../../config';
import { showNotification } from '../../UI/Notifications/Notifications';

/**
 * Earns a trophy for the player
 * @param {string} playerId - The player's ID
 * @param {string} trophyName - The name of the trophy to earn (must match trophies.json)
 * @param {number} progressIncrement - For Progress trophies, the amount to increment (default 1)
 * @param {Object} currentPlayer - The current player object (optional, for Event trophy checking)
 * @param {Array} masterTrophies - The master trophies list (optional, for Event trophy checking)
 * @returns {Promise<Object>} The result of the API call
 */
export async function earnTrophy(playerId, trophyName, progressIncrement = 1, currentPlayer = null, masterTrophies = null) {
    try {
        // If we have currentPlayer and masterTrophies, check if this is an Event trophy that's already earned
        if (currentPlayer && masterTrophies) {
            const trophyDef = masterTrophies.find(t => t.name === trophyName);
            if (trophyDef && trophyDef.type === 'Event') {
                // Check if player already has this Event trophy
                const hasEventTrophy = currentPlayer.trophies?.some(t => t.name === trophyName);
                if (hasEventTrophy) {
                    console.log(`⚠️ Player already has Event trophy: ${trophyName}`);
                    return { success: false, message: 'Trophy already earned' };
                }
            }
        }
        
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