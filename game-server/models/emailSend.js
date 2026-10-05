// One document per (player, campaign) marketing send: the idempotency ledger for bulk email
// (phase D event announcements). campaign_key convention: "<kind>_<id>@<date>".
const mongoose = require('mongoose');

const emailSendSchema = new mongoose.Schema({
  player_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  campaign_key: { type: String, required: true },
  sent_at: { type: Date, default: Date.now },
}, { collection: 'email_sends', versionKey: false });

emailSendSchema.index({ player_id: 1, campaign_key: 1 }, { unique: true });
emailSendSchema.index({ campaign_key: 1 });

module.exports = mongoose.model('EmailSend', emailSendSchema);
