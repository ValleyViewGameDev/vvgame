import API_BASE from '../../config';
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import StoryModal from '../../UI/Modals/StoryModal';
import { hopeArtifacts } from '../../Utils/hopeArtifacts';

/**
 * HopeFound - the Quest for Hope "found" moment (docs/early-game.md §3, backlog OB-5).
 *
 * Watches the player's holdings; when a Quest for Hope artifact turns up that is not yet in
 * `currentPlayer.hopeFound`, the artifact's story modal plays at once (optimistic, house rule)
 * and `POST /api/hope/found` records it in parallel and mails the Oracle's letter with the hint
 * to the next artifact (messages.json rows with `hopeArtifact`). An account from before this
 * existed has no `hopeFound`: the first call seeds it silently, so old finds never replay.
 */
const FOUND_STRING = {
  "King's Crown": 200830,
  Trident: 200831,
  'Brass Bell': 200832,
  'Phoenix Feather': 200833,
  "Vampire's Blood": 200834,
  'Brief Candle': 200835,
  "Prospero's Orb": 200836,
};

const held = (list, type) => (Array.isArray(list) ? list : []).some((i) => i?.type === type && (i.quantity || i.qty || 0) > 0);

export default function HopeFound({ currentPlayer, setCurrentPlayer, inventory, backpack, masterTraders, masterResources }) {
  const [queue, setQueue] = useState([]);   // artifacts whose moment is waiting to play
  const shown = useRef(new Set());          // played (or queued) this session
  const asking = useRef(false);

  useEffect(() => {
    if (!currentPlayer?.playerId || !masterTraders?.length) return;
    const artifacts = [...hopeArtifacts(masterTraders)];
    const have = artifacts.filter((t) => held(inventory, t) || held(backpack, t));
    const known = currentPlayer.hopeFound;
    const legacy = !Array.isArray(known);
    const unseen = legacy ? have : have.filter((t) => !known.includes(t) && !shown.current.has(t));
    if (unseen.length === 0 || asking.current) return;

    if (!legacy) {
      unseen.forEach((t) => shown.current.add(t));
      setQueue((q) => [...q, ...unseen]);
    }
    asking.current = true;
    axios.post(`${API_BASE}/api/hope/found`, { playerId: currentPlayer.playerId })
      .then(({ data }) => {
        if (Array.isArray(data?.hopeFound)) setCurrentPlayer((prev) => ({ ...prev, hopeFound: data.hopeFound }));
      })
      .catch((err) => console.error('Error recording a Quest for Hope find:', err))
      .finally(() => { asking.current = false; });
  }, [inventory, backpack, masterTraders, currentPlayer?.playerId, currentPlayer?.hopeFound, setCurrentPlayer]);

  const current = queue[0];
  if (!current) return null;
  const symbol = masterResources?.find((r) => r.type === current)?.symbol || '✨';
  return (
    <StoryModal
      isOpen
      onClose={() => setQueue((q) => q.slice(1))}
      symbol={symbol}
      dialogKey={FOUND_STRING[current]}
      username={currentPlayer?.username}
    />
  );
}
