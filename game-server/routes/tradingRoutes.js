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

    // Ensure player has proper tradeStall structure
    if (!player.tradeStall || player.tradeStall.length !== 6) {
      player.tradeStall = Array.from({ length: 6 }, (_, index) => ({
        slotIndex: index,
        resource: null,
        amount: 0,
        price: 0,
        sellTime: null,
        boughtBy: null,
        boughtFor: null
      }));
    }

    // Update only the specific slots that have changed, preserving slotIndex
    tradeStall.forEach((slot, index) => {
      if (slot && index < 6) {
        player.tradeStall[index] = {
          ...player.tradeStall[index],
          slotIndex: index,
          resource: slot.resource || null,
          amount: slot.amount || 0,
          price: slot.price || 0,
          sellTime: slot.sellTime || null,
          boughtBy: slot.boughtBy || null,
          boughtFor: slot.boughtFor || null
        };
      }
    });

    // Save the updated player document
    await player.save();

    console.log('Trade Stall updated successfully:', player.tradeStall);
    res.status(200).json({ success: true, tradeStall: player.tradeStall, inventory: player.inventory });
  } catch (error) {
    console.error('Error updating trade stall:', error);
    res.status(500).send('Server error updating trade stall');
  }
});

router.get('/player-trade-stall', async (req, res) => {
  const { playerId } = req.query;

  if (!playerId) {
    return res.status(400).send('Missing required fields: playerId');
  }

  try {
    const player = await Player.findOne({ playerId });
    if (!player) {
      return res.status(404).send('Player not found');
    }

    // Ensure player has proper tradeStall structure
    if (!player.tradeStall || player.tradeStall.length !== 6) {
      player.tradeStall = Array.from({ length: 6 }, (_, index) => ({
        slotIndex: index,
        resource: null,
        amount: 0,
        price: 0,
        sellTime: null,
        boughtBy: null,
        boughtFor: null
      }));
      await player.save();
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
