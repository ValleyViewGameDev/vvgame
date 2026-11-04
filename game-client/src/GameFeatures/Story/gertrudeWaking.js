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
import { createCollectEffect, createMagicAuraEffect } from '../../VFX/VFX';
import soundManager from '../../Sound/SoundManager';

/**
 * The Queen of stone (docs/story.md §0; server: utils/storyState.js, POST /api/story/wake-gertrude).
 *
 * Gertrude stands as a statue ("Gertrude's Statue", action `statue`) in her castle in the Town
 * until the end of the early game:
 *   1. Helena's "Rosemary, for Remembrance" (L14) gives Gertrude's Song; Feste's "If Music Be the
 *      Food of Love" (L15) asks for it. Collecting his reward hands him the Song (consumed, POST
 *      /api/story/give-feste-song), which saves storyFlags.festeHasSong: the statue is READY, shown
 *      by a checkmark (Utils/ResourceOverlayUtils.js), and that is all waking needs.
 *   2. Feste's errand (derived from the player's state on every brain tick, NPCCitizenBehavior, so a
 *      reload just starts it again): while the statue is ready, Feste leaves his loop and walks an
 *      A* route to a tile beside her, at the player's walking pace, through the Town's doors
 *      (`passDoors`), then waits with a 🎶. No teleport: if he cannot get there he simply stays put.
 *   3. Tapping the ready statue opens the riddle modal; "Music, awake her!" always works. Feste sings
 *      if he is in the Town while the statue glows and sparkles (VFX createMagicAuraEffect); then her
 *      waking speech opens over the statue, and closing it turns the statue into Gertrude.
 *      Optimistic: the server call runs alongside, and only a refusal puts the statue back.
 *   4. Once she is awake, a Feste still standing by her walks home (homeX/homeY, by the Academy) the
 *      same way, then returns to his own loop.
 */
export const STATUE = "Gertrude's Statue";
export const QUEEN = 'Gertrude';
const FESTE = 'Feste';
export const FESTE_QUEST = 'If Music Be the Food of Love';
const FESTE_NEAR = 3;      // tiles (Chebyshev) from the statue that count as "beside her" in the modal
const ERRAND_STEP_MS = 90; // the errand walk's pace: the player's (PlayerMovement MOVEMENT_STEP_MS)
const HOME_NEAR = 4;       // after the waking, a Feste this close to the Queen walks home
const SONG_MS = 4400;      // how long Feste sings before she wakes

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const isGertrudeAwake = (player) => !!player?.storyFlags?.gertrudeAwake;
const festeQuestDone = (player) => (player?.completedQuests || []).some((q) => q?.questId === FESTE_QUEST);
/** The statue is ready to wake: Feste has the Song (or the player finished his quest before the Song existed). */
export const isStatueReady = (player) => !isGertrudeAwake(player) && (!!player?.storyFlags?.festeHasSong || festeQuestDone(player));
const findStatue = (resources) => (resources || []).find((r) => r.type === STATUE);
const findFeste = (gridId) => Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {}).find((n) => n?.type === FESTE);
const hex24 = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

// ---------------------------------------------------------------- Feste's errand (brain hook)

const errands = new Map(); // npcId -> { gridId, kind: 'statue' | 'home' }

/** Walk the errand at the player's pace and through doors; restore the NPC's own when it ends. */
function beginErrand(npc) {
  if (npc.errandBaseStepMs == null) npc.errandBaseStepMs = npc.stepMs;
  npc.stepMs = ERRAND_STEP_MS;
  npc.passDoors = true;
  npc.storyErrand = true;
  npc.citizenState = null; // out of the loop while on the errand (it restarts when he is free)
}
function endErrand(npc) {
  if (npc.errandBaseStepMs != null) { npc.stepMs = npc.errandBaseStepMs; npc.errandBaseStepMs = null; }
  npc.passDoors = false;
  npc.storyErrand = false;
  npc.path = null;
  errands.delete(npc.id);
  stopHeadlineEffect(npc.id);
}

/**
 * Called by every Citizen's brain tick before anything else. Returns true when this NPC is on a
 * story errand (and has been moved for this tick), so the brain skips its own loop.
 */
export function runStoryErrand(npc, gridId, tiles, resources, npcs, player) {
  if (npc.type !== FESTE) return false;
  const statue = findStatue(resources);
  let errand = errands.get(npc.id);
  if (errand && errand.gridId !== gridId) { endErrand(npc); errand = null; }

  // to the statue, while she is ready to wake
  if (statue && isStatueReady(player)) {
    if (!errand || errand.kind !== 'statue') { errand = { gridId, kind: 'statue' }; errands.set(npc.id, errand); beginErrand(npc); }
    startHeadlineEffect(npc.id, 'emoji', npc.position, { emoji: '🎶' });
    if (cheb(npc.position, statue) <= 1) { npc.path = null; return true; } // there: wait beside her
    const step = npc.followPath(statue.x, statue.y, tiles, resources, npcs, { stopShort: true });
    if (step === 'blocked') npc.path = null; // no way through right now: stand, and try again next tick
    return true;
  }

  // home again once she is awake, if he is still standing by her
  if (isGertrudeAwake(player) && Number.isInteger(npc.homeX) && Number.isInteger(npc.homeY)) {
    const queen = (npcs || []).find((n) => n?.type === QUEEN);
    if (!errand && queen && cheb(npc.position, queen.position) <= HOME_NEAR) {
      errand = { gridId, kind: 'home' };
      errands.set(npc.id, errand);
      beginErrand(npc);
      stopHeadlineEffect(npc.id);
    }
    if (errand?.kind === 'home') {
      const home = { x: npc.homeX, y: npc.homeY };
      const step = cheb(npc.position, home) === 0 ? 'arrived' : npc.followPath(home.x, home.y, tiles, resources, npcs);
      if (step === 'arrived') {
        NPCsInGridManager.updateNPC(gridId, npc.id, { position: npc.position }).catch(() => {});
        endErrand(npc);
        return false;
      }
      if (step === 'blocked') npc.path = null;
      return true;
    }
  }

  if (errand) endErrand(npc);
  return false;
}

// ---------------------------------------------------------------- the statue modal

let showRequest = null; // set by the mounted host

/** Open the statue's modal (App's resource click). opts: { resource, currentPlayer, setCurrentPlayer, gridId, setResources, updateStatus, TILE_SIZE, masterResources } */
export function openStatue(opts) {
  if (showRequest) showRequest(opts);
}

function wake(req, strings, setStory) {
  const { resource, currentPlayer, setCurrentPlayer, gridId, setResources, updateStatus, TILE_SIZE, masterResources } = req;
  const { x, y } = resource;
  const feste = findFeste(gridId);
  if (feste) {
    ConversationManager.addSpeech(feste.id, '🎶', 'song');
    startHeadlineEffect(feste.id, 'emoji', feste.position, { emoji: '🎵' });
  }
  // the statue glows and sparkles for the whole song
  const statueDef = (masterResources || []).find((r) => r.type === STATUE) || {};
  createMagicAuraEffect(x, y, SONG_MS, { span: Number(statueDef.artSpan) || 1 });
  soundManager.playSFX('heal');
  updateStatus?.(strings[2157] || '🎶 O mistress mine, where are you roaming?');
  setTimeout(() => updateStatus?.(strings[2158] || '🎶 Journeys end in lovers meeting.'), SONG_MS / 2);

  setTimeout(() => {
    if (feste) { ConversationManager.removeSpeech(feste.id); stopHeadlineEffect(feste.id); }
    const def = (masterResources || []).find((r) => r.type === QUEEN && r.category === 'npc') || {};
    soundManager.playSFX('levelup');

    // Her speech opens over the still statue; the statue becomes the Queen when it is closed.
    // The server call runs alongside (optimistic): its answer only matters if it refuses.
    let npcId = hex24();
    let refused = false;
    let swapped = false;
    const before = GlobalGridStateTilesAndResources.getResources() || [];
    const swap = async () => {
      if (refused || swapped) return;
      swapped = true;
      const current = GlobalGridStateTilesAndResources.getResources() || [];
      const after = current.filter((r) => !(r.x === x && r.y === y && r.type === STATUE));
      GlobalGridStateTilesAndResources.setResources(after);
      setResources?.(after);
      createCollectEffect(x, y, TILE_SIZE || 45);
      await NPCsInGridManager.addLocalNPC(gridId, {
        id: npcId, type: QUEEN, position: { x, y }, state: 'idle', hp: def.maxhp || 10, maxhp: def.maxhp || 10, homeX: x, homeY: y,
      });
    };
    const undo = () => {
      if (swapped) {
        NPCsInGridManager.forgetNPC(gridId, npcId);
        GlobalGridStateTilesAndResources.setResources(before);
        setResources?.(before);
      }
      setCurrentPlayer?.((prev) => {
        const flags = { ...(prev?.storyFlags || {}) };
        delete flags.gertrudeAwake;
        return { ...prev, storyFlags: flags };
      });
      setStory(null);
      updateStatus?.(strings[2160] || 'The Queen did not wake. Try again.');
    };

    // her waking is meeting her (Elbow's "Be Stone No More" is a Meet goal); the server does the same
    const awakeAt = new Date().toISOString();
    setCurrentPlayer?.((prev) => {
      const rels = [...(prev?.relationships || [])];
      const k = rels.findIndex((r) => r?.name === QUEEN);
      if (k < 0) rels.push({ name: QUEEN, relscore: 10, met: true, clues: ['met'] });
      else if (!rels[k].met) rels[k] = { ...rels[k], met: true, relscore: Math.max(rels[k].relscore || 0, 10), clues: [...new Set([...(rels[k].clues || []), 'met'])] };
      return { ...prev, relationships: rels, storyFlags: { ...(prev?.storyFlags || {}), gertrudeAwake: awakeAt } };
    });
    setStory({ username: currentPlayer?.username, filename: def.filename, onClosed: swap });

    axios.post(`${API_BASE}/api/story/wake-gertrude`, { playerId: currentPlayer.playerId, gridId, npcId })
      .then(async ({ data }) => {
        if (data?.npc && data.npc.id !== npcId) { // she was already awake there under another id
          if (swapped) { NPCsInGridManager.forgetNPC(gridId, npcId); await NPCsInGridManager.addLocalNPC(gridId, data.npc); }
          npcId = data.npc.id;
        }
        if (data?.storyFlags) setCurrentPlayer?.((prev) => ({ ...prev, storyFlags: data.storyFlags, ...(data.relationships ? { relationships: data.relationships } : {}) }));
      })
      .catch((err) => {
        if (!err.response) return; // the network: keep the waking; the next enter-grid agrees with the server
        refused = true;
        undo();
      });
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
      onClose={() => { const done = story.onClosed; setStory(null); done?.(); }}
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
  const ready = isStatueReady(currentPlayer); // Feste has the Song: waking needs nothing else
  const close = () => setRequest(null);
  const line = !ready ? (strings[2152] || 'She does not stir. Perhaps someone who still loves her knows what she needs.')
    : !festeNear ? (strings[2153] || 'Feste has her song, though the fool is not beside her yet. Call it anyway, and the music will find her.')
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
            {ready && (
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
