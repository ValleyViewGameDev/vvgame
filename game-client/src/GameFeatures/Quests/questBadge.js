import { STATE_GOALS, stateGoalMet } from './stateGoals';

/**
 * The Quest HUD button's badge (App.js, owner 2026-10-11): 'completed' (✅) when any active quest
 * is ready to turn in, 'active' (?) when there are active quests but none is done, else null.
 *
 * "Done" is the To Do panel's own test (QuestPanel.reevaluateQuestProgress): the stored completed
 * flag, or every goal's progress at its qty, with an Acquire goal met by owning that skill or
 * power (and Meet / Find the same way, stateGoals.js). Quests whose template no longer exists (stale or renamed) are ignored, as the panel
 * ignores them; `validTitles` is the set of current quest titles (null = not loaded yet: trust
 * the player's list).
 */
export function isQuestDone(quest, player) {
  if (quest.completed) return true;
  let total = 0; let met = 0;
  for (let i = 1; i <= 3; i++) {
    const action = quest[`goal${i}action`]; const item = quest[`goal${i}item`]; const qty = quest[`goal${i}qty`];
    if (!action || !item || !qty) continue;
    total++;
    const owned = STATE_GOALS.includes(action) && stateGoalMet(action, item, player); // Acquire / Meet / Find
    if (owned || (quest.progress?.[`goal${i}`] || 0) >= qty) met++;
  }
  return total > 0 && met === total;
}

export function questBadgeState(player, validTitles) {
  const open = (player?.activeQuests || []).filter(q =>
    !q.rewardCollected && (!validTitles || validTitles.has(q.questId)));
  if (open.length === 0) return null;
  return open.some(q => isQuestDone(q, player)) ? 'completed' : 'active';
}
