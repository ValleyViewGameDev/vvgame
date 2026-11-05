/**
 * The game server's door to utils/offerRules.mjs (the one rule for which outlets may use a
 * resource). The rules are an ES module so the editor can share them; this CommonJS wrapper loads
 * them once at boot (server.js awaits `ready`), then answers synchronously.
 *
 *   await ready                       before the first use (boot, or any async caller)
 *   blocked(resource, outlet)         reason string, or null when the outlet may use it
 *   blocksFor(resource)               { kent, bank, caravan, fair, tradeStall } for one row
 *   enemyDropReady(resource, player, playerLevel)
 *                                     false while an enemy-only drop is still out of the player's
 *                                     reach (Kent and the Caravan; docs/tuning.md 5d)
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

/*
 * Enemy drops (owner, 2026-11-05). A good that only enemies drop (no home source: none, or the
 * valley, or the enemy itself) waits until the player has been to the valley (the "Explore the
 * Valley" trophy) AND has reached the `homelevel` of the easiest enemy that drops it: the player
 * level whose shared gear that enemy is fitted against (resources.json, docs/tuning.md 5d), so a
 * player is only asked for what their gear can win. A good with a home source (Thread: the Loom)
 * is not an enemy drop here; its own level and skill gates apply.
 */
const dropLevel = new Map();   // good -> lowest homelevel among the enemies that drop it
for (const e of masterResources) {
  if (e.action !== 'attack' || !e.output) continue;
  const lvl = Number(e.homelevel) || 0;
  dropLevel.set(e.output, Math.min(dropLevel.get(e.output) ?? Infinity, lvl));
}

function hasHomeSource(resource) {
  const src = resource.source;
  if (!src || src === 'valley') return false;
  return byType.get(src)?.action !== 'attack';
}

function enemyDropReady(resource, player, playerLevel) {
  if (!dropLevel.has(resource.type) || hasHomeSource(resource)) return true;
  const explored = (player?.trophies || []).some((t) => t.name === 'Explore the Valley');
  return explored && playerLevel >= dropLevel.get(resource.type);
}

module.exports = { ready, blocked, blocksFor, enemyDropReady };
