/**
 * actionRetry - a durable retry line for action requests that got NO answer (BL-3).
 *
 * On a slow connection (a phone hotspot) a request can time out or drop. The tap already showed
 * its result (optimistic UI), so the client keeps the request and sends it again until the
 * server answers, then applies that answer's player delta (Utils/playerDelta.js). The line is
 * kept in localStorage per player, so a reload or a closed tab still delivers it.
 *
 * Only for requests that are SAFE TO REPEAT: the server must refuse a second copy of something
 * it already did. /action/harvest is: a tile already collected answers 409 'gone' with the true
 * counts, so a retry can never grant twice. Do not queue a route without that property.
 *
 * Any answer (success, 'gone', or another refusal) ends the entry: the delta brings the counts
 * to the server's. Entries older than MAX_AGE_MS are dropped (the tile may have regrown).
 */
import { postAction, applyPlayerDelta } from './playerDelta';

const STORE_PREFIX = 'vv:pendingActions:';
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 200;
const BACKOFF_MS = [2000, 4000, 8000, 15000, 30000, 60000];
export const ACTION_TIMEOUT_MS = 15000;

/** Statuses that mean "no real answer": the network, or Render's gateway while the server is busy or redeploying. */
export function isNoAnswer(status) {
  return status === 0 || status === 502 || status === 503 || status === 504;
}

let setters = null;     // { setCurrentPlayer, setInventory, setBackpack }, from App
let playerId = null;
let timer = null;
let attempt = 0;
let flushing = false;

const storeKey = () => (playerId ? STORE_PREFIX + playerId : null);

function load() {
  const key = storeKey();
  if (!key) return [];
  try { const list = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(list) ? list : []; } catch (_) { return []; }
}

function save(list) {
  const key = storeKey();
  if (!key) return;
  try {
    if (list.length) localStorage.setItem(key, JSON.stringify(list.slice(-MAX_ENTRIES)));
    else localStorage.removeItem(key);
  } catch (_) { /* storage off: the line still lives for this page */ }
}

// The in-page copy (storage can be off); load() merges with it on registration
let memory = [];
const read = () => (memory.length ? memory : (memory = load()));
const write = (list) => { memory = list; save(list); };

function schedule() {
  clearTimeout(timer);
  if (!read().length) { attempt = 0; return; }
  const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  timer = setTimeout(flush, wait);
}

/** Send every queued request once, oldest first; keep the ones that still get no answer. */
export async function flush() {
  if (flushing || !setters) return;
  flushing = true;
  try {
    const now = Date.now();
    const seen = new Set(read().map((e) => e.id));
    const pending = read().filter((e) => now - e.at < MAX_AGE_MS); // older ones are dropped
    const keep = [];
    let stillOffline = false;
    for (const entry of pending) {
      if (stillOffline) { keep.push(entry); continue; }
      const answer = await postAction(entry.path, entry.body, { timeout: ACTION_TIMEOUT_MS });
      if (isNoAnswer(answer.status)) { keep.push(entry); stillOffline = true; continue; }
      applyPlayerDelta(answer.data, setters); // ok, 'gone' or a refusal: the server's counts either way
      if (!answer.ok && answer.reason !== 'gone') console.warn('↩️ Retried action refused:', entry.path, answer.reason);
    }
    // Requests queued while this pass ran are in memory after the ones it read
    const added = read().filter((e) => !seen.has(e.id));
    write([...keep, ...added]);
    attempt = keep.length ? attempt + 1 : 0;
  } finally {
    flushing = false;
    schedule();
  }
}

/** Queue a request that got no answer; it is sent again until the server answers. */
export function queueRetry(path, body) {
  if (!playerId) return;
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, path, body, at: Date.now() };
  write([...read(), entry]);
  if (!timer) schedule();
}

/** How many requests are waiting (for debugging and a possible "syncing" hint). */
export function pendingCount() { return read().length; }

/**
 * App calls this once the player is known: the setters an answer is applied with. Anything left
 * from an earlier page (a reload, a closed tab) is sent at once.
 */
export function registerActionRetry(id, deltaSetters) {
  if (!id) return;
  if (String(id) !== playerId) { playerId = String(id); memory = []; attempt = 0; }
  setters = deltaSetters;
  if (read().length) flush();
}

if (typeof window !== 'undefined') {
  // Back online: try at once instead of waiting out the backoff
  window.addEventListener('online', () => { attempt = 0; flush(); });
}
