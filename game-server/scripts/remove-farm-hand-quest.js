/**
 * One-off migration (2026-11-11): "Hire Farm Hand" was deleted from questsEN.json
 * (the forced Audrey lesson, useAudreyLesson.js, replaces it). Removes it from every player's
 * activeQuests and completedQuests. Nothing else refers to it; the To Do list already ignored
 * the stale entries, so this is cleanup.
 *
 *   node scripts/backup.js                    first
 *   node scripts/remove-farm-hand-quest.js       dry run
 *   node scripts/remove-farm-hand-quest.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');

const TITLE = 'Hire Farm Hand';
const apply = process.argv.includes('--apply');
const isFarmHand = (q) => q === TITLE || q?.questId === TITLE || q?.title === TITLE;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const players = mongoose.connection.db.collection('players');
  console.log(apply ? 'APPLYING' : 'DRY RUN (pass --apply to write)');
  let touched = 0;
  for (const p of await players.find({}).project({ username: 1, activeQuests: 1, completedQuests: 1 }).toArray()) {
    const set = {};
    for (const field of ['activeQuests', 'completedQuests']) {
      if (!Array.isArray(p[field])) continue;
      const kept = p[field].filter((q) => !isFarmHand(q));
      if (kept.length !== p[field].length) set[field] = kept;
    }
    if (!Object.keys(set).length) continue;
    touched++;
    console.log(`  ${p.username}: removed from ${Object.keys(set).join(', ')}`);
    if (apply) await players.updateOne({ _id: p._id }, { $set: set });
  }
  console.log(`${touched} player(s) ${apply ? 'updated' : 'would change'}`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
