// What the player brings to a conversation (owner 2026-11-02, Conversation.js): the last doober
// they collected (round 1) and the last NPC they used a relationship button on (round 2). Kept
// per player in localStorage, so a refresh keeps them; when unavailable the old picks apply.
const dooberKey = (playerId) => `vv:lastDoober:${playerId || 'anon'}`;
const npcKey = (playerId) => `vv:recentNpcs:${playerId || 'anon'}`;

/** A doober was collected: off the board (ResourceClicking.js) or from a crafting slot. */
export function rememberLastDoober(playerId, type) {
  if (!type) return;
  try { localStorage.setItem(dooberKey(playerId), type); } catch (_) { /* private mode */ }
}
export function lastDoober(playerId) {
  try { return localStorage.getItem(dooberKey(playerId)); } catch (_) { return null; }
}

/** A relationship button was used on this NPC (RelationshipCard.js): the most recent first. */
export function rememberNpcInteraction(playerId, npcName) {
  if (!npcName) return;
  try {
    const list = JSON.parse(localStorage.getItem(npcKey(playerId)) || '[]').filter((n) => n !== npcName);
    localStorage.setItem(npcKey(playerId), JSON.stringify([npcName, ...list].slice(0, 5)));
  } catch (_) { /* private mode */ }
}
/** The last NPC interacted with, not counting `except` (the one being talked to now). */
export function lastNpcInteraction(playerId, except) {
  try {
    return JSON.parse(localStorage.getItem(npcKey(playerId)) || '[]').find((n) => n !== except) || null;
  } catch (_) { return null; }
}
