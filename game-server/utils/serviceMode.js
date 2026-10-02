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
const devCache = new Map();
async function isDeveloperPlayerId(playerId) {
  if (!playerId) return false;
  if (devCache.has(playerId)) return devCache.get(playerId);
  let result = false;
  try {
    const player = await Player.findById(playerId, 'username').lean();
    result = !!player && developerUsernames.has(player.username);
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
    const playerId = req.get('x-player-id') || req.body?.playerId || req.query?.playerId;
    if (await isDeveloperPlayerId(playerId)) return next();
    return res.status(503).json({ maintenance: true, message });
  };
}

module.exports = { getStatus, maintenanceGate, isDeveloperPlayerId };
