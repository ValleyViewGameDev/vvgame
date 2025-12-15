import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import Panel from '../../UI/Panels/Panel';
import { useStrings } from '../../UI/StringsContext';
import './Relationships.css';

const Relationships = ({ 
  onClose, 
  currentPlayer,
  setCurrentPlayer,
  updateStatus 
}) => {
  const strings = useStrings();
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRelationships();
  }, [currentPlayer?.playerId]);

  const loadRelationships = async () => {
    if (!currentPlayer?.playerId) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/api/player/${currentPlayer.playerId}`);
      const playerData = response.data;
      
      if (playerData.relationships) {
        setRelationships(playerData.relationships);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading relationships:', error);
      updateStatus('Failed to load relationships');
      setLoading(false);
    }
  };

  return (
    <Panel 
      onClose={onClose} 
      titleKey="Relationships" 
      descriptionKey="View and manage your relationships"
      panelName="Relationships"
    >
      <div className="relationships-container">
        {/* TODO: Add relationship UI components here based on design */}
        <h2>Relationships Panel</h2>
        <p>Design coming soon...</p>
      </div>
    </Panel>
  );
};

export default React.memo(Relationships);