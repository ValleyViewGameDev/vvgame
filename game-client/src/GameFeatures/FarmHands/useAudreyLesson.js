import { useEffect, useRef, useState } from 'react';
import { showNotification } from '../../UI/Notifications/Notifications';
import { findBoardTarget } from '../FTUE/findBoardTarget';
import { hasMoment, markMoment } from '../../Utils/moments';
import { getLocalizedString } from '../../Utils/stringLookup';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import PixiCamera from '../../Render/PixiRenderer/PixiCamera';

/**
 * The Audrey lesson (owner 2026-11-10): a FORCED just-in-time tutorial, once per profile, the first
 * time a player at level 5 or above (Audrey, the Farm Hand, unlocks at L5 and is free) is on their
 * own homestead with no Farm Hand yet. If they reach L5 elsewhere it starts when they get home. It
 * waits for the level-up modal and the L5 survey nudge to close (`blocked`).
 *
 *   1. 'farmhouse' scrim + arrow on the Farm House; tap it (its panel opens)
 *   2. 'buy'       scrim + arrow on Audrey's card in the Farm House panel; tap it (free, 3 s)
 *   3. 'wait'      the card is crafting: the scrim keeps everything else dark until it is ready
 *   4. 'collect'   scrim + arrow on the ready card; tap it (Audrey walks out to her Worker Slot and
 *                  the Farm House panel closes by itself, FarmHouse.js, for every worker)
 *   5. 'audrey'    the camera pans to Audrey; scrim + arrow on her; tap her (her panel opens)
 *   6. 'bulk'      the arrow on the Bulk Harvest button, NO scrim: the forced part ends here, since
 *                  the player may have no ripe crops to harvest. The arrow goes when the button or
 *                  the panel goes, or after HINT_MS.
 *
 * The stage is read from the DOM and the NPC store a few times a second, so the panels need no
 * hooks beyond `data-panel-name` (Panel.js), `data-resource-type` (ResourceButton) and
 * `data-tutorial="bulk-harvest"` (FarmHand.js).
 *
 * Never a trap (the Snug lesson's lesson, useSnugLesson.js): the moment 'audreyLesson' is stamped
 * when the lesson STARTS, so a reload or any failure never brings it back; if a stage's target
 * cannot be found for LOST_MS, or the whole flow runs past MAX_MS, it stands down; leaving the
 * grid ends it.
 *
 * App.js merges the result into the FTUE's scrim / doinker props, like the Snug lesson's:
 * { scrim, doinkerTargets, doinkerType, doinkerPointing } while running, else null.
 */
const START_DELAY_MS = 1200;
const POLL_MS = 250;
const LOST_MS = 8000;
const MAX_MS = 180000;
const HINT_MS = 20000;
const LESSON_LEVEL = 5;
const WORKER = 'Farm Hand';
const HOUSE = 'Farm House';

const SEL_PANEL = '[data-panel-name="FarmHouse"]';
const SEL_BULK = '[data-tutorial="bulk-harvest"]';

const audreyOnBoard = (gridId) => {
  const npcs = gridId ? NPCsInGridManager.getNPCsInGrid(gridId) : null;
  return (npcs && Object.values(npcs).find((n) => n?.type === WORKER)) || null;
};

export default function useAudreyLesson({ currentPlayer, setCurrentPlayer, gridId, level, isAppInitialized, blocked, closePanel, strings }) {
  const [stage, setStage] = useState(null);
  const playerRef = useRef(currentPlayer);
  playerRef.current = currentPlayer;
  const cardSel = `${SEL_PANEL} [data-resource-type="${CSS.escape(getLocalizedString(WORKER, strings))}"]`;

  const atHome = !!gridId && !!currentPlayer?.gridId && String(currentPlayer.gridId) === String(gridId);
  const eligible = !!isAppInitialized && atHome && !blocked && !currentPlayer?.firsttimeuser
    && (level || 0) >= LESSON_LEVEL && !hasMoment(currentPlayer, 'audreyLesson');

  useEffect(() => { setStage(null); }, [gridId]);

  const begin = () => {
    closePanel?.();
    showNotification('FTUE', {
      title: getLocalizedString(WORKER, strings),
      message: strings?.[17517] || strings?.[350],
      iconSrc: '/assets/resources/npc-head-farmhand.svg',
    });
    setStage('farmhouse');
  };

  // Start: a moment after arriving home (or after the level-up modal closes there)
  useEffect(() => {
    if (!eligible) return undefined;
    const timer = setTimeout(() => {
      if (!findBoardTarget(HOUSE, gridId)) return;
      const p = playerRef.current;
      if (audreyOnBoard(gridId)) { if (p) markMoment(p, 'audreyLesson', setCurrentPlayer); return; } // already hired
      if (p && !hasMoment(p, 'audreyLesson')) markMoment(p, 'audreyLesson', setCurrentPlayer);
      begin();
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [gridId, eligible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dev hook: run the lesson now on this grid, done or not
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return undefined;
    window.__audreyLesson = () => {
      if (!findBoardTarget(HOUSE, gridId)) return 'no Farm House on this grid';
      begin();
      return 'started';
    };
    return () => { delete window.__audreyLesson; };
  }, [gridId, closePanel, strings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the player through the flow
  const reachedBulk = useRef(false);
  useEffect(() => {
    if (!stage) { reachedBulk.current = false; return undefined; }
    const startedAt = Date.now();
    let lostSince = null;
    let bulkSince = null;
    let panned = false;
    const timer = setInterval(() => {
      const audrey = audreyOnBoard(gridId);
      let next; let found;
      if (reachedBulk.current) {
        if (!document.querySelector(SEL_BULK) || Date.now() - bulkSince > HINT_MS) { setStage(null); return; }
        return;
      }
      if (!audrey) {
        const card = document.querySelector(cardSel);
        if (!card) { next = 'farmhouse'; found = !!findBoardTarget(HOUSE, gridId); }
        else if (card.querySelector('.ready')) { next = 'collect'; found = true; }
        else if (card.querySelector('.in-progress')) { next = 'wait'; found = true; }
        else { next = 'buy'; found = true; }
      } else if (document.querySelector(SEL_BULK)) { next = 'bulk'; found = true; }
      else {
        next = 'audrey'; found = true;
        if (!panned && audrey.position) { panned = true; PixiCamera.panToTile(Math.round(audrey.position.x), Math.round(audrey.position.y), 600); }
      }
      if (next === 'bulk') { reachedBulk.current = true; bulkSince = Date.now(); }
      if (found) lostSince = null;
      else if (lostSince == null) lostSince = Date.now();
      else if (Date.now() - lostSince > LOST_MS) { setStage(null); return; }   // stand down
      if (Date.now() - startedAt > MAX_MS) { setStage(null); return; }
      setStage((cur) => (cur === next ? cur : next));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [stage === null, gridId, cardSel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stage) return null;
  const card = { selector: cardSel };
  switch (stage) {
    case 'farmhouse': return { scrim: HOUSE, doinkerTargets: HOUSE, doinkerType: 'resource', doinkerPointing: 'down' };
    case 'buy':
    case 'collect': return { scrim: card, doinkerTargets: cardSel, doinkerType: 'element', doinkerPointing: 'down' };
    case 'wait': return { scrim: card, doinkerTargets: null, doinkerType: 'element', doinkerPointing: 'down' };
    case 'audrey': return { scrim: WORKER, doinkerTargets: WORKER, doinkerType: 'resource', doinkerPointing: 'down' };
    case 'bulk': return { scrim: null, doinkerTargets: SEL_BULK, doinkerType: 'element', doinkerPointing: 'down' };
    default: return null;
  }
}
