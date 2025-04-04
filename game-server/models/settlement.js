// settlement.js
const mongoose = require('mongoose');

const SettlementSchema = new mongoose.Schema({
  name: { type: String, required: true },
  frontierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Frontier', required: true },
  grids: [
    [
      {
        // This references the big Grid doc if needed
        gridId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grid', default: null },

        // The new coordinate code that encodes frontier, settlement row/col, grid row/col
        gridCoord: { type: Number, required: true }, // or String, if you prefer

        gridType: { 
          type: String, 
          enum: ['homestead', 'town', 'valley', 'valley1', 'valley2', 'valley3', 'reserved'], 
          required: true 
        },

        available: { type: Boolean, required: true },
      },
    ],
  ],
  taxrate: { type: Number, required: true },


  roles: [
    {
      roleName: { type: String, required: true }, // ✅ Role title (e.g., "Mayor", "Sheriff")
      playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' } // ✅ Player ID assigned to this role
    }
  ],
  campaignPromises: [
    {
      playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true }, // ✅ The player who made the promise
      username: { type: String, required: true }, // ✅ Store the username for easy retrieval
      text: { type: String, required: true }, // ✅ The actual campaign promise
    }
  ],
  votes: [
    {
      voterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: false },
      candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: false }
    }
  ],

  currentoffers: [
    {
      itemBought: { type: String, required: true },
      qtyBought: { type: Number, required: true },
      itemGiven: { type: String, required: true },
      qtyGiven: { type: Number, required: true },
      claimedBy: { type: mongoose.Schema.Types.ObjectId },
      filled: { type: Boolean, default: false },
    }
  ],
  nextoffers: [
    {
      itemBought: { type: String, required: true },
      qtyBought: { type: Number, required: true },
      itemGiven: { type: String, required: true },
      qtyGiven: { type: Number, required: true },
      claimedBy: { type: mongoose.Schema.Types.ObjectId },
      filled: { type: Boolean, default: false },
    }
  ],
  trainrewards: [
    {
      item: { type: String, required: true },
      qty: { type: Number, required: true },
    }
  ],

  population: { type: Number, default: 0 }, // ✅ Track settlement population
  creationDate: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Settlement', SettlementSchema);