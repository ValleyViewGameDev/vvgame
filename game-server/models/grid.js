const mongoose = require('mongoose');

const GridSchema = new mongoose.Schema({

  gridType: {
    type: String,
    enum: ['homestead', 'town', 'valley', 'valley0', 'valley1', 'valley2', 'valley3', 'reserved'], // Match settlement schema
    required: true, // Make gridType mandatory
  },
  tiles: {
    type: Array, // A 2D array representing the grid
    required: true,
  },
  resources: {
    type: Array, // Resources in the grid
    required: true,
  },
  // NPCs map (data only)
  gridStateNPCs: {
    type: Map,
    of: new mongoose.Schema({
      id: { type: String, required: true, index: true },
      type: { type: String, required: true },
      position: { 
        x: { type: Number, required: true }, 
        y: { type: Number, required: true } 
      },
      state: { type: String, required: true },
      hp: { type: Number, default: 0 },
      maxhp: { type: Number, default: 0 },
      grazeEnd: { type: Number },
      lastMoveTime: { type: Number }
    }),
    default: {}
  },
  gridStateNPCsLastUpdated: { type: Date, default: Date.now },

  // PCs map (data only)
  gridStatePCs: {
    type: Map,
    of: new mongoose.Schema({
      playerId: { type: String, required: true },
      username: { type: String, required: true },
      type: { type: String, required: true, enum: ['pc'] },
      position: { 
        x: { type: Number, required: true }, 
        y: { type: Number, required: true } 
      },
      icon: {
        type: String,
        validate: {
          validator: (value) => /^[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}]+$/u.test(value),
          message: 'Invalid icon format. Expected an emoji.'
        }
      },
      hp: { type: Number, default: 25 },
      maxhp: { type: Number, default: 25 },
      attackbonus: { type: Number, required: true },
      armorclass: { type: Number, required: true },
      damage: { type: Number, required: true },
      attackrange: { type: Number, required: true },
      speed: { type: Number, required: true },
      iscamping: { type: Boolean, default: false }
    }),
    default: {}
  },
  gridStatePCsLastUpdated:  { type: Date, default: Date.now },

  frontierId: {
    type: mongoose.Schema.Types.ObjectId, // Links this grid to a frontier
    ref: 'Frontier', // Reference to the Frontier model
    required: true,
  },
  settlementId: {
    type: mongoose.Schema.Types.ObjectId, // Links this grid to a settlement
    ref: 'Settlement', // Reference to the Settlement model
    required: true,
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId, // Links to the player's ID
    ref: 'Player',
    default: null, // Public grids (e.g., Towns) will have no owner
  },
});

// Add compound index for common queries
GridSchema.index({ frontierId: 1, gridType: 1 });
GridSchema.index({ frontierId: 1, gridId: 1 });

const Grid = mongoose.model('Grid', GridSchema, 'grids'); // Ensure 'grids' is the correct collection name
module.exports = Grid;
