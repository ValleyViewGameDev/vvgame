import React, { useState, useEffect } from 'react';
import { 
  updateRelationship, 
  updateRelationshipStatus, 
  getNPCReactions, 
  checkOtherRelationships,
  generateRelationshipStatusMessage 
} from './RelationshipUtils';
import { useStrings } from '../../UI/StringsContext';
import { playConversation } from './Conversation';
import ConversationManager from './ConversationManager';

const RelationshipCard = ({ 
  currentPlayer,
  setCurrentPlayer,
  targetName,
  targetType = 'npc', // 'npc' or 'player'
  targetEmoji = null, // Optional emoji for the target
  onRelationshipChange,
  showActions = true,
  compact = false,
  masterInteractions = [],
  updateStatus,
  checkDistance = null, // Optional function to check if target is in range
  onInteractionClick = null, // Optional function to handle zoom/camera when interaction is clicked
  playerPosition = null, // Player's grid position for conversation
  targetPosition = null, // Target's grid position for conversation
  TILE_SIZE = 30 // Tile size for positioning speech bubbles
}) => {
  const [relationship, setRelationship] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const strings = useStrings();

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
    
    // Check distance first, before any zoom/camera operations
    if (checkDistance && !checkDistance()) {
      if (updateStatus) {
        updateStatus(620); // "You are too far away"
      }
      setIsProcessing(false);
      return;
    }
    
    // Handle zoom and camera centering only after distance check passes
    if (onInteractionClick) {
      await onInteractionClick();
    }
    
    // Check if interaction is allowed based on other relationships
    const relationshipCheck = checkOtherRelationships(currentPlayer, targetName, interaction);
    if (!relationshipCheck.allowed) {
      if (updateStatus) {
        updateStatus(`❌ ${relationshipCheck.reason}`);
      }
      setIsProcessing(false);
      return;
    }
    
    // Play conversation sequence if positions are provided
    if (playerPosition && targetPosition) {
      const playerEmoji = currentPlayer.icon || '😊';
      const defaultTargetEmoji = targetType === 'npc' ? '🤔' : '😊';
      const conversationTargetEmoji = targetEmoji || defaultTargetEmoji;
      
      // Use player ID for consistent tracking
      const playerId = currentPlayer._id?.toString() || currentPlayer.playerId;
      const targetId = targetType === 'npc' ? targetName : targetName; // For NPCs, use name as ID
      
      await playConversation(
        playerPosition,
        targetPosition,
        playerEmoji,
        conversationTargetEmoji,
        TILE_SIZE,
        () => {
          // Conversation complete - continue with interaction
        },
        playerId,
        targetId,
        interaction,
        currentPlayer
      );
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
                    // Clear all statuses dynamically from masterInteractions
                    const statuses = masterInteractions
                      .filter(item => item.isaninteraction === false)
                      .map(item => item.interaction.toLowerCase());
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
                npcReactions,
                strings
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
      
        // Show relationship outcome VFX
        if (scoreChange !== 0) {
          const targetId = targetType === 'npc' ? targetName : targetName; // For NPCs, use name as ID
          ConversationManager.showOutcome(targetId, scoreChange > 0);
        }
        
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
      
      // Show relationship outcome VFX for failed interaction
      if (scoreChange < 0) {
        const targetId = targetType === 'npc' ? targetName : targetName; // For NPCs, use name as ID
        ConversationManager.showOutcome(targetId, false);
      }
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
        <h3 className="relationship-title">{strings[601]}</h3>
        
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