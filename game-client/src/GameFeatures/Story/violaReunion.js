import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import API_BASE from '../../config';
import '../../UI/Modals/Modal.css';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { startHeadlineEffect, stopHeadlineEffect } from '../../VFX/NPCVFX';
import { createCollectEffect } from '../../VFX/VFX';
import soundManager from '../../Sound/SoundManager';
import { getLocalizedString } from '../../Utils/stringLookup';

/**
 * The twins (Twelfth Night; docs/story.md; server: utils/storyState.js, POST
 * /api/story/reunite-viola). Sebastian stands on the sandy island in Sunflower Lake (1011670).
 * When the player greets him for the first time (his "met" StoryModal closes, NPCsPanel), Viola,
 * who has been watching from the water, rises out of the lake a little way off, swims to the shore
 * beside him (storyGoal.js), and the recognition scene from the play's last act plays at once as a
 * two-voice modal. From then on she lives in the water beside the island; her old lake no longer
 * has her, and the reunion gives the player her Secret. Optimistic: she appears on the tap and
 * the server call runs alongside; only a refusal takes her away again.
 */
export const SEBASTIAN = 'Sebastian';
const VIOLA = 'Viola';
const SPAWN_MIN = 4, SPAWN_MAX = 8; // tiles from the shore where she rises
const HEARTS_MS = 4000;

// The scene: [speaker, string key]. Twelfth Night 5.1, shortened.
const SCENE = [[SEBASTIAN, 2161], [VIOLA, 2162], [SEBASTIAN, 2163], [VIOLA, 2164], [SEBASTIAN, 2165], [VIOLA, 2166]];

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const hex24 = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
export const isViolaReunited = (player) => !!player?.storyFlags?.violaReunited;

let showScene = null; // set by the mounted host

/** Water tiles Viola can use (she lives in the water): no resource and no NPC on them. */
function waterTiles(tiles, resources, npcs) {
  const out = [];
  for (let y = 0; y < tiles.length; y++) for (let x = 0; x < (tiles[y]?.length || 0); x++) {
    if (tiles[y][x] !== 'w') continue;
    if (resources.some((r) => r && r.x === x && r.y === y)) continue;
    if (npcs.some((n) => n && Math.floor(n.position?.x) === x && Math.floor(n.position?.y) === y)) continue;
    out.push({ x, y });
  }
  return out;
}

/**
 * Called when Sebastian's "met" StoryModal closes. ctx: { currentPlayer, setCurrentPlayer,
 * setInventory, setBackpack, updateStatus, TILE_SIZE, masterResources, strings }.
 */
export async function startViolaReunion(ctx) {
  const { currentPlayer, setCurrentPlayer, setInventory, setBackpack, updateStatus, TILE_SIZE = 45, masterResources, strings = {} } = ctx;
  if (!currentPlayer || isViolaReunited(currentPlayer)) return;
  const gridId = currentPlayer.location?.g;
  const npcsMap = NPCsInGridManager.getNPCsInGrid(gridId) || {};
  const npcs = Object.values(npcsMap);
  const sebastian = npcs.find((n) => n?.type === SEBASTIAN);
  if (!sebastian || npcs.some((n) => n?.type === VIOLA)) return;
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  if (!tiles) return;

  // where she ends (the water beside him) and where she rises (a little way off)
  const water = waterTiles(tiles, resources, npcs);
  const shore = water.filter((t) => cheb(t, sebastian.position) === 1).sort((a, b) => a.y - b.y || a.x - b.x)[0]
    || water.sort((a, b) => cheb(a, sebastian.position) - cheb(b, sebastian.position))[0];
  if (!shore) return;
  const far = water.filter((t) => { const d = cheb(t, shore); return d >= SPAWN_MIN && d <= SPAWN_MAX; });
  const rise = far[Math.floor(Math.random() * far.length)] || shore;

  // she appears at once (optimistic), rising out of the lake
  const def = (masterResources || []).find((r) => r.type === VIOLA && r.category === 'npc') || {};
  const npcId = hex24();
  const probe = await NPCsInGridManager.addLocalNPC(gridId, {
    id: npcId, type: VIOLA, position: { x: rise.x, y: rise.y }, state: 'idle', hp: def.maxhp || 10, maxhp: def.maxhp || 10, homeX: shore.x, homeY: shore.y,
  });
  if (!probe) return;
  createCollectEffect(rise.x, rise.y, TILE_SIZE);
  soundManager.playSFX('boat_on');
  startHeadlineEffect(npcId, 'emoji', probe.position, { emoji: '❗' });

  // the server writes her into this island and out of her old lake, alongside
  const request = axios.post(`${API_BASE}/api/story/reunite-viola`, { playerId: currentPlayer.playerId, gridId, npcId, x: shore.x, y: shore.y })
    .then(({ data }) => {
      setCurrentPlayer?.((prev) => ({ ...prev, storyFlags: data.storyFlags, relationships: data.relationships || prev.relationships, inventory: data.inventory || prev.inventory, backpack: data.backpack || prev.backpack }));
      if (data?.inventory) setInventory?.(data.inventory);
      if (data?.backpack) setBackpack?.(data.backpack);
      return true;
    })
    .catch((err) => {
      if (!err.response) return true; // the network: keep her; the next enter-grid agrees with the server
      NPCsInGridManager.forgetNPC(gridId, npcId);
      stopHeadlineEffect(npcId);
      updateStatus?.(strings[2167] || 'Viola could not reach the island. Try again.');
      return false;
    });
  setCurrentPlayer?.((prev) => ({ ...prev, storyFlags: { ...(prev?.storyFlags || {}), violaReunited: { x: shore.x, y: shore.y, id: npcId } } }));

  // she swims to the shore beside him, then the scene plays
  probe.storyGoal = {
    x: shore.x, y: shore.y,
    onArrive: () => {
      stopHeadlineEffect(npcId);
      showScene?.({
        username: currentPlayer.username,
        onDone: async () => {
          if (!(await request)) return;
          [npcId, sebastian.id].forEach((id) => {
            const n = NPCsInGridManager.getNPCsInGrid(gridId)?.[id];
            if (n) startHeadlineEffect(id, 'emoji', n.position, { emoji: '❤️' });
            setTimeout(() => stopHeadlineEffect(id), HEARTS_MS);
          });
          soundManager.playSFX('levelup');
          updateStatus?.(strings[2168] || 'Viola has found her brother. She lives beside him now.');
        },
      });
    },
  };
}

/** The two-voice scene: one line per page, the speaker's art and name above it. Mounted at the root (index.js). */
export const ReunionHost = () => {
  const strings = useStrings();
  const [scene, setScene] = useState(null);
  const [page, setPage] = useState(0);
  const [defs, setDefs] = useState({});
  useEffect(() => {
    showScene = (next) => { setPage(0); setScene(next); };
    return () => { showScene = null; };
  }, []);
  useEffect(() => {
    if (!scene) return;
    import('../../Utils/TuningManager').then(({ loadMasterResources }) => loadMasterResources()).then((list) => {
      const pick = (t) => (list || []).find((r) => r.type === t && r.category === 'npc') || {};
      setDefs({ [SEBASTIAN]: pick(SEBASTIAN), [VIOLA]: pick(VIOLA) });
    }).catch(() => {});
  }, [scene]);
  if (!scene) return null;
  const [speaker, key] = SCENE[page];
  const def = defs[speaker] || {};
  const last = page === SCENE.length - 1;
  const next = () => {
    if (!last) { setPage(page + 1); return; }
    const done = scene.onDone;
    setScene(null);
    done?.();
  };
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-container modal-small">
        <div className="modal-title">{strings[2169] || 'Thrice Welcome'}</div>
        <div className="modal-content" style={{ textAlign: 'center' }}>
          {def.filename
            ? <img src={`/assets/resources/${def.filename}`} alt={speaker} style={{ width: 64, height: 64 }} />
            : <div style={{ fontSize: 48 }}>{def.symbol || ''}</div>}
          <div className="modal-message"><strong>{getLocalizedString(speaker, strings)}</strong></div>
          <p className="modal-message">{(strings[key] || '').replace('{username}', scene.username || '')}</p>
          <div className="modal-buttons shared-buttons">
            <button className="btn-basic btn-success btn-modal" onClick={next}>
              {last ? (strings[2171] || 'OK') : (strings[2170] || 'Next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
