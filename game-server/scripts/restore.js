#!/usr/bin/env node
/**
 * Restore a scripts/backup.js dump. Each listed collection is DROPPED and re-inserted.
 *
 *   node scripts/restore.js --dir backups/<stamp> --uri mongodb://localhost:27017/vvgame_rehearsal --yes
 *
 * --uri is required (never defaults to .env) so a rehearsal cannot accidentally hit production.
 * To restore production during a rollback, pass the production URI explicitly and --yes.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const dir = arg('--dir'); const uri = arg('--uri'); const yes = process.argv.includes('--yes');
if (!dir || !uri || !yes) {
  console.error('usage: node scripts/restore.js --dir <backup dir> --uri <mongodb uri> --yes');
  process.exit(1);
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log(`Restoring ${manifest.takenAt} (from "${manifest.database}") into "${db.databaseName}"`);
  for (const name of manifest.collections) {
    const docs = EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf-8'), { relaxed: false });
    await db.collection(name).drop().catch(() => {});
    if (docs.length) await db.collection(name).insertMany(docs);
    console.log(`  ${name.padEnd(12)} ${String(docs.length).padStart(6)} docs restored`);
  }
  await mongoose.disconnect();
  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });
