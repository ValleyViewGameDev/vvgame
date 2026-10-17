/**
 * One-off migration (2026-10-16): the Mermaid becomes Viola (Twelfth Night), and the Mermaid's
 * Secret becomes Viola's Secret (docs/story.md). Persisted names live on players
 * (relationships[].name, npcRelationships[].a / .b, inventory / backpack item types, and anything
 * else holding the exact name) and in grids' NPCsInGrid (`type`). The grid resource layer stores
 * layout keys ('mm', 'sec7'), which do not change, so it needs nothing.
 *
 * Replaces exact string VALUES only (never keys, never substrings), field by field.
 *
 *   node scripts/backup.js                         first
 *   node scripts/rename-mermaid-to-viola.js        dry run: what would change
 *   node scripts/rename-mermaid-to-viola.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');

const RENAMES = { 'Mermaid': 'Viola', "Mermaid's Secret": "Viola's Secret" };
const apply = process.argv.includes('--apply');

// Returns [newValue, count] with every exact RENAMES value replaced
function rewrite(v) {
  if (typeof v === 'string') return RENAMES[v] ? [RENAMES[v], 1] : [v, 0];
  if (Array.isArray(v)) {
    let n = 0;
    const out = v.map((x) => { const [y, c] = rewrite(x); n += c; return y; });
    return [out, n];
  }
  if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId) && v._bsontype === undefined) {
    let n = 0;
    const out = {};
    for (const [k, x] of Object.entries(v)) { const [y, c] = rewrite(x); out[k] = y; n += c; }
    return [out, n];
  }
  return [v, 0];
}

async function migrate(db, collection, filterFields) {
  const coll = db.collection(collection);
  let docs = 0, values = 0;
  for (const doc of await coll.find({}).toArray()) {
    const set = {};
    let n = 0;
    for (const [field, value] of Object.entries(doc)) {
      if (field === '_id' || (filterFields && !filterFields.includes(field))) continue;
      const [next, c] = rewrite(value);
      if (c) { set[field] = next; n += c; }
    }
    if (!n) continue;
    docs++; values += n;
    const label = doc.username || (doc.gridCoord != null ? `grid ${doc.gridCoord}${doc.isTemplate ? ' template' : ' copy'}` : String(doc._id));
    console.log(`  ${collection}: ${label}: ${n} value(s) in ${Object.keys(set).join(', ')}`);
    if (apply) await coll.updateOne({ _id: doc._id }, { $set: set });
  }
  return { docs, values };
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(apply ? 'APPLYING' : 'DRY RUN (pass --apply to write)');
  const p = await migrate(db, 'players');
  const g = await migrate(db, 'grids', ['NPCsInGrid']);
  console.log(`players: ${p.docs} docs, ${p.values} values; grids: ${g.docs} docs, ${g.values} values`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
