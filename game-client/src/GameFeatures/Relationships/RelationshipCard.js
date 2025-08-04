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
        const updatedRel = result.player.relationships.find(rel => rel.name === targetName);
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
            const finalRel = statusResult.player.relationships.find(rel => rel.name === targetName);
            setRelationship(finalRel);
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
            const finalRel = removeResult.player.relationships.find(rel => rel.name === targetName);
            setRelationship(finalRel);
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
        const updatedRel = result.player.relationships.find(rel => rel.name === targetName);
        setRelationship(updatedRel);
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

  if (compact) {
    // Compact version for inline display
    return (
      <div className="relationship-card-compact">
        <span className="relationship-name">{targetName}</span>
        <span className="relationship-score" style={{ color: scoreColor }}>
          [{relationship.relscore}]
        </span>
        {/* Status flags */}
        {relationship.friend && <span className="relationship-status">• Friend</span>}
        {relationship.crush && <span className="relationship-status">• Crush</span>}
        {relationship.love && <span className="relationship-status">• Love</span>}
        {relationship.married && <span className="relationship-status">• Married</span>}
        {relationship.rival && <span className="relationship-status">• Rival</span>}
      </div>
    );
  }

  // Get available interactions based on visibility and relationship score
  const availableInteractions = masterInteractions.filter(interaction => {
    // Only show visible interactions
    if (!interaction.isvisible) return false;
    
    // Check if relationship score is within min/max range
    const minScore = interaction.relscoremin ?? -100;
    const maxScore = interaction.relscoremax ?? 100;
    if (relationship.relscore < minScore || relationship.relscore > maxScore) return false;
    
    // Check if the interaction would grant a status that already exists
    if (interaction.relbitadd && relationship[interaction.relbitadd]) {
      return false; // Already has this status, so hide the interaction
    }
    
    // Check if required relationship status exists
    if (interaction.relbitrequired && !relationship[interaction.relbitrequired]) {
      return false; // Doesn't have required status
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
          {relationship.met && <span className="relationship-status-badge met">Met</span>}
          {relationship.friend && <span className="relationship-status-badge friend">Friend</span>}
          {relationship.crush && <span className="relationship-status-badge crush">Crush</span>}
          {relationship.love && <span className="relationship-status-badge love">Love</span>}
          {relationship.married && <span className="relationship-status-badge married">Married</span>}
          {relationship.rival && <span className="relationship-status-badge rival">Rival</span>}
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