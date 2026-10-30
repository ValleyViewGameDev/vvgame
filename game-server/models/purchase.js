// Purchase ledger: one row per fulfilled store purchase. Written by
// POST /api/purchase-store-offer (routes/paymentRoutes.js), the single
// server-side fulfilment point: Stripe Checkout redirects the client back with
// ?purchase=success&session_id=..., the client calls purchase-store-offer, and
// the server retrieves that session from Stripe (paid, metadata matching) before
// granting. `kind` 'stripe' = a verified paid session (stripeSessionId, unique:
// one grant per session); 'store_offer' = a developer grant with no payment
// (amountCents 0). Rows before 2026-10-30 were fulfilled on the client's word.
// There is no Stripe webhook yet. See docs/analytics.md (Monetization).
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
  stripeSessionId: { type: String, default: null },  // the verified Checkout session; one grant per session
  ts: { type: Date, default: Date.now, index: true },
  schema_version: { type: Number, default: 1 },
}, { collection: 'purchases', versionKey: false });
PurchaseSchema.index({ stripeSessionId: 1 }, { unique: true, partialFilterExpression: { stripeSessionId: { $type: 'string' } } });

module.exports = mongoose.model('Purchase', PurchaseSchema);
