const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  username: { type: String, required: true },
  message: { type: String, required: true },
  scope: { type: String, enum: ['grid', 'settlement', 'frontier'], required: true },
  scopeId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, expires: 60 * 60 * 24 }  // Expires after 24 hours
});

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);