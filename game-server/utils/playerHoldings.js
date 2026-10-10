/**
 * Giving up resources, server side: the mirror of the client's rule in
 * game-client/src/Utils/InventoryManagement.js (getPlayerQuantity / spendIngredients).
 *   - What a player holds of a type = backpack + warehouse (inventory) together.
 *   - Taking it takes from the BACKPACK first, then the warehouse.
 *   - A take that cannot be covered changes nothing and returns false.
 * Every route that spends a player's goods (crafting, station upgrades, replant seeds, Trade
 * Stall requests, ...) goes through here; never deduct from `inventory` alone.
 * The arrays are mutated in place (works for plain arrays and Mongoose arrays).
 */

const sumOf = (list, type) => (Array.isArray(list) ? list : []).reduce((n, item) => (item && item.type === type ? n + (item.quantity || 0) : n), 0);

function heldQuantity(inventory, backpack, type) {
  return sumOf(backpack, type) + sumOf(inventory, type);
}

function takeFrom(list, type, qty) {
  let remaining = qty;
  if (!Array.isArray(list)) return remaining;
  for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
    const item = list[i];
    if (!item || item.type !== type || !(item.quantity > 0)) continue;
    const take = Math.min(item.quantity, remaining);
    item.quantity -= take;
    remaining -= take;
    if (item.quantity <= 0) list.splice(i, 1);
  }
  return remaining;
}

/** Take qty of type, backpack first. False (and nothing taken) when the player is short. */
function takeFromHoldings(inventory, backpack, type, qty) {
  if (!(qty > 0)) return true;
  if (heldQuantity(inventory, backpack, type) < qty) return false;
  const rest = takeFrom(backpack, type, qty);
  if (rest > 0) takeFrom(inventory, type, rest);
  return true;
}

/**
 * A cost as [type, qty] pairs: a recipe's ingredient1..ingredient10 pairs, or, with
 * `{ table: true }`, a plain { type: qty } cost table (globalTuning.craftingStationSlotCosts.slotN).
 * A recipe with no ingredients costs nothing (its other numeric fields are never costs).
 */
function recipeCosts(recipe, { table = false } = {}) {
  if (!recipe) return [];
  if (table) return Object.entries(recipe).filter(([, qty]) => typeof qty === 'number' && qty > 0);
  const pairs = [];
  for (let i = 1; i <= 10; i++) {
    const type = recipe[`ingredient${i}`];
    const qty = Number(recipe[`ingredient${i}qty`]);
    if (type && qty > 0) pairs.push([type, qty]);
  }
  return pairs;
}

function canAffordCosts(recipe, inventory, backpack, opts = {}) {
  return recipeCosts(recipe, opts).every(([type, qty]) => heldQuantity(inventory, backpack, type) >= qty);
}

/** Spend a whole cost (all or nothing), backpack first. */
function spendCosts(recipe, inventory, backpack, opts = {}) {
  if (!canAffordCosts(recipe, inventory, backpack, opts)) return false;
  for (const [type, qty] of recipeCosts(recipe, opts)) takeFromHoldings(inventory, backpack, type, qty);
  return true;
}

module.exports = { heldQuantity, takeFromHoldings, recipeCosts, canAffordCosts, spendCosts };
