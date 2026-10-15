/**
 * Economy derivations for the ECONOMY sheet (tuning/resources.json). Shared by the editor server
 * (recomputed on every save), the editor client (live, read-only column) and
 * tools/derive-economy.js (the command line, after hand edits or a CSV import).
 *
 * effort (minutes per unit): how much production one unit of a good costs, through its whole
 * recipe chain, the way a player actually produces it (docs/tuning.md, "Effort and ask sizing").
 *
 *   effort(good) = crafttime(good) / 60 / (yield x parallel)  +  sum of ingredientQty x effort(ingredient)
 *
 *   crafttime  the good's own cycle in seconds (a crop's grow time, an animal's or tree's cycle,
 *              a station's craft time); the ECONOMY column already carries it on every good.
 *   yield      units per cycle: the farm animal's qtycollected for an animal product, 1 for a
 *              crafted good, the good's own qtycollected otherwise (crops, trees, deposits).
 *   parallel   how many of that producer a player typically runs at once: the `parallel`
 *              column on the producer's row (plot, tree, animal, station). Blank = 1.
 *
 * A good whose chain loops back on itself, or an ingredient with no row (Money), adds nothing.
 * Goods with no crafttime and no ingredients get no effort (the column stays blank).
 */

const PRODUCT_CATEGORY = 'doober';

function producerOf(good, byType) {
  return byType.get(good.source) || null;
}

function unitsPerCycle(good, producer) {
  if (producer?.category === 'npc') return producer.qtycollected || 1;  // farm animal
  if (producer?.category === 'crafting') return 1;                       // a craft makes one
  return good.qtycollected || 1;                                         // crop, tree, deposit
}

/** Map of type -> effort minutes per unit (unrounded) for every good that has one. */
export function computeEffort(rows) {
  const byType = new Map(rows.map((r) => [r.type, r]));
  const memo = new Map();
  const visiting = new Set();

  const effortOf = (type) => {
    if (memo.has(type)) return memo.get(type);
    const good = byType.get(type);
    if (!good || visiting.has(type)) return 0;
    visiting.add(type);
    const producer = producerOf(good, byType);
    const parallel = Math.max(1, Number(producer?.parallel) || 1);
    let minutes = (Number(good.crafttime) || 0) / 60 / (unitsPerCycle(good, producer) * parallel);
    for (const i of [1, 2, 3, 4]) {
      const ingredient = good[`ingredient${i}`];
      if (ingredient) minutes += (Number(good[`ingredient${i}qty`]) || 1) * effortOf(ingredient);
    }
    visiting.delete(type);
    memo.set(type, minutes);
    return minutes;
  };

  const out = new Map();
  for (const r of rows) {
    if (r.category !== PRODUCT_CATEGORY) continue;
    const e = effortOf(r.type);
    if (e > 0) out.set(r.type, e);
  }
  return out;
}

/** Stored precision: 2 significant decimals below 10 minutes, whole minutes above. */
export function roundEffort(e) {
  return e >= 10 ? Math.round(e) : Math.round(e * 100) / 100;
}

// ----------------------------------------------------------------------------- gem prices
/**
 * gemcost (gems to buy one unit): Hay Day's "time is diamonds" (docs/economy-plan.md):
 *
 *   gemcost(good) = ceil( Money x Money's gemcost
 *                         + smooth( sum(other ingredientQty x gemcost(ingredient)) + (crafttime minutes)^0.45 ) )
 *
 * Exceptions, in order:
 *   gemOverride  a hand-set price on the row wins (sheet overrides that never followed the rule).
 *   no recipe and no crafttime (Money, gems, specials): the stored gemcost is the input.
 *   rare         a row ticked `rare` (Tulip, Feverfew, Rosemary, ... the scroll-find crops): its time
 *                is its EFFORT (grow time over yield x parallel plots), not the wall-clock grow,
 *                because a player grows many at once and also finds them in scrolls:
 *                ceil(effort ^ 0.45).
 * Only rows that already carry a gemcost (or a gemOverride) are written; plots and other unpriced
 * rows stay unpriced. A row with no recipe and no crafttime (Money, gems) keeps its stored gemcost;
 * in the editor gemcost is read-only, so change such a price through gemOverride.
 * smooth: unchanged up to GEM_PRICE.knee, then knee x (x / knee) ^ power, so deep chains and big
 * unlocks stay expensive without reaching absurd numbers. Money is never smoothed (a flat 100
 * coins a gem): otherwise buying a big coin shortfall with gems undercuts the Store's Money packs. Economy/gemPricing.js applies the same
 * curve to what a gem purchase charges in the game; keep the two in step.
 */
export const GEM_PRICE = { knee: 250, power: 0.35, linear: 'Money' };
export const smoothGems = (x) => (x <= GEM_PRICE.knee ? x : GEM_PRICE.knee * (x / GEM_PRICE.knee) ** GEM_PRICE.power);

/** Map of type -> derived gemcost for every row the rule prices (others keep their stored value). */
export function computeGemcost(rows) {
  const byType = new Map(rows.map((r) => [r.type, r]));
  const efforts = computeEffort(rows);
  const memo = new Map();
  const visiting = new Set();
  const recipeOf = (r) => [1, 2, 3, 4].map((i) => [r[`ingredient${i}`], Number(r[`ingredient${i}qty`]) || 1]).filter(([t]) => t);
  const gemOf = (type) => {
    if (memo.has(type)) return memo.get(type);
    const r = byType.get(type);
    if (!r) return 0;
    if (typeof r.gemOverride === 'number') { memo.set(type, r.gemOverride); return r.gemOverride; }
    const recipe = recipeOf(r), time = Number(r.crafttime) || 0;
    if ((!recipe.length && !time) || visiting.has(type)) return Number(r.gemcost) || 0;
    visiting.add(type);
    let g;
    if (r.rare === true && !recipe.length) g = Math.ceil((efforts.get(type) || time / 60) ** 0.45);
    else {
      const flat = recipe.filter(([t]) => t === GEM_PRICE.linear).reduce((n, [t, q]) => n + q * gemOf(t), 0);
      const rest = recipe.filter(([t]) => t !== GEM_PRICE.linear).reduce((n, [t, q]) => n + q * gemOf(t), 0);
      g = Math.ceil(flat + smoothGems(rest + (time ? (time / 60) ** 0.45 : 0)));
    }
    visiting.delete(type);
    memo.set(type, g);
    return g;
  };
  const out = new Map();
  for (const r of rows) {
    if (typeof r.gemOverride === 'number' || (typeof r.gemcost === 'number' && (recipeOf(r).length || Number(r.crafttime)))) out.set(r.type, gemOf(r.type));
  }
  return out;
}

/**
 * Writes `effort` onto every good's row (removes it where there is none) and the derived
 * `gemcost` onto every row the gem rule prices. Mutates `rows`; returns the number of rows whose
 * value changed.
 */
export function deriveResources(rows) {
  const efforts = computeEffort(rows);
  let changed = 0;
  for (const r of rows) {
    if (r.category !== PRODUCT_CATEGORY) {
      if (r.effort !== undefined) { delete r.effort; changed++; }
      continue;
    }
    const e = efforts.has(r.type) ? roundEffort(efforts.get(r.type)) : undefined;
    if (r.effort !== e) {
      if (e === undefined) delete r.effort; else r.effort = e;
      changed++;
    }
  }
  const gems = computeGemcost(rows);
  for (const r of rows) {
    if (gems.has(r.type) && r.gemcost !== gems.get(r.type)) { r.gemcost = gems.get(r.type); changed++; }
  }
  return changed;
}
