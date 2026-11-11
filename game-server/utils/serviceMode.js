/**
 * Service mode: lets the server announce an update or hold players at a maintenance screen.
 *
 *   SERVICE_MODE = normal | notice | maintenance   (env var, read at boot)
 *   SERVICE_MESSAGE = optional text shown in the client modal
 *
 * - notice: the client shows a dismissable update notice on every load. Gameplay untouched.
 * - maintenance: the client shows a blocking modal and every gameplay route answers 503,
 *   except for developer accounts (tuning/developerUsernames.json), who can keep playing to test.
 *
 * Flip the mode by changing the env var on the Render service (it restarts; clients re-check
 * /api/status on reconnect and every 60 s).
 */
const fs = require('fs');
const path = require('path');
const Player = require('../models/player');

const MODES = ['normal', 'notice', 'maintenance'];
const mode = MODES.includes(process.env.SERVICE_MODE) ? process.env.SERVICE_MODE : 'normal';
const message = process.env.SERVICE_MESSAGE || '';

const developerUsernames = new Set(
  JSON.parse(fs.readFileSync(path.join(__dirname, '../tuning/developerUsernames.json'), 'utf-8'))
);

// playerId -> isDeveloper, so the maintenance gate costs one lookup per player per process.
// The id comes from the caller's session (utils/session.js rewrites x-player-id). A developer
// account must also have a password (BL-2): a passwordless profile signs in, and resumes its
// session, by name or id alone, so it can never carry developer rights.
const devCache = new Map();
async function isDeveloperPlayerId(playerId) {
  if (!playerId) return false;
  playerId = String(playerId);
  if (devCache.has(playerId)) return devCache.get(playerId);
  let result = false;
  try {
    const { hasPassword } = require('./publicPlayer');
    const player = await Player.findById(playerId, 'username password').lean();
    result = !!player && developerUsernames.has(player.username) && hasPassword(player);
  } catch (_) {
    result = false;
  }
  devCache.set(playerId, result);
  return result;
}

// Routes that must keep working during maintenance so the client can show the modal and devs can log in.
const OPEN_PATHS = new Set(['/api/status', '/api/ping', '/api/login', '/api/check-developer-status']);

function getStatus() {
  return { mode, message, version: process.env.RENDER_GIT_COMMIT || null };
}

function maintenanceGate() {
  return async (req, res, next) => {
    if (mode !== 'maintenance') return next();
    const base = req.path.split('/').slice(0, 3).join('/'); // '/api/<first segment>'
    if (OPEN_PATHS.has(base) || !req.path.startsWith('/api')) return next();
    // the session's player (utils/session.js), never an id the request names
    if (await isDeveloperPlayerId(req.get('x-player-id'))) return next();
    return res.status(503).json({ maintenance: true, message });
  };
}

// A rename or a password change can make a player a developer or stop them being one: drop the cached answer.
function forgetDeveloperStatus(playerId) { if (playerId) devCache.delete(String(playerId)); }

module.exports = { getStatus, maintenanceGate, isDeveloperPlayerId, forgetDeveloperStatus };
