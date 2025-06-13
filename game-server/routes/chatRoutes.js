const express = require('express');
const ChatMessage = require('../models/chat');

const router = express.Router();

router.get('/chat/:scope/:scopeId', async (req, res) => {
  const { scope, scopeId } = req.params;

  if (!['grid', 'settlement', 'frontier'].includes(scope)) {
    return res.status(400).json({ error: 'Invalid chat scope' });
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const messages = await ChatMessage.find({
      scope,
      scopeId,
      timestamp: { $gte: oneDayAgo }
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    console.error('❌ Error fetching chat messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;