/**
 * One writer per grid at a time (2026-10-10).
 *
 * A grid's resources are ONE Mixed array, and every route that changes a grid loads the whole
 * document and saves the whole array back. Two requests on the same grid at once (a craft
 * started while a Farm Hand replants, a doober collected while an animal is harvested) could
 * each load the old array, and the later save silently undid the earlier one: e.g. a crafting
 * slot the client saw empty stayed full on the server ("all slots are full" until a refresh).
 *
 * This Express middleware queues every WRITE request (POST/PUT/PATCH/DELETE) that names a
 * grid, per grid id, through the same per-key queue update-grid already used (../queue.js):
 * the next request on that grid starts only when the previous one has answered (or closed).
 * Reads are never queued. The game server is ONE Node process, so an in-process queue is
 * enough; a second instance would need a database-side guard instead.
 *
 * update-grid answers 202 at once and does its work in a task queued on the same key, so that
 * task runs after the request that queued it and before the next grid write.
 * A request that never answers releases the grid after LOCK_TIMEOUT_MS so one hung request
 * cannot freeze a grid.
 */
const { enqueueByKey } = require('../queue');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCK_TIMEOUT_MS = 20000;
// Routes that carry the grid id in the URL, not the body (req.params is not parsed yet here)
const GRID_IN_PATH = /\/(update-grid|update-tile|plant-new-trees|make-it-snow|melt-the-snow|delete-dungeon)\/([0-9a-fA-F]{24})(?:[/?]|$)/;

function gridIdOf(req) {
  const fromBody = req.body && (req.body.gridId || req.body.GridId || req.body.fromGridId);
  if (fromBody && typeof fromBody === 'string') return fromBody;
  if (req.query && typeof req.query.gridId === 'string') return req.query.gridId;
  const m = GRID_IN_PATH.exec(req.originalUrl || req.url || '');
  return m ? m[2] : null;
}

function gridWriteLock(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  const gridId = gridIdOf(req);
  if (!gridId) return next();

  // Same key as update-grid's own queued task (the bare grid id), so the two share one line
  enqueueByKey(String(gridId), () => new Promise((release) => {
    let released = false;
    const done = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      release();
    };
    const timer = setTimeout(() => {
      console.warn(`⏱️ gridWriteLock: ${req.method} ${req.originalUrl} held grid ${gridId} for ${LOCK_TIMEOUT_MS} ms; releasing`);
      done();
    }, LOCK_TIMEOUT_MS);
    res.on('finish', done);
    res.on('close', done);
    next();
  }));
}

module.exports = { gridWriteLock, gridIdOf };
