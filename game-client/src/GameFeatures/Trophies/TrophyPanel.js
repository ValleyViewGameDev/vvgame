import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import '../../UI/Panel.css';
import './TrophyPanel.css'; 
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { gainIngredients } from '../../Utils/InventoryManagement';
import FloatingTextManager from '../../UI/FloatingText';


function TrophyPanel({ onClose, masterResources, masterTrophies, currentPlayer, setCurrentPlayer, updateStatus, openPanel, setActiveStation, inventory, setInventory, backpack, setBackpack }) {

    const strings = useStrings();
    const [trophies, setTrophies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [collecting, setCollecting] = useState(null); // Track which trophy is being collected
    
    useEffect(() => {
        // Fetch trophies when panel opens
        const fetchTrophies = async () => {
            try {
                setLoading(true);
                const response = await axios.get(`${API_BASE}/api/player/${currentPlayer.playerId}/trophies`);
                if (response.data.success) {
                    setTrophies(response.data.trophies || []);
                }
            } catch (error) {
                console.error('Error fetching trophies:', error);
                updateStatus('Failed to load trophies');
            } finally {
                setLoading(false);
            }
        };
        
        if (currentPlayer?.playerId) {
            fetchTrophies();
        }
    }, [currentPlayer?.playerId]);
    
    // Handle collecting trophy reward
    const handleCollectReward = async (trophyName) => {
        try {
            setCollecting(trophyName);
            
            const response = await axios.post(`${API_BASE}/api/collect-trophy-reward`, {
                playerId: currentPlayer.playerId,
                trophyName: trophyName
            });
            
            if (response.data.success) {
                const { gemReward, inventory } = response.data;
                
                // Update inventory from server response
                if (inventory) {
                    setInventory(inventory);
                    setCurrentPlayer(prev => ({ ...prev, inventory }));
                }
                
                // Update local trophy state to mark as collected
                setTrophies(prevTrophies => 
                    prevTrophies.map(t => 
                        t.name === trophyName ? { ...t, collected: true } : t
                    )
                );
                
                FloatingTextManager.addFloatingText(`+${gemReward} 💎`, window.innerWidth / 2, window.innerHeight / 2, 64);
                updateStatus(`💎 Earned ${gemReward} Gem${gemReward > 1 ? 's' : ''} from your trophy`);
            } else {
                updateStatus(response.data.message || 'Failed to collect reward');
            }
        } catch (error) {
            console.error('Error collecting trophy reward:', error);
            updateStatus('Failed to collect trophy reward');
        } finally {
            setCollecting(null);
        }
    };

    // Helper function to get progress info
    const getProgressInfo = (trophyDef, playerTrophy) => {
        if (!trophyDef.progress || trophyDef.progress.length === 0) return null;
        
        const currentProgress = playerTrophy?.progress || 0;
        const progressArray = trophyDef.progress;
        
        // Find last achieved milestone and next milestone
        let lastAchievedMilestone = null;
        let lastMilestone = 0; // For progress bar calculation
        let nextMilestone = progressArray[0];
        
        for (let i = 0; i < progressArray.length; i++) {
            if (currentProgress >= progressArray[i]) {
                // This milestone has been achieved
                lastAchievedMilestone = progressArray[i];
                lastMilestone = progressArray[i];
                // Look for next milestone
                if (i + 1 < progressArray.length) {
                    nextMilestone = progressArray[i + 1];
                } else {
                    // Max milestone reached
                    nextMilestone = progressArray[i];
                }
            } else {
                // Found the next milestone to achieve
                nextMilestone = progressArray[i];
                break;
            }
        }
        
        // For display, we show progress between current milestone boundaries
        const progressBetweenMilestones = currentProgress - lastMilestone;
        const milestoneDifference = nextMilestone - lastMilestone;
        const percentage = milestoneDifference > 0 ? (progressBetweenMilestones / milestoneDifference) * 100 : 100;
        
        return {
            current: currentProgress,
            lastAchievedMilestone, // The actual milestone number to display on icon
            lastMilestone, // For progress bar calculation
            nextMilestone,
            percentage: Math.min(100, Math.max(0, percentage)),
            displayText: `${currentProgress} / ${nextMilestone}`,
            hasAchievedAll: currentProgress >= progressArray[progressArray.length - 1]
        };
    };

    return (
        <Panel onClose={onClose} descriptionKey="1035" titleKey="1135" panelName="TrophyPanel">
            
            <div className="trophy-container">
                {loading ? (
                    <div className="loading">Loading trophies...</div>
                ) : (
                    <div className="trophy-grid">
                        {masterTrophies?.sort((a, b) => {
                            // Sort trophies by status:
                            // 1. Earned but not collected (highest priority)
                            // 2. Earned and collected
                            // 3. Not earned (lowest priority)
                            
                            const playerTrophyA = trophies.find(t => t.name === a.name);
                            const playerTrophyB = trophies.find(t => t.name === b.name);
                            
                            const isEarnedA = !!playerTrophyA;
                            const isEarnedB = !!playerTrophyB;
                            
                            const hasUncollectedRewardA = isEarnedA && playerTrophyA?.collected === false;
                            const hasUncollectedRewardB = isEarnedB && playerTrophyB?.collected === false;
                            
                            // If both have uncollected rewards, maintain original order
                            if (hasUncollectedRewardA && hasUncollectedRewardB) return 0;
                            // If only A has uncollected reward, A comes first
                            if (hasUncollectedRewardA && !hasUncollectedRewardB) return -1;
                            // If only B has uncollected reward, B comes first
                            if (!hasUncollectedRewardA && hasUncollectedRewardB) return 1;
                            
                            // Neither has uncollected rewards, check if earned
                            // If both are earned and collected, maintain original order
                            if (isEarnedA && isEarnedB) return 0;
                            // If only A is earned, A comes first
                            if (isEarnedA && !isEarnedB) return -1;
                            // If only B is earned, B comes first
                            if (!isEarnedA && isEarnedB) return 1;
                            
                            // Neither is earned, maintain original order
                            return 0;
                        }).map((trophyDef, index) => {
                            // Find if player has earned this trophy
                            const playerTrophy = trophies.find(t => t.name === trophyDef.name);
                            const isEarned = !!playerTrophy;
                            const progressInfo = trophyDef.type === 'Progress' ? getProgressInfo(trophyDef, playerTrophy) : null;
                            const hasUncollectedReward = isEarned && playerTrophy?.collected === false;
                            const isCollecting = collecting === trophyDef.name;
                            
                            return (
                                <div 
                                    key={index} 
                                    className={`trophy-card ${!isEarned ? 'unearned' : ''} trophy-${(trophyDef.type || 'Event').toLowerCase()}`}
                                    data-tooltip={trophyDef.tooltip || ''}
                                >
                                    <div className="trophy-icon-wrapper">
                                        <div className="trophy-icon">🏆</div>
                                        {isEarned && trophyDef.type === 'Progress' && progressInfo?.lastAchievedMilestone && (
                                            <div className="progress-number">{progressInfo.lastAchievedMilestone}</div>
                                        )}
                                    </div>
                                    <div className="trophy-content">
                                        <div className="trophy-name">
                                            {getLocalizedString(trophyDef.name, strings)}
                                        </div>
                                        {trophyDef.type === 'Progress' && progressInfo && (
                                            <div className="trophy-progress">
                                                <div className="progress-text">
                                                    {progressInfo.displayText}
                                                </div>
                                                <div className="progress-bar">
                                                    <div 
                                                        className="progress-fill" 
                                                        style={{
                                                            width: `${Math.min(100, Math.max(0, progressInfo.percentage))}%`
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {trophyDef.type === 'Count' && isEarned && playerTrophy?.qty > 0 && (
                                            <div className="trophy-count">
                                                <div className="count-text">
                                                    {playerTrophy.qty}x
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {hasUncollectedReward && (
                                        <div 
                                            className="trophy-reward-gem"
                                            onClick={() => handleCollectReward(trophyDef.name)}
                                            style={{
                                                opacity: isCollecting ? 0.5 : 1,
                                                cursor: isCollecting ? 'wait' : 'pointer'
                                            }}
                                        >
                                            💎
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
  
        </Panel>
    );
}

export default TrophyPanel;