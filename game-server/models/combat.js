const mongoose = require('mongoose');

const CombatSchema = new mongoose.Schema({
  hp: { type: Number, required: true },
  maxhp: { type: Number, required: true },
  range: { type: Number, required: true },
  attackrange: { type: Number, required: true },
  armorclass: { type: Number, required: true },
  attackbonus: { type: Number, required: true },
  damage: { type: Number, required: true },
  speed: { type: Number, required: true },
});

const Combat = mongoose.model('Combat', CombatSchema);
module.exports = Combat;