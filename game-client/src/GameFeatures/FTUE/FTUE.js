import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import './FTUE.css';
import FTUEstepsData from './FTUEsteps.json';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { updateGridResource } from '../../Utils/GridManagement';
import { enrichResourceFromMaster } from '../../Utils/ResourceHelpers';
import FloatingTextManager from '../../UI/FloatingText';

const FTUE = ({ currentPlayer, setCurrentPlayer, onClose, openPanel, setActiveQuestGiver, gridId, setActiveStation, masterResources, setResources, TILE_SIZE }) => {
  const strings = useStrings();
  const [currentStepData, setCurrentStepData] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // Load the current step data based on player's ftuestep
  useEffect(() => {
    // Only show FTUE if player is explicitly a first-time user
    if (currentPlayer?.firsttimeuser !== true) {
      console.log('Player is not a first-time user, closing FTUE');
      onClose();
      return;
    }
    
    // Handle step 0 by showing step 1 content without advancing yet
    if (currentPlayer?.ftuestep === 0) {
      console.log('🎓 Player at FTUE step 0, showing step 1 content');
      const step1Data = FTUEstepsData.find(step => step.step === 1);
      if (step1Data) {
        setCurrentStepData(step1Data);
      }
      return;
    }
    
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
  }, [currentPlayer?.ftuestep, currentPlayer?.firsttimeuser, onClose]);

  // Preload image when step data changes
  useEffect(() => {
    if (currentStepData?.image) {
      setImageLoaded(false);
      const img = new Image();
      img.src = `/assets/${currentStepData.image}`;
      img.onload = () => {
        setImageLoaded(true);
      };
      img.onerror = () => {
        console.error('Failed to load FTUE image:', currentStepData.image);
        setImageLoaded(true); // Still show modal even if image fails
      };
    }
  }, [currentStepData]);

  const handleOK = async () => {
    try {
      // If we're showing step 1 content but player is still at step 0, advance to step 1
      const currentStep = currentPlayer.ftuestep === 0 ? 1 : currentPlayer.ftuestep;
      const actualCurrentStep = currentPlayer.ftuestep;
      const nextStep = currentStep + 1;      
      // Check if there's a next step in the data
      const hasNextStep = FTUEstepsData.some(step => step.step === nextStep);
      
//////////// FTUE STEP 3 /////////////

      if (currentStep === 3 && openPanel && setActiveQuestGiver && gridId) {
        console.log(`🎓 Step 3: Opening Kent panel to guide player`);
        
        // Find Kent NPC and open NPCPanel
        const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
        if (npcsInGrid) {
          const kentNPC = Object.values(npcsInGrid).find(npc => npc.type === 'Kent');
          if (kentNPC) {
            console.log(`🎓 Found Kent, opening NPCPanel`);
            onClose(); // Close FTUE modal first
            setActiveQuestGiver(kentNPC); // Set Kent as the active quest giver
            openPanel('NPCPanel'); // Open the quest giver panel
          } else {
            console.log(`⚠️ Kent NPC not found in grid`);
            onClose(); // Still close FTUE modal
          }
        }

//////////// FTUE STEP 4 /////////////

      } else if (currentStep === 4) {
        console.log(`🎓 Processing FTUE step 4 - Adding Grower quest`);
        
        // Add the Grower quest
        await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 7);
        
        onClose(); // Close FTUE modal
        
        // Auto-open the Farming panel
        if (openPanel) {
          console.log(`🎓 Step 4: Auto-opening Farming panel`);
          openPanel('FarmingPanel');
        }

//////////// FTUE STEP 5 /////////////

      } else if (currentStep === 5) {
        console.log(`🎓 Processing FTUE step 5 - Adding Hire the Shepherd quest`);
        
        // Add the "Hire the Shepherd" quest
        await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 9);
        
        onClose(); // Close FTUE modal

//////////// FTUE STEP 6 /////////////

      } else if (currentStep === 6) {
        console.log(`🎓 Processing FTUE step 6 - cow purchased`);
        
        // Add the Get Axe quest (quest 10) at step 6 so it's ready for step 7
        await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 10);
        
        onClose();

//////////// FTUE STEP 7 /////////////

      } else if (currentStep === 7 && openPanel) {
        console.log(`🎓 Adding shepherd quest after FTUE step ${currentStep}`);
        
        // Add the shepherd quest (quest 8)
        await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 8);
         
        onClose(); // Close FTUE modal first
        openPanel('QuestPanel');

//////////// FTUE STEP 8 /////////////

      } else if (currentStep === 8) {
        console.log(`🎓 Processing FTUE step 8 - axe acquired`);
        
        // No quest to add here since Get Axe quest was already added at step 6
        
        onClose(); // Close FTUE modal

//////////// FTUE STEP 9 /////////////

      } else if (currentStep === 9) {
        console.log(`🎓 Adding Wizard quest after FTUE step ${currentStep}`);
        
        // Add the Axe quest
        await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 1);
        await completeTutorial();

        onClose(); // Close FTUE modal
        return; // Don't continue with normal step advancement
      }

      if (!hasNextStep) {
        completeTutorial();

      } else {
        const stepData = FTUEstepsData.find(step => step.step === currentStep);
        if (stepData?.continue) {
          // If the current step has a continue action, advance the FTUE step
          // Use actualCurrentStep to handle step 0 -> 1 transition properly
          const response = await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { ftuestep: actualCurrentStep + 1 }
          });
          if (response.data.success) {
            setCurrentPlayer(prev => ({
              ...prev,
              ftuestep: actualCurrentStep + 1
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
      // First check if the Wizard quest (index=1) has already been added
      const currentActiveQuests = currentPlayer?.activeQuests || [];
      const wizardQuestExists = currentActiveQuests.some(q => q.questId === "Find the Wizard in the Valley");
      
      let finalActiveQuests = currentActiveQuests;
      
      if (!wizardQuestExists) {
        console.log('🎓 Adding completed Wizard quest before completing tutorial');
        
        // Add the quest with index=1
        const updatedPlayer = await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 1);
        
        // Mark it as completed
        if (updatedPlayer.activeQuests && updatedPlayer.activeQuests.length > 0) {
          const questIndex = updatedPlayer.activeQuests.findIndex(q => q.questId === "Find the Wizard in the Valley");
          if (questIndex !== -1) {
            updatedPlayer.activeQuests[questIndex].completed = true;
            finalActiveQuests = updatedPlayer.activeQuests;
            
            // Save the completed quest
            await axios.post(`${API_BASE}/api/update-profile`, {
              playerId: currentPlayer.playerId,
              updates: { activeQuests: finalActiveQuests }
            });
          }
        }
      } else {
        console.log('🎓 Wizard quest already exists, skipping addition');
      }
      
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
            firsttimeuser: false,
            activeQuests: finalActiveQuests
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



  // Handle aspiration choice for step 2
  const handleAspirationChoice = async (aspiration) => {
    try {
      // Update player's aspiration in the database
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { 
          aspiration: aspiration,
          ftuestep: 3 // Advance to next step after choosing
        }
      });
      
      if (response.data.success) {
        setCurrentPlayer(prev => ({
          ...prev,
          aspiration: aspiration,
          ftuestep: 3
        }));
        onClose();
      }
    } catch (error) {
      console.error('Error setting aspiration:', error);
    }
  };

  // Don't render if no step data or (image not loaded for non-step-2)
  if (!currentStepData || (currentPlayer?.ftuestep !== 2 && !imageLoaded)) {
    return null;
  }

  // Custom render for step 2 - Aspiration choice
  if (currentPlayer?.ftuestep === 2) {
    return (
      <div className="ftue-overlay">
        <div className="ftue-modal">
          <div className="ftue-header">
            <h2>{strings[currentStepData.titleKey]}</h2>
          </div>
          
          <div className="ftue-text">
            <p>{strings[currentStepData.bodyKey]}</p>
          </div>
          
          <div className="ftue-aspiration-content">
            <div className="ftue-aspiration-panels">
              {/* Panel 1 */}
              <div 
                className="ftue-aspiration-panel" 
                onClick={() => handleAspirationChoice(1)}
              >
                <h3>{strings[750]}</h3>
                <p>{strings[751]}</p>
              </div>
              
              {/* Panel 2 */}
              <div 
                className="ftue-aspiration-panel" 
                onClick={() => handleAspirationChoice(2)}
              >
                <h3>{strings[752]}</h3>
                <p>{strings[753]}</p>
              </div>
              
              {/* Panel 3 */}
              <div 
                className="ftue-aspiration-panel" 
                onClick={() => handleAspirationChoice(3)}
              >
                <h3>{strings[754]}</h3>
                <p>{strings[755]}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Standard render for other steps
  return (
    <div className="ftue-overlay">
      <div className="ftue-modal">
        <div className="ftue-header">
          <h2>{strings[currentStepData.titleKey]}</h2>
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

// Export function to add an accepted quest to player data
export const addAcceptedQuest = async (playerId, currentPlayer, setCurrentPlayer, questIndex) => {
  try {
    // Fetch quest template from API
    const response = await axios.get(`${API_BASE}/api/quests`);
    const questTemplates = response.data || [];
    
    // Find the specific quest template by index
    const questTemplate = questTemplates.find(q => q.index === questIndex);
    if (!questTemplate) {
      console.error(`❌ Quest template not found for index: ${questIndex}`);
      return currentPlayer;
    }
    
    // Create the quest object following the activeQuests format
    const newQuest = {
      questId: questTemplate.title, // Use title from template
      startTime: Date.now(),
      symbol: questTemplate.symbol || '❓',
      progress: {
        goal1: 0,
        goal2: 0,
        goal3: 0
      },
      completed: false,
      rewardCollected: false,
      // Add goal fields from template
      goal1action: questTemplate.goal1action || null,
      goal1item: questTemplate.goal1item || null,
      goal1qty: questTemplate.goal1qty || null,
      goal2action: questTemplate.goal2action || null,
      goal2item: questTemplate.goal2item || null,
      goal2qty: questTemplate.goal2qty || null,
      goal3action: questTemplate.goal3action || null,
      goal3item: questTemplate.goal3item || null,
      goal3qty: questTemplate.goal3qty || null
    };
    
    // Get current active quests
    const currentActiveQuests = currentPlayer?.activeQuests || [];
    
    // Check if quest already exists
    const questExists = currentActiveQuests.some(q => q.questId === questTemplate.title);
    if (questExists) {
      console.log(`📚 Quest "${questTemplate.title}" already exists in active quests`);
      return currentPlayer;
    }
    
    // Add new quest to active quests
    const updatedActiveQuests = [...currentActiveQuests, newQuest];
    
    // Update database
    const updateResponse = await axios.post(`${API_BASE}/api/update-profile`, {
      playerId,
      updates: { activeQuests: updatedActiveQuests }
    });
    
    if (updateResponse.data.success) {
      // Update local state
      const updatedPlayer = {
        ...currentPlayer,
        activeQuests: updatedActiveQuests
      };
      setCurrentPlayer(updatedPlayer);
      
      console.log(`✅ Quest "${questTemplate.title}" (index: ${questIndex}) added to active quests`);
      return updatedPlayer;
    }
    
    return currentPlayer;
  } catch (error) {
    console.error('Error adding accepted quest:', error);
    return currentPlayer;
  }
};

export default FTUE;