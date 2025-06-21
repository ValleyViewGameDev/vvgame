import API_BASE from '../../config';
import axios from 'axios';

/**
 * Updates quest progress for a given player.
 * @param {Object} player - Current player object.
 * @param {String} action - Action performed (e.g., "Skill", "Craft").
 * @param {String} item - Item associated with the action (e.g., "Horse", "Axe").
 * @param {Number} quantity - Quantity of the item affected.
 * @param {Function} setCurrentPlayer - State updater for the current player.
 */
export async function trackQuestProgress(player, action, item, quantity, setCurrentPlayer) {
  if (!player?.activeQuests?.length) return;

  console.log("At trackQuestProgress; action = ",action);

  let questUpdated = false;

  const updatedQuests = player.activeQuests.map((quest) => {
    if (quest.completed || quest.rewardCollected) return quest; // Skip completed or rewarded quests

    const progress = { ...quest.progress };
    let goalsCompleted = 0; // Tracks how many goals are completed
    let totalGoals = 0;     // Tracks total defined goals

    for (let i = 1; i <= 3; i++) {
      const goalAction = quest[`goal${i}action`];
      const goalItem = quest[`goal${i}item`];
      const goalQty = quest[`goal${i}qty`];

      if (!goalAction || !goalItem || !goalQty) continue; // Skip undefined goals
      totalGoals++; // Count this as a valid goal

      if (goalAction === action && goalItem === item) {
        progress[`goal${i}`] = Math.min((progress[`goal${i}`] || 0) + quantity, goalQty); // Increment progress
      }

      // Check if the goal is completed
      if (progress[`goal${i}`] >= goalQty) goalsCompleted++;
    }

    // Mark quest as completed if all goals are done
    if (goalsCompleted === totalGoals && totalGoals > 0) {
      quest.completed = true;
    }

    quest.progress = progress;
    questUpdated = true;

    return quest;
  });

  if (questUpdated) {
    try {
      console.log("Saving updated player quests; updatedQuests = ", updatedQuests);
      const response = await axios.post(`${API_BASE}/api/update-player-quests`, {
        playerId: player.playerId,
        activeQuests: updatedQuests,
      });
      setCurrentPlayer(response.data.player); // Update the player's state
    } catch (error) {
      console.error('Error updating quest progress:', error);
    }
  }
}