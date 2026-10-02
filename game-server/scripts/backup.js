#!/usr/bin/env node
/**
 * Dump the four gameplay collections to JSON so a migration can be rehearsed and rolled back.
 *
 *   node scripts/backup.js            -> game-server/backups/<ISO timestamp>/<collection>.json
 *   node scripts/backup.js --out DIR  -> custom directory
 *
 * Uses MONGODB_URI from game-server/.env. Read-only. mongodump is not installed on the dev
 * machine, which is why this exists. Restore with scripts/restore.js.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const COLLECTIONS = ['players', 'grids', 'settlements', 'frontiers'];

(async () => {
  const outArg = process.argv.indexOf('--out');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = outArg > -1 ? process.argv[outArg + 1] : path.join(__dirname, '../backups', stamp);
  fs.mkdirSync(outDir, { recursive: true });

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log(`Backing up database "${db.databaseName}" to ${outDir}`);

  for (const name of COLLECTIONS) {
    const docs = await db.collection(name).find({}).toArray();
    const file = path.join(outDir, `${name}.json`);
    fs.writeFileSync(file, EJSON.stringify(docs, { relaxed: false }));
    const mb = (fs.statSync(file).size / 1048576).toFixed(1);
    console.log(`  ${name.padEnd(12)} ${String(docs.length).padStart(6)} docs  ${mb} MB`);
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
    database: db.databaseName, takenAt: new Date().toISOString(), collections: COLLECTIONS
  }, null, 2));
  await mongoose.disconnect();
  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });
