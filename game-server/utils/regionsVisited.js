// The valley regions a player has set foot in (`player.regionsVisited`), for the `Discover
// <region>` quest goal (backlog OB-6, docs/midgame-quests-draft.md). setPlayerLocation
// (utils/gridResolver.js) adds each region as it is entered. An account from before the list
// existed has none: on its first enter-grid, seedRegionsVisited rebuilds it once from the grids it
// has visited (`gridsVisited`) and the regions of those cells' templates, so past discoveries
// count, the way /hope/found seeds `hopeFound`.

const Grid = require('../models/grid');
const { isGridVisited } = require('./gridsVisitedUtils');

/** Add a region to the list (no save). Skips accounts not yet seeded. */
function noteRegion(player, region) {
  if (!region || !Array.isArray(player.regionsVisited) || player.regionsVisited.includes(region)) return;
  player.regionsVisited.push(region);
  player.markModified?.('regionsVisited');
}

/** Build the list once for an account without one (no save). */
async function seedRegionsVisited(player) {
  if (Array.isArray(player.regionsVisited)) return;
  const query = { region: { $ne: null }, ownerId: null };
  if (player.frontierId) query.frontierId = player.frontierId;
  const cells = await Grid.find(query, { gridCoord: 1, region: 1 }).lean();
  const found = new Set();
  for (const c of cells) if (c.gridCoord != null && isGridVisited(player.gridsVisited, Number(c.gridCoord))) found.add(c.region);
  if (player.location?.region) found.add(player.location.region);
  player.regionsVisited = [...found];
  player.markModified?.('regionsVisited');
}

module.exports = { noteRegion, seedRegionsVisited };
