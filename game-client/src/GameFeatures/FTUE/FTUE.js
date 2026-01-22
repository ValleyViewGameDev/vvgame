import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import './FTUE.css';
import { showNotification } from '../../UI/Notifications/Notifications';
import { addAcceptedQuest, completeTutorial, handleFeedbackSubmit } from './FTUEutils';
import StoryModal from '../../UI/Modals/StoryModal';
import NPCsInGridManager from '../../GridState/GridStateNPCs';


const FTUE = ({ currentPlayer, setCurrentPlayer, onClose, openPanel, setActiveQuestGiver, gridId, masterFTUEsteps }) => {
  const strings = useStrings();
  const [currentStepData, setCurrentStepData] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [positiveReasons, setPositiveReasons] = useState([]);
  const [negativeReasons, setNegativeReasons] = useState([]);
  
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
      const step1Data = masterFTUEsteps.find(step => step.step === 1);
      if (step1Data) {
        setCurrentStepData(step1Data);
      }
      return;
    }
    
    if (currentPlayer?.ftuestep) {
      // Normal step loading
      const stepData = masterFTUEsteps.find(step => step.step === currentPlayer.ftuestep);
      if (stepData) {
        setCurrentStepData(stepData);
      } else {
        // If no valid step found, close the FTUE
        console.log('No valid FTUE step found for step:', currentPlayer.ftuestep);
        onClose();
      }
    }
  }, [currentPlayer?.ftuestep, currentPlayer?.firsttimeuser, onClose]);

  // Show notification and add quests for current step on load/refresh
  // This ensures players see the notification again if they refresh the app
  // and that quests are added for trigger-based steps that don't have modals
  useEffect(() => {
    if (!currentStepData || !strings) return;

    // Show notification if defined
    if (currentStepData.notificationKey) {
      console.log(`🎓 Re-triggering notification for step ${currentStepData.step} on load`);
      showNotification('FTUE', {
        title: strings[7049],
        message: strings[currentStepData.notificationKey],
        ...(currentStepData.notificationIcon && { icon: currentStepData.notificationIcon })
      });
    }

    // Add quests if defined (check for duplicates to avoid re-adding on refresh)
    const addQuestsForStep = async () => {
      if (currentStepData.addQuests && currentStepData.addQuests.length > 0) {
        console.log(`🎓 Step ${currentStepData.step}: Checking quests to add: ${currentStepData.addQuests.join(', ')}`);

        // Fetch quest templates to get quest titles for duplicate checking
        try {
          const response = await axios.get(`${API_BASE}/api/quests`);
          const questTemplates = response.data || [];
          const currentActiveQuests = currentPlayer?.activeQuests || [];

          let playerState = currentPlayer;
          for (const questIndex of currentStepData.addQuests) {
            // Find the quest template to check if it's already added
            const questTemplate = questTemplates.find(q => q.index === questIndex);
            if (!questTemplate) continue;

            // Check if quest is already in activeQuests
            const alreadyHasQuest = currentActiveQuests.some(q => q.questId === questTemplate.title);
            if (alreadyHasQuest) {
              console.log(`🎓 Quest "${questTemplate.title}" already exists, skipping`);
              continue;
            }

            console.log(`🎓 Adding quest "${questTemplate.title}" (index ${questIndex})`);
            playerState = await addAcceptedQuest(currentPlayer.playerId, playerState, setCurrentPlayer, questIndex);
          }
        } catch (error) {
          console.error('Error adding FTUE quests:', error);
        }
      }
    };

    addQuestsForStep();
  }, [currentStepData?.step]); // Only trigger when step changes, not on every re-render

  // Auto-advance if step has showModal: false (but not while feedback modal is showing)
  useEffect(() => {
    if (currentStepData?.showModal === false && !showFeedbackModal) {
      // Use setTimeout to ensure handleOK is defined and avoid render cycle issues
      const timer = setTimeout(() => {
        handleOK();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentStepData?.showModal, currentStepData?.step, showFeedbackModal]);

  // Handle feedback submission - saves feedback then continues with current step's logic
  const onFeedbackSubmit = async (isPositive) => {
    // Save the feedback
    await handleFeedbackSubmit(
      isPositive,
      currentPlayer.playerId,
      currentPlayer,
      setCurrentPlayer,
      positiveReasons,
      negativeReasons
    );

    // Hide feedback modal and continue with the rest of handleOK logic
    setShowFeedbackModal(false);

    // Continue with the step's remaining logic
    await continueStepLogic();
  };

  // Continuation function that executes the rest of the step logic after feedback (if any)
  const continueStepLogic = async () => {
    try {
      const currentStep = currentPlayer.ftuestep === 0 ? 1 : currentPlayer.ftuestep;
      const actualCurrentStep = currentPlayer.ftuestep;
      const nextStep = currentStep + 1;
      const hasNextStep = masterFTUEsteps.some(step => step.step === nextStep);
      const stepData = masterFTUEsteps.find(step => step.step === currentStep);

      // Check for notification defined in FTUEsteps.json
      if (stepData?.notificationKey) {
        showNotification('FTUE', {
          title: strings[7049],
          message: strings[stepData.notificationKey],
          ...(stepData.notificationIcon && { icon: stepData.notificationIcon })
        });
      }
      // Auto-add quests defined in FTUEsteps.json
      if (stepData?.addQuests && stepData.addQuests.length > 0) {
        console.log(`🎓 Step ${currentStep}: Auto-adding quests ${stepData.addQuests.join(', ')}`);
        let playerState = currentPlayer;
        for (const questIndex of stepData.addQuests) {
          playerState = await addAcceptedQuest(currentPlayer.playerId, playerState, setCurrentPlayer, questIndex);
        }
      }

      if (!hasNextStep) {
        completeTutorial(currentPlayer.playerId, currentPlayer, setCurrentPlayer, onClose);
      } else {
        if (stepData?.continue) {
          // If the current step has a continue action, advance the FTUE step
          const response = await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { ftuestep: actualCurrentStep + 1 }
          });
          if (response.data.success) {
            setCurrentPlayer(prev => ({
              ...prev,
              ftuestep: actualCurrentStep + 1
            }));
          }
        }
        // Close FTUE modal (but don't touch panel state)
        onClose();

        // Auto-open panel defined in FTUEsteps.json (after closing FTUE modal)
        if (stepData?.openPanel && openPanel) {
          // If opening NPCPanel, we need to set activeQuestGiver first
          // This mirrors how handleNPCPanel works in App.js when clicking an NPC
          if (stepData.openPanel === 'NPCPanel' && stepData.panelTargetNPC) {
            const npcs = NPCsInGridManager.getNPCsInGrid(gridId);
            if (npcs) {
              const npcArray = Object.values(npcs);
              const targetNPC = npcArray.find(npc => npc.type === stepData.panelTargetNPC);
              if (targetNPC) {
                setActiveQuestGiver(targetNPC);
                openPanel(stepData.openPanel);
                return;
              }
            }
          }

          // For non-NPC panels or if NPC not found, open immediately
          openPanel(stepData.openPanel);
        }
      }
    } catch (error) {
      console.error('Error in continueStepLogic:', error);
    }
  };

  const handleOK = async () => {
    try {
      // If we're showing step 1 content but player is still at step 0, advance to step 1
      const currentStep = currentPlayer.ftuestep === 0 ? 1 : currentPlayer.ftuestep;
      const stepData = masterFTUEsteps.find(step => step.step === currentStep);

      // Check if this step has showFeedbackModalAfter and feedback hasn't been collected yet
      const hasFeedback = currentPlayer?.ftueFeedback &&
        (currentPlayer.ftueFeedback.positive?.length > 0 || currentPlayer.ftueFeedback.negative?.length > 0);

      if (stepData?.showFeedbackModalAfter && !hasFeedback) {
        // Show feedback modal as an intervention after OK is clicked
        console.log(`🎓 Step ${currentStep} has showFeedbackModalAfter, showing feedback modal`);
        setShowFeedbackModal(true);
        return; // Don't continue - onFeedbackSubmit will call continueStepLogic
      }

      // No feedback needed, continue with step logic
      await continueStepLogic();

    } catch (error) {
      console.error('Error advancing FTUE step:', error);
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
          //ftuestep: 3 // Advance to next step after choosing
        }
      });
      
      if (response.data.success) {
        setCurrentPlayer(prev => ({
          ...prev,
          aspiration: aspiration,
          //ftuestep: 3
        }));
        onClose();
      }
    } catch (error) {
      console.error('Error setting aspiration:', error);
    }
    handleOK(); // Advance to next step after feedback
  };

  // Handle checkbox toggle
  const toggleReason = (reasonIndex, isPositive) => {
    if (isPositive) {
      setPositiveReasons(prev => 
        prev.includes(reasonIndex) 
          ? prev.filter(r => r !== reasonIndex)
          : [...prev, reasonIndex]
      );
    } else {
      setNegativeReasons(prev => 
        prev.includes(reasonIndex) 
          ? prev.filter(r => r !== reasonIndex)
          : [...prev, reasonIndex]
      );
    }
  };

  // Don't render if no step data (unless showing feedback modal)
  if (!currentStepData && !showFeedbackModal) {
    return null;
  }

  // Render feedback modal if showing
  if (showFeedbackModal) {
    return (
      <div className="ftue-overlay">
        <div className="ftue-modal">
          <div className="ftue-header">
            <h2>{strings[780]}</h2>
          </div>
          
          <div className="ftue-feedback-content">
            {/* Positive feedback section */}
            <div className="ftue-feedback-section">
              <h3>{strings[781]}</h3>
              <div className="ftue-feedback-options">
                <label className="ftue-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={positiveReasons.includes(784)}
                    onChange={() => toggleReason(784, true)}
                  />
                  {strings[784]}
                </label>
                <label className="ftue-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={positiveReasons.includes(785)}
                    onChange={() => toggleReason(785, true)}
                  />
                  {strings[785]}
                </label>
                <label className="ftue-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={positiveReasons.includes(786)}
                    onChange={() => toggleReason(786, true)}
                  />
                  {strings[786]}
                </label>
                <label className="ftue-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={positiveReasons.includes(787)}
                    onChange={() => toggleReason(787, true)}
                  />
                  {strings[787]}
                </label>
              </div>
              <button
                className="ftue-button ftue-button-primary"
                onClick={() => onFeedbackSubmit(true)}
                disabled={positiveReasons.length === 0}
              >
                {strings[783]}
              </button>
            </div>

            {/* Negative feedback section */}
            <div className="ftue-feedback-section">
              <h3>{strings[782]}</h3>
              <div className="ftue-feedback-options">
                <label className="ftue-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={negativeReasons.includes(790)}
                    onChange={() => toggleReason(790, false)}
                  />
                  {strings[790]}
                </label>
                <label className="ftue-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={negativeReasons.includes(791)}
                    onChange={() => toggleReason(791, false)}
                  />
                  {strings[791]}
                </label>
                <label className="ftue-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={negativeReasons.includes(792)}
                    onChange={() => toggleReason(792, false)}
                  />
                  {strings[792]}
                </label>
                <label className="ftue-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={negativeReasons.includes(793)}
                    onChange={() => toggleReason(793, false)}
                  />
                  {strings[793]}
                </label>
              </div>
              <button
                className="ftue-button ftue-button-primary"
                onClick={() => onFeedbackSubmit(false)}
                disabled={negativeReasons.length === 0}
              >
                {strings[794]}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // Don't render modal if showModal is false (will auto-advance via useEffect)
  if (currentStepData?.showModal === false) {
    return null;
  }

  // Standard render for steps with showModal: true - use StoryModal with player icon
  return (
    <StoryModal
      isOpen={true}
      onClose={handleOK}
      symbol={currentPlayer?.icon || '😀'}
      dialogKey={currentStepData.bodyKey}
      relationshipType="FTUE"
      username={currentPlayer?.username}
    />
  );
};

// Re-export utility functions for backwards compatibility
export { incrementFTUEStep, getFTUEStep, addAcceptedQuest, completeTutorial, handleFeedbackSubmit } from './FTUEutils';

export default FTUE;