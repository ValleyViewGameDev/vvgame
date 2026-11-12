/**
 * Player sessions (BL-2, 2026-11-11): a signed token in place of the bare `x-player-id` header.
 *
 * A player id is not a secret (it appears in chat, settlement roles and other responses), so the
 * server no longer believes a request that merely names one. Sign-in (/login, /login-google), a
 * new profile (/register-new-player) and /session/resume answer with `sessionToken`, a signed
 * token naming the player id and an expiry (`<payload>.<HMAC-SHA256>`, both base64url, made with
 * Node's own crypto: jsonwebtoken's jwa dependency crashes on Node 25, which removed SlowBuffer); the client sends it as `Authorization: Bearer <token>` (a page-hide
 * beacon, which cannot set headers, puts it in the body as `sessionToken`).
 *
 * - sessionMiddleware: verifies the token, sets req.sessionPlayerId, and REWRITES the
 *   x-player-id header to the session's player (or removes it), so every existing
 *   `req.get('x-player-id')` check (developer routes, the maintenance gate, Mayor edits, account
 *   deletion) now reads the session, not whatever the client typed.
 * - claimGuard: a request that names a player as its actor (`playerId`, the cast-vote `voterId`,
 *   the Google `linkPlayerId`) must carry that player's session, or a developer's. Reads by id
 *   (GET with a playerId) are not guarded here.
 * - ownerGuard: routes that write a thing by its id with no playerId (the grid NPC routes) check
 *   that the session's player owns it.
 *
 * SESSION_ENFORCE=on refuses a request that fails claimGuard (401 SESSION_REQUIRED /
 * SESSION_INVALID, 403 SESSION_MISMATCH); `log` (the default until the client that sends tokens
 * is live everywhere) only logs it. Developer rights need a valid session in either mode.
 *
 * Secret: SESSION_SECRET, else SECRET_KEY (both from the env). Only this server signs tokens; the
 * editor signs in with a developer's name and password like any client (tools/editor/server.js).
 */
const crypto = require('crypto');

const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const ENFORCE = process.env.SESSION_ENFORCE === 'on' ? 'on' : 'log';

let SECRET = process.env.SESSION_SECRET || process.env.SECRET_KEY || '';
if (!SECRET) {
  // Never sign with an empty key. A per-process key still works, but every restart signs the
  // players out (passwordless profiles resume silently; password profiles sign in again).
  SECRET = crypto.randomBytes(32).toString('hex');
  console.error('❌ session: neither SESSION_SECRET nor SECRET_KEY is set; sessions end at every restart');
}

const mac = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');

function signSession(playerId) {
  const body = Buffer.from(JSON.stringify({ sub: String(playerId), exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${body}.${mac(body)}`;
}

/** The player id a token was signed for, or null when it is missing, forged or expired. */
function verifySession(token) {
  if (!token || typeof token !== 'string' || token.length > 512) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.sub || !(Number(payload.exp) > Date.now())) return null;
    return String(payload.sub);
  } catch (_) {
    return null;
  }
}

function tokenOf(req) {
  const header = req.get('authorization');
  if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  const fromBody = req.body && req.body.sessionToken;
  return typeof fromBody === 'string' ? fromBody : null;
}

function sessionMiddleware(req, res, next) {
  const token = tokenOf(req);
  const playerId = token ? verifySession(token) : null;
  req.sessionPlayerId = playerId;
  req.sessionInvalid = !!token && !playerId;
  if (req.body && typeof req.body === 'object' && 'sessionToken' in req.body) delete req.body.sessionToken;
  if (playerId) req.headers['x-player-id'] = playerId;
  else delete req.headers['x-player-id'];
  next();
}

// The body fields that name the acting player.
const ACTOR_FIELDS = ['playerId', 'voterId', 'linkPlayerId'];
function claimedActors(req) {
  const body = req.body;
  if (!body || typeof body !== 'object') return [];
  const out = new Set();
  for (const field of ACTOR_FIELDS) {
    const v = body[field];
    if (v !== undefined && v !== null && v !== '') out.add(String(v));
  }
  return [...out];
}

async function claimGuard(req, res, next) {
  const claims = claimedActors(req);
  if (!claims.length) return next();
  const session = req.sessionPlayerId;
  let code = null;
  if (!session) code = req.sessionInvalid ? 'SESSION_INVALID' : 'SESSION_REQUIRED';
  else if (claims.some((id) => id !== session)) {
    const { isDeveloperPlayerId } = require('./serviceMode');
    if (!(await isDeveloperPlayerId(session))) code = 'SESSION_MISMATCH';
  }
  if (!code) return next();
  console.warn(`🔐 ${code} ${req.method} ${req.originalUrl} claims=${claims.join(',')} session=${session || '-'}${ENFORCE === 'on' ? '' : ' (logged, not enforced)'}`);
  if (ENFORCE !== 'on') return next();
  return res.status(code === 'SESSION_MISMATCH' ? 403 : 401).json({ success: false, error: 'Please sign in again.', code });
}

/**
 * Owner-only writes (BL-2 part 2, 2026-11-11): a write to something a player owns (a grid's NPCs)
 * must come from that owner's session, or a developer's. In the single-player game no two players
 * ever write the same grid. Answers true when the write may go ahead; otherwise it has answered
 * the request (401 SESSION_REQUIRED / SESSION_INVALID, 403 NOT_OWNER) and returns false. With
 * SESSION_ENFORCE off it logs and lets the write through, like claimGuard.
 */
async function ownerGuard(req, res, ownerId, what) {
  const session = req.sessionPlayerId;
  if (session && ownerId && String(ownerId) === session) return true;
  let code;
  if (!session) code = req.sessionInvalid ? 'SESSION_INVALID' : 'SESSION_REQUIRED';
  else {
    const { isDeveloperPlayerId } = require('./serviceMode');
    if (await isDeveloperPlayerId(session)) return true;
    code = 'NOT_OWNER';
  }
  console.warn(`🔐 ${code} ${req.method} ${req.originalUrl} ${what} owner=${ownerId || '-'} session=${session || '-'}${ENFORCE === 'on' ? '' : ' (logged, not enforced)'}`);
  if (ENFORCE !== 'on') return true;
  res.status(code === 'NOT_OWNER' ? 403 : 401).json({ success: false, error: code === 'NOT_OWNER' ? 'Not yours.' : 'Please sign in again.', code });
  return false;
}

/** Socket.io: the player the connection's token names (handshake `auth.token`), else null. */
function socketPlayerId(socket, fallbackToken) {
  return verifySession(socket?.handshake?.auth?.token) || verifySession(fallbackToken) || null;
}

module.exports = { signSession, verifySession, sessionMiddleware, claimGuard, ownerGuard, socketPlayerId, ENFORCE };
