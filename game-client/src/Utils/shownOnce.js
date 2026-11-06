/**
 * A local "already shown" mark for the once-per-profile prompts (the survey nudge, the email ask,
 * the Snug lesson), kept beside their server stamp (survey_prompt_seen_at, email_prompt_seen_at,
 * settings.snugLessonDone).
 *
 * Why: those prompts check a field on the client's player copy, and many screens still rebuild
 * that copy from an older one (`{ ...currentPlayer, x }` from a stale closure), which silently
 * drops a stamp set a moment earlier; the prompt then came back at the next level-up
 * (owner, 2026-11-06). The server stamp still covers other devices (it is read at boot); this mark
 * covers the rest of the session and later sessions on this device.
 *
 *   wasShown(playerId, key)   true once markShown ran for this player on this device
 *   markShown(playerId, key)
 */
const shownThisSession = new Set();
const storageKey = (playerId, key) => `shownOnce:${key}:${playerId}`;

export function wasShown(playerId, key) {
  if (!playerId) return false;
  if (shownThisSession.has(storageKey(playerId, key))) return true;
  try { return localStorage.getItem(storageKey(playerId, key)) === '1'; } catch (_) { return false; }
}

export function markShown(playerId, key) {
  if (!playerId) return;
  shownThisSession.add(storageKey(playerId, key));
  try { localStorage.setItem(storageKey(playerId, key), '1'); } catch (_) { /* private mode: the session Set still holds */ }
}
