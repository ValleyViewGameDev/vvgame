import API_BASE from '../../config';
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import StoryModal from '../../UI/Modals/StoryModal';
import { hopeArtifacts } from '../../Utils/hopeArtifacts';
import { playHopeLanding } from './HopeQuest';

/**
 * HopeFound - the Quest for Hope "found" moment (docs/early-game.md §3, backlog OB-5).
 *
 * Watches the player's holdings; when a Quest for Hope artifact turns up that is not yet in
 * `currentPlayer.hopeFound`, the moment plays at once (optimistic, house rule): the Quest panel
 * opens and the artifact slams into its slot (HopeQuest.js playHopeLanding, owner 2026-11-02),
 * then its story modal follows; the panel stays open for the player to close. In parallel
 * `POST /api/hope/found` records it and mails the Oracle's letter with the hint to the next
 * artifact (messages.json rows with `hopeArtifact`). An account from before this existed has no
 * `hopeFound`: the first call seeds it silently, so old finds never replay.
 */
const PANEL_SETTLE_MS = 420; // the Quest panel's slide-in (--d-anim-in 260 ms) is over before the slot is measured
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

export default function HopeFound({ currentPlayer, setCurrentPlayer, inventory, backpack, masterTraders, masterResources, openPanel }) {
  const [queue, setQueue] = useState([]);   // artifacts whose moment is waiting to play
  const [landed, setLanded] = useState(null); // the head of the queue once its slam is over (its story may show)
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
  const openPanelRef = useRef(openPanel);   // App recreates openPanel every render; the slam must not restart
  openPanelRef.current = openPanel;

  // the slam: open the Quest panel (left open afterwards), let it slide in, land the artifact
  useEffect(() => {
    if (!current || landed === current) return undefined;
    let cancelled = false;
    openPanelRef.current?.('QuestPanel');
    const t = setTimeout(() => {
      playHopeLanding(current).then(() => { if (!cancelled) setLanded(current); });
    }, PANEL_SETTLE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [current, landed]);

  if (!current || landed !== current) return null;
  const art = masterResources?.find((r) => r.type === current);
  const symbol = art?.symbol || '✨';
  return (
    <StoryModal
      isOpen
      onClose={() => setQueue((q) => q.slice(1))}
      symbol={symbol}
      npcFilename={art?.iconFile || art?.filename}
      dialogKey={FOUND_STRING[current]}
      username={currentPlayer?.username}
    />
  );
}
