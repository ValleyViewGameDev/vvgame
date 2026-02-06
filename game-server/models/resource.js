const mongoose = require('mongoose');

// Schema for individual crafting slot state
const CraftingSlotSchema = new mongoose.Schema({
  craftEnd: { type: Date, default: null },      // When crafting completes
  craftedItem: { type: String, default: null }, // What is being crafted
  qty: { type: Number, default: 1 },            // Quantity to receive on collection
}, { _id: false });

const ResourceSchema = new mongoose.Schema({
  gridId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grid', required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  type: { type: String, required: true },
  growEnd: { type: Date, default: null },
  // Legacy single-slot fields (kept for backward compatibility with non-crafting resources)
  craftEnd: { type: Date, default: null },
  craftedItem: { type: String, default: null },
  qty: { type: Number, default: 1 },
  size: { type: Number, default: 1 },
  stationLevel: { type: Number, default: 0 },
  occupied: { type: Boolean, default: false },
  // Array of slot states for multi-slot crafting stations
  slots: { type: [CraftingSlotSchema], default: undefined },
});

const Resource = mongoose.model('Resource', ResourceSchema);
module.exports = Resource;