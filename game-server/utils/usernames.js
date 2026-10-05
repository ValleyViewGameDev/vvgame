/**
 * Username rules, shared by registration, the profile rename and (phase B) the Home Deed
 * name prompt: trimmed, 2 to 20 characters, no control characters, no profanity
 * (leo-profanity, English list; the game's other languages get their own lists when needed).
 * Returns null when the name is acceptable, otherwise a short code the client maps to a
 * string: EMPTY | TOO_SHORT | TOO_LONG | INVALID | PROFANE.
 */
const filter = require('leo-profanity');

const MIN = 2;
const MAX = 20;

function validateUsername(raw) {
  if (typeof raw !== 'string') return 'EMPTY';
  const name = raw.trim();
  if (!name) return 'EMPTY';
  if (name.length < MIN) return 'TOO_SHORT';
  if (name.length > MAX) return 'TOO_LONG';
  if (/[\u0000-\u001f\u007f<>]/.test(name)) return 'INVALID';
  try { if (filter.check(name)) return 'PROFANE'; } catch (_) { /* filter never blocks a signup */ }
  return null;
}

module.exports = { validateUsername, USERNAME_MIN: MIN, USERNAME_MAX: MAX };
