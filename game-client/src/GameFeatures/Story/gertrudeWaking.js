import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import API_BASE from '../../config';
import '../../UI/Modals/Modal.css';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import CloseButton from '../../UI/Buttons/CloseButton';
import StoryModal from '../../UI/Modals/StoryModal';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import ConversationManager from '../Relationships/ConversationManager';
import { startHeadlineEffect, stopHeadlineEffect } from '../../VFX/NPCVFX';
import { createCollectEffect } from '../../VFX/VFX';
import soundManager from '../../Sound/SoundManager';

/**
 * The Queen of stone (docs/story.md §0; server: utils/storyState.js, POST /api/story/wake-gertrude).
 *
 * Gertrude stands as a statue ("Gertrude's Statue", action `statue`) in her castle in the Town
 * until the end of the early game:
 *   1. Helena's "Rosemary, for Remembrance" (L14), then Feste's "If Music Be the Food of Love"
 *      (L15, prereq the first).
 *   2. Feste's errand: once his quest is done and the Queen still sleeps, Feste leaves his loop and
 *      walks to the statue (stopping beside it) and stays there. A walk that is blocked, or takes
 *      longer than ERRAND_MS, ends in a teleport to a free tile beside her. The errand is derived
 *      from the player's state on every brain tick (NPCCitizenBehavior), so a reload, a reset or
 *      a fresh town copy just starts it again.
 *   3. Tapping the statue opens the riddle modal. With Feste within FESTE_NEAR tiles, "Music, awake
 *      her!" closes it, Feste sings on the board (bubbles, the song in the status bar), then the
 *      statue becomes Gertrude and her waking speech opens. Optimistic: the server call runs
 *      alongside, and only a refusal puts the statue back.
 */
export const STATUE = "Gertrude's Statue";
export const QUEEN = 'Gertrude';
const FESTE = 'Feste';
export const FESTE_QUEST = 'If Music Be the Food of Love';
const FESTE_NEAR = 3;      // tiles (Chebyshev) from the statue for the song to work
const ERRAND_MS = 45000;   // a walk to the statue longer than this ends in a teleport
const SONG_MS = 4400;      // how long Feste sings before she wakes

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const isGertrudeAwake = (player) => !!player?.storyFlags?.gertrudeAwake;
const festeQuestDone = (player) => (player?.completedQuests || []).some((q) => q?.questId === FESTE_QUEST);
const findStatue = (resources) => (resources || []).find((r) => r.type === STATUE);
const findFeste = (gridId) => Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {}).find((n) => n?.type === FESTE);
const hex24 = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

// ---------------------------------------------------------------- Feste's errand (brain hook)

const errands = new Map(); // npcId -> { gridId, since }

/** A free tile next to the statue that this NPC may stand on, nearest the NPC first. */
function freeTileBeside(npc, statue, tiles, resources, npcs) {
  const options = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const x = statue.x + dx, y = statue.y + dy;
    if (!npc.terrainOpen(x, y, tiles, resources)) continue;
    if (npcs.some((n) => n && n.id !== npc.id && Math.floor(n.position?.x) === x && Math.floor(n.position?.y) === y)) continue;
    options.push({ x, y, d: Math.hypot(x - npc.position.x, y - npc.position.y) });
  }
  return options.sort((a, b) => a.d - b.d)[0] || null;
}

/**
 * Called by every Citizen's brain tick before anything else. Returns true when this NPC is on a
 * story errand (and has been moved for this tick), so the brain skips its own loop.
 */
export function runStoryErrand(npc, gridId, tiles, resources, npcs, player, TILE_SIZE = 45) {
  if (npc.type !== FESTE) return false;
  const statue = findStatue(resources);
  if (!statue || !festeQuestDone(player) || isGertrudeAwake(player)) {
    if (npc.storyErrand) { npc.storyErrand = false; errands.delete(npc.id); stopHeadlineEffect(npc.id); }
    return false;
  }
  const now = Date.now();
  let errand = errands.get(npc.id);
  if (!errand || errand.gridId !== gridId) {
    errand = { gridId, since: now };
    errands.set(npc.id, errand);
    npc.citizenState = null; // out of the loop while on the errand (it restarts when he is free)
  }
  npc.storyErrand = true;
  startHeadlineEffect(npc.id, 'emoji', npc.position, { emoji: '🎶' });

  if (cheb(npc.position, statue) <= 1) { npc.path = null; return true; } // there: wait beside her

  const step = npc.followPath(statue.x, statue.y, tiles, resources, npcs, { stopShort: true });
  if (step === 'blocked' || now - errand.since > ERRAND_MS) {
    // no way through (walls, a crowd, a long detour): appear beside her
    const spot = freeTileBeside(npc, statue, tiles, resources, npcs);
    if (spot) {
      npc.position = { x: spot.x, y: spot.y };
      npc.path = null;
      NPCsInGridManager.updateNPC(gridId, npc.id, { position: npc.position }).catch(() => {});
      createCollectEffect(spot.x, spot.y, TILE_SIZE);
    }
    errand.since = now;
  }
  return true;
}

// ---------------------------------------------------------------- the statue modal

let showRequest = null; // set by the mounted host

/** Open the statue's modal (App's resource click). opts: { resource, currentPlayer, setCurrentPlayer, gridId, setResources, updateStatus, TILE_SIZE, masterResources } */
export function openStatue(opts) {
  if (showRequest) showRequest(opts);
}

function wake(req, strings, setStory) {
  const { resource, currentPlayer, setCurrentPlayer, gridId, setResources, updateStatus, TILE_SIZE, masterResources } = req;
  const feste = findFeste(gridId);
  if (feste) {
    ConversationManager.addSpeech(feste.id, '🎶', 'song');
    startHeadlineEffect(feste.id, 'emoji', feste.position, { emoji: '🎵' });
  }
  soundManager.playSFX('heal');
  updateStatus?.(strings[2157] || '🎶 O mistress mine, where are you roaming?');
  setTimeout(() => updateStatus?.(strings[2158] || '🎶 Journeys end in lovers meeting.'), SONG_MS / 2);

  setTimeout(async () => {
    if (feste) { ConversationManager.removeSpeech(feste.id); stopHeadlineEffect(feste.id); }
    const { x, y } = resource;
    const npcId = hex24();
    const before = GlobalGridStateTilesAndResources.getResources() || [];
    const after = before.filter((r) => !(r.x === x && r.y === y && r.type === STATUE));
    GlobalGridStateTilesAndResources.setResources(after);
    setResources?.(after);
    createCollectEffect(x, y, TILE_SIZE || 45);
    const def = (masterResources || []).find((r) => r.type === QUEEN && r.category === 'npc') || {};
    await NPCsInGridManager.addLocalNPC(gridId, {
      id: npcId, type: QUEEN, position: { x, y }, state: 'idle', hp: def.maxhp || 10, maxhp: def.maxhp || 10, homeX: x, homeY: y,
    });
    soundManager.playSFX('levelup');
    const awakeAt = new Date().toISOString();
    setCurrentPlayer?.((prev) => ({ ...prev, storyFlags: { ...(prev?.storyFlags || {}), gertrudeAwake: awakeAt } }));
    setStory({ username: currentPlayer?.username, filename: def.filename });

    try {
      const { data } = await axios.post(`${API_BASE}/api/story/wake-gertrude`, { playerId: currentPlayer.playerId, gridId, npcId });
      if (data?.npc && data.npc.id !== npcId) { // she was already awake there under another id
        NPCsInGridManager.forgetNPC(gridId, npcId);
        await NPCsInGridManager.addLocalNPC(gridId, data.npc);
      }
      if (data?.storyFlags) setCurrentPlayer?.((prev) => ({ ...prev, storyFlags: data.storyFlags }));
    } catch (err) {
      if (!err.response) return; // the network: keep the waking; the next enter-grid agrees with the server
      NPCsInGridManager.forgetNPC(gridId, npcId);
      GlobalGridStateTilesAndResources.setResources(before);
      setResources?.(before);
      setCurrentPlayer?.((prev) => {
        const flags = { ...(prev?.storyFlags || {}) };
        delete flags.gertrudeAwake;
        return { ...prev, storyFlags: flags };
      });
      setStory(null);
      updateStatus?.(strings[2160] || 'The Queen did not wake. Try again.');
    }
  }, SONG_MS);
}

/** Mounted once at the app root (index.js), like GemSpendConfirmHost. */
export const StatueHost = () => {
  const strings = useStrings();
  const [request, setRequest] = useState(null);
  const [story, setStory] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    showRequest = (next) => setRequest(next);
    return () => { showRequest = null; };
  }, []);
  // while open, look again every second: Feste may be walking up
  useEffect(() => {
    if (!request) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [request]);

  const storyModal = story && (
    <StoryModal
      isOpen
      onClose={() => setStory(null)}
      npcName={QUEEN}
      dialogKey={2159}
      username={story.username}
      npcFilename={story.filename}
    />
  );
  if (!request) return storyModal || null;

  const { resource, currentPlayer, gridId } = request;
  const feste = findFeste(gridId);
  const festeNear = !!feste && cheb(feste.position, resource) <= FESTE_NEAR;
  const questDone = festeQuestDone(currentPlayer);
  const close = () => setRequest(null);
  const line = !questDone ? (strings[2152] || 'She does not stir. Perhaps someone who still loves her knows what she needs.')
    : !festeNear ? (strings[2153] || 'Only silence answers. Where is the fool with his song?')
    : (strings[2154] || 'Feste stands beside her, ready with his song.');

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-container modal-small">
        <CloseButton corner onClick={close} />
        <div className="modal-title">{strings[2150] || 'The Queen of Stone'}</div>
        <div className="modal-content">
          <p className="modal-message">{strings[2151]}</p>
          <p className="modal-message"><em>{line}</em></p>
          <div className="modal-buttons shared-buttons">
            <button className="btn-basic btn-neutral btn-modal" onClick={close}>
              {strings[2156] || 'Leave her be'}
            </button>
            {questDone && festeNear && (
              <button className="btn-basic btn-success btn-modal" onClick={() => { close(); wake(request, strings, setStory); }}>
                {strings[2155] || 'Music, awake her!'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
