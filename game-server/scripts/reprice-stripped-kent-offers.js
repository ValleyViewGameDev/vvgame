#!/usr/bin/env node
/**
 * Kent's two-item cards were saved without their `items` (the player schema had no such path,
 * fixed 2026-10-12), so every stored two-item card reloaded as its FIRST item at the two-item
 * price. The second item is gone for good; this reprices those cards to what they now ask for:
 * Money = maxprice x quantity of the remaining item (minprice or 10 as fallback, as Kent does).
 * Bonus rewards (valley items) are kept.
 *
 *   node scripts/reprice-stripped-kent-offers.js          -> dry run, prints the ledger
 *   node scripts/reprice-stripped-kent-offers.js --apply  -> writes
 *
 * A card is repriced only when it has no `items` and its Money is above what its one item is
 * worth. Run scripts/backup.js first.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const resources = require('../tuning/resources.json');

const apply = process.argv.includes('--apply');
const byType = Object.fromEntries(resources.map((r) => [r.type, r]));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const players = mongoose.connection.db.collection('players');
  const cursor = players.find({ 'kentOffers.offers.0': { $exists: true } }, { projection: { username: 1, kentOffers: 1 } });

  let cards = 0;
  let playersChanged = 0;
  for await (const player of cursor) {
    const offers = player.kentOffers.offers;
    const lines = [];
    offers.forEach((offer, index) => {
      if (offer.items?.length) return;
      const money = offer.rewards?.find((r) => r.item === 'Money');
      if (!money) return;
      const resource = byType[offer.item];
      const worth = (resource?.maxprice || resource?.minprice || 10) * offer.quantity;
      if (money.quantity <= worth) return;
      lines.push(`  #${index} ${offer.quantity} ${offer.item}: ${money.quantity.toLocaleString()} -> ${worth.toLocaleString()}`);
      money.quantity = worth;
      cards++;
    });
    if (lines.length === 0) continue;
    playersChanged++;
    console.log(player.username);
    lines.forEach((l) => console.log(l));
    if (apply) {
      await players.updateOne({ _id: player._id }, { $set: { 'kentOffers.offers': offers } });
    }
  }

  console.log(`\n${cards} card(s) on ${playersChanged} player(s) ${apply ? 'repriced' : 'would be repriced (dry run; --apply to write)'}.`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
