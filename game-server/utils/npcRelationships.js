/**
 * npcRelationships - the citizen-to-citizen relationship store on the Player document
 * (docs/citizens.md §2.2, decision 7). One row per unordered pair of NPC types; the client
 * seeds a new pair from its static RelationshipMatrix and sends the conversation's delta;
 * the server clamps the score and keeps the status flags in step with it.
 */
const SCORE_MIN = -100;
const SCORE_MAX = 100;
const FRIEND_AT = 30;   // relscore at or above which two citizens are friends
const RIVAL_AT = -30;   // relscore at or below which they are rivals
const LOVE_AT = 70;     // a seeded love stays unless the score falls under this

const pairKey = (a, b) => (String(a) < String(b) ? [String(a), String(b)] : [String(b), String(a)]);

function findPair(player, a, b) {
  const [x, y] = pairKey(a, b);
  return (player.npcRelationships || []).find((r) => r.a === x && r.b === y) || null;
}

/** Flags follow the score; `love` is only ever seeded (the matrix) and lost by falling out. */
function applyFlags(row) {
  row.friend = row.relscore >= FRIEND_AT && !row.rival;
  row.rival = row.relscore <= RIVAL_AT;
  if (row.rival) row.friend = false;
  if (row.love && row.relscore < LOVE_AT) row.love = false;
  return row;
}

/**
 * Apply a conversation outcome. `seed` = { relscore, love } the client derived from the
 * static matrix, used only when the pair has no row yet.
 */
function applyDelta(player, a, b, delta, seed = {}) {
  const [x, y] = pairKey(a, b);
  if (!Array.isArray(player.npcRelationships)) player.npcRelationships = [];
  let row = findPair(player, x, y);
  if (!row) {
    row = { a: x, b: y, relscore: Number(seed.relscore) || 0, friend: false, rival: false, love: !!seed.love, talks: 0, lastTalkAt: null };
    applyFlags(row);
    player.npcRelationships.push(row);
    row = findPair(player, x, y);
  }
  row.relscore = Math.max(SCORE_MIN, Math.min(SCORE_MAX, (row.relscore || 0) + (Number(delta) || 0)));
  row.talks = (row.talks || 0) + 1;
  row.lastTalkAt = new Date();
  applyFlags(row);
  player.markModified('npcRelationships');
  return row;
}

module.exports = { pairKey, findPair, applyDelta, applyFlags, FRIEND_AT, RIVAL_AT, LOVE_AT };
