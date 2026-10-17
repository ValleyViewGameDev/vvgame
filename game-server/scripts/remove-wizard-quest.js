/**
 * One-off migration (2026-10-17): "Find the Wizard in the Valley" was deleted from questsEN.json
 * (Prospero now trades his Orb for a riddle, docs/story.md §4). Removes it from every player's
 * activeQuests and completedQuests. Nothing else refers to it; the To Do list already ignored
 * the stale entries, so this is cleanup.
 *
 *   node scripts/backup.js                    first
 *   node scripts/remove-wizard-quest.js       dry run
 *   node scripts/remove-wizard-quest.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');

const TITLE = 'Find the Wizard in the Valley';
const apply = process.argv.includes('--apply');
const isWizard = (q) => q === TITLE || q?.questId === TITLE || q?.title === TITLE;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const players = mongoose.connection.db.collection('players');
  console.log(apply ? 'APPLYING' : 'DRY RUN (pass --apply to write)');
  let touched = 0;
  for (const p of await players.find({}).project({ username: 1, activeQuests: 1, completedQuests: 1 }).toArray()) {
    const set = {};
    for (const field of ['activeQuests', 'completedQuests']) {
      if (!Array.isArray(p[field])) continue;
      const kept = p[field].filter((q) => !isWizard(q));
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
