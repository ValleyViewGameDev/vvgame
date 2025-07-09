// settlement.js
const mongoose = require('mongoose');

const SettlementSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Internal coordinate-based name
  displayName: { type: String }, // User-facing editable name
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
          enum: ['homestead', 'town', 'valley', 'valley0', 'valley1', 'valley2', 'valley3', 'reserved'], 
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
  taxlog: [
    {
      date: { type: Date, required: true },
      totalcollected: { type: Number, required: true },
      currentmayor: { type: String, required: true },
      mayortake: { type: Number, required: true },
    }
  ],
  banklog: [
    {
      date: { type: Date, required: true },
      seasonlevel: { type: Number, required: true },
      offers: [
        {
          offer: { type: String, required: true },  // ✅ FIXED
          qty: { type: String, required: true },
        }
      ]
    }
  ],
  trainlog: [
    {
      date: { type: Date, required: true },
      alloffersfilled: { type: Boolean, default: false },
      totalwinners: { type: Number, required: true },
      rewards: [
        {
          item: { type: String, required: true },
          qty: { type: Number, required: true },
        }
      ],
      logic: { type: String, required: false } 
    }
  ],
  electionlog: [
    {
      date: { type: Date, required: true },
      candidates: [
        {
          playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
          username: { type: String, required: true },
          votes: { type: Number, required: true }
        }
      ],
      electedmayor: { type: String, required: true }
    }
  ],

  population: { type: Number, default: 0 }, // ✅ Track settlement population
  creationDate: { type: Date, default: Date.now },
});

// Set displayName default to name if not provided
SettlementSchema.pre('save', function(next) {
  if (!this.displayName) {
    this.displayName = this.name;
  }
  next();
});

module.exports = mongoose.model('Settlement', SettlementSchema);