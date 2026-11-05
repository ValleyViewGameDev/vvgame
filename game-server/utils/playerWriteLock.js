/**
 * One writer per player at a time (2026-11-04, Phase 5 groundwork).
 *
 * The action routes (/action/*, crafting, trading) load the Player, change several fields
 * (holdings, quests, trophies, xp) and save it. Two of them at once for the same player (fast
 * taps, a craft collected while a doober is picked up) could each load the old record, and the
 * later save would undo the earlier one, or Mongoose would refuse it with a VersionError (House
 * hit exactly this: docs reference_stale_doc_versionerror).
 *
 * Same shape as gridWriteLock.js: an Express middleware that queues every WRITE request naming a
 * player (`playerId` in the body) per player id, through the shared per-key queue (../queue.js),
 * so the next request for that player starts only when the previous one has answered. Reads are
 * never queued. Mounted AFTER gridWriteLock, so every request takes its grid first and its player
 * second: a request names at most one grid, so the two locks can never wait on each other.
 * In-process: it relies on the game server being ONE Node process, like the grid lock.
 */
const { enqueueByKey } = require('../queue');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCK_TIMEOUT_MS = 20000;
const KEY_PREFIX = 'player:'; // never collides with a grid id key

function playerIdOf(req) {
  const id = req.body && req.body.playerId;
  return id && (typeof id === 'string' || typeof id === 'number') ? String(id) : null;
}

function playerWriteLock(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  const playerId = playerIdOf(req);
  if (!playerId) return next();

  enqueueByKey(KEY_PREFIX + playerId, () => new Promise((release) => {
    let released = false;
    const done = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      release();
    };
    const timer = setTimeout(() => {
      console.warn(`⏱️ playerWriteLock: ${req.method} ${req.originalUrl} held player ${playerId} for ${LOCK_TIMEOUT_MS} ms; releasing`);
      done();
    }, LOCK_TIMEOUT_MS);
    res.on('finish', done);
    res.on('close', done);
    next();
  }));
}

module.exports = { playerWriteLock, playerIdOf };
