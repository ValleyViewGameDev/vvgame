import React, { useState, useEffect } from 'react';
import { updateRelationship } from './RelationshipUtils';

const RelationshipCard = ({ 
  currentPlayer,
  setCurrentPlayer,
  targetName,
  targetType = 'npc', // 'npc' or 'player'
  onRelationshipChange,
  showActions = true,
  compact = false,
  masterInteractions = []
}) => {
  const [relationship, setRelationship] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);

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

  // Get available interactions based on relationship score
  const availableInteractions = masterInteractions.filter(interaction => {
    const requiredScore = interaction.relscorethreshold || -100;
    return relationship.relscore >= requiredScore;
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
                key={interaction.name}
                className="panel-button"
                onClick={() => onRelationshipChange && onRelationshipChange(interaction)}
              >
                {interaction.icon} {interaction.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(RelationshipCard);