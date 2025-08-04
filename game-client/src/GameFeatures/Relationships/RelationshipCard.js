import React, { useState, useEffect } from 'react';
import { updateRelationship, updateRelationshipStatus } from './RelationshipUtils';

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
        
        if (updateStatus) {
          updateStatus(`✅ ${interaction.interaction} successful!`);
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
      
      if (updateStatus) {
        updateStatus(`❌ ${interaction.interaction} failed.`);
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
    
    // Special case: if relscore is 0, only show Greet
    if (relationship.relscore === 0 && interaction.interaction !== 'Greet') {
      return false;
    }
    
    // Check if relationship score is within min/max range
    const minScore = interaction.relscoremin ?? -100;
    const maxScore = interaction.relscoremax ?? 100;
    if (relationship.relscore <= minScore || relationship.relscore > maxScore) return false;
    
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