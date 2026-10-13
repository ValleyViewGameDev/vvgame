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

/**
 * Writes `effort` onto every good's row (removes it where there is none). Mutates `rows`;
 * returns the number of rows whose value changed.
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
  return changed;
}
