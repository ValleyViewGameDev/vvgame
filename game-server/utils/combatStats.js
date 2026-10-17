/**
 * combatStats - the player's combat stats as the SERVER derives them from the Player document
 * (base stats + equipped weapon/armour + every magic enhancement), mirroring the client's
 * PlayersInGrid.powerModifiers so both sides agree. The server never accepts these from the
 * client: `/action/npc-kill` bounds a claimed kill with them and `/player/state` clamps hp to
 * the derived max (docs/audits/combat-and-npc-review-2026-10-07.md, Track 2).
 */
const masterResources = require('../tuning/resources.json');
const globalTuning = require('../tuning/globalTuning.json');

const COMBAT_ATTRIBUTES = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
const DEFAULTS = { maxhp: 25, armorclass: 10, attackbonus: 0, damage: 1, attackrange: 1, speed: 5 };

// Mirrors game-client/src/GameFeatures/Combat/combatGear.js (weapon / shield / armour / magic,
// shields only beside a one-handed weapon, magic capped by the player's slot count)
const isWeapon = (r) => !!r && r.passable === true && typeof r.damage === 'number' && r.damage > 0;
const isShield = (r) => !!r && r.passable === true && r.shield === true && !isWeapon(r);
const isArmor = (r) => !!r && r.passable === true && typeof r.armorclass === 'number' && r.armorclass > 0 && !isWeapon(r) && !isShield(r);
const isMagic = (r) => !!r && r.category === 'power' && !isWeapon(r) && !isArmor(r) && !isShield(r);
const handsOf = (r) => (r?.hands === 2 ? 2 : 1);

function magicSlotBase() {
  const n = globalTuning.combat?.magicSlotsBase;
  return Number.isFinite(n) ? n : 5;
}
function magicSlotCount(player) {
  return Number.isFinite(player?.magicSlots) ? player.magicSlots : magicSlotBase();
}
function equippedMagicTypes(player) {
  const slots = magicSlotCount(player);
  const owned = (player.powers || []).map((p) => masterResources.find((r) => r.type === p.type)).filter(isMagic);
  const chosen = player.settings?.equippedMagic;
  if (Array.isArray(chosen)) return chosen.filter((t) => owned.some((r) => r.type === t)).slice(0, slots);
  return owned.sort((a, b) => (b.level || 0) - (a.level || 0)).slice(0, slots).map((r) => r.type);
}

function powerModifiers(player) {
  const mods = {};
  const s = player.settings || {};
  const magic = new Set(equippedMagicTypes(player));
  const weapon = masterResources.find((r) => r.type === s.equippedWeapon);
  const shieldOk = !weapon || handsOf(weapon) === 1;
  for (const power of player.powers || []) {
    const r = masterResources.find((x) => x.type === power.type);
    if (!r || r.category !== 'power') continue;
    const counts = isWeapon(r) ? power.type === s.equippedWeapon
      : isShield(r) ? power.type === s.equippedShield && shieldOk
      : isArmor(r) ? power.type === s.equippedArmor
      : magic.has(power.type);
    if (!counts) continue;
    const qty = power.quantity || 0;
    for (const attr of COMBAT_ATTRIBUTES) {
      if (typeof r[attr] === 'number') mods[attr] = (mods[attr] || 0) + qty * r[attr];
    }
  }
  return mods;
}

/** { maxhp, armorclass, attackbonus, damage, attackrange, speed } for a Player (plain or document). */
function derivedStats(player) {
  const p = player?.toObject ? player.toObject() : (player || {});
  const mods = powerModifiers(p);
  return {
    maxhp: (p.baseMaxhp || DEFAULTS.maxhp) + (mods.maxhp || 0),
    armorclass: (p.baseArmorclass || DEFAULTS.armorclass) + (mods.armorclass || 0),
    attackbonus: (p.baseAttackbonus || DEFAULTS.attackbonus) + (mods.attackbonus || 0),
    damage: (p.baseDamage || DEFAULTS.damage) + (mods.damage || 0),
    attackrange: (p.baseAttackrange || DEFAULTS.attackrange) + (mods.attackrange || 0),
    speed: (p.baseSpeed || DEFAULTS.speed) + (mods.speed || 0),
  };
}

/** The swing cooldown the client uses (globalTuning.combat), for the kill-rate bound. */
function attackCooldownMs(speed) {
  const t = { attackCooldownMinMs: 400, attackCooldownMaxMs: 800, attackCooldownPerSpeedMs: 100, ...(globalTuning.combat || {}) };
  const s = Number.isFinite(speed) ? speed : 5;
  return Math.max(t.attackCooldownMinMs, Math.min(t.attackCooldownMaxMs, t.attackCooldownMinMs + (s - 1) * t.attackCooldownPerSpeedMs));
}

module.exports = { derivedStats, powerModifiers, attackCooldownMs, COMBAT_ATTRIBUTES, magicSlotBase, magicSlotCount };
