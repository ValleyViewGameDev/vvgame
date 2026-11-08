import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import StoryModal from '../../UI/Modals/StoryModal';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { createCollectEffect, createMagicAuraEffect, holdResourceRenders } from '../../VFX/VFX';
import StoryFX from '../../Render/PixiRenderer/StoryFX';
import PixiCamera from '../../Render/PixiRenderer/PixiCamera';
import ambientVFXManager from '../../VFX/AmbientVFXManager';
import { enrichGridResources } from '../../AppInit';
import soundManager from '../../Sound/SoundManager';
import { footprintCenter } from '../../Utils/footprint';

/**
 * The Quest for Hope's finale (owner 2026-11-07; server: utils/hopeFinale.js, POST
 * /api/story/hope-finale; docs/story.md §4).
 *
 * Starts when the Oracle's Hope trade succeeds (NPCsPanel handleTrade), or when a player who holds
 * Hope but has not seen the finale is on her grid (App: an older trade, or a reload part-way):
 *   1. three speeches from the Oracle (StoryModal): Hope is home; the storm's story ends (the cast
 *      cast apart, the pages mended, and they stay, as friends); her farewell
 *   2. every quarrel is mended (status line); the camera zooms all the way in on the Oracle
 *   3. the Oracle glows (Gertrude's waking aura) and turns into a dove that flies slowly north off
 *      the map; as it takes off the camera zooms out to 'farish' (one short of the farthest grid
 *      zoom) so the rest is in view. The server call goes out now, after the Oracle has left the local NPC store, so
 *      nothing of hers is saved back.
 *   4. the Enormous Mountain fades out; in its clearing stand the Home of the Oracle, a Post
 *      House, Snug and Peter Quince (each with a poof); the Hope Mountain clouds stop
 *   5. ten OneKXP stars (1,000 XP each, round where the mountain stood) and 100 gems fall from
 *      the sky, staggered over 10 s, each with a trail of magic dust, bouncing to rest as ordinary
 *      pickups on the board. The Hope trade itself pays no XP, so no level-up modal breaks in.
 * Optimistic: everything plays on the client; a refusal from the server puts the Oracle and the
 * mountain back. The server's answer says what to add (ids and tiles), so both sides agree.
 */
export const HOPE_COORD = 1014307;
const ORACLE = 'Oracle';
const MOUNTAIN = 'Enormous Mountain';
const SPEECHES = [16535, 16536, 16537];
const AURA_MS = 3200;
const DOVE_MS = 9000;
const FADE_MS = 4500;
const GEM_STAGGER_MS = 10000;
const GEM_BATCH_MS = 400;
const HANDOFF_MS = 450; // the board's re-render (its texture wave waits up to 120 ms) plus margin

export const isHopeReturned = (player) => !!player?.storyFlags?.hopeReturned;
const list = (a, b) => (Array.isArray(a) ? a : Array.isArray(b) ? b : []);
export const holdsHope = (player, inventory, backpack) =>
  [...list(inventory, player?.inventory), ...list(backpack, player?.backpack)].some((i) => i?.type === 'Hope' && i.quantity > 0)
  || (player?.trophies || []).some((t) => t?.name === 'Hope');

let showRequest = null;   // set by the mounted host
let running = false;
let hooks = { zoomTo: null };

/** App registers what the finale needs from it: zoomTo(level) sets a grid zoom ('closer' ... 'far'). */
export function setHopeFinaleHooks(next) { hooks = { ...hooks, ...next }; }

/** Begin the finale. opts: { currentPlayer, setCurrentPlayer, gridId, setResources, updateStatus, masterResources, TILE_SIZE } */
export function startHopeFinale(opts) {
  if (running || !showRequest || !opts?.gridId) return false;
  running = true;
  showRequest(opts);
  return true;
}
export const isHopeFinaleRunning = () => running;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function setLocalResources(next, setResources) {
  GlobalGridStateTilesAndResources.setResources(next);
  setResources?.(next);
}

async function playSpectacle(req, strings) {
  const { currentPlayer, setCurrentPlayer, gridId, setResources, updateStatus, masterResources, TILE_SIZE } = req;
  const say = (key) => { if (strings[key]) updateStatus?.(strings[key]); };
  const tile = TILE_SIZE || 45;

  say(16538); // every quarrel mended
  soundManager.playSFX('levelup');

  // 3. the Oracle becomes a dove, seen up close
  const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
  const oracle = npcs.find((n) => n?.type === ORACLE);
  const at = oracle ? { x: Math.round(oracle.position.x), y: Math.round(oracle.position.y) } : null;
  if (oracle) { oracle.storyHold = true; oracle.path = null; } // she holds still for it (NPCCitizenBehavior)
  hooks.zoomTo?.('closer');
  await wait(450); // the zoom (PixiCamera ZOOM_DURATION_MS 220) re-centres on the player first
  if (at) PixiCamera.panToTile(at.x, at.y, 700);
  await wait(1100);
  const oracleRecord = oracle ? { id: oracle.id, type: ORACLE, position: { ...oracle.position }, state: oracle.state || 'idle', hp: oracle.hp, maxhp: oracle.maxhp, homeX: oracle.homeX, homeY: oracle.homeY } : null;
  if (at) {
    createMagicAuraEffect(at.x, at.y, AURA_MS);
    soundManager.playSFX('heal');
    await wait(AURA_MS);
    NPCsInGridManager.forgetNPC(gridId, oracle.id);
    createCollectEffect(at.x, at.y, tile);
  }
  const before = GlobalGridStateTilesAndResources.getResources() || [];
  const server = axios.post(`${API_BASE}/api/story/hope-finale`, { playerId: currentPlayer.playerId, gridId }).then((r) => r.data).catch((err) => ({ error: err }));
  say(16539);
  const dove = at ? StoryFX.doveFlight(at.x, at.y, { ms: DOVE_MS }) : Promise.resolve();
  await wait(900); // the dove lifts off; then the view opens out to take in the mountain and the sky
  hooks.zoomTo?.('farish');

  // 4. the mountain fades; what it hid appears
  await wait(1600);
  const mountain = before.find((r) => r.type === MOUNTAIN);
  if (mountain) await StoryFX.fadeResource(mountain.x, mountain.y, FADE_MS);
  const data = await server;
  if (data?.error || !data?.success) {
    if (mountain) StoryFX.clearFade(mountain.x, mountain.y);
    if (data?.error && !data.error.response) { // the network: keep what played; the next visit agrees with the server
      running = false;
      return;
    }
    if (oracleRecord) await NPCsInGridManager.addLocalNPC(gridId, oracleRecord);
    setLocalResources(before, setResources);
    updateStatus?.(strings[16543] || 'The Oracle is not ready yet. Speak with her again.');
    running = false;
    return;
  }
  setCurrentPlayer?.((prev) => ({ ...prev, storyFlags: data.storyFlags, relationships: data.relationships, npcRelationships: data.npcRelationships }));
  ambientVFXManager.setStoryFlags(data.storyFlags); // the Hope Mountain clouds end here
  ambientVFXManager.refresh();

  // the mountain goes with its whole footprint (the 'shadow' tiles AppInit.enrichGridResources
  // laid under a multi-tile resource are what block movement), and what appears gets its own
  const gone = [...(data.removedResources || []), ...(mountain ? [mountain] : [])];
  const goneAnchors = new Set(gone.flatMap((r) => [r.anchorKey, `${r.type}-${r.x}-${r.y}`, `${r.type}_${r.x}_${r.y}`].filter(Boolean)));
  const goneTiles = new Set(gone.map((r) => `${r.x},${r.y}`));
  let current = (GlobalGridStateTilesAndResources.getResources() || []).filter((r) =>
    !(r.type === MOUNTAIN && goneTiles.has(`${r.x},${r.y}`)) && !(r.type === 'shadow' && goneAnchors.has(r.parentAnchorKey)));
  const addedRows = enrichGridResources(data.addedResources || [], masterResources || []);
  const added = addedRows.filter((r) => r.type !== 'shadow');
  current = [...current, ...addedRows];
  setLocalResources(current, setResources);
  if (mountain) setTimeout(() => StoryFX.clearFade(mountain.x, mountain.y), 1000);
  say(16540);
  for (const r of added) {
    const c = footprintCenter({ ...((masterResources || []).find((m) => m.type === r.type) || {}), x: r.x, y: r.y });
    createCollectEffect(c.x, c.y, tile);
  }
  for (const n of data.addedNpcs || []) {
    await NPCsInGridManager.addLocalNPC(gridId, n);
    createCollectEffect(n.position.x, n.position.y, tile);
  }
  soundManager.playSFX('success');
  await Promise.race([dove, wait(2500)]);

  // 5. gems from the sky
  const gems = data.gems || [];
  if (gems.length) {
    say(16541);
    const release = holdResourceRenders(gems);     // hidden on the board until each one lands
    // the ten OneKXP stars (first, round the old mountain) and the 100 gems, each as its own type
    const gemRows = enrichGridResources(gems.map((g) => ({ type: g.type || 'Gem', x: g.x, y: g.y })), masterResources || []);
    const artOf = (type) => (masterResources || []).find((m) => m.type === type) || {};
    setLocalResources([...(GlobalGridStateTilesAndResources.getResources() || []), ...gemRows], setResources);
    // A landed drop's sprite rests where the board will draw it; its tile is released to the board
    // (one re-render per batch) and the stand-in goes only once the real sprite has had time to
    // be drawn beneath it (HANDOFF_MS), so the swap is invisible
    let landed = [];
    const flush = () => {
      if (!landed.length) return;
      const batch = landed; landed = [];
      release(batch.map((l) => l.g));
      setTimeout(() => batch.forEach((l) => l.remove()), HANDOFF_MS);
    };
    const timer = setInterval(flush, GEM_BATCH_MS);
    const step = GEM_STAGGER_MS / gems.length;
    await Promise.all(gems.map((g, i) => wait(i * step + Math.random() * step).then(() =>
      StoryFX.gemFall(g.x, g.y, { symbol: artOf(g.type || 'Gem').symbol || '💎', filename: artOf(g.type || 'Gem').filename || null, onLanded: (remove) => { landed.push({ g, remove }); if (i % 7 === 0) soundManager.playSFX('collect_item'); } }))));
    clearInterval(timer);
    flush();
  }
  running = false;
}

/** Mounted once at the app root (index.js), like StatueHost. */
export const HopeFinaleHost = () => {
  const strings = useStrings();
  const [request, setRequest] = useState(null);

  useEffect(() => {
    showRequest = (next) => setRequest(next);
    return () => { showRequest = null; };
  }, []);

  if (!request) return null;
  const oracleDef = (request.masterResources || []).find((r) => r.type === ORACLE && r.category === 'npc') || {};
  const next = () => {
    const req = request;
    setRequest(null);
    playSpectacle(req, strings).catch((e) => { console.error('Hope finale failed:', e); running = false; });
  };
  return (
    <StoryModal
      isOpen
      onClose={next}
      npcName={ORACLE}
      dialogKey={SPEECHES}
      username={request.currentPlayer?.username}
      symbol={oracleDef.symbol}
      npcFilename={oracleDef.filename}
    />
  );
};
