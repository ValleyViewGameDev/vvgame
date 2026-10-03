/**
 * emojiKey: the atlas frame name for an emoji string.
 *
 * Used by scripts/build-atlas.js (to pick the Twemoji SVG for each `symbol`) and by the
 * renderer (to look the frame up at runtime), so both sides must agree. Twemoji's rule:
 * lower-case hex code points joined by "-", with U+FE0F (variation selector) dropped
 * unless the sequence contains U+200D (zero-width joiner).
 *
 *   emojiKey('🏕️') === '1f3d5'
 *   emojiKey('🧑‍🌾') === '1f9d1-200d-1f33e'
 *
 * ESM only; Node >= 22.12 can `require()` it from the CommonJS build script.
 */
export function emojiKey(str) {
  if (!str) return null;
  const hasZwj = str.includes('‍');
  const parts = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f && !hasZwj) continue;
    parts.push(cp.toString(16));
  }
  return parts.length ? parts.join('-') : null;
}

/** True when the string is a single emoji-ish symbol worth looking up (not a word, not empty). */
export function looksLikeEmoji(str) {
  if (!str || typeof str !== 'string') return false;
  if (str.length > 16) return false;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp > 0x2000) return true;
  }
  return false;
}
