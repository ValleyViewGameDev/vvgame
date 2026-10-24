import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { createCollectEffect } from '../../VFX/VFX';

/**
 * A one-off walk for a story moment: set `npc.storyGoal = { x, y, onArrive, since }` (memory only)
 * and the citizen's brain walks it there before anything else (NPCCitizenBehavior calls
 * runStoryGoal first), then calls onArrive once and clears it. A route that is blocked or takes
 * longer than GOAL_MS ends in a teleport onto the goal. Used by Viola swimming to her brother
 * (violaReunion.js). Feste's walk to the statue is a derived errand instead (gertrudeWaking.js),
 * because it must survive a reload.
 */
const GOAL_MS = 20000;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function runStoryGoal(npc, gridId, tiles, resources, npcs, TILE_SIZE = 45) {
  const goal = npc.storyGoal;
  if (!goal) return false;
  const now = Date.now();
  if (!goal.since) goal.since = now;
  const arrive = () => {
    npc.storyGoal = null;
    npc.path = null;
    NPCsInGridManager.updateNPC(gridId, npc.id, { position: npc.position, homeX: goal.x, homeY: goal.y }).catch(() => {});
    try { goal.onArrive?.(npc); } catch (e) { console.error('story goal onArrive failed', e); }
  };
  if (cheb(npc.position, goal) === 0) { arrive(); return true; }
  const step = npc.followPath(goal.x, goal.y, tiles, resources, npcs);
  if (step === 'arrived') { arrive(); return true; }
  if (step === 'blocked' || now - goal.since > GOAL_MS) {
    npc.position = { x: goal.x, y: goal.y };
    createCollectEffect(goal.x, goal.y, TILE_SIZE);
    arrive();
  }
  return true;
}
