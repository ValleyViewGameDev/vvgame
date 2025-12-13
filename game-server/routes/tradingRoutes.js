const express = require('express');
const router = express.Router();
const Player = require('../models/player'); // Ensure the player schema includes tradeStall
const Grid = require('../models/grid'); // For Outpost trade stalls
const fs = require('fs');
const path = require('path');
const { isCurrency } = require('../utils/inventoryUtils');

/**
 * Transaction management helper functions
 */
const TransactionManager = {
  async startTransaction(playerId, transactionKey, transactionId) {
    const player = await Player.findOne({ playerId });
    if (!player) throw new Error('Player not found');

    // Check if transaction already processed (idempotency)
    const lastTxId = player.lastTransactionIds.get(transactionKey);
    if (lastTxId === transactionId) {
      return { success: true, message: 'Already processed', player };
    }

    // Check if there's an active transaction for this action
    if (player.activeTransactions.has(transactionKey)) {
      const activeTransaction = player.activeTransactions.get(transactionKey);
      const timeSinceStart = Date.now() - activeTransaction.timestamp.getTime();
      
      // If transaction is older than 30 seconds, consider it stale and remove it
      if (timeSinceStart > 30000) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      } else {
        throw new Error('Transaction in progress');
      }
    }

    // Mark transaction as active
    player.activeTransactions.set(transactionKey, {
      type: transactionKey,
      timestamp: new Date(),
      transactionId
    });
    await player.save();

    return { success: true, player };
  },

  async completeTransaction(playerId, transactionKey, transactionId) {
    const player = await Player.findOne({ playerId });
    if (!player) throw new Error('Player not found');

    // Mark transaction as complete
    player.lastTransactionIds.set(transactionKey, transactionId);
    player.activeTransactions.delete(transactionKey);
    await player.save();

    return player;
  },

  async failTransaction(playerId, transactionKey) {
    try {
      const player = await Player.findOne({ playerId });
      if (player) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      }
    } catch (error) {
      console.error('Error cleaning up failed transaction:', error);
    }
  }
};

/**
 * Helper function to check warehouse capacity
 */
const checkWarehouseCapacity = async (player, itemType, itemQuantity) => {
  // Load tuning files
  const resourcesPath = path.join(__dirname, '../tuning/resources.json');
  const globalTuningPath = path.join(__dirname, '../tuning/globalTuning.json');
  const masterResources = JSON.parse(fs.readFileSync(resourcesPath, 'utf-8'));
  const globalTuning = JSON.parse(fs.readFileSync(globalTuningPath, 'utf-8'));

  // Calculate warehouse and backpack capacities with skills
  const baseWarehouse = player.warehouseCapacity || 0;
  const baseBackpack = player.backpackCapacity || 0;
  const isGold = player.accountStatus === "Gold";
  const warehouseBonus = isGold ? (globalTuning?.warehouseCapacityGold || 100000) : 0;
  const backpackBonus = isGold ? (globalTuning?.backpackCapacityGold || 5000) : 0;

  let warehouseCapacity = baseWarehouse + warehouseBonus;
  let backpackCapacity = baseBackpack + backpackBonus;

  // Add skill bonuses
  (player.skills || []).forEach(skill => {
    const skillDetails = masterResources.find(res => res.type === skill.type);
    if (skillDetails) {
      const bonus = skillDetails.qtycollected || 0;
      if (skillDetails.output === 'warehouseCapacity') {
        warehouseCapacity += bonus;
      } else if (skillDetails.output === 'backpackCapacity') {
        backpackCapacity += bonus;
      }
    }
  });

  // If the item being added is currency, it doesn't need capacity check
  if (isCurrency(itemType)) {
    return { hasSpace: true, availableSpace: Infinity };
  }

  // Calculate current usage (exclude currencies)
  const currentWarehouseUsage = (player.inventory || [])
    .filter(item => !isCurrency(item.type))
    .reduce((sum, item) => sum + (item.quantity || 0), 0);
  const currentBackpackUsage = (player.backpack || [])
    .filter(item => !isCurrency(item.type))
    .reduce((sum, item) => sum + (item.quantity || 0), 0);
  const totalCapacity = warehouseCapacity + backpackCapacity;
  const currentTotalUsage = currentWarehouseUsage + currentBackpackUsage;
  const availableSpace = totalCapacity - currentTotalUsage;

  return {
    hasSpace: availableSpace >= itemQuantity,
    availableSpace,
    needed: itemQuantity
  };
};

/**
 * Protected TradeStall endpoints with transaction management
 */

// Collect Money from sold items - protected endpoint
router.post('/trade-stall/collect-payment', async (req, res) => {
  const { playerId, slotIndex, transactionId, transactionKey } = req.body;
  
  if (!playerId || slotIndex === undefined || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Start transaction
    const { success, message, player } = await TransactionManager.startTransaction(
      playerId, 
      `${transactionKey}-${slotIndex}`, 
      transactionId
    );

    if (message === 'Already processed') {
      return res.json({ success: true, message: 'Payment already collected' });
    }

    // Validate the slot
    if (!player.tradeStall || !player.tradeStall[slotIndex]) {
      await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Invalid slot' });
    }

    const slot = player.tradeStall[slotIndex];
    if (!slot.boughtBy || !slot.boughtFor) {
      await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Slot not purchased or already collected' });
    }

    // Add money to inventory
    const moneyItem = player.inventory.find(item => item.type === 'Money');
    if (moneyItem) {
      moneyItem.quantity += slot.boughtFor;
    } else {
      player.inventory.push({ type: 'Money', quantity: slot.boughtFor });
    }

    // Clear the slot but preserve locked state
    player.tradeStall[slotIndex] = {
      slotIndex: slotIndex,
      locked: player.tradeStall[slotIndex].locked || false, // Preserve locked state
      resource: null,
      amount: 0,
      price: 0,
      sellTime: null,
      boughtBy: null,
      boughtFor: null
    };

    await player.save();

    // Complete transaction
    await TransactionManager.completeTransaction(
      playerId, 
      `${transactionKey}-${slotIndex}`, 
      transactionId
    );

    res.json({ 
      success: true, 
      collected: slot.boughtFor,
      tradeStall: player.tradeStall,
      inventory: player.inventory 
    });

  } catch (error) {
    await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Collection already in progress' });
    }
    console.error('Error collecting payment:', error);
    res.status(500).json({ error: 'Failed to collect payment' });
  }
});

// Sell items to game - protected endpoint
router.post('/trade-stall/sell-to-game', async (req, res) => {
  const { playerId, slotIndex, transactionId, transactionKey } = req.body;
  
  if (!playerId || slotIndex === undefined || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Start transaction
    const { success, message, player } = await TransactionManager.startTransaction(
      playerId, 
      `${transactionKey}-${slotIndex}`, 
      transactionId
    );

    if (message === 'Already processed') {
      return res.json({ success: true, message: 'Item already sold' });
    }

    // Validate the slot
    if (!player.tradeStall || !player.tradeStall[slotIndex]) {
      await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Invalid slot' });
    }

    const slot = player.tradeStall[slotIndex];
    if (!slot.resource || slot.boughtBy || !slot.sellTime || slot.sellTime > Date.now()) {
      await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Slot not ready to sell or already sold' });
    }

    // Calculate sell value (full price)
    const sellValue = slot.amount * slot.price;

    // Add money to inventory
    const moneyItem = player.inventory.find(item => item.type === 'Money');
    if (moneyItem) {
      moneyItem.quantity += sellValue;
    } else {
      player.inventory.push({ type: 'Money', quantity: sellValue });
    }

    // Clear the slot but preserve locked state
    player.tradeStall[slotIndex] = {
      slotIndex: slotIndex,
      locked: player.tradeStall[slotIndex].locked || false, // Preserve locked state
      resource: null,
      amount: 0,
      price: 0,
      sellTime: null,
      boughtBy: null,
      boughtFor: null
    };

    await player.save();

    // Complete transaction
    await TransactionManager.completeTransaction(
      playerId, 
      `${transactionKey}-${slotIndex}`, 
      transactionId
    );

    res.json({ 
      success: true, 
      sold: sellValue,
      resource: slot.resource,
      amount: slot.amount,
      tradeStall: player.tradeStall,
      inventory: player.inventory 
    });

  } catch (error) {
    await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Sale already in progress' });
    }
    console.error('Error selling to game:', error);
    res.status(500).json({ error: 'Failed to sell to game' });
  }
});

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
        locked: index !== 0, // First slot unlocked by default
        resource: null,
        amount: 0,
        price: 0,
        sellTime: null,
        boughtBy: null,
        boughtFor: null
      }));
    }

    // Update only the specific slots that have changed, preserving slotIndex and locked state
    tradeStall.forEach((slot, index) => {
      if (slot && index < 6) {
        player.tradeStall[index] = {
          ...player.tradeStall[index],
          slotIndex: index,
          locked: slot.locked !== undefined ? slot.locked : player.tradeStall[index].locked, // Preserve or update locked state
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
        locked: index !== 0, // First slot unlocked by default
        resource: null,
        amount: 0,
        price: 0,
        sellTime: null,
        boughtBy: null,
        boughtFor: null
      }));
      await player.save();
    } else {
      // Migration for existing players: add locked field if missing
      let needsSave = false;
      player.tradeStall.forEach((slot, index) => {
        if (slot && slot.locked === undefined) {
          // For existing users, unlock slots that have items in them
          // This preserves their current functionality
          if (slot.resource && slot.amount > 0) {
            slot.locked = false;
          } else {
            // Empty slots: first slot unlocked, others locked
            slot.locked = index !== 0;
          }
          needsSave = true;
        }
      });
      
      if (needsSave) {
        await player.save();
      }
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

/**
 * Outpost Trade Stall endpoints (grid-based)
 */

// Initialize outpost trade stall on a grid
router.post('/outpost/initialize', async (req, res) => {
  const { gridId } = req.body;

  if (!gridId) {
    return res.status(400).json({ error: 'Missing gridId' });
  }

  try {
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found' });
    }

    // Initialize outpost trade stall with 4 slots
    grid.outpostTradeStall = Array.from({ length: 4 }, (_, index) => ({
      slotIndex: index,
      resource: null,
      amount: 0,
      price: 0,
      sellTime: null,
      boughtBy: null,
      boughtFor: null,
      sellerUsername: null,
      sellerId: null
    }));

    await grid.save();

    res.json({ success: true, outpostTradeStall: grid.outpostTradeStall });
  } catch (error) {
    console.error('Error initializing outpost:', error);
    res.status(500).json({ error: 'Failed to initialize outpost' });
  }
});

// Add item to outpost slot - protected endpoint
router.post('/outpost/add-item', async (req, res) => {
  const { 
    gridId, 
    slotIndex, 
    resource, 
    amount, 
    price, 
    sellTime, 
    sellerUsername, 
    sellerId,
    transactionId, 
    transactionKey 
  } = req.body;

  if (!gridId || slotIndex === undefined || !resource || !amount || !price || !sellTime || !sellerId || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Start transaction for the seller
    const { success, message, player } = await TransactionManager.startTransaction(
      sellerId, 
      `${transactionKey}-${slotIndex}`, 
      transactionId
    );

    if (message === 'Already processed') {
      // Return the current state if already processed
      const grid = await Grid.findById(gridId);
      return res.json({ success: true, message: 'Item already added', outpostTradeStall: grid.outpostTradeStall });
    }

    const grid = await Grid.findById(gridId);
    if (!grid) {
      await TransactionManager.failTransaction(sellerId, `${transactionKey}-${slotIndex}`);
      return res.status(404).json({ error: 'Grid not found' });
    }

    // Initialize outpost trade stall if it doesn't exist
    if (!grid.outpostTradeStall) {
      grid.outpostTradeStall = Array.from({ length: 4 }, (_, index) => ({
        slotIndex: index,
        resource: null,
        amount: 0,
        price: 0,
        sellTime: null,
        boughtBy: null,
        boughtFor: null,
        sellerUsername: null,
        sellerId: null
      }));
    }

    // Validate slot
    if (slotIndex < 0 || slotIndex >= 4) {
      await TransactionManager.failTransaction(sellerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Invalid slot index' });
    }

    const slot = grid.outpostTradeStall[slotIndex];
    if (slot.resource) {
      await TransactionManager.failTransaction(sellerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Slot already occupied' });
    }

    // Remove item from player's backpack
    const backpackItem = player.backpack.find(item => item.type === resource);
    if (!backpackItem || backpackItem.quantity < amount) {
      await TransactionManager.failTransaction(sellerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Insufficient items in backpack' });
    }

    backpackItem.quantity -= amount;
    if (backpackItem.quantity === 0) {
      player.backpack = player.backpack.filter(item => item.type !== resource);
    }

    // Add item to outpost slot
    grid.outpostTradeStall[slotIndex] = {
      slotIndex: slotIndex,
      resource: resource,
      amount: amount,
      price: price,
      sellTime: sellTime,
      boughtBy: null,
      boughtFor: null,
      sellerUsername: sellerUsername,
      sellerId: sellerId
    };

    await grid.save();
    await player.save();

    // Complete transaction
    await TransactionManager.completeTransaction(sellerId, `${transactionKey}-${slotIndex}`, transactionId);

    res.json({ 
      success: true, 
      outpostTradeStall: grid.outpostTradeStall,
      backpack: player.backpack
    });

  } catch (error) {
    await TransactionManager.failTransaction(sellerId, `${transactionKey}-${slotIndex}`);
    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Add item already in progress' });
    }
    console.error('Error adding item to outpost:', error);
    res.status(500).json({ error: 'Failed to add item to outpost' });
  }
});

// Buy item from outpost - protected endpoint
router.post('/outpost/buy-item', async (req, res) => {
  const { gridId, slotIndex, buyerId, buyerUsername, transactionId, transactionKey } = req.body;

  if (!gridId || slotIndex === undefined || !buyerId || !buyerUsername || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Start transaction for the buyer
    const { success, message, player } = await TransactionManager.startTransaction(
      buyerId, 
      `${transactionKey}-${slotIndex}`, 
      transactionId
    );

    if (message === 'Already processed') {
      return res.json({ success: true, message: 'Item already purchased' });
    }

    const grid = await Grid.findById(gridId);
    if (!grid || !grid.outpostTradeStall || !grid.outpostTradeStall[slotIndex]) {
      await TransactionManager.failTransaction(buyerId, `${transactionKey}-${slotIndex}`);
      return res.status(404).json({ error: 'Invalid outpost or slot' });
    }

    const slot = grid.outpostTradeStall[slotIndex];
    if (!slot.resource || slot.boughtBy) {
      await TransactionManager.failTransaction(buyerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Slot empty or already purchased' });
    }

    const totalCost = slot.amount * slot.price;
    const moneyItem = player.inventory.find(item => item.type === 'Money');
    const currentMoney = moneyItem ? moneyItem.quantity : 0;

    if (totalCost > currentMoney) {
      await TransactionManager.failTransaction(buyerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    // Check warehouse capacity before purchasing
    const capacityCheck = await checkWarehouseCapacity(player, slot.resource, slot.amount);
    if (!capacityCheck.hasSpace) {
      await TransactionManager.failTransaction(buyerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({
        error: 'Not enough warehouse space',
        needed: capacityCheck.needed,
        available: capacityCheck.availableSpace
      });
    }

    // Deduct money from buyer
    if (moneyItem) {
      moneyItem.quantity -= totalCost;
    }

    // Add item to buyer's inventory
    const existingItem = player.inventory.find(item => item.type === slot.resource);
    if (existingItem) {
      existingItem.quantity += slot.amount;
    } else {
      player.inventory.push({ type: slot.resource, quantity: slot.amount });
    }

    // Mark slot as purchased
    slot.boughtBy = buyerUsername;
    slot.boughtFor = totalCost;

    await grid.save();
    await player.save();

    // Complete transaction
    await TransactionManager.completeTransaction(buyerId, `${transactionKey}-${slotIndex}`, transactionId);

    res.json({ 
      success: true,
      outpostTradeStall: grid.outpostTradeStall,
      inventory: player.inventory
    });

  } catch (error) {
    await TransactionManager.failTransaction(buyerId, `${transactionKey}-${slotIndex}`);
    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Purchase already in progress' });
    }
    console.error('Error buying from outpost:', error);
    res.status(500).json({ error: 'Failed to buy from outpost' });
  }
});

// Collect payment from outpost - protected endpoint
router.post('/outpost/collect-payment', async (req, res) => {
  const { gridId, slotIndex, playerId, transactionId, transactionKey } = req.body;

  if (!gridId || slotIndex === undefined || !playerId || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Start transaction
    const { success, message, player } = await TransactionManager.startTransaction(
      playerId, 
      `${transactionKey}-${slotIndex}`, 
      transactionId
    );

    if (message === 'Already processed') {
      return res.json({ success: true, message: 'Payment already collected' });
    }

    const grid = await Grid.findById(gridId);
    if (!grid || !grid.outpostTradeStall || !grid.outpostTradeStall[slotIndex]) {
      await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
      return res.status(404).json({ error: 'Invalid outpost or slot' });
    }

    const slot = grid.outpostTradeStall[slotIndex];
    if (!slot.boughtBy || !slot.boughtFor || slot.sellerId !== playerId) {
      await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Invalid collection attempt' });
    }

    // Add money to player's inventory
    const moneyItem = player.inventory.find(item => item.type === 'Money');
    if (moneyItem) {
      moneyItem.quantity += slot.boughtFor;
    } else {
      player.inventory.push({ type: 'Money', quantity: slot.boughtFor });
    }

    // Clear the slot
    grid.outpostTradeStall[slotIndex] = {
      slotIndex: slotIndex,
      resource: null,
      amount: 0,
      price: 0,
      sellTime: null,
      boughtBy: null,
      boughtFor: null,
      sellerUsername: null,
      sellerId: null
    };

    await grid.save();
    await player.save();

    // Complete transaction
    await TransactionManager.completeTransaction(playerId, `${transactionKey}-${slotIndex}`, transactionId);

    res.json({ 
      success: true,
      collected: slot.boughtFor,
      outpostTradeStall: grid.outpostTradeStall,
      inventory: player.inventory
    });

  } catch (error) {
    await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Collection already in progress' });
    }
    console.error('Error collecting payment:', error);
    res.status(500).json({ error: 'Failed to collect payment' });
  }
});

// Sell to game from outpost - protected endpoint
router.post('/outpost/sell-to-game', async (req, res) => {
  const { gridId, slotIndex, playerId, transactionId, transactionKey } = req.body;

  if (!gridId || slotIndex === undefined || !playerId || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Start transaction
    const { success, message, player } = await TransactionManager.startTransaction(
      playerId, 
      `${transactionKey}-${slotIndex}`, 
      transactionId
    );

    if (message === 'Already processed') {
      return res.json({ success: true, message: 'Item already sold' });
    }

    const grid = await Grid.findById(gridId);
    if (!grid || !grid.outpostTradeStall || !grid.outpostTradeStall[slotIndex]) {
      await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
      return res.status(404).json({ error: 'Invalid outpost or slot' });
    }

    const slot = grid.outpostTradeStall[slotIndex];
    if (!slot.resource || slot.boughtBy || !slot.sellTime || slot.sellTime > Date.now() || slot.sellerId !== playerId) {
      await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Slot not ready to sell or invalid seller' });
    }

    // Calculate sell value (full price)
    const sellValue = slot.amount * slot.price;

    // Add money to player's inventory
    const moneyItem = player.inventory.find(item => item.type === 'Money');
    if (moneyItem) {
      moneyItem.quantity += sellValue;
    } else {
      player.inventory.push({ type: 'Money', quantity: sellValue });
    }

    const soldResource = slot.resource;
    const soldAmount = slot.amount;

    // Clear the slot
    grid.outpostTradeStall[slotIndex] = {
      slotIndex: slotIndex,
      resource: null,
      amount: 0,
      price: 0,
      sellTime: null,
      boughtBy: null,
      boughtFor: null,
      sellerUsername: null,
      sellerId: null
    };

    await grid.save();
    await player.save();

    // Complete transaction
    await TransactionManager.completeTransaction(playerId, `${transactionKey}-${slotIndex}`, transactionId);

    res.json({ 
      success: true,
      sold: sellValue,
      resource: soldResource,
      amount: soldAmount,
      outpostTradeStall: grid.outpostTradeStall,
      inventory: player.inventory
    });

  } catch (error) {
    await TransactionManager.failTransaction(playerId, `${transactionKey}-${slotIndex}`);
    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Sale already in progress' });
    }
    console.error('Error selling to game:', error);
    res.status(500).json({ error: 'Failed to sell to game' });
  }
});

/**
 * Trade Stall Request endpoints (buy orders)
 */

// Get player's trade stall requests
router.get('/player-trade-stall-requests', async (req, res) => {
  const { playerId } = req.query;

  if (!playerId) {
    return res.status(400).send('Missing required fields: playerId');
  }

  try {
    const player = await Player.findOne({ playerId });
    if (!player) {
      return res.status(404).send('Player not found');
    }

    // Ensure player has proper tradeStallRequests structure
    if (!player.tradeStallRequests || player.tradeStallRequests.length !== 3) {
      player.tradeStallRequests = Array.from({ length: 3 }, (_, index) => ({
        slotIndex: index,
        locked: index !== 0, // First slot unlocked by default
        resource: null,
        amount: 0,
        price: 0,
        moneyCommitted: 0
      }));
      await player.save();
    } else {
      // Migration for existing players: add locked field if missing
      let needsSave = false;
      player.tradeStallRequests.forEach((slot, index) => {
        if (slot && slot.locked === undefined) {
          if (slot.resource && slot.amount > 0) {
            slot.locked = false;
          } else {
            slot.locked = index !== 0;
          }
          needsSave = true;
        }
      });

      if (needsSave) {
        await player.save();
      }
    }

    res.status(200).json({ tradeStallRequests: player.tradeStallRequests });
  } catch (error) {
    console.error('Error fetching trade stall requests:', error);
    res.status(500).send('Server error fetching trade stall requests');
  }
});

// Update player's trade stall requests
router.post('/update-player-trade-stall-requests', async (req, res) => {
  console.log('POST /update-player-trade-stall-requests route hit');
  const { playerId, tradeStallRequests } = req.body;

  if (!playerId || !tradeStallRequests) {
    return res.status(400).send('Missing required fields: playerId or tradeStallRequests');
  }

  try {
    const player = await Player.findOne({ playerId });
    if (!player) {
      return res.status(404).send('Player not found');
    }

    // Ensure player has proper tradeStallRequests structure
    if (!player.tradeStallRequests || player.tradeStallRequests.length !== 3) {
      player.tradeStallRequests = Array.from({ length: 3 }, (_, index) => ({
        slotIndex: index,
        locked: index !== 0,
        resource: null,
        amount: 0,
        price: 0,
        moneyCommitted: 0
      }));
    }

    // Update only the specific slots that have changed
    tradeStallRequests.forEach((slot, index) => {
      if (slot && index < 3) {
        player.tradeStallRequests[index] = {
          ...player.tradeStallRequests[index],
          slotIndex: index,
          locked: slot.locked !== undefined ? slot.locked : player.tradeStallRequests[index].locked,
          resource: slot.resource || null,
          amount: slot.amount || 0,
          price: slot.price || 0,
          moneyCommitted: slot.moneyCommitted || 0
        };
      }
    });

    await player.save();

    console.log('Trade Stall Requests updated successfully:', player.tradeStallRequests);
    res.status(200).json({ success: true, tradeStallRequests: player.tradeStallRequests });
  } catch (error) {
    console.error('Error updating trade stall requests:', error);
    res.status(500).send('Server error updating trade stall requests');
  }
});

// Fulfill a player's request (sell to their buy order) - protected endpoint
router.post('/trade-stall/fulfill-request', async (req, res) => {
  const { sellerPlayerId, buyerPlayerId, slotIndex, transactionId, transactionKey } = req.body;

  if (!sellerPlayerId || !buyerPlayerId || slotIndex === undefined || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Start transaction for the seller
    const { success, message, player: seller } = await TransactionManager.startTransaction(
      sellerPlayerId,
      `${transactionKey}-${slotIndex}`,
      transactionId
    );

    if (message === 'Already processed') {
      return res.json({ success: true, message: 'Request already fulfilled' });
    }

    // Get buyer
    const buyer = await Player.findOne({ playerId: buyerPlayerId });
    if (!buyer) {
      await TransactionManager.failTransaction(sellerPlayerId, `${transactionKey}-${slotIndex}`);
      return res.status(404).json({ error: 'Buyer not found' });
    }

    // Validate the request slot
    if (!buyer.tradeStallRequests || !buyer.tradeStallRequests[slotIndex]) {
      await TransactionManager.failTransaction(sellerPlayerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Invalid request slot' });
    }

    const request = buyer.tradeStallRequests[slotIndex];
    if (!request.resource || !request.amount || !request.moneyCommitted) {
      await TransactionManager.failTransaction(sellerPlayerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Invalid or empty request' });
    }

    // Check if seller has the requested items in inventory
    const sellerItem = seller.inventory.find(item => item.type === request.resource);
    if (!sellerItem || sellerItem.quantity < request.amount) {
      await TransactionManager.failTransaction(sellerPlayerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({ error: 'Seller does not have enough items' });
    }

    // Check buyer's warehouse capacity before fulfilling request
    const capacityCheck = await checkWarehouseCapacity(buyer, request.resource, request.amount);
    if (!capacityCheck.hasSpace) {
      await TransactionManager.failTransaction(sellerPlayerId, `${transactionKey}-${slotIndex}`);
      return res.status(400).json({
        error: 'Buyer does not have enough warehouse space',
        needed: capacityCheck.needed,
        available: capacityCheck.availableSpace
      });
    }

    // Deduct items from seller's inventory
    sellerItem.quantity -= request.amount;
    if (sellerItem.quantity === 0) {
      seller.inventory = seller.inventory.filter(item => item.type !== request.resource);
    }

    // Add money to seller's inventory
    const sellerMoney = seller.inventory.find(item => item.type === 'Money');
    if (sellerMoney) {
      sellerMoney.quantity += request.moneyCommitted;
    } else {
      seller.inventory.push({ type: 'Money', quantity: request.moneyCommitted });
    }

    // Add items to buyer's inventory
    const buyerItem = buyer.inventory.find(item => item.type === request.resource);
    if (buyerItem) {
      buyerItem.quantity += request.amount;
    } else {
      buyer.inventory.push({ type: request.resource, quantity: request.amount });
    }

    // Clear the request slot (money was already committed, no need to refund)
    buyer.tradeStallRequests[slotIndex] = {
      slotIndex: slotIndex,
      locked: buyer.tradeStallRequests[slotIndex].locked || false,
      resource: null,
      amount: 0,
      price: 0,
      moneyCommitted: 0
    };

    await seller.save();
    await buyer.save();

    // Complete transaction
    await TransactionManager.completeTransaction(
      sellerPlayerId,
      `${transactionKey}-${slotIndex}`,
      transactionId
    );

    res.json({
      success: true,
      earned: request.moneyCommitted,
      resource: request.resource,
      amount: request.amount,
      tradeStallRequests: buyer.tradeStallRequests,
      sellerInventory: seller.inventory,
      buyerInventory: buyer.inventory
    });

  } catch (error) {
    await TransactionManager.failTransaction(sellerPlayerId, `${transactionKey}-${slotIndex}`);
    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Fulfillment already in progress' });
    }
    console.error('Error fulfilling request:', error);
    res.status(500).json({ error: 'Failed to fulfill request' });
  }
});

module.exports = router;
