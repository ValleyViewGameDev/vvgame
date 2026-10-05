#!/usr/bin/env node
// Manual run of the unnamed-silent-account purge (utils/purgeUnnamed.js).
//   node scripts/purge-unnamed.js            lists the candidates (dry run)
//   node scripts/purge-unnamed.js --apply    deletes them and logs the count
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { purgeUnnamed, PURGE_AFTER_DAYS } = require('../utils/purgeUnnamed');

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await purgeUnnamed({ apply });
  for (const c of result.candidates) {
    console.log(`  ${c.username}  created ${c.created?.toISOString?.().slice(0, 10)}  lastActive ${c.lastActive?.toISOString?.().slice(0, 10) || '-'}  step ${c.ftuestep ?? '-'}`);
  }
  console.log(apply ? `Deleted ${result.count}.` : `${result.count} would be deleted (inactive ${PURGE_AFTER_DAYS}+ days). Re-run with --apply.`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
