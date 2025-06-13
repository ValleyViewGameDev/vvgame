import mongoose from 'mongoose';

const ChatMessageSchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  username: { type: String, required: true },
  message: { type: String, required: true },
  scope: { type: String, enum: ['grid', 'settlement', 'frontier'], required: true },
  scopeId: { type: String, required: true }, // gridId, settlementId, or frontierId
  timestamp: { type: Date, default: Date.now }
});

const Chat = mongoose.model('ChatMessage', ChatMessageSchema);
export default Chat;