import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import './FTUE.css';
import FTUEstepsData from './FTUEsteps.json';
import NPCsInGridManager from '../../GridState/GridStateNPCs';

const FTUE = ({ currentPlayer, setCurrentPlayer, onClose, openPanel, setActiveQuestGiver, gridId }) => {
  const strings = useStrings();
  const [currentStepData, setCurrentStepData] = useState(null);
  
  // Load the current step data based on player's ftuestep
  useEffect(() => {
    if (currentPlayer?.ftuestep) {
      const stepData = FTUEstepsData.find(step => step.step === currentPlayer.ftuestep);
      if (stepData) {
        setCurrentStepData(stepData);
      } else {
        // If no valid step found, close the FTUE
        console.log('No valid FTUE step found for step:', currentPlayer.ftuestep);
        onClose();
      }
    }
  }, [currentPlayer?.ftuestep, onClose]);

  const handleOK = async () => {
    try {
      const currentStep = currentPlayer.ftuestep;
      const nextStep = currentStep + 1;      
      // Check if there's a next step in the data
      const hasNextStep = FTUEstepsData.some(step => step.step === nextStep);
      
      // Check if we should open a panel after this step
      if (currentStep === 3 && openPanel) {
        console.log(`🎓 Opening QuestPanel after FTUE step ${currentStep}`);
        onClose(); // Close FTUE modal first
        openPanel('QuestPanel');
      } else if (currentStep === 5 && openPanel && setActiveQuestGiver && gridId) {
        // Find Kent NPC and open QuestGiverPanel
        console.log(`🎓 Looking for Kent NPC after FTUE step 5`);
        const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
        if (npcsInGrid) {
          const kentNPC = Object.values(npcsInGrid).find(npc => npc.type === 'Kent');
          if (kentNPC) {
            console.log(`🎓 Found Kent, opening QuestGiverPanel`);
            onClose(); // Close FTUE modal first
            setActiveQuestGiver(kentNPC); // Set Kent as the active quest giver
            openPanel('QuestGiverPanel'); // Open the quest giver panel
          } else {
            console.log(`⚠️ Kent NPC not found in grid`);
            onClose(); // Still close FTUE modal
          }
        }
      }
      
      if (!hasNextStep) {
        completeTutorial();

      } else {
        const stepData = FTUEstepsData.find(step => step.step === currentStep);
        if (stepData?.continue) {
          // If the current step has a continue action, advance the FTUE step
          const response = await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { ftuestep: nextStep }
          });
          if (response.data.success) {
            setCurrentPlayer(prev => ({
              ...prev,
              ftuestep: nextStep
            }));
            onClose();
          }
        } else {  
          onClose();
          return;
        } 
      }

    } catch (error) {
      console.error('Error advancing FTUE step:', error);
    }
  };

  const completeTutorial = async () => {
    try {
      // Update the player's firsttimeuser flag to false and remove ftuestep
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { 
          firsttimeuser: false,
          ftuestep: null  // This will remove the field from the document
        }
      });
      
      if (response.data.success) {
        // Update local player state
        setCurrentPlayer(prev => {
          const updated = {
            ...prev,
            firsttimeuser: false
          };
          delete updated.ftuestep;  // Remove ftuestep from local state
          return updated;
        });
        
        // Close the tutorial
        onClose();
      }
    } catch (error) {
      console.error('Error completing tutorial:', error);
      // Close anyway to not block the user
      onClose();
    }
  };

  const handleSkip = () => {
    completeTutorial();
  };

  // Don't render if no step data
  if (!currentStepData) {
    return null;
  }

  return (
    <div className="ftue-overlay">
      <div className="ftue-modal">
        <div className="ftue-header">
          <h2>{strings[currentStepData.titleKey]}</h2>
          <button className="ftue-skip-button" onClick={handleSkip}>
            {strings[795]}
          </button>
        </div>
        
        <div className="ftue-text">
          <p>{strings[currentStepData.bodyKey]}</p>
        </div>

        <div className="ftue-content">
          <div className="ftue-image-container">
            <img 
              src={`/assets/${currentStepData.image}`} 
              alt={strings[currentStepData.titleKey]}
              className="ftue-image"
            />
          </div>
          
          <div className="ftue-buttons">
            <button className="ftue-button ftue-button-primary" onClick={handleOK}>{strings[796]}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Export function to get current FTUE step from DB and sync with local state
export const getFTUEStep = async (playerId, currentPlayer, setCurrentPlayer) => {
  try {
    // Fetch player data from DB
    const response = await axios.get(`${API_BASE}/api/player/${playerId}`);
    const dbFtueStep = response.data.ftuestep;
    
    // Update local state if different from DB
    if (currentPlayer && currentPlayer.ftuestep !== dbFtueStep) {
      console.log('🔄 Syncing FTUE step from DB:', dbFtueStep);
      setCurrentPlayer(prev => ({
        ...prev,
        ftuestep: dbFtueStep
      }));
    }
    
    return dbFtueStep || 0;
  } catch (error) {
    console.error('Error fetching FTUE step:', error);
    return currentPlayer?.ftuestep || 0;
  }
};

// Export function to increment FTUE step in both DB and local state
export const incrementFTUEStep = async (playerId, currentPlayer, setCurrentPlayer) => {
  try {
    const currentStep = currentPlayer?.ftuestep || 0;
    const nextStep = currentStep + 1;
    
    // Check if the next step exists in the data
    const nextStepExists = FTUEstepsData.some(step => step.step === nextStep);
    
    if (!nextStepExists) {
      console.log('📚 No more FTUE steps available after step', currentStep);
      return currentStep;
    }
    
    // Update DB
    const response = await axios.post(`${API_BASE}/api/update-profile`, {
      playerId,
      updates: { ftuestep: nextStep }
    });
    
    if (response.data.success) {
      // Update local state - this will trigger the modal via the useEffect in App.js
      setCurrentPlayer(prev => ({
        ...prev,
        ftuestep: nextStep
      }));
      
      console.log('✅ FTUE step incremented to:', nextStep);
      return nextStep;
    }
    
    return currentStep;
  } catch (error) {
    console.error('Error incrementing FTUE step:', error);
    return currentPlayer?.ftuestep || 0;
  }
};

export default FTUE;