#!/usr/bin/env node
/**
 * One grant per Stripe Checkout session (routes/paymentRoutes.js logPurchase): builds the unique
 * partial index on purchases.stripeSessionId. server.js runs with autoIndex off, so the schema's
 * index is only built here. Safe to re-run; touches no documents.
 *
 *   node scripts/create-purchase-session-index.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Purchase = require('../models/purchase');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await Purchase.createIndexes();
  const names = (await Purchase.collection.indexes()).map((i) => i.name);
  console.log(`purchases indexes on "${mongoose.connection.db.databaseName}": ${names.join(', ')}`);
  await mongoose.disconnect();
})().catch(async (err) => { console.error(err); await mongoose.disconnect(); process.exit(1); });
