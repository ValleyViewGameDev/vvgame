/**
 * The gem price curve (docs/tuning.md, "Gem prices"). Prices up to `knee` gems are the plain
 * Hay Day sum; above it they grow as knee x (x / knee) ^ power, so a deep chain or a big unlock
 * stays expensive without reaching absurd numbers. `linear` (Money) is never smoothed: it is
 * added at its flat gemcost, so buying a coin shortfall with gems never undercuts a Money pack. tools/editor/sheets/economy.js (GEM_PRICE)
 * uses the same curve to derive resources.json `gemcost`; keep the two in step.
 */
export const GEM_PRICE = { knee: 250, power: 0.35, linear: 'Money' };

export const smoothGems = (x) => (x <= GEM_PRICE.knee ? x : GEM_PRICE.knee * (x / GEM_PRICE.knee) ** GEM_PRICE.power);
