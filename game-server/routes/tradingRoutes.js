const express = require('express');
const router = express.Router();
const Player = require('../models/player'); // Ensure the player schema includes tradeStall

/**
 * Route to update the trading stall for a player
 * POST /api/update-trade-stall
 * Request body should include `username` and `tradeStall` (array of items)
 */
router.post('/update-player-trade-stall', async (req, res) => {
  console.log('POST /update-player-trade-stall route hit');
  const { playerId, tradeStall } = req.body;

  if (!playerId || !tradeStall) {
    return res.status(400).send('Missing required fields: playerId or tradeStall');
  }

  try {
    const player = await Player.findOne({ playerId });
    if (!player) {
      return res.status(404).send('Player not found');
    }

    // Deduct items from inventory
    tradeStall.forEach((slot) => {
      if (slot && slot.resource) {
        const inventoryItem = player.inventory.find((item) => item.type === slot.resource);
        if (inventoryItem) {
          inventoryItem.quantity -= slot.amount;
          if (inventoryItem.quantity <= 0) {
            player.inventory = player.inventory.filter((item) => item.type !== slot.resource);
          }
        }
      }
    });
 
    // Update the trade stall on the player document
    player.tradeStall = tradeStall;

    // Save the updated player document
    await player.save();

    console.log('Trade Stall and Inventory updated successfully:', player);
    res.status(200).json({ success: true, tradeStall: player.tradeStall, inventory: player.inventory });
  } catch (error) {
    console.error('Error updating trade stall and inventory:', error);
    res.status(500).send('Server error updating trade stall and inventory');
  }
});

router.get('/player-trade-stall', async (req, res) => {
  const { playerId } = req.query;

  if (!playerId) {
    return res.status(400).send('Missing required fields: username');
  }

  try {
    const player = await Player.findOne({ playerId });
    if (!player) {
      return res.status(404).send('Player not found');
    }

    res.status(200).json({ tradeStall: player.tradeStall, inventory: player.inventory });
  } catch (error) {
    console.error('Error fetching trade stall data:', error);
    res.status(500).send('Server error fetching trade stall data');
  }
});

router.post('/sell-items', async (req, res) => {
  const { playerId, tradeStall, totalMoney } = req.body;

  if (!playerId || !tradeStall || typeof totalMoney !== 'number') {
    return res.status(400).send('Missing required fields: username, tradeStall, or totalMoney');
  }

  try {
    const player = await Player.findOne({ playerId });
    if (!player) {
      return res.status(404).send('Player not found');
    }

    // Add money to the player's inventory
    const moneyItem = player.inventory.find((item) => item.type === 'Money');
    if (moneyItem) {
      moneyItem.quantity += totalMoney;
    } else {
      player.inventory.push({ type: 'Money', quantity: totalMoney });
    }

    // Clear the trade stall
    player.tradeStall = [];

    // Save the updated player document
    await player.save();

    res.status(200).json({ success: true, inventory: player.inventory });
  } catch (error) {
    console.error('Error selling items:', error);
    res.status(500).send('Server error selling items');
  }
});

module.exports = router;
