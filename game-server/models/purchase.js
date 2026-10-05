// Purchase ledger: one row per fulfilled store purchase. Written by
// POST /api/purchase-store-offer (routes/paymentRoutes.js), which is the single
// server-side fulfilment point today: Stripe Checkout redirects the client back
// with ?purchase=success and the client then calls purchase-store-offer, so a
// Stripe-paid offer and a free/dev-granted offer land in the same route. `kind`
// records which it was: 'stripe' when the offer carries a price (priceInCents),
// 'store_offer' otherwise. There is no Stripe webhook yet, so a paid row here
// means "the client reported success and the server fulfilled it", not "Stripe
// confirmed payment". See docs/analytics.md (Monetization).
//
// Durable + never deleted: Monetization reads revenue from this ledger, not
// from the live players doc, so a deleted account's purchases still count.

const mongoose = require('mongoose');

const PurchaseSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, index: true },
  username: { type: String, default: null },        // stamped so a deleted account stays recognizable
  kind: { type: String, enum: ['store_offer', 'stripe'], required: true },
  offerId: { type: String, required: true },         // store.json offer id (stringified)
  title: { type: String, default: null },            // offer title at purchase time
  gems: { type: Number, default: 0 },                // Gem quantity in the offer's rewards (0 when none)
  amountCents: { type: Number, default: 0 },         // offer.priceInCents at purchase time (0 for free grants)
  ts: { type: Date, default: Date.now, index: true },
  schema_version: { type: Number, default: 1 },
}, { collection: 'purchases', versionKey: false });

module.exports = mongoose.model('Purchase', PurchaseSchema);
