const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  username: { type: String, required: true },
  message: { type: String, required: true },
  scope: { type: String, enum: ['grid', 'settlement', 'frontier'], required: true },
  scopeId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);