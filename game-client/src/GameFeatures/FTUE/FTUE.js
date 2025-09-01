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
  
  // Load the current step data based on player's ftuestep
  useEffect(() => {
    // Only show FTUE if player is explicitly a first-time user
    if (currentPlayer?.firsttimeuser !== true) {
      console.log('Player is not a first-time user, closing FTUE');
      onClose();
      return;
    }
    
    // Handle step 0 by advancing to step 1
    if (currentPlayer?.ftuestep === 0) {
      console.log('🎓 Player at FTUE step 0, advancing to step 1');
      incrementFTUEStep(currentPlayer.playerId || currentPlayer._id, currentPlayer, setCurrentPlayer)
        .then(() => {
          console.log('Successfully advanced from step 0 to step 1');
        })
        .catch(err => {
          console.error('Failed to advance from step 0:', err);
        });
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

  const handleOK = async () => {
    try {
      const currentStep = currentPlayer.ftuestep;
      const nextStep = currentStep + 1;      
      // Check if there's a next step in the data
      const hasNextStep = FTUEstepsData.some(step => step.step === nextStep);
      
//////////// FTUE STEP 3 /////////////

      if (currentStep === 3 && openPanel) {
        console.log(`🎓 Adding starter quests and opening QuestPanel after FTUE step ${currentStep}`);
        
        // Add the two starter quests sequentially
        const playerAfterFirstQuest = await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 2);
        await addAcceptedQuest(currentPlayer.playerId, playerAfterFirstQuest, setCurrentPlayer, 3);
        
        onClose(); // Close FTUE modal first
        openPanel('QuestPanel');

//////////// FTUE STEP 4 /////////////

      } else if (currentStep === 4 && openPanel && setActiveStation) {
        console.log(`🎓 Adding Hire Kent quest and opening FarmHousePanel after FTUE step ${currentStep}`);
        
        // Add the "Hire Kent" quest
        await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 4);
        
        // Find the Farm House on the grid
        const resources = GlobalGridStateTilesAndResources.getResources();
        const farmHouse = resources?.find(res => res.type === 'Farm House');
        
        if (farmHouse) {
          console.log(`🎓 Found Farm House at (${farmHouse.x}, ${farmHouse.y})`);
          // Set the active station with the Farm House position
          setActiveStation({
            type: farmHouse.type,
            position: { x: farmHouse.x, y: farmHouse.y },
            gridId: gridId
          });
          onClose(); // Close FTUE modal first
          openPanel('FarmHouse');
        } else {
          console.log(`⚠️ Farm House not found on grid`);
          onClose(); // Still close FTUE modal
        }

//////////// FTUE STEP 5 /////////////

      } else if (currentStep === 5 && openPanel && setActiveQuestGiver && gridId) {
        console.log(`🎓 Processing FTUE step 5`);
        
        // First, add the Trading Post at (29, 32)
        await handleAddTradingPost();
        
        // Then find Kent NPC and open NPCPanel
        console.log(`🎓 Looking for Kent NPC after FTUE step 5`);
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

//////////// FTUE STEP 6 /////////////

      } else if (currentStep === 6) {
        
        // Add the two starter quests sequentially
        // Add the "Grower" and "Harvest" quests
        const playerAfterFirstQuest = await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 7);
        await addAcceptedQuest(currentPlayer.playerId, playerAfterFirstQuest, setCurrentPlayer, 8);
        onClose(); // Close FTUE modal first
        openPanel('QuestPanel');

//////////// FTUE STEP 7 /////////////

      } else if (currentStep === 7) {
        console.log(`🎓 Adding Hire the Shepherd quest after FTUE step ${currentStep}`);
        
        // Add the "Hire the Shepherd" quest
        await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 9);
        
        onClose(); // Close FTUE modal

//////////// FTUE STEP 8 /////////////

      } else if (currentStep === 8) {
    
        onClose(); // Close FTUE modal

//////////// FTUE STEP 9 /////////////

      } else if (currentStep === 9) {
        console.log(`🎓 Adding Axe quest after FTUE step ${currentStep}`);
    
        // Add the "Hire the Shepherd" quest
        await addAcceptedQuest(currentPlayer.playerId, currentPlayer, setCurrentPlayer, 10);
        
        onClose(); // Close FTUE modal

//////////// FTUE STEP 11 /////////////

      } else if (currentStep === 11) {
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


  // Add Trading Post to the grid at specific coordinates
  const handleAddTradingPost = async () => {
    try {
      console.log('🏪 Adding Trading Post to grid at (29, 32)');
      
      // Check if Trading Post already exists at this location
      const resources = GlobalGridStateTilesAndResources.getResources();
      const existingTradingPost = resources?.find(res => 
        res.type === 'Trading Post' && res.x === 29 && res.y === 32
      );
      
      if (existingTradingPost) {
        console.log('🏪 Trading Post already exists at (29, 32)');
        return;
      }
      
      // Check if there's any other resource at this location that needs to be removed
      const existingResource = resources?.find(res => res.x === 29 && res.y === 32);
      if (existingResource) {
        console.log(`🗑️ Removing existing resource at (29, 32): ${existingResource.type}`);
        
        // Remove from local state
        const filteredResources = resources.filter(res => !(res.x === 29 && res.y === 32));
        GlobalGridStateTilesAndResources.setResources(filteredResources);
        
        // Remove from database
        await updateGridResource(gridId, { type: null, x: 29, y: 32 }, true);
      }
      
      // Find Trading Post in masterResources to get its properties
      const tradingPostResource = masterResources?.find(res => res.type === 'Trading Post');
      if (!tradingPostResource) {
        console.error('❌ Trading Post not found in masterResources');
        return;
      }
      
      // Create the Trading Post resource
      const rawResource = { type: 'Trading Post', x: 29, y: 32 };
      const enriched = enrichResourceFromMaster(rawResource, masterResources);
      
      // Add to local state
      const currentResources = GlobalGridStateTilesAndResources.getResources() || [];
      const finalResources = [...currentResources, enriched];
      GlobalGridStateTilesAndResources.setResources(finalResources);
      if (setResources) {
        setResources(finalResources);
      }
      
      // Update in database
      await updateGridResource(gridId, rawResource, true);
      
      // Show success message
      if (TILE_SIZE) {
        FloatingTextManager.addFloatingText('🏪 Trading Post added!', 29, 32, TILE_SIZE);
      }
      
      console.log('✅ Trading Post successfully added to grid');
    } catch (error) {
      console.error('❌ Error adding Trading Post:', error);
    }
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