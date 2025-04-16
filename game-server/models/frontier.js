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

});

// Add indexes for timer queries
FrontierSchema.index({ 'seasons.endTime': 1 });
FrontierSchema.index({ 'taxes.endTime': 1 });
FrontierSchema.index({ 'elections.endTime': 1 });
FrontierSchema.index({ 'train.endTime': 1 });
FrontierSchema.index({ 'bank.endTime': 1 });

module.exports = mongoose.model('Frontier', FrontierSchema);