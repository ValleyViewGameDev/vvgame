// Developer-related helper functions
const developerUsernames = require('../tuning/developerUsernames.json');

/**
 * Checks if a username belongs to a developer
 * @param {string} username - The username to check
 * @returns {boolean} - True if the user is a developer, false otherwise
 */
function isDeveloper(username) {
  if (!username) return false;
  return developerUsernames.includes(username);
}

/**
 * Adds isDeveloper flag to an array of players
 * @param {Array} players - Array of player objects
 * @returns {Array} - Array of players with isDeveloper flag added
 */
function addDeveloperFlags(players) {
  return players.map(player => ({
    ...player,
    isDeveloper: isDeveloper(player.username)
  }));
}

/**
 * Filters out developers from an array of players
 * @param {Array} players - Array of player objects
 * @returns {Array} - Array of players excluding developers
 */
function excludeDevelopers(players) {
  return players.filter(player => !isDeveloper(player.username));
}

/**
 * Express middleware for admin routes (the editor and the in-game debug panel): the caller's
 * x-player-id must be a developer account's, the same check as the maintenance gate. The editor
 * sends it from --dev-player-id; the game client sets it on every request once signed in.
 */
async function requireDeveloper(req, res, next) {
  const { isDeveloperPlayerId } = require('./serviceMode');
  if (await isDeveloperPlayerId(req.get('x-player-id'))) return next();
  console.warn(`🚫 developer-only ${req.method} ${req.originalUrl} refused`);
  return res.status(403).json({ error: 'developer only' });
}

module.exports = {
  isDeveloper,
  requireDeveloper,
  addDeveloperFlags,
  excludeDevelopers
};