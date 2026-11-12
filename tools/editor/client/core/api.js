/**
 * API client. `local.*` is this tool's own server (files under game-server/); `game.*` is the
 * same-origin proxy to the game server (/api/game/* -> --game-server). Both throw an Error
 * with `.status` and `.body` on a non-2xx so callers can show the server's message.
 *
 * Game calls carry the developer's session (Authorization: Bearer), from signing in to the editor
 * with a developer's username and password (server.js editorLogin). The token is kept per game
 * server in localStorage. A game call refused for want of a session (401, or 403 from a
 * developer-only route) asks for sign-in and is sent again once.
 */
import { el } from './dom.js';
import { modal } from './ui.js';

async function request(method, url, body, headers = {}) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const err = new Error((data && data.error) || (data && data.message) || `${method} ${url} failed (${res.status})`);
    err.status = res.status; err.body = data;
    throw err;
  }
  return data;
}

// ----------------------------------------------------------------------------- session
let gameServer = null;
const sessionKey = async () => {
  if (!gameServer) gameServer = (await request('GET', '/api/local/info')).gameServer;
  return `vvEditorSession:${gameServer}`;
};
const readSession = async () => {
  try { return JSON.parse(localStorage.getItem(await sessionKey()) || 'null'); } catch (e) { return null; }
};
const listeners = new Set();
/** Called with { username } or null whenever the editor signs in or out. */
export function onSessionChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export async function currentSession() { const s = await readSession(); return s ? { username: s.username } : null; }
export async function signOut() {
  try { localStorage.removeItem(await sessionKey()); } catch (e) { /* private mode */ }
  listeners.forEach((fn) => fn(null));
}

let signingIn = null; // one sign-in dialog at a time, shared by every refused call
/** Opens the sign-in dialog. Resolves true once signed in, false when cancelled. */
export function signIn(reason) {
  if (signingIn) return signingIn;
  signingIn = new Promise((resolve) => {
    const user = el('input', { placeholder: 'Developer username', autocomplete: 'username', style: { width: '100%', marginBottom: '8px' } });
    const pass = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', style: { width: '100%' } });
    const error = el('div', { class: 'note', style: { color: '#a33', minHeight: '1.4em', marginTop: '8px' } }, '');
    let done = false;
    const finish = (ok) => { if (done) return; done = true; signingIn = null; resolve(ok); };
    const submit = async (close) => {
      error.textContent = 'Signing in…';
      try {
        const out = await request('POST', '/api/local/login', { username: user.value, password: pass.value });
        localStorage.setItem(await sessionKey(), JSON.stringify(out));
        listeners.forEach((fn) => fn({ username: out.username }));
        finish(true);
        close();
      } catch (err) { error.textContent = err.message; }
    };
    const m = modal({
      title: 'Sign in to the editor',
      width: '360px',
      body: el('div', {}, [
        el('div', { class: 'note', style: { marginBottom: '10px' } }, reason || `Sign in with a developer account to change data on ${gameServer || 'the game server'}.`),
        user, pass, error,
      ]),
      buttons: [
        { label: 'Cancel', onClick: (close) => close() },
        { label: 'Sign in', primary: true, onClick: (close) => submit(close) },
      ],
      onClose: () => finish(false),
    });
    for (const input of [user, pass]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(m.close); });
    setTimeout(() => user.focus(), 0);
  });
  return signingIn;
}

const needsSignIn = (err) => err.status === 401
  || (err.status === 403 && (err.body?.error === 'developer only' || ['SESSION_MISMATCH', 'NOT_OWNER', 'NOT_DEVELOPER'].includes(err.body?.code)));

async function gameRequest(method, path, body) {
  const send = async () => {
    const s = await readSession();
    const data = await request(method, `/api/game${path}`, body, s?.token ? { Authorization: `Bearer ${s.token}` } : {});
    // /update-profile answers 200 but drops developer-only fields for a non-developer: not a save
    if (Array.isArray(data?.ignored) && data.ignored.length) {
      const err = new Error(`Not saved: the game server did not accept a developer session for ${data.ignored.join(', ')}.`);
      err.status = 403; err.body = { ...data, code: 'NOT_DEVELOPER' };
      throw err;
    }
    return data;
  };
  try { return await send(); }
  catch (err) {
    if (!needsSignIn(err)) throw err;
    const had = await readSession();
    if (!(await signIn(had ? 'Your editor session was refused. Sign in again with a developer account.' : undefined))) throw err;
    return send();
  }
}

export const local = {
  info: () => request('GET', '/api/local/info'),
  resources: () => request('GET', '/api/local/resources'),
  randomValley: () => request('GET', '/api/local/random-valley'),
  layouts: () => request('GET', '/api/local/layouts'),
  dungeonEntrances: () => request('GET', '/api/local/dungeon-entrances'),
  dungeonWiring: () => request('GET', '/api/local/dungeon-wiring'),
  saveDungeonWiring: (gridCoord, template) => request('PUT', '/api/local/dungeon-wiring', { gridCoord, template }),
  layout: (dir, name) => request('GET', `/api/local/layouts/${dir}/${encodeURIComponent(name)}`),
  saveLayout: (dir, name, layout) => request('PUT', `/api/local/layouts/${dir}/${encodeURIComponent(name)}`, layout),
  deleteLayout: (dir, name) => request('DELETE', `/api/local/layouts/${dir}/${encodeURIComponent(name)}`),
  tuningList: () => request('GET', '/api/local/tuning'),
  tuning: (id) => request('GET', `/api/local/tuning/${id}`),
  saveTuning: (id, data) => request('PUT', `/api/local/tuning/${id}`, { data }),
  patchPhase: (event, phase, minutes) => request('PATCH', '/api/local/tuning/globalTuning/phase', { event, phase, minutes }),
  settlementLayouts: () => request('GET', '/api/local/settlement-layouts'),
  frontierLayouts: () => request('GET', '/api/local/frontier-layouts'),
  avatarFiles: () => request('GET', '/api/local/avatar/files'),
  questForHope: () => request('GET', '/api/local/quest-for-hope'),
};

export const game = {
  get: (path) => gameRequest('GET', path),
  post: (path, body) => gameRequest('POST', path, body),
  put: (path, body) => gameRequest('PUT', path, body),
  delete: (path) => gameRequest('DELETE', path),
};
