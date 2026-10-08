/**
 * NPCCitizenBehavior - the shared brain of every Citizen (quest, trade, heal, worker).
 * Design: docs/citizens.md (Track 4 of docs/audits/combat-and-npc-review-2026-10-07.md).
 *
 * SCAFFOLD (2026-10-08): the state LOOP runs and is visible (a resting citizen shows Zzz), and
 * the "waiting" interrupt is in place, but inside each state the citizen still runs its
 * legacy per-action behaviour (roam near the player, do nothing for workers). The real
 * working / eating / socializing behaviours land once the design is agreed.
 *
 * The loop: working -> resting -> roaming -> eating -> socializing -> working ...
 * Each state's length is a per-type field in resources.json (seconds):
 *   stateWorking, stateResting, stateRoaming, stateEating, stateSocializing
 * A state with 0 (or no) seconds is skipped. A citizen with no state fields at all keeps the
 * legacy behaviour and never cycles.
 *
 * "waiting" is NOT part of the loop: when the player comes within `range` (line of sight),
 * a quest, trade or heal citizen stops where it is and waits, with the loop's clock paused,
 * until the player leaves range. Workers do not wait.
 */
import playersInGridManager from '../../GridState/PlayersInGrid';
import { calculateDistance } from '../../Utils/worldHelpers';
import { isWallBlocking } from '../../Utils/GridManagement';
import { startHeadlineEffect, stopHeadlineEffect, updateHeadlineEffectPosition } from '../../VFX/NPCVFX';

export const CITIZEN_ACTIONS = ['quest', 'trade', 'heal', 'worker'];
export const CITIZEN_STATES = ['working', 'resting', 'roaming', 'eating', 'socializing'];
const WAITS_FOR_PLAYER = ['quest', 'trade', 'heal'];

const STATE_FIELD = { working: 'stateWorking', resting: 'stateResting', roaming: 'stateRoaming', eating: 'stateEating', socializing: 'stateSocializing' };
const HEADLINE = { resting: { type: 'Zzz' }, waiting: { type: 'emoji', emoji: '💬' } };

export const isCitizen = (npc) => !!npc && CITIZEN_ACTIONS.includes(npc.action);
export const stateSeconds = (npc, state) => Math.max(0, Number(npc?.[STATE_FIELD[state]]) || 0);
export const hasStateLoop = (npc) => CITIZEN_STATES.some((s) => stateSeconds(npc, s) > 0);

/** The next state in the loop with a non-zero length (wrapping), or null when none has one. */
export function nextCitizenState(npc, from) {
  const idx = CITIZEN_STATES.indexOf(from);
  // no current state: the loop starts at the first state with a length (working, normally)
  const order = idx < 0 ? CITIZEN_STATES : CITIZEN_STATES.slice(idx + 1).concat(CITIZEN_STATES.slice(0, idx + 1));
  return order.find((s) => stateSeconds(npc, s) > 0) || null;
}

function setHeadline(npc, state) {
  const h = HEADLINE[state];
  if (h) startHeadlineEffect(npc.id, h.type, npc.position, { emoji: h.emoji });
  else stopHeadlineEffect(npc.id);
}

/** Enter a loop state now (resets its clock). */
export function enterCitizenState(npc, state, now = Date.now()) {
  npc.citizenState = state;
  npc.citizenStateUntil = now + stateSeconds(npc, state) * 1000;
  npc.citizenStateEnteredAt = now;
  setHeadline(npc, state);
}

/** Seconds left in the current loop state (Infinity while waiting / no loop). */
export function citizenSecondsLeft(npc, now = Date.now()) {
  if (!npc?.citizenStateUntil || npc.citizenState === 'waiting') return Infinity;
  return Math.max(0, (npc.citizenStateUntil - now) / 1000);
}

async function handleCitizenBehavior(gridId, TILE_SIZE) {
  const now = Date.now();

  // ---- waiting: the player is near a quest/trade/heal citizen
  if (WAITS_FOR_PLAYER.includes(this.action)) {
    const pc = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {})[0];
    const near = !!pc && pc.hp > 0 && calculateDistance(pc.position, this.position) <= (this.range || 3) && !isWallBlocking(this.position, pc.position);
    if (near) {
      if (this.citizenState !== 'waiting') {
        // pause the loop's clock where it is
        this.citizenResume = { state: this.citizenState, remainingMs: Math.max(0, (this.citizenStateUntil || now) - now) };
        this.citizenState = 'waiting';
        setHeadline(this, 'waiting');
      }
      updateHeadlineEffectPosition(this.id, this.position);
      return; // no movement at all while the player is here
    }
    if (this.citizenState === 'waiting') {
      const r = this.citizenResume || {};
      if (r.state && hasStateLoop(this)) {
        this.citizenState = r.state;
        this.citizenStateUntil = now + (r.remainingMs || 0);
        setHeadline(this, r.state);
      } else {
        this.citizenState = null;
        stopHeadlineEffect(this.id);
      }
      this.citizenResume = null;
    }
  }

  // ---- the loop
  if (hasStateLoop(this)) {
    if (!this.citizenState || now >= (this.citizenStateUntil || 0)) {
      enterCitizenState(this, nextCitizenState(this, this.citizenState) || 'working', now);
    }
    updateHeadlineEffectPosition(this.id, this.position);
  }

  // ---- inside the state: SCAFFOLD, the legacy behaviour of the action
  // (docs/citizens.md says what each state will do once built)
  if (this.citizenState === 'resting') return; // rest is standing still, Zzz above the head
  switch (this.action) {
    case 'quest': return this.handleQuestGiverBehavior(gridId);
    case 'trade': return this.handleTraderBehavior(gridId);
    case 'heal': return this.handleHealBehavior(gridId);
    case 'worker': return this.handleWorkerBehavior(gridId);
    default: return undefined;
  }
}

export function attachCitizenBehavior(NPC) {
  NPC.prototype.handleCitizenBehavior = handleCitizenBehavior;
}
