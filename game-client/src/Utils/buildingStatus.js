/**
 * buildingStatus: the "?" and ✅ over buildings that have something for the player (owner 2026-11-10).
 *
 * - Skills: a building shows "?" while it teaches a skill the player can take now: not owned, its
 *   level reached and its required skill owned (what SkillsPanel lists as buyable), even when the
 *   player cannot pay for it yet; the GREEN ? (question-green.svg) once they can pay for one.
 * - Bank, Caravan (Train) and Harvest Festival (Carnival): once the player's level unlocks the
 *   building, "?" while it has an open offer, ✅ when the player already holds the goods for at
 *   least one of them. The offers live on the server (frontier bank, the player's Caravan, the
 *   settlement's fair); useBuildingOffers fetches them when such a building is on the grid and
 *   again whenever that building's phase turns over.
 */
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import API_BASE from '../config';
import { getPlayerQuantity, canAfford } from './InventoryManagement';

export const OFFER_BUILDINGS = { Bank: 'bank', Train: 'caravan', Carnival: 'carnival' };

/** The skills each building teaches: { [source]: rows }. Skills only: the Adventure Camp's Tent and
 *  Boat ('special') are goods bought again and again, never "acquired", so they raise no "?". */
export function skillsBySource(masterResources) {
  const bySource = {};
  for (const r of masterResources || []) {
    if (!r.source || r.category !== 'skill') continue;
    (bySource[r.source] = bySource[r.source] || []).push(r);
  }
  return bySource;
}

/**
 * The building's skill sign: 'question-ready' (the green ?) when the player can take one of its
 * skills now AND holds the ingredients for it, 'question' when one is open to them (level and
 * required skill met) but not yet affordable, else null (owner 2026-11-10).
 */
export function skillOverlay(buildingType, bySource, currentPlayer, level, inventory, backpack) {
  const rows = bySource[buildingType];
  if (!rows || !currentPlayer) return null;
  const owned = new Set((currentPlayer.skills || []).filter((s) => (s.quantity ?? 1) > 0).map((s) => s.type));
  const open = rows.filter((r) => !owned.has(r.type)
    && r.requires !== 'devonly'
    && (!r.requires || owned.has(r.requires))
    && (!r.level || level >= r.level));
  if (!open.length) return null;
  return open.some((r) => canAfford(r, inventory, backpack, 1)) ? 'question-ready' : 'question';
}

/** 'ready' when one open offer can be paid now, 'question' when there are open offers, else null. */
export function offersOverlay(offers, inventory, backpack) {
  if (!offers || !offers.length) return null;
  const canPay = offers.some((o) => getPlayerQuantity(o.item, inventory, backpack) >= (Number(o.qty) || 0));
  return canPay ? 'ready' : 'question';
}

/**
 * The open offers of the offer buildings on this grid, normalised to [{ item, qty }]:
 * { bank, caravan, carnival } (null = none, or the building is not here).
 */
export function useBuildingOffers({ resources, currentPlayer, timers }) {
  const here = useMemo(() => {
    const set = new Set();
    for (const r of resources || []) if (OFFER_BUILDINGS[r.type]) set.add(OFFER_BUILDINGS[r.type]);
    return set;
  }, [resources]);

  const playerId = currentPlayer?.playerId;
  const frontierId = currentPlayer?.frontierId;
  const settlementId = currentPlayer?.settlementId;
  const gtype = currentPlayer?.location?.gtype || '';
  const inValley = gtype.startsWith('valley');
  const inHome = String(currentPlayer?.location?.s) === String(settlementId);
  const bankPhase = timers?.bank?.phase;
  const bankEnd = timers?.bank?.endTime;
  const trainPhase = timers?.train?.phase;
  const trainEnd = timers?.train?.endTime;
  const fairPhase = timers?.carnival?.phase;
  const fairEnd = timers?.carnival?.endTime;

  const [bankOffers, setBankOffers] = useState(null);
  const [syncedTrain, setSyncedTrain] = useState(null);
  const [fairOffers, setFairOffers] = useState(null);

  // Bank: the frontier's offers (a valley Counting House has its own list), home settlement or valley only
  useEffect(() => {
    let live = true;
    setBankOffers(null);
    if (!here.has('bank') || !frontierId || bankPhase !== 'active' || !(inHome || inValley)) return undefined;
    axios.get(`${API_BASE}/api/get-frontier/${frontierId}`).then(({ data }) => {
      if (!live) return;
      const valley = data?.bank?.valleyOffers || [];
      setBankOffers(inValley && valley.length ? valley : (data?.bank?.offers || []));
    }).catch(() => {});
    return () => { live = false; };
  }, [here, frontierId, bankPhase, bankEnd, inHome, inValley]);

  // Caravan: bring the player's Caravan up to the settlement's, as the panel does when it opens
  useEffect(() => {
    let live = true;
    if (!here.has('caravan') || !playerId || !settlementId || trainPhase !== 'loading') return undefined;
    axios.post(`${API_BASE}/api/caravan/sync`, { playerId }).then(({ data }) => {
      if (live && data?.success) setSyncedTrain(data.train || null);
    }).catch(() => {});
    return () => { live = false; };
  }, [here, playerId, settlementId, trainPhase, trainEnd]);

  // Harvest Festival: the settlement's fair offers
  useEffect(() => {
    let live = true;
    setFairOffers(null);
    if (!here.has('carnival') || !settlementId || fairPhase !== 'here') return undefined;
    axios.get(`${API_BASE}/api/get-settlement/${settlementId}`).then(({ data }) => {
      if (live) setFairOffers(data?.carnival?.currentoffers || []);
    }).catch(() => {});
    return () => { live = false; };
  }, [here, settlementId, fairPhase, fairEnd]);

  return useMemo(() => {
    const bank = bankPhase === 'active' && bankOffers
      ? bankOffers.map((o) => ({ item: o.itemBought, qty: o.qtyBought }))
      : null;
    // the player's own Caravan as the panel last left it wins over our sync when it is as new
    const ownTrain = currentPlayer?.train;
    const train = ownTrain && (!syncedTrain || (ownTrain.currentTrainNumber || 0) >= (syncedTrain.currentTrainNumber || 0)) ? ownTrain : syncedTrain;
    const loadingOver = trainEnd && Date.now() >= trainEnd;
    const caravan = trainPhase === 'loading' && !loadingOver && train
      ? (train.currentTrainOffers || []).filter((o) => !o.completed).map((o) => ({ item: o.item, qty: o.quantity }))
      : null;
    const carnival = fairPhase === 'here' && fairOffers
      ? fairOffers.filter((o) => !o.filled && (!o.claimedBy || String(o.claimedBy) === String(playerId))).map((o) => ({ item: o.itemBought, qty: o.qtyBought }))
      : null;
    return { bank, caravan, carnival };
  }, [bankPhase, bankOffers, currentPlayer?.train, syncedTrain, trainPhase, trainEnd, fairPhase, fairOffers, playerId]);
}
