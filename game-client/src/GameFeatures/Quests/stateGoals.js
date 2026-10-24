import API_BASE from '../../config';
import axios from 'axios';

/**
 * Quest goals that are a fact about the player, not a count of things done after accepting:
 *   Acquire <skill or power>   the player owns it
 *   Meet <NPC type>            the player has greeted that character (relationship `met`)
 *   Find <item>                the player holds it, or (one of the seven treasures) has ever found
 *                              it (`player.hopeFound`), so giving it to the Oracle does not undo it
 *   Discover <region>          the player has entered that valley region (`player.regionsVisited`,
 *                              or standing in it now: an older account's list is seeded on the server)
 * Meet and Find were added for Constable Elbow's story chain (docs/narrative-pass.md P3.4); Discover
 * for the mid-game quests (docs/midgame-quests-draft.md).
 * Every place that decides "is this goal done" asks here: the To Do panel, the HUD badge, the
 * accept-time check and the giver's panel.
 */
export const STATE_GOALS = ['Acquire', 'Meet', 'Find', 'Discover'];

const holds = (list, item) => (list || []).some((i) => i?.type === item && (i.quantity || 0) > 0);

export function stateGoalMet(action, item, player) {
  if (!player || !item) return false;
  switch (action) {
    case 'Acquire': return !!(player.skills?.some((s) => s.type === item) || player.powers?.some((p) => p.type === item));
    case 'Meet': return !!player.relationships?.some((r) => r?.name === item && r.met);
    case 'Find': return holds(player.inventory, item) || holds(player.backpack, item)
      || (Array.isArray(player.hopeFound) && player.hopeFound.includes(item));
    case 'Discover': return !!(player.regionsVisited?.includes(item) || player.location?.region === item);
    default: return false;
  }
}

/** The quest with its state goals brought up to date: { quest, changed }. */
export function applyStateGoals(quest, player) {
  if (!quest || quest.completed || quest.rewardCollected) return { quest, changed: false };
  const progress = { ...(quest.progress || {}) };
  let changed = false; let total = 0; let met = 0;
  for (let i = 1; i <= 3; i++) {
    const action = quest[`goal${i}action`]; const item = quest[`goal${i}item`]; const qty = quest[`goal${i}qty`];
    if (!action || !item || !qty) continue;
    total++;
    if (STATE_GOALS.includes(action) && stateGoalMet(action, item, player) && (progress[`goal${i}`] || 0) < qty) {
      progress[`goal${i}`] = qty;
      changed = true;
    }
    if ((progress[`goal${i}`] || 0) >= qty) met++;
  }
  const completed = total > 0 && met === total;
  if (!changed && !completed) return { quest, changed: false };
  return { quest: { ...quest, progress, completed }, changed: changed || completed };
}

/** Bring every active quest's state goals up to date, saving when anything changed. */
export async function refreshStateGoals(player, setCurrentPlayer) {
  const active = player?.activeQuests || [];
  let any = false;
  const updated = active.map((q) => { const r = applyStateGoals(q, player); if (r.changed) any = true; return r.quest; });
  if (!any) return active;
  setCurrentPlayer?.((prev) => ({ ...prev, activeQuests: updated }));
  try {
    await axios.post(`${API_BASE}/api/update-player-quests`, { playerId: player.playerId, activeQuests: updated });
  } catch (err) {
    console.error('refreshStateGoals: save failed', err);
  }
  return updated;
}
