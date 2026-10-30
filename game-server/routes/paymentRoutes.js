const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Player = require('../models/player'); // Import the Player model
const Grid = require('../models/grid');
const Settlement = require('../models/settlement');
const sendMailboxMessage = require('../utils/messageUtils'); // or messageUtils/sendMailboxMessage.js
const Purchase = require('../models/purchase');
const { recordPurchase } = require('../utils/analytics');
const { isDeveloperPlayerId } = require('../utils/serviceMode');

let stripeClient = null;
const stripe = () => (stripeClient ||= require('stripe')(process.env.STRIPE_SECRET_KEY));

// Append a row to the purchases ledger (models/purchase.js) and flag the player's activity day.
// A Stripe-paid offer carries its Checkout session id, which is unique in the ledger: the row is
// written (awaited) BEFORE the reward, so a second fulfilment of the same session (App.js and the
// Store both read the success redirect, a reload, a replayed URL) hits the duplicate key and
// grants nothing. Returns false when that session was already fulfilled. A developer grant
// (no session) is 'store_offer' and fire-and-forget. See docs/analytics.md.
async function logPurchase(player, offer, stripeSessionId = null) {
  const rewards = Array.isArray(offer.rewards) ? offer.rewards : [];
  const gems = rewards.filter((r) => r && r.item === 'Gem').reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const row = {
    playerId: player._id,
    username: player.username || null,
    kind: stripeSessionId ? 'stripe' : 'store_offer',
    offerId: String(offer.id),
    title: offer.title || null,
    gems,
    amountCents: stripeSessionId ? (Number(offer.priceInCents) || 0) : 0,
    stripeSessionId,
    ts: new Date(),
  };
  if (stripeSessionId) {
    // The unique index (scripts/create-purchase-session-index.js; autoIndex is off) closes the
    // race; the lookup covers a database the script has not run on yet.
    if (await Purchase.exists({ stripeSessionId })) return false;
    try { await Purchase.create(row); } catch (err) { if (err?.code === 11000) return false; throw err; }
  } else {
    Purchase.create(row).catch(() => {});
  }
  recordPurchase(player._id).catch(() => {});
  return true;
}
 

// POST /create-checkout-session
// A Stripe failure (expired key, Stripe down) answers 502; it used to be an unhandled rejection
// that took the whole server down, so every request in flight failed with no CORS header.
router.post('/create-checkout-session', async (req, res) => {
  const { playerId, offerId } = req.body;
  const storeOffers = require('../tuning/store.json');
  const offer = storeOffers.find(o => String(o.id) === String(offerId));
  if (!offer || !(Number(offer.priceInCents) > 0)) return res.status(400).json({ error: 'Invalid offerId' });
  if (!playerId || !mongoose.Types.ObjectId.isValid(playerId) || !(await Player.exists({ _id: playerId }))) {
    return res.status(400).json({ error: 'Invalid playerId' });
  }
  try {
    const session = await stripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: offer.title || offerId,
          },
          unit_amount: offer.priceInCents, // Add this field to your store.json
        },
        quantity: 1,
      }],
      mode: 'payment',
      //success_url: `${process.env.YOUR_DOMAIN}/payment-success?playerId=${playerId}&offerId=${offerId}`,
      // {CHECKOUT_SESSION_ID} is filled in by Stripe; purchase-store-offer verifies that session.
      success_url: `${process.env.YOUR_DOMAIN}/?purchase=success&playerId=${playerId}&offerId=${offerId}&session_id={CHECKOUT_SESSION_ID}`,
      //cancel_url: `${process.env.YOUR_DOMAIN}/payment-cancelled`,
      cancel_url: `${process.env.YOUR_DOMAIN}/?purchase=cancelled`,
      metadata: { playerId: String(playerId), offerId: String(offerId) }
    });
    res.json({ id: session.id });
  } catch (error) {
    console.error('❌ Stripe checkout session failed:', error?.code || '', error?.message);
    res.status(502).json({ error: 'Checkout is unavailable right now.' });
  }
});


// ✅ POST /api/purchase-store-offer {playerId, offerId, sessionId}
// Grants an offer only for a Stripe Checkout session the server retrieves itself: paid, and its
// metadata naming this player and offer. Each session grants once (logPurchase). A developer
// x-player-id may grant without a session (testing). No webhook yet: a buyer who closes the tab
// before the redirect lands is fulfilled by hand (the session shows in the Stripe dashboard).
router.post('/purchase-store-offer', async (req, res) => {
  const { playerId, offerId, sessionId } = req.body;
  console.log("📥 Incoming store purchase:", { playerId, offerId, sessionId });

  if (!playerId || !offerId) {
    return res.status(400).json({ error: "Missing playerId or offerId." });
  }
 
  try {
    const Player = require("../models/player");
    const sendMailboxMessage = require("../utils/messageUtils");
    const storeOffers = require("../tuning/store.json");
    const player = await Player.findById(playerId);
    console.log("👤 Player loaded:", player ? player._id : "NOT FOUND");
    if (!player) { return res.status(404).json({ error: "Player not found." }); }
    const offer = storeOffers.find(o => String(o.id) === String(offerId));
    console.log("🛍️ Offer found:", offer ? offer.id : "NOT FOUND");
    if (!offer) { return res.status(404).json({ error: "Store offer not found." }); }

    let paidSessionId = null;
    if (sessionId) {
      let session;
      try { session = await stripe().checkout.sessions.retrieve(String(sessionId)); }
      catch (err) {
        console.error('❌ Stripe session lookup failed:', err?.code || '', err?.message);
        return res.status(402).json({ error: "Payment could not be verified." });
      }
      if (session.payment_status !== 'paid'
        || String(session.metadata?.playerId) !== String(playerId)
        || String(session.metadata?.offerId) !== String(offerId)) {
        console.warn('🚫 purchase-store-offer: session does not match a paid purchase', { sessionId, playerId, offerId, status: session.payment_status });
        return res.status(402).json({ error: "Payment could not be verified." });
      }
      paidSessionId = session.id;
    } else if (!(await isDeveloperPlayerId(req.get('x-player-id')))) {
      return res.status(402).json({ error: "Payment could not be verified." });
    }

    // ✅ Check shelf life (if defined)
    if (offer.shelflifeDays) {
      const createdAt = new Date(player.created);
      const now = new Date();
      const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      if (diffDays > offer.shelflifeDays) {
        return res.status(403).json({ error: "Offer has expired for this player." });
      }
    }

    // 🎖️ Special case: Gold Pass upgrade
    if (String(offerId) === "1") {
      if (!(await logPurchase(player, offer, paidSessionId))) return res.status(200).json({ success: true, alreadyFulfilled: true });
      player.accountStatus = "Gold";
      await player.save();
      require('../utils/emailNotifications').sendSubscriptionThanksEmail(player).catch(() => {}); // once, needs an email on file
      return res.status(200).json({ success: true, message: "Gold account upgraded." });
    }

    // ✅ Send via Mailbox
    const rewards = offer.rewards || [];
    console.log("📨 Sending mailbox message with rewards:", rewards);
    if (!(await logPurchase(player, offer, paidSessionId))) return res.status(200).json({ success: true, alreadyFulfilled: true });
    await sendMailboxMessage(playerId, 201, rewards); // 201 = store message template
    return res.status(200).json({ success: true, message: "Purchase successful. Reward sent via Mailbox." });

  } catch (error) {
    console.error("❌ Error processing store purchase:", error);
    console.error("❌ Stack trace:", error.stack);
    return res.status(500).json({ error: "Server error while processing purchase." });
  }
});


// ✅ GET /api/store-offers
router.get('/store-offers', (req, res) => {
  try {
    const storeData = require('../tuning/store.json');
    res.json(storeData);
  } catch (err) {
    console.error("❌ Failed to load store offers:", err);
    res.status(500).json({ error: "Failed to load store offers." });
  }
});


module.exports = router;
