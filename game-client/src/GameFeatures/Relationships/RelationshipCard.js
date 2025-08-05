import React, { useState, useEffect } from 'react';
import { 
  updateRelationship, 
  updateRelationshipStatus, 
  getNPCReactions, 
  checkOtherRelationships,
  generateRelationshipStatusMessage 
} from './RelationshipUtils';

const RelationshipCard = ({ 
  currentPlayer,
  setCurrentPlayer,
  targetName,
  targetType = 'npc', // 'npc' or 'player'
  onRelationshipChange,
  showActions = true,
  compact = false,
  masterInteractions = [],
  updateStatus
}) => {
  const [relationship, setRelationship] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadOrCreateRelationship();
  }, [currentPlayer?.playerId, targetName]);

  const loadOrCreateRelationship = async () => {
    if (!currentPlayer || !targetName) {
      return;
    }

    // Find existing relationship
    const existingRel = currentPlayer.relationships?.find(rel => rel.name === targetName);
    
    if (existingRel) {
      setRelationship(existingRel);
    } else if (!isInitializing) {
      // Create new relationship with score 0
      setIsInitializing(true);
      const result = await updateRelationship(currentPlayer, targetName, 0);
      
      if (result.success && result.player) {
        // Update the currentPlayer with the new data
        setCurrentPlayer(result.player);
        const newRel = result.player.relationships.find(rel => rel.name === targetName);
        setRelationship(newRel || {
          name: targetName,
          relscore: 0
        });
      }
      setIsInitializing(false);
    }
  };

  const handleInteraction = async (interaction) => {
    if (!relationship || isProcessing) return;
    
    setIsProcessing(true);
    
    // Check if interaction is allowed based on other relationships
    const relationshipCheck = checkOtherRelationships(currentPlayer, targetName, interaction);
    if (!relationshipCheck.allowed) {
      if (updateStatus) {
        updateStatus(`❌ ${relationshipCheck.reason}`);
      }
      setIsProcessing(false);
      return;
    }
    
    // Roll for success based on interaction chance
    const randomRoll = Math.random();
    const success = randomRoll <= (interaction.chance || 1.0);
    
    if (success) {
      // Update relationship score
      const scoreChange = interaction.relscoreresult || 0;
      const result = await updateRelationship(currentPlayer, targetName, scoreChange);
      
      if (result.success && result.player) {
        setCurrentPlayer(result.player);
        let updatedRel = result.player.relationships.find(rel => rel.name === targetName);
        setRelationship(updatedRel);
        
        // Add relationship status if specified
        if (interaction.relbitadd) {
          const statusResult = await updateRelationshipStatus(
            currentPlayer, 
            targetName, 
            interaction.relbitadd, 
            true
          );
          
          if (statusResult.success && statusResult.player) {
            setCurrentPlayer(statusResult.player);
            updatedRel = statusResult.player.relationships.find(rel => rel.name === targetName);
            setRelationship(updatedRel);
            
            // Check for NPC reactions only if this is an NPC
            let npcReactions = [];
            if (targetType === 'npc') {
              npcReactions = getNPCReactions(targetName, interaction.relbitadd);
              
              // Apply each reaction
              for (const reaction of npcReactions) {
                // Clear all statuses if needed
                if (reaction.clearAllStatuses) {
                  // First, set the score to the exact value
                  const scoreResult = await updateRelationship(
                    statusResult.player, 
                    reaction.npc, 
                    reaction.setScore - (statusResult.player.relationships?.find(r => r.name === reaction.npc)?.relscore || 0)
                  );
                  
                  if (scoreResult.success && scoreResult.player) {
                    // Clear all statuses
                    const statuses = ['met', 'friend', 'crush', 'love', 'married', 'rival'];
                    for (const status of statuses) {
                      await updateRelationshipStatus(scoreResult.player, reaction.npc, status, false);
                    }
                    
                    // Set new status
                    if (reaction.setStatus) {
                      // First ensure they are "met"
                      const metResult = await updateRelationshipStatus(
                        scoreResult.player, 
                        reaction.npc, 
                        'met', 
                        true
                      );
                      
                      // Then set the reaction status
                      const finalResult = await updateRelationshipStatus(
                        metResult.success ? metResult.player : scoreResult.player, 
                        reaction.npc, 
                        reaction.setStatus, 
                        true
                      );
                      if (finalResult.success && finalResult.player) {
                        setCurrentPlayer(finalResult.player);
                      }
                    }
                  }
                } else if (reaction.scoreChange) {
                  // Just change the score
                  const scoreResult = await updateRelationship(
                    statusResult.player, 
                    reaction.npc, 
                    reaction.scoreChange
                  );
                  if (scoreResult.success && scoreResult.player) {
                    // Ensure they are "met" if relationship exists and score is positive
                    const updatedRelWithReactor = scoreResult.player.relationships?.find(r => r.name === reaction.npc);
                    if (updatedRelWithReactor && !updatedRelWithReactor.met) {
                      const metResult = await updateRelationshipStatus(
                        scoreResult.player, 
                        reaction.npc, 
                        'met', 
                        true
                      );
                      if (metResult.success && metResult.player) {
                        setCurrentPlayer(metResult.player);
                      } else {
                        setCurrentPlayer(scoreResult.player);
                      }
                    } else {
                      setCurrentPlayer(scoreResult.player);
                    }
                  }
                }
              }
            }
            
            // Generate and display status message for successful interaction
            if (updateStatus) {
              const statusMessage = generateRelationshipStatusMessage(
                targetName, 
                interaction.relbitadd, 
                true, 
                npcReactions
              );
              if (statusMessage) {
                updateStatus(statusMessage);
              }
            }
          }
        }
        
        // Remove relationship status if specified
        if (interaction.relbitremove) {
          const removeResult = await updateRelationshipStatus(
            currentPlayer, 
            targetName, 
            interaction.relbitremove, 
            false
          );
          
          if (removeResult.success && removeResult.player) {
            setCurrentPlayer(removeResult.player);
            updatedRel = removeResult.player.relationships.find(rel => rel.name === targetName);
            setRelationship(updatedRel);
          }
        }
        
        // Check if any relationship statuses should be removed due to score falling below minimum
        const statusesToRemove = masterInteractions.filter(item => {
          // Only check non-interaction status items
          if (item.isaninteraction !== false) return false;
          
          // Check if this status has a minimum score requirement
          if (typeof item.relscoremin !== 'number') return false;
          
          // Check if the new score is below the minimum and the relationship has this status
          const statusKey = item.interaction.toLowerCase();
          return updatedRel.relscore < item.relscoremin && updatedRel[statusKey] === true;
        });
        
        // Remove any statuses that no longer meet minimum score requirements
        for (const statusItem of statusesToRemove) {
          const statusKey = statusItem.interaction.toLowerCase();
          const removeResult = await updateRelationshipStatus(
            currentPlayer,
            targetName,
            statusKey,
            false
          );
          
          if (removeResult.success && removeResult.player) {
            setCurrentPlayer(removeResult.player);
            updatedRel = removeResult.player.relationships.find(rel => rel.name === targetName);
            setRelationship(updatedRel);
          }
        }
      
        // Here we need to give feedback for successful interaction in a speech bubble above the NPC
        
      }
    } else {
      // Failed interaction - decrease score by same amount
      const scoreChange = -(interaction.relscoreresult || 0);
      const result = await updateRelationship(currentPlayer, targetName, scoreChange);
      
      if (result.success && result.player) {
        setCurrentPlayer(result.player);
        let updatedRel = result.player.relationships.find(rel => rel.name === targetName);
        setRelationship(updatedRel);
        
        // Check if any relationship statuses should be removed due to score falling below minimum
        const statusesToRemove = masterInteractions.filter(item => {
          // Only check non-interaction status items
          if (item.isaninteraction !== false) return false;
          
          // Check if this status has a minimum score requirement
          if (typeof item.relscoremin !== 'number') return false;
          
          // Check if the new score is below the minimum and the relationship has this status
          const statusKey = item.interaction.toLowerCase();
          return updatedRel.relscore < item.relscoremin && updatedRel[statusKey] === true;
        });
        
        // Remove any statuses that no longer meet minimum score requirements
        for (const statusItem of statusesToRemove) {
          const statusKey = statusItem.interaction.toLowerCase();
          const removeResult = await updateRelationshipStatus(
            currentPlayer,
            targetName,
            statusKey,
            false
          );
          
          if (removeResult.success && removeResult.player) {
            setCurrentPlayer(removeResult.player);
            updatedRel = removeResult.player.relationships.find(rel => rel.name === targetName);
            setRelationship(updatedRel);
          }
        }
      }
      
      /// Here we need to give feedback for failed interaction in a specch bubble above the NPC
    }
    
    // Call the parent's relationship change handler
    if (onRelationshipChange) {
      onRelationshipChange(interaction, success);
    }
    
    setIsProcessing(false);
  };

  if (!relationship) {
    return null;
  }

  // Determine color based on score
  const getScoreColor = (score) => {
    if (score > 50) return '#4CAF50'; // Green
    if (score > 0) return '#8BC34A'; // Light Green
    if (score === 0) return '#9E9E9E'; // Gray
    if (score > -50) return '#FF9800'; // Orange
    return '#F44336'; // Red
  };

  const scoreColor = getScoreColor(relationship.relscore);

  // Get visible relationship statuses early so we can use in both compact and full views
  const visibleStatuses = masterInteractions.filter(item => {
    // Only consider non-interaction items
    if (item.isaninteraction !== false) return false;
    
    // Check if visible and if the relationship has this status
    const statusKey = item.interaction.toLowerCase();
    return item.isvisible && relationship[statusKey] === true;
  });

  if (compact) {
    // Compact version for inline display
    return (
      <div className="relationship-card-compact">
        <span className="relationship-name">{targetName}</span>
        <span className="relationship-score" style={{ color: scoreColor }}>
          [{relationship.relscore}]
        </span>
        {/* Status flags */}
        {visibleStatuses.map((status) => (
          <span key={status.interaction} className="relationship-status">
            • {status.interaction}
          </span>
        ))}
      </div>
    );
  }

  // Get available interactions based on visibility and relationship score
  const availableInteractions = masterInteractions.filter(interaction => {
    // Only include actual interactions
    if (interaction.isaninteraction === false) return false;
    // Only show visible interactions
    if (!interaction.isvisible) return false;
    // Check if relationship score is within min/max range
    const minScore = interaction.relscoremin ?? -100;
    const maxScore = interaction.relscoremax ?? 100;
    if (relationship.relscore < minScore || relationship.relscore > maxScore) return false;
    
    // Check if required relationship status exists
    if (interaction.relbitrequired && !relationship[interaction.relbitrequired]) {
      return false; // Doesn't have required status
    }
    
    // Check relbitblock fields - hide interaction if any blocked status exists
    for (let i = 1; i <= 3; i++) {
      const blockField = interaction[`relbitblock${i}`];
      if (blockField) {
        if (blockField === 'all') {
          // Block if ANY relationship status exists
          const hasAnyStatus = relationship.met || relationship.friend || 
                             relationship.crush || relationship.love || 
                             relationship.married || relationship.rival;
          if (hasAnyStatus) return false;
        } else if (relationship[blockField]) {
          // Block if specific status exists
          return false;
        }
      }
    }
    
    return true;
  });

  // Full card version
  return (
    <div className="relationship-card">
      <div className="relationship-card-content">
        <h3 className="relationship-title">Relationship</h3>
        
        <div className="relationship-score-bar-container">
          <div className="relationship-score-gradient">
            <div 
              className="relationship-score-marker"
              style={{ 
                left: `${((relationship.relscore + 100) / 200) * 100}%`
              }}
            />
          </div>
        </div>

        {/* Status flags display */}
        <div className="relationship-status-display">
          {visibleStatuses.map((status) => (
            <span 
              key={status.interaction}
              className={`relationship-status-badge ${status.interaction.toLowerCase()}`}
            >
              {status.interaction}
            </span>
          ))}
        </div>

        {showActions && availableInteractions.length > 0 && (
          <div className="relationship-actions">
            {availableInteractions.map((interaction) => (
              <button
                key={interaction.interaction}
                className="panel-button"
                onClick={() => handleInteraction(interaction)}
                disabled={isProcessing}
              >
                {interaction.interaction}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(RelationshipCard);