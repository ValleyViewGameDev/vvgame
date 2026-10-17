/**
 * combatGear - what a combat power is and whether it counts toward the player's stats.
 * Mirrored on the server by game-server/utils/combatStats.js; keep the two in step.
 *
 * Four kinds, each with its own equip slot (Combat panel, player.settings):
 *   weapon  passable + damage           settings.equippedWeapon (1); `hands` 1 or 2 (default 1)
 *   shield  passable + shield: true     settings.equippedShield (1); only with a one-handed weapon
 *   armor   passable + armorclass       settings.equippedArmor (1); never a weapon or a shield
 *   magic   everything else             settings.equippedMagic (up to magicSlotCount)
 *
 * Magic slots: globalTuning.combat.magicSlotsBase (5) unless the player bought more
 * (player.magicSlots; costs in globalTuning.combat.magicSlotGemCosts). A player who has never
 * chosen (settings.equippedMagic unset) wears their highest-level magic items up to the cap.
 */
export const COMBAT_ATTRIBUTES = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
export const DEFAULT_MAGIC_SLOTS = 5;

export const isWeapon = (r) => !!r && r.passable === true && typeof r.damage === 'number' && r.damage > 0;
export const isShield = (r) => !!r && r.passable === true && r.shield === true && !isWeapon(r);
export const isArmor = (r) => !!r && r.passable === true && typeof r.armorclass === 'number' && r.armorclass > 0 && !isWeapon(r) && !isShield(r);
export const isMagic = (r) => !!r && r.category === 'power' && !isWeapon(r) && !isArmor(r) && !isShield(r);
export const handsOf = (r) => (r?.hands === 2 ? 2 : 1);
export const handsIcon = (r) => (handsOf(r) === 2 ? '🤚🤚' : '🤚');

export const gearKind = (r) => (isWeapon(r) ? 'weapon' : isShield(r) ? 'shield' : isArmor(r) ? 'armor' : 'magic');

export function magicSlotBase(globalTuning) {
  const n = globalTuning?.combat?.magicSlotsBase;
  return Number.isFinite(n) ? n : DEFAULT_MAGIC_SLOTS;
}

export function magicSlotCount(player, globalTuning) {
  return Number.isFinite(player?.magicSlots) ? player.magicSlots : magicSlotBase(globalTuning);
}

/** The gem price of the next slot, or null when every slot is bought. */
export function nextMagicSlotCost(player, globalTuning) {
  const costs = globalTuning?.combat?.magicSlotGemCosts || [];
  const bought = magicSlotCount(player, globalTuning) - magicSlotBase(globalTuning);
  return bought >= 0 && bought < costs.length ? costs[bought] : null;
}

/** Types of the magic items that count: the player's choice (capped), or the best owned. */
export function equippedMagicTypes(player, masterResources, globalTuning) {
  const slots = magicSlotCount(player, globalTuning);
  const owned = (player?.powers || [])
    .map((p) => masterResources.find((r) => r.type === p.type))
    .filter(isMagic);
  const chosen = player?.settings?.equippedMagic;
  if (Array.isArray(chosen)) return chosen.filter((t) => owned.some((r) => r.type === t)).slice(0, slots);
  return owned.sort((a, b) => (b.level || 0) - (a.level || 0)).slice(0, slots).map((r) => r.type);
}

/** The shield counts only beside a one-handed weapon (or no weapon). */
export function shieldUsable(player, masterResources) {
  const weapon = masterResources.find((r) => r.type === player?.settings?.equippedWeapon);
  return !weapon || handsOf(weapon) === 1;
}

/** `{ [attr]: total }` from every power that counts for this player right now. */
export function powerModifiers(player, masterResources, globalTuning) {
  const mods = {};
  const s = player?.settings || {};
  const magic = new Set(equippedMagicTypes(player, masterResources, globalTuning));
  const shieldOk = shieldUsable(player, masterResources);
  for (const power of player?.powers || []) {
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

/**
 * After a magic item is gained (shop, scroll, debug): the settings that wear it at once when a
 * slot is free, or null when it should wait in the Combat panel. `player` already owns it.
 */
export function settingsWearingNewMagic(player, type, masterResources, globalTuning) {
  const r = masterResources.find((x) => x.type === type);
  if (!isMagic(r)) return null;
  const worn = equippedMagicTypes(player, masterResources, globalTuning);
  if (worn.includes(type) || worn.length >= magicSlotCount(player, globalTuning)) return null;
  return { ...(player.settings || {}), equippedMagic: [...worn, type] };
}
