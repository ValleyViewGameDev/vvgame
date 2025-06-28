const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Player = require('../models/player'); // Import the Player model
const Grid = require('../models/grid');
const Settlement = require('../models/settlement');
const sendMailboxMessage = require('../utils/messageUtils'); // or messageUtils/sendMailboxMessage.js
 

// POST /create-checkout-session
router.post('/create-checkout-session', async (req, res) => {

  console.log("🔐 Stripe key loaded:", process.env.STRIPE_SECRET_KEY?.slice(0, 8)); // Redact most of it

  const { playerId, offerId } = req.body;
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const storeOffers = require('../tuning/store.json');
  const offer = storeOffers.find(o => o.id === offerId);

  if (!offer) return res.status(400).json({ error: 'Invalid offerId' });

  const session = await stripe.checkout.sessions.create({
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
    success_url: `${process.env.YOUR_DOMAIN}/?purchase=success&playerId=${playerId}&offerId=${offerId}`,
    
    //cancel_url: `${process.env.YOUR_DOMAIN}/payment-cancelled`,
    cancel_url: `${process.env.YOUR_DOMAIN}/?purchase=cancelled`,

    metadata: { playerId, offerId }
  });

  res.json({ id: session.id });
});




// ✅ POST /api/purchase-store-offer
router.post('/purchase-store-offer', async (req, res) => {
  const { playerId, offerId } = req.body;

  console.log("📥 Incoming store purchase:", { playerId, offerId });

  if (!playerId || !offerId) {
    return res.status(400).json({ error: "Missing playerId or offerId." });
  }

  try {
    const Player = require("../models/player");
    const sendMailboxMessage = require("../utils/messageUtils");
    const storeOffers = require("../tuning/store.json");
    const player = await Player.findById(playerId);

    console.log("👤 Player loaded:", player ? player._id : "NOT FOUND");

    if (!player) {
      return res.status(404).json({ error: "Player not found." });
    }

    const offer = storeOffers.find(o => String(o.id) === String(offerId));

    console.log("🛍️ Offer found:", offer ? offer.id : "NOT FOUND");

    if (!offer) {
      return res.status(404).json({ error: "Store offer not found." });
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

    // ✅ Send via Mailbox
    const rewards = offer.rewards || [];
    console.log("📨 Sending mailbox message with rewards:", rewards);
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
