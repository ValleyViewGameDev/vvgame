// How many units Kent and the Train ask for (docs/tuning.md, "Effort and ask sizing").
//
// Every good carries `effort` in resources.json: production minutes per unit through its whole
// recipe chain, derived by the editor from crafttime, yield and `parallel` (tools/editor/sheets/
// economy.js). An ask is sized by effort, not by units, the way Hay Day sizes boat crates by
// production time: quick goods come in dozens, slow ones in a handful.
//
//   center   = qtyAt1Min(level) x effort ^ -exponent     (exponent 0.4: Hay Day's crate curve)
//              for a good over one minute per unit the curve is steeper: effort ^ -exponentSlow
//              (0.55, owner 2026-10-30), so slow goods come down in number while the crops,
//              all under a minute, keep 0.4; at one minute the two agree, so the curve is continuous
//   quantity = round(center x scale x random(1 - spread .. 1 + spread)), clamped to [min, max]
//
// The tables live in globalTuning.json `askSizing` (the globalTuning sheet in the editor):
//   { exponent, exponentSlow, spread, kent: [{ maxLevel, qtyAt1Min, min, max }], train: [...],
//     trainBandScale: { basic, easy, aspirational } }

const FALLBACK = {
    exponent: 0.4,
    exponentSlow: 0.4,
    spread: 0.25,
    kent: [{ maxLevel: 999, qtyAt1Min: 10, min: 1, max: 20 }],
    train: [{ maxLevel: 999, qtyAt1Min: 40, min: 2, max: 40 }],
    trainBandScale: {}
};
// Goods with no effort (should not reach Kent or the Train) are sized as one-minute goods
const DEFAULT_EFFORT = 1;
const MIN_EFFORT = 0.01;

function sizingConfig(globalTuning) {
    return { ...FALLBACK, ...(globalTuning?.askSizing || {}) };
}

function levelRow(table, playerLevel) {
    return table.find(row => playerLevel <= row.maxLevel) || table[table.length - 1];
}

/**
 * The deterministic middle of an ask for this good at this level (before the random spread),
 * clamped to the level's [min, max]. `kind` is 'kent' or 'train'; `scale` a band multiplier.
 */
export function getAskCenter(resource, playerLevel, globalTuning, kind = 'kent', scale = 1) {
    const config = sizingConfig(globalTuning);
    const row = levelRow(config[kind] || FALLBACK[kind], playerLevel);
    const effort = Math.max(MIN_EFFORT, Number(resource?.effort) || DEFAULT_EFFORT);
    const exponent = effort > 1 ? (config.exponentSlow ?? config.exponent) : config.exponent;
    const center = row.qtyAt1Min * Math.pow(effort, -exponent) * scale;
    return Math.min(row.max, Math.max(row.min, center));
}

/**
 * A random ask around the center, within the level's [min, max]
 */
export function pickAskQuantity(resource, playerLevel, globalTuning, kind = 'kent', scale = 1) {
    const config = sizingConfig(globalTuning);
    const row = levelRow(config[kind] || FALLBACK[kind], playerLevel);
    const center = getAskCenter(resource, playerLevel, globalTuning, kind, scale);
    const jitter = 1 + (Math.random() * 2 - 1) * config.spread;
    return Math.min(row.max, Math.max(row.min, Math.round(center * jitter)));
}

/**
 * The band multiplier for a Train order band ('basic' | 'easy' | 'aspirational')
 */
export function getTrainBandScale(globalTuning, band) {
    return Number(sizingConfig(globalTuning).trainBandScale?.[band]) || 1;
}
