/**
 * One-off migration (2026-11-11): dungeon templates renamed (d001 -> d001_Large, d002 ->
 * d002_TownCellar, d003 -> d003_Zombie, dPhoenix -> d005_Phoenix). Rewrites the old names where
 * they are persisted:
 *   - frontiers: dungeons.<id>.templateUsed
 *   - grids:     templateKey 'dungeon:<old>' (the template instance and every player's copy)
 * Until it runs, the server still finds the file through RENAMED_TEMPLATES (utils/dungeonUtils.js),
 * so it is safe to run after the deploy.
 *
 *   node scripts/backup.js                           first
 *   node scripts/rename-dungeon-templates.js          dry run: what would change
 *   node scripts/rename-dungeon-templates.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');

const { RENAMED_TEMPLATES } = require('../utils/dungeonUtils');
const apply = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(apply ? 'APPLYING' : 'DRY RUN (pass --apply to write)');

  const frontiers = db.collection('frontiers');
  for (const f of await frontiers.find({}, { projection: { name: 1, dungeons: 1 } }).toArray()) {
    const set = {};
    for (const [id, entry] of Object.entries(f.dungeons || {})) {
      const to = RENAMED_TEMPLATES[String(entry?.templateUsed || '').replace(/\.json$/, '')];
      if (to) set[`dungeons.${id}.templateUsed`] = to;
    }
    if (!Object.keys(set).length) continue;
    console.log(`  frontier ${f.name}: ${Object.keys(set).length} registry entr(ies)`);
    if (apply) await frontiers.updateOne({ _id: f._id }, { $set: set });
  }

  const grids = db.collection('grids');
  for (const [from, to] of Object.entries(RENAMED_TEMPLATES)) {
    const filter = { templateKey: `dungeon:${from}` };
    const n = await grids.countDocuments(filter);
    console.log(`  grids with templateKey dungeon:${from} -> dungeon:${to}: ${n}`);
    if (apply && n) await grids.updateMany(filter, { $set: { templateKey: `dungeon:${to}` } });
  }

  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
