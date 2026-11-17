/**
 * Per-copy price inflation: crafting stations and rows with `copyInflation` (owner 2026-11-16; server twin: game-server/utils/playerEconomy.js
 * withScaledStationCost). Each station of the SAME type already on the grid raises that type's Money
 * price by `globalTuning.craftingStationInflation` (compounding, rounded up to 50): Hay Day's rising
 * price per extra machine, as a coin sink. Plots, trees and other buildings stay flat; only Money
 * scales. Used by the Build panel (the shown price, affordability, the gem top-up) and BuildAndBuy.
 */

// resources: the grid's resources; type: the station type ('Oven', ...)
export const countStationsOfType = (resources, type) => (resources || []).filter((r) => r && r.type === type).length;

// The per-copy rate: a row's own `copyInflation` (the grand and aspirational decorations), else the
// station rate for a crafting station, else none.
const copyInflationOf = (item, stationRate) => (Number(item?.copyInflation) > 0 ? Number(item.copyInflation)
  : item?.category === 'crafting' ? Number(stationRate ?? 0.1) : 0);

// A copy of a build option with its Money ingredients scaled; anything with no per-copy rate comes back unchanged.
// stationRate: globalTuning.craftingStationInflation.
export const withScaledStationCost = (item, resources, stationRate = 0.1) => {
  const inflation = copyInflationOf(item, stationRate);
  if (!item || !(inflation > 0)) return item;
  const count = countStationsOfType(resources, item.type);
  if (!count) return item;
  const scaled = { ...item };
  for (let i = 1; i <= 4; i++) {
    const qtyKey = `ingredient${i}qty`;
    if (scaled[`ingredient${i}`] === 'Money' && scaled[qtyKey]) {
      scaled[qtyKey] = Math.ceil((scaled[qtyKey] * Math.pow(1 + inflation, count)) / 50) * 50;
    }
  }
  return scaled;
};
