const mongoose = require('mongoose');

const ResourceSchema = new mongoose.Schema({
  gridId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grid', required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  type: { type: String, required: true },
  growEnd: { type: Date, default: null },
  craftEnd: { type: Date, default: null },
  craftedItem: { type: String, default: null }, // ✅ NEW FIELD TO TRACK WHAT WAS CRAFTED
  qty: { type: Number, default: 1 },
  size: { type: Number, default: 1 },
  occupied: { type: Boolean, default: false },
});

const Resource = mongoose.model('Resource', ResourceSchema);
module.exports = Resource;