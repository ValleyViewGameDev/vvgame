/**
 * The client half of the action-route contract (docs/refactor-plan.md Phase 5; server side in
 * game-server/utils/playerEconomy.js playerDelta).
 *
 * An action route answers with `player` (the fields that action may change: inventory, backpack,
 * activeQuests, completedQuests, trophies, skills, powers, xp, range) and `seq` (increasing on the server). Apply the
 * answer here and nowhere else: it replaces exactly those fields on currentPlayer and the
 * inventory / backpack state, and ignores an answer older than one already applied (two taps in
 * flight can answer out of order). Never refetch the player after an action.
 *
 *   const answer = await postAction('/api/action/harvest', { playerId, gridId, x, y });
 *   if (answer.ok) applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
 */
import axios from 'axios';
import API_BASE from '../config';

const DELTA_FIELDS = ['inventory', 'backpack', 'activeQuests', 'completedQuests', 'trophies', 'skills', 'powers', 'xp', 'range'];
let lastAppliedSeq = 0;

/** Apply an action answer's player delta. Returns false when there was nothing (new) to apply. */
export function applyPlayerDelta(answer, { setCurrentPlayer, setInventory, setBackpack } = {}) {
  const delta = answer?.player;
  if (!delta || typeof delta !== 'object') return false;
  const seq = Number(answer.seq) || 0;
  if (seq && seq <= lastAppliedSeq) return false;
  if (seq) lastAppliedSeq = seq;

  const patch = {};
  for (const key of DELTA_FIELDS) if (delta[key] !== undefined) patch[key] = delta[key];
  if (typeof setCurrentPlayer === 'function') setCurrentPlayer((prev) => (prev ? { ...prev, ...patch } : prev));
  if (patch.inventory && typeof setInventory === 'function') setInventory(patch.inventory);
  if (patch.backpack && typeof setBackpack === 'function') setBackpack(patch.backpack);
  return true;
}

/**
 * POST an action route. Never throws: { ok, status, reason, data } where a refusal (4xx with a
 * reason) is ok:false with data still carrying the player delta to resync with, and a network
 * failure is status 0.
 */
export async function postAction(path, body) {
  try {
    const res = await axios.post(`${API_BASE}${path}`, body);
    return { ok: !!res.data?.success, status: res.status, reason: res.data?.reason || null, data: res.data };
  } catch (err) {
    const data = err.response?.data || null;
    return { ok: false, status: err.response?.status || 0, reason: data?.reason || (err.response ? 'error' : 'network'), data };
  }
}

/**
 * The instant half: add qty of type where the server will put it (currencies and home: the
 * warehouse; away: the backpack), so the counts move on the tap. The answer's delta replaces it.
 */
export function predictGain({ type, qty, isCurrencyItem, atHome, setCurrentPlayer, setInventory, setBackpack }) {
  if (!(qty > 0)) return;
  const field = isCurrencyItem || atHome ? 'inventory' : 'backpack';
  const add = (list) => {
    const next = Array.isArray(list) ? [...list] : [];
    const i = next.findIndex((item) => item?.type === type);
    if (i >= 0) next[i] = { ...next[i], quantity: (next[i].quantity || 0) + qty };
    else next.push({ type, quantity: qty });
    return next;
  };
  let nextList = null;
  setCurrentPlayer?.((prev) => {
    if (!prev) return prev;
    nextList = add(prev[field]);
    return { ...prev, [field]: nextList };
  });
  const setter = field === 'inventory' ? setInventory : setBackpack;
  setter?.((prev) => (nextList || add(prev)));
}
