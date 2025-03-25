import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';

function FarmHandsPanel({ onClose, currentPlayer, setCurrentPlayer }) {

  useEffect(() => {
    const fetchFarmHandsData = async () => {
      if (!currentPlayer || !currentPlayer.settlementId) {
        console.warn("⚠️ currentPlayer or settlementId is not available yet.");
        return;
      }
    };
    fetchFarmHandsData();
  }, [currentPlayer]);


  return (
    <Panel onClose={onClose} descriptionKey="1023" titleKey="1123" panelName="FarmHandsPanel">
      <div className="panel-content">
  
      </div>
    </Panel>
  );
}

export default FarmHandsPanel;