/**
 * One-off migration (2026-10-24): Gertrude became a statue in every town (docs/story.md §0,
 * utils/storyState.js). Every enter-grid now turns a town copy's Gertrude NPC back into the
 * statue unless the player's storyFlags.gertrudeAwake is set. Players who already met her keep
 * her awake: this sets the flag for every player with a Gertrude relationship (or her Secret).
 * Their town copies are put right on their next enter-grid; nothing else changes.
 *
 *   node scripts/backup.js                              first
 *   node scripts/wake-gertrude-for-friends.js           dry run
 *   node scripts/wake-gertrude-for-friends.js --apply   [--except name,name]
 */
require('dotenv').config();
const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');
const exceptArg = process.argv.includes('--except') ? process.argv[process.argv.indexOf('--except') + 1] : '';
const except = new Set(exceptArg.split(',').map((s) => s.trim()).filter(Boolean));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const players = mongoose.connection.db.collection('players');
  console.log(apply ? 'APPLYING' : 'DRY RUN (pass --apply to write)');
  let n = 0;
  for (const p of await players.find({}).project({ username: 1, relationships: 1, inventory: 1, backpack: 1, storyFlags: 1 }).toArray()) {
    const knows = (p.relationships || []).some((r) => r?.name === 'Gertrude')
      || [...(p.inventory || []), ...(p.backpack || [])].some((i) => i?.type === "Gertrude's Secret");
    if (!knows || p.storyFlags?.gertrudeAwake) continue;
    if (except.has(p.username)) { console.log(`  ${p.username}: skipped (--except)`); continue; }
    n++;
    console.log(`  ${p.username}: Gertrude stays awake`);
    if (apply) await players.updateOne({ _id: p._id }, { $set: { 'storyFlags.gertrudeAwake': new Date() } });
  }
  console.log(`${n} player(s) ${apply ? 'updated' : 'would change'}`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
