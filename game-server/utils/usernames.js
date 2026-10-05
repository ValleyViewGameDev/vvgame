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

// Generated name for a silent account: "Brave Fox 4821". Unique against the players collection.
const ADJECTIVES = ['Brave', 'Quiet', 'Merry', 'Clever', 'Gentle', 'Hardy', 'Lucky', 'Nimble', 'Steady', 'Sunny', 'Wild', 'Bold', 'Keen', 'Kind', 'Swift'];
const NOUNS = ['Fox', 'Hare', 'Otter', 'Finch', 'Badger', 'Heron', 'Lark', 'Wren', 'Stag', 'Vole', 'Robin', 'Ox', 'Goose', 'Hound', 'Ram'];
async function generateUniqueRandomUsername(Player) {
  for (let i = 0; i < 20; i++) {
    const name = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]} ${1000 + Math.floor(Math.random() * 9000)}`;
    if (!(await Player.exists({ username: name }))) return name;
  }
  return `Wanderer ${Date.now().toString(36)}`;
}

module.exports = { validateUsername, generateUniqueRandomUsername, USERNAME_MIN: MIN, USERNAME_MAX: MAX };
