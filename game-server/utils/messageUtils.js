// game-server/utils/messageUtils/sendMailboxMessage.js

const fs = require('fs');
const path = require('path');
const Player = require('../models/player');

// Load mailbox messages from tuning
const messageTemplates = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../tuning/messages.json'), 'utf8')
);

/**
 * Sends a mailbox message to a player
 * @param {String} playerId - Player's MongoDB _id
 * @param {String} messageId - ID of the message template
 * @param {Array} [customRewards=[]] - Optional rewards if everyoneRewards is false
 */
async function sendMailboxMessage(playerId, messageId, customRewards = [], io = null) {
  console.log('DEBUG sendMailboxMessage:', {
    playerId,
    messageId,
    customRewards
  });

  const template = messageTemplates.find(m => m.id === messageId);
  if (!template) {
    console.warn(`❌ Mailbox template '${messageId}' not found.`);
    return;
  } 

  const message = {
    messageId,
    receivedAt: new Date(),
    collected: false,
    neverPurge: template.neverPurge || false,
  };

  if (!template.everyoneRewards) {
    message.rewards = customRewards;
  }

  try {
    await Player.updateOne(
      { _id: playerId },
      { $push: { messages: message } }
    );
    console.log(`📬 Message '${messageId}' sent to player ${playerId} with rewards:`, customRewards);
    if (io) {
      console.log(`📡 Emitting mailbox-badge-update to playerId room: ${playerId}`);
      io.to(playerId.toString()).emit('mailbox-badge-update', {
        playerId: playerId.toString(),
        hasNewMail: true,
      });
    }
  } catch (error) {
    console.error(`❌ Failed to send mailbox message to player ${playerId}:`, error);
    throw error; // Re-throw to catch in caller
  }
}

module.exports = sendMailboxMessage;
