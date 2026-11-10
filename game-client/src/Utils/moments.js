import API_BASE from '../config';
import axios from 'axios';

/**
 * One-time moments: the shared record for every JIT tutorial, nudge and prompt that must happen
 * once per profile (owner, 2026-11-06). Use this for any new one; never add a schema field or a
 * settings key for it.
 *
 *   hasMoment(player, key)                      true once the moment was stamped (any device)
 *   markMoment(player, key, setCurrentPlayer)   stamp it: instantly on this device, then on the
 *                                               server (POST /api/player/moment, one atomic $set)
 *
 * Where it is kept, and why all three:
 *   - player.moments[key]  (server, Player.moments) the durable record, read at boot on any device;
 *   - this device          (a session Set + localStorage), because many screens still rebuild the
 *                          client's player copy from an older one ({ ...currentPlayer, x } from a
 *                          stale closure), which can drop a stamp set a moment earlier; that is how
 *                          the survey nudge came back at every level-up;
 *   - LEGACY               the stamps written before moments existed, so old accounts are not asked
 *                          again (no migration needed).
 *
 * Keys in use: survey (the L5 survey nudge), email (the email ask), snugLesson (Travel with Snug),
 * audreyLesson (hire Audrey at L5, FarmHands/useAudreyLesson.js).
 * A key is a short name: letters first, then letters, digits, - or _ (no dots).
 */
const LEGACY = {
  survey: (p) => p?.survey_prompt_seen_at,
  email: (p) => p?.email_prompt_seen_at,
  snugLesson: (p) => p?.settings?.snugLessonDone,
};

const seenThisSession = new Set();
const localKey = (playerId, key) => `moment:${key}:${playerId}`;

function onThisDevice(playerId, key) {
  if (!playerId) return false;
  if (seenThisSession.has(localKey(playerId, key))) return true;
  try { return localStorage.getItem(localKey(playerId, key)) === '1'; } catch (_) { return false; }
}

export function hasMoment(player, key) {
  if (!player) return false;
  return !!(player.moments?.[key] || LEGACY[key]?.(player) || onThisDevice(player.playerId, key));
}

export function markMoment(player, key, setCurrentPlayer) {
  const playerId = player?.playerId;
  if (!playerId) return;
  seenThisSession.add(localKey(playerId, key));
  try { localStorage.setItem(localKey(playerId, key), '1'); } catch (_) { /* private mode: the session Set holds */ }
  const now = new Date().toISOString();
  setCurrentPlayer?.((prev) => (prev ? { ...prev, moments: { ...(prev.moments || {}), [key]: prev.moments?.[key] || now } } : prev));
  axios.post(`${API_BASE}/api/player/moment`, { playerId, key })
    .then(({ data }) => {
      if (data?.moments) setCurrentPlayer?.((prev) => (prev ? { ...prev, moments: { ...(prev.moments || {}), ...data.moments } } : prev));
    })
    .catch((e) => console.warn(`Could not record moment '${key}':`, e?.message));   // this device still remembers it
}
