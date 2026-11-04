/**
 * The game server's door to utils/offerRules.mjs (the one rule for which outlets may use a
 * resource). The rules are an ES module so the editor can share them; this CommonJS wrapper loads
 * them once at boot (server.js awaits `ready`), then answers synchronously.
 *
 *   await ready                       before the first use (boot, or any async caller)
 *   blocked(resource, outlet)         reason string, or null when the outlet may use it
 *   blocksFor(resource)               { kent, bank, caravan, fair, tradeStall } for one row
 */
const masterResources = require('../tuning/resources.json');
const seasons = require('../tuning/seasons.json');
const { hopeArtifacts } = require('./hopeArtifacts');

let rules = null;
let ctx = null;
const ready = import('./offerRules.mjs').then((m) => {
  rules = m;
  ctx = m.offerContext({ seasons, hopeArtifacts: hopeArtifacts() });
  return m;
});

function need() {
  if (!rules) throw new Error('offerRules not loaded yet: await offerEligibility.ready first');
}

const byType = new Map(masterResources.map((r) => [r.type, r]));

function blocked(resource, outlet) {
  need();
  const r = typeof resource === 'string' ? byType.get(resource) : resource;
  return rules.blockReason(r, outlet, ctx);
}

function blocksFor(resource) {
  need();
  return rules.offerBlocks(resource, ctx);
}

module.exports = { ready, blocked, blocksFor };
