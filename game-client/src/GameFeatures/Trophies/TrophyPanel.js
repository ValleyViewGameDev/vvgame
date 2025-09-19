import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import '../../UI/Panel.css';
import './TrophyPanel.css'; 
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';


function TrophyPanel({ onClose, masterResources, masterTrophies, currentPlayer, setCurrentPlayer, updateStatus, openPanel, setActiveStation }) {

    const strings = useStrings();
    const [trophies, setTrophies] = useState([]);
    const [loading, setLoading] = useState(true);
    
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
                        {masterTrophies?.map((trophyDef, index) => {
                            // Find if player has earned this trophy
                            const playerTrophy = trophies.find(t => t.name === trophyDef.name);
                            const isEarned = !!playerTrophy;
                            const progressInfo = trophyDef.type === 'Progress' ? getProgressInfo(trophyDef, playerTrophy) : null;
                            
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
                                    </div>
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