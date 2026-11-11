import axios from 'axios';
import API_BASE from '../config';

/**
 * The player's session token (BL-2, game-server/utils/session.js). The server signs it at
 * sign-in, at a new profile and at /api/session/resume; every request carries it as
 * `Authorization: Bearer <token>`, and the server believes the player it names, not a playerId
 * in the request. Imported once at the top of App.js, so the header is on from the first request.
 *
 * A client that holds a stored player but no token (signed in before sessions existed, or an
 * expired token) asks /session/resume before its first request; a profile with a password is
 * refused there and is sent to the sign-in form.
 */
const KEY = 'sessionToken';
const RESUME_URL = `${API_BASE}/api/session/resume`;
// Requests that need no session (they are how one is obtained)
const OPEN_URLS = ['/api/session/resume', '/api/login', '/api/login-google', '/api/register-new-player', '/api/check-username', '/api/status'];
const SESSION_CODES = new Set(['SESSION_REQUIRED', 'SESSION_INVALID']);
// Fired when a new token is kept, so the socket re-joins its player room with it (socketManager.js)
export const SESSION_EVENT = 'vv:session';

export function getSessionToken() {
  try { return localStorage.getItem(KEY); } catch (_) { return null; }
}

function applyHeader(token) {
  if (token) axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete axios.defaults.headers.common.Authorization;
}

export function setSessionToken(token) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch (_) { /* storage off: the header still holds it for this page */ }
  applyHeader(token);
}

/** Keep the token a sign-in / signup answer carries ({ sessionToken }). */
export function rememberSession(data) {
  if (!data?.sessionToken) return;
  setSessionToken(data.sessionToken);
  try { window.dispatchEvent(new Event(SESSION_EVENT)); } catch (_) { /* no window */ }
}

export function clearSession() {
  setSessionToken(null);
}

function storedPlayerId() {
  try {
    const p = JSON.parse(localStorage.getItem('player') || 'null');
    return p?.playerId || p?._id || null;
  } catch (_) { return null; }
}

// Back to the sign-in form: the stored profile has a password and no valid session
function signOutToSignIn() {
  try {
    localStorage.removeItem('player');
    localStorage.removeItem('gridId');
    localStorage.setItem('vv_signin_requested', '1');
  } catch (_) { /* storage off */ }
  clearSession();
  window.location.reload();
}

let resuming = null;
/** Resolves once this client holds a session (or has none to get). One request at a time. */
export function ensureSession() {
  if (getSessionToken()) return Promise.resolve(true);
  const playerId = storedPlayerId();
  if (!playerId) return Promise.resolve(false);
  if (!resuming) {
    resuming = axios.post(RESUME_URL, { resumePlayerId: playerId })
      .then(({ data }) => { rememberSession(data); return !!data?.sessionToken; })
      .catch((err) => {
        const code = err?.response?.data?.code;
        if (code === 'SIGN_IN_REQUIRED' || code === 'NOT_FOUND') signOutToSignIn();
        return false;
      })
      .finally(() => { resuming = null; });
  }
  return resuming;
}

const isOpen = (url) => OPEN_URLS.some((u) => String(url || '').includes(u));

applyHeader(getSessionToken());

// Before any request that needs a session: get one first when the stored player has none
axios.interceptors.request.use(async (config) => {
  if (isOpen(config.url) || getSessionToken() || !storedPlayerId()) return config;
  await ensureSession();
  const token = getSessionToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A token the server refuses (expired, or signed with an old key): drop it, resume once, retry
axios.interceptors.response.use(undefined, async (error) => {
  const { config, response } = error || {};
  if (!config || config.__sessionRetried || isOpen(config.url) || !SESSION_CODES.has(response?.data?.code)) throw error;
  clearSession();
  if (!(await ensureSession())) throw error;
  config.__sessionRetried = true;
  config.headers.Authorization = `Bearer ${getSessionToken()}`;
  return axios(config);
});
