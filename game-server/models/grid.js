const mongoose = require('mongoose');

const GridSchema = new mongoose.Schema({

  gridType: {
    type: String,
    enum: ['homestead', 'town', 'valley', 'valley1', 'valley2', 'valley3', 'dungeon', 'reserved'], // Match settlement schema
    required: true, // Make gridType mandatory
  },
  region: {
    type: String,
    default: null, // Optional - grids may not belong to a region
  },
  // NPCs map (data only)
  NPCsInGrid: {
    type: Map,
    of: new mongoose.Schema({
      id: { type: String, required: true },
      type: { type: String, required: true },
      position: { 
        x: { type: Number, required: true }, 
        y: { type: Number, required: true } 
      },
      state: { type: String, required: true },
      hp: { type: Number, default: 0 },
      maxhp: { type: Number, default: 0 },
      grazeEnd: { type: Number },
      lastUpdated: { type: Date, default: Date.now },
      // Citizens (docs/citizens.md): loop position + home, so they resume on re-entry
      citizenState: { type: String },
      citizenStateUntil: { type: Number },
      citizenTask: { type: mongoose.Schema.Types.Mixed },
      homeX: { type: Number },
      homeY: { type: Number },
      // Workers: the panel's "Automatically work?" switch (unset = the type's default)
      autoWork: { type: Boolean },
    }),
    default: {}
  },
  NPCsInGridLastUpdated: { type: Date, default: Date.now },

  // PCs map (data only)
  playersInGrid: {
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
      iscamping: { type: Boolean, default: false },
      isinboat: { type: Boolean, default: false },
      lastUpdated: { type: Date, default: Date.now }
    }),
    default: {}
  },
  playersInGridLastUpdated:  { type: Date, default: Date.now },

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
    type: mongoose.Schema.Types.ObjectId, // Homestead owner, or the player who owns this town/valley/dungeon copy
    ref: 'Player',
    default: null, // Template instances have no owner
  },

  // Per-player world (Phase 2, docs/phase-2-contract.md)
  gridCoord: { type: Number, default: null },      // world cell TTFFSSGG; null for dungeons
  isTemplate: { type: Boolean, default: false },   // the one shared instance per cell/dungeon template that the editor edits
  templateKey: { type: String, default: null },    // what this grid was generated from (e.g. 'town/townN', 'valleyFixedCoord/1011100', 'dungeon:d001', 'ftue-cave')
  seasonNumber: { type: Number, default: null },   // season this copy was last caught up to (trees / snow)
  resetEpoch: { type: Date, default: null },       // dungeons: when this copy was last reset from its template
  
  // COMPACT RESOURCE AND TILE STORAGE (V2 format)
  resources: {
    type: [mongoose.Schema.Types.Mixed], // Array of encoded resource arrays
    default: [], // Default to empty array for new grids
    index: false // Explicitly prevent indexing of compressed data
  },
  
  tiles: {
    type: String, // Base64 encoded compressed tile data
    default: '', // Default to empty string for new grids
    index: false // Explicitly prevent indexing of compressed data
  },
  
  lastOptimized: {
    type: Date,
    default: null // Only set when grid is optimized
  }
});

// Indexes
GridSchema.index({ frontierId: 1, gridType: 1 });
GridSchema.index({ ownerId: 1, gridCoord: 1 }, { partialFilterExpression: { gridCoord: { $type: 'number' } } });
GridSchema.index({ ownerId: 1, templateKey: 1 });

const Grid = mongoose.model('Grid', GridSchema, 'grids'); // Ensure 'grids' is the correct collection name
module.exports = Grid;
 