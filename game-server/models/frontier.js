const mongoose = require('mongoose');

const FrontierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  tier: { type: Number, required: true },
  
  settlements: [
    [
      {
        settlementId: { type: mongoose.Schema.Types.ObjectId, required: true },
        settlementType: { type: String, required: true },
        available: { type: Boolean, required: true },
      },
    ],
  ],

  governor: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },

  // ✅ Taxes (Timer Controlled by Main Scheduler, Logic Per Settlement)
  taxes: {
    phase: { type: String }, 
    startTime: { type: Date, default: Date.now }, 
    endTime: { type: Date, required: true },
  },

  // ✅ Bank Offers (Regenerated Each Tax Cycle)
  bank: {
    phase: { type: String }, 
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, required: true },
    offers: [
      {
        itemBought: { type: String, required: true },
        qtyBought: { type: Number, required: true },
        itemGiven: { type: String, required: true },
        qtyGiven: { type: Number, required: true },
      }
    ],
  },

  // ✅ Season Timing (Controlled Per Frontier)
  seasons: {
    phase: { type: String }, 
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, required: true },
    seasonNumber: { type: Number, default: 1 },
    seasonType: { type: String, default: "Spring" },
  },

  // ✅ Elections Timing (Controlled Per Frontier, Logic Per Settlement)
  elections: {
    phase: { type: String }, 
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, required: true },
  },

  // ✅ Train Timing (Controlled Per Frontier, Logic Per Settlement)
  train: {
    phase: { type: String }, 
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, required: true },
  },
  // ✅ Carnival Timing (Controlled Per Frontier, Logic Per Settlement)
  carnival: {
    phase: { type: String }, 
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, required: true },
  },
  // ✅ Message Timing (Controlled Per Frontier, logic Per Player)
  messages: {
    phase: { type: String }, 
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, required: true },
  },
  // ✅ Networth Calculation Timing (Controlled Per Frontier, logic Per Player)
  networth: {
    phase: { type: String }, 
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, required: true },
  },


  seasonlog: [
    {
      date: { type: Date, required: true },
      seasonnumber: { type: Number, required: true },
      seasontype: { type: String, required: true }, // e.g., "Spring", "Summer", etc.
      seasonwinners: [
        {
          playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
          username: { type: String, required: true },
          networth: { type: Number, required: true }
        }
      ],
      winningsettlement: { type: String, required: true },
      gridsreset: { type: Number, required: true },
      playersrelocated: { type: Number, required: true },
    }
  ],
    
});

// Add indexes for timer queries
FrontierSchema.index({ 'seasons.endTime': 1 });
FrontierSchema.index({ 'taxes.endTime': 1 });
FrontierSchema.index({ 'elections.endTime': 1 });
FrontierSchema.index({ 'train.endTime': 1 });
FrontierSchema.index({ 'bank.endTime': 1 });
FrontierSchema.index({ 'messages.endTime': 1 });
FrontierSchema.index({ 'networth.endTime': 1 });

module.exports = mongoose.model('Frontier', FrontierSchema);