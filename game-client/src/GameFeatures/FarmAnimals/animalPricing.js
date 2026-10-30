/**
 * Farm animal price inflation. Each animal of the SAME type already on the grid raises that type's
 * Money cost by `globalTuning.farmAnimalInflation` (compounding), so a herd of cows does not make
 * the first pig dear. The grid-wide cap (`maxFarmAnimals`) still counts every animal.
 * Used by the Buy panel (price and purchase) and the Animal panel (the sell refund).
 */

// npcs: the grid's NPCs as an object or array; type: the animal type ('Cow', 'Pig', ...)
export const countAnimalsOfType = (npcs, type) => Object.values(npcs || {})
  .filter((npc) => npc && npc.action === 'graze' && npc.type === type).length;

// Round up to the nearest 50, as the shop has always shown it.
export const scaledAnimalMoneyCost = (baseCost, animalCount, inflation = 0.1) => {
  if (!animalCount) return baseCost;
  const scaled = baseCost * Math.pow(1 + inflation, animalCount);
  return Math.ceil(scaled / 50) * 50;
};

// A copy of a buy option with its Money ingredients scaled; non-animals come back unchanged.
export const withScaledAnimalCost = (item, npcs, inflation) => {
  if (!item?.passable || item.action !== 'graze') return item;
  const count = countAnimalsOfType(npcs, item.type);
  const scaledItem = { ...item };
  for (let i = 1; i <= 4; i++) {
    const qtyKey = `ingredient${i}qty`;
    if (scaledItem[`ingredient${i}`] === 'Money' && scaledItem[qtyKey]) {
      scaledItem[qtyKey] = scaledAnimalMoneyCost(scaledItem[qtyKey], count, inflation);
    }
  }
  return scaledItem;
};
