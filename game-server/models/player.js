const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  language: { type: String, default: "English", required: true },
  icon: {
    type: String,
    required: true, // This might cause issues if `icon` is missing
    default: '😀', // Ensure a sensible default is provided
  },
  range: { type: Number, default: 0 },
  baseHp: { type: Number, default: 0 },
  baseMaxhp: { type: Number, default: 0 },
  baseAttackrange: { type: Number, default: 0 },
  baseArmorclass: { type: Number, default: 0 },
  baseAttackbonus: { type: Number, default: 0 },
  baseDamage: { type: Number, default: 0 },
  baseSpeed: { type: Number, default: 0 },
  location: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    g: { type: mongoose.Schema.Types.ObjectId, ref: 'Homestead' }, // The current grid where the player is located
    s: { type: mongoose.Schema.Types.ObjectId, ref: 'Settlement' }, // The current settlement where the player is located
    f: { type: mongoose.Schema.Types.ObjectId, ref: 'Frontier' }, // The current frontier where the player is located
    gridCoord: { type: Number, default: 0 },
    gtype: { type: String, required: true },
  },
  inventory: [  // AKA warehouse
    {
      type: { type: String, required: true },
      quantity: { type: Number, default: 0 },
      _id: false, // Disable automatic _id for inventory items
    }
  ],
  backpack: [
    {
      type: { type: String, required: true },
      quantity: { type: Number, default: 0 },
      _id: false, // Disable automatic _id for inventory items
    }
  ],
  skills: [
    {
      type: { type: String, required: true },
      quantity: { type: Number, default: 0 },
      _id: false, // Disable automatic _id for inventory items
    }
  ],
  powers: [
    {
      type: { type: String, required: true },
      quantity: { type: Number, default: 0 },
      _id: false, // Disable automatic _id for inventory items
    }
  ],
  warehouseCapacity: { type: Number, default: 50 }, // Initial capacity for Warehouse
  backpackCapacity: { type: Number, default: 20 }, // Initial capacity for Backpack
  accountStatus: {
    type: String,
    enum: ['Free', 'Bronze', 'Silver', 'Gold'],
    default: 'Free',
  },
  role: {
    type: String,
    enum: ['Citizen', 'Mayor', 'Governor', 'President'],
    default: 'Citizen',
  },
  tradeStall: {
    type: Array,
    default: [],
  },

  activeQuests: [
    {
      questId: { type: String },       // "quest_berry_hunt"
      startTime: { type: Number },
      symbol: { type: String },
      progress: {
        goal1: { type: Number, default: 0 }, // how many have been collected so far
        goal2: { type: Number, default: 0 },
        goal3: { type: Number, default: 0 }
      },
      completed: { type: Boolean, default: false },
      rewardCollected: { type: Boolean, default: false },
      goal1action: { type: String }, // e.g., "Collect"
      goal1item: { type: String },   // e.g., "Berry"
      goal1qty: { type: Number },    // e.g., 10
      goal2action: { type: String },
      goal2item: { type: String },
      goal2qty: { type: Number },
      goal3action: { type: String },
      goal3item: { type: String },
      goal3qty: { type: Number },
    }
  ],
  completedQuests: [ { questId: { type: String }, timestamp: { type: Number } } ],

  frontierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Frontier', required: true }, // Where the user's homestead is
  settlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Settlement', required: true }, // Where the user's homestead is
  gridId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grid', required: true }, // THe ID of the homestead owned by the user

  settings: {
    isStateMachineEnabled: { type: Boolean, default: false },
    isTeleportEnabled: { type: Boolean, default: false },
    toggleVFX: { type: Boolean, default: true },
    hasDied: { type: Boolean, default: false },
  },

  relocations: { type: Number },
  iscamping: { type: Boolean, default: false },
  netWorth: { type: Number },

  messages: [
    {
      _id: false, 
      messageId: { type: Number, required: true },
      timestamp: { type: Date, default: Date.now },
      rewards: [
        {
          item: String,
          qty: Number
        }
      ],
      read: { type: Boolean, default: false },
      collected: { type: Boolean, default: false },
      neverPurge: { type: Boolean, default: false } 
    }
  ],

created: { type: Date, default: Date.now },


});

const Player = mongoose.model('Player', playerSchema);
module.exports = Player;



