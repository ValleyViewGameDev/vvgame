// Developer-related helper functions
const developerUsernames = require('../tuning/developerUsernames.json');
// Test accounts that are not developers (made, deleted and re-made freely): no developer access,
// but kept off the leaderboards and season rewards like developers. Matched case-insensitively.
const testUsernames = new Set(require('../tuning/testUsernames.json').map((n) => n.toLowerCase()));

/**
 * Checks if a username belongs to a developer
 * @param {string} username - The username to check
 * @returns {boolean} - True if the user is a developer, false otherwise
 */
function isDeveloper(username) {
  if (!username) return false;
  return developerUsernames.includes(username);
}

function isTestAccount(username) {
  return !!username && testUsernames.has(String(username).toLowerCase());
}

// Kept off the leaderboards, season winners and season rewards: developers and test accounts.
function isExcludedFromRankings(username) {
  return isDeveloper(username) || isTestAccount(username);
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
 * session must be a developer account's, the same check as the maintenance gate. x-player-id is
 * rewritten from the session token (utils/session.js); the editor signs a token for
 * --dev-player-id, the game client sends the one it got at sign-in.
 */
async function requireDeveloper(req, res, next) {
  const { isDeveloperPlayerId } = require('./serviceMode');
  if (await isDeveloperPlayerId(req.get('x-player-id'))) return next();
  console.warn(`🚫 developer-only ${req.method} ${req.originalUrl} refused`);
  return res.status(403).json({ error: 'developer only' });
}

module.exports = {
  isDeveloper,
  isTestAccount,
  isExcludedFromRankings,
  requireDeveloper,
  addDeveloperFlags,
  excludeDevelopers
};