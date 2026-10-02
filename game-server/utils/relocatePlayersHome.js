/**
 * Send players home. Phase 2: there are no shared grids to move PC records between; going home is
 * just writing player.location (see utils/gridResolver.sendPlayerHome).
 */
const Player = require('../models/player');
const { sendPlayerHome } = require('./gridResolver');

/** Every player in a frontier goes home (season end). Returns the number relocated. */
async function relocatePlayersHome(frontierId) {
  const players = await Player.find({ frontierId });
  let count = 0;
  for (const player of players) {
    try {
      const home = await sendPlayerHome(player);
      if (home) count++;
    } catch (err) {
      console.error(`❌ relocatePlayersHome: ${player.username}:`, err.message);
    }
  }
  console.log(`🏠 relocatePlayersHome: ${count}/${players.length} players sent home`);
  return count;
}

/** One player goes home (admin tool, homestead removal). Returns true if they had a homestead. */
async function relocateOnePlayerHome(playerId) {
  const player = await Player.findById(playerId);
  if (!player) return false;
  const home = await sendPlayerHome(player);
  return !!home;
}

module.exports = { relocatePlayersHome, relocateOnePlayerHome };
