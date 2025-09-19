import axios from 'axios';
import API_BASE from '../../config';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './TrophyNotification.css';

// Global trophy notification manager
let notificationRoot = null;
let notificationTimer = null;

/**
 * Trophy notification component
 */
function TrophyNotification({ trophy, onDismiss }) {
    React.useEffect(() => {
        // Auto-dismiss after 5 seconds
        const timer = setTimeout(() => {
            onDismiss();
        }, 5000);
        
        return () => clearTimeout(timer);
    }, [onDismiss]);
    
    return (
        <div className="trophy-notification">
            <button className="trophy-notification-dismiss" onClick={onDismiss}>×</button>
            <div className="trophy-notification-content">
                <div className="trophy-notification-icon">🏆</div>
                <div className="trophy-notification-text">
                    <div className="trophy-notification-title">Trophy Earned!</div>
                    <div className="trophy-notification-name">{trophy.name}</div>
                    {trophy.progress && trophy.nextMilestone && (
                        <div className="trophy-notification-progress">
                            Progress: {trophy.progress} / {trophy.nextMilestone}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Shows a trophy notification
 * @param {Object} trophy - The trophy data to display
 */
function showTrophyNotification(trophy) {
    // Clear any existing notification
    if (notificationTimer) {
        clearTimeout(notificationTimer);
    }
    
    // Create or reuse the notification container
    let container = document.getElementById('trophy-notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'trophy-notification-container';
        document.body.appendChild(container);
    }
    
    if (!notificationRoot) {
        notificationRoot = ReactDOM.createRoot(container);
    }
    
    const handleDismiss = () => {
        if (notificationRoot) {
            notificationRoot.render(null);
        }
    };
    
    notificationRoot.render(
        <TrophyNotification 
            trophy={trophy} 
            onDismiss={handleDismiss}
        />
    );
}

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
            console.log(`🏆 Trophy earned: ${trophyName}`, response.data.trophy);
            
            // Show trophy notification
            if (response.data.trophy) {
                showTrophyNotification(response.data.trophy);
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