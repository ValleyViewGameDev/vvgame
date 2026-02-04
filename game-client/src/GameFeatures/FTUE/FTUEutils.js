import axios from 'axios';
import API_BASE from '../../config';
import { getFTUEsteps } from '../../Utils/TuningManager';

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

// Export function to try advancing FTUE by trigger key
// Only advances if the player is at the step immediately before the trigger's step
export const tryAdvanceFTUEByTrigger = async (triggerKey, playerId, currentPlayer, setCurrentPlayer) => {
  // Only process for first-time users
  if (!currentPlayer?.firsttimeuser) {
    return currentPlayer?.ftuestep || 0;
  }

  const currentStep = currentPlayer?.ftuestep || 0;

  // Find a step that has this trigger AND where the player is at the expected step
  // This allows the same trigger to be reused across multiple steps
  const triggerStep = getFTUEsteps().find(step =>
    step.trigger === triggerKey && step.step === currentStep + 1
  );

  if (!triggerStep) {
    console.log(`🎓 No FTUE step found with trigger: ${triggerKey} for current step ${currentStep}`);
    return currentStep;
  }

  console.log(`🎓 Trigger "${triggerKey}" matched! Advancing from step ${currentStep} to ${triggerStep.step}`);
  return incrementFTUEStep(playerId, currentPlayer, setCurrentPlayer);
};

// Export function to increment FTUE step in both DB and local state
export const incrementFTUEStep = async (playerId, currentPlayer, setCurrentPlayer) => {
  try {
    const currentStep = currentPlayer?.ftuestep || 0;
    const nextStep = currentStep + 1;

    // Check if the next step exists in the data
    const nextStepExists = getFTUEsteps().some(step => step.step === nextStep);

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

      console.log(`✅ Quest "${questTemplate.title}" added to active quests`);
      return updatedPlayer;
    }

    return currentPlayer;
  } catch (error) {
    console.error('Error adding accepted quest:', error);
    return currentPlayer;
  }
};

// Export function to complete the FTUE tutorial
export const completeTutorial = async (playerId, currentPlayer, setCurrentPlayer, onClose) => {
  try {
    // First check if the Wizard quest (index=1) has already been added
    const currentActiveQuests = currentPlayer?.activeQuests || [];
    const wizardQuestExists = currentActiveQuests.some(q => q.questId === "Find the Wizard in the Valley");

    let finalActiveQuests = currentActiveQuests;

    if (!wizardQuestExists) {
      console.log('🎓 Adding completed Wizard quest before completing tutorial');

      // Add the quest with index=1
      const updatedPlayer = await addAcceptedQuest(playerId, currentPlayer, setCurrentPlayer, 1);

      // Mark it as completed
      if (updatedPlayer.activeQuests && updatedPlayer.activeQuests.length > 0) {
        const questIndex = updatedPlayer.activeQuests.findIndex(q => q.questId === "Find the Wizard in the Valley");
        if (questIndex !== -1) {
          updatedPlayer.activeQuests[questIndex].completed = true;
          finalActiveQuests = updatedPlayer.activeQuests;

          // Save the completed quest
          await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: playerId,
            updates: { activeQuests: finalActiveQuests }
          });
        }
      }
    } else {
      console.log('🎓 Wizard quest already exists, skipping addition');
    }


    // Update the player's firsttimeuser flag to false and remove ftuestep
    const response = await axios.post(`${API_BASE}/api/update-profile`, {
      playerId: playerId,
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
      if (onClose) onClose();
    }
  } catch (error) {
    console.error('Error completing tutorial:', error);
    // Close anyway to not block the user
    if (onClose) onClose();
  }
};

// Export function to handle feedback submission (saves feedback only, does not advance step)
export const handleFeedbackSubmit = async (isPositive, playerId, currentPlayer, setCurrentPlayer, positiveReasons, negativeReasons) => {
  try {
    // Detect browser type
    const getBrowserType = () => {
      const userAgent = navigator.userAgent;
      if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
      if (userAgent.includes('Firefox')) return 'Firefox';
      if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
      if (userAgent.includes('Edg')) return 'Edge';
      if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
      return 'Unknown';
    };

    const browserType = getBrowserType();

    // Save feedback to database (do not advance step - let caller handle that)
    // Use dot notation to preserve existing ftueFeedback fields (like diagnostics from account creation)
    const response = await axios.post(`${API_BASE}/api/update-profile`, {
      playerId: playerId,
      updates: {
        'ftueFeedback.positive': isPositive ? positiveReasons : [],
        'ftueFeedback.negative': !isPositive ? negativeReasons : [],
        'ftueFeedback.browser': browserType
      }
    });

    if (response.data.success) {
      // Update local state with feedback only, preserving existing ftueFeedback fields
      setCurrentPlayer(prev => ({
        ...prev,
        ftueFeedback: {
          ...prev.ftueFeedback,
          positive: isPositive ? positiveReasons : [],
          negative: !isPositive ? negativeReasons : [],
          browser: browserType
        }
      }));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error saving FTUE feedback:', error);
    return false;
  }
};
