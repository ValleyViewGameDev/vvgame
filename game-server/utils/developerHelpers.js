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

module.exports = {
  isDeveloper,
  addDeveloperFlags,
  excludeDevelopers
};