import { useEffect, useRef, useState } from 'react';
import { showNotification } from '../../UI/Notifications/Notifications';
import { findBoardTarget } from '../FTUE/findBoardTarget';
import { updatePlayerSettings } from '../../settings';
import { wasShown, markShown } from '../../Utils/shownOnce';

/**
 * The Snug lesson (backlog OB-9, owner 2026-11-05): a just-in-time tutorial, once per profile, the
 * first time a player past the FTUE stands on a valley grid where Snug is (a valley town). It
 * force-flows them with the FTUE's scrim and doinker:
 *
 *   1. 'snug'   the board goes dark except Snug; the arrow points at him; tap him (his panel opens)
 *   2. 'greet'  only if they have never met him: the panel's Greet button (Travel needs "met")
 *   3. 'travel' the panel's "Travel with Snug" button (NPCsPanel.js, data-tutorial="snug-travel")
 *   4. the Travel modal opens: the scrim and arrow go, control returns, the lesson is stamped done
 *      (player.settings.snugLessonDone, so it never runs again on any device)
 *
 * A persistent toast (string 17027) explains Snug travel throughout and stays until dismissed.
 * The stage is read from the DOM a few times a second (the panel's buttons, the modal), so the
 * lesson needs no hooks inside NPCsPanel beyond the data attributes. If Snug cannot be found on
 * the board for a few seconds the lesson stands down unstamped and tries again on a later visit.
 *
 * App.js merges the result into the FTUE's own scrim / doinker props: { scrim, doinkerTargets,
 * doinkerType, doinkerPointing } while running, else null.
 */
const START_DELAY_MS = 2500;   // after arrival: let the region burst and its toast play first
const POLL_MS = 250;
const LOST_SNUG_MS = 6000;

const SEL_TRAVEL = '[data-tutorial="snug-travel"]';
const SEL_GREET = '[data-interaction="Greet"]';
const SEL_MODAL = '.snug-travel-modal';

const STAGES = {
  snug: { scrim: 'Snug', doinkerTargets: 'Snug', doinkerType: 'resource', doinkerPointing: 'down' },
  greet: { scrim: { selector: SEL_GREET }, doinkerTargets: SEL_GREET, doinkerType: 'element', doinkerPointing: 'down' },
  travel: { scrim: { selector: SEL_TRAVEL }, doinkerTargets: SEL_TRAVEL, doinkerType: 'element', doinkerPointing: 'down' },
};

export default function useSnugLesson({ currentPlayer, setCurrentPlayer, gridId, isAppInitialized, closePanel, strings }) {
  const [stage, setStage] = useState(null);
  const playerRef = useRef(currentPlayer);
  playerRef.current = currentPlayer;

  const gtype = currentPlayer?.location?.gtype || '';
  const eligible = !!isAppInitialized && !!gridId && !currentPlayer?.firsttimeuser
    && !currentPlayer?.settings?.snugLessonDone && !wasShown(currentPlayer?.playerId, 'snugLesson')
    && gtype.startsWith('valley');

  // Start: a little after arriving on a valley grid where Snug stands
  useEffect(() => {
    setStage(null);
    if (!eligible) return undefined;
    const timer = setTimeout(() => {
      if (!findBoardTarget('Snug', gridId)) return;   // no Snug here: not a valley town
      closePanel?.();
      showNotification('FTUE', {
        title: strings?.[10191] || 'Travel with Snug',
        message: strings?.[17027],
        iconSrc: '/assets/resources/npc-snug.svg',
      });
      setStage('snug');
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [gridId, eligible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dev hook: run the lesson now on this grid (Snug must be on the board), done or not
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return undefined;
    window.__snugLesson = () => {
      if (!findBoardTarget('Snug', gridId)) return 'no Snug on this grid';
      closePanel?.();
      showNotification('FTUE', { title: strings?.[10191] || 'Travel with Snug', message: strings?.[17027], iconSrc: '/assets/resources/npc-snug.svg' });
      setStage('snug');
      return 'started';
    };
    return () => { delete window.__snugLesson; };
  }, [gridId, closePanel, strings]);

  // Follow the player through the flow, reading the DOM
  useEffect(() => {
    if (!stage) return undefined;
    let lostSince = null;
    const timer = setInterval(() => {
      if (document.querySelector(SEL_MODAL)) {
        setStage(null);
        const p = playerRef.current;
        markShown(p?.playerId, 'snugLesson');   // a stale player copy can drop the stamp (Utils/shownOnce.js)
        if (p && !p.settings?.snugLessonDone) updatePlayerSettings({ snugLessonDone: true }, p, setCurrentPlayer);
        return;
      }
      let next = 'snug';
      if (document.querySelector(SEL_TRAVEL)) next = 'travel';
      else if (document.querySelector(SEL_GREET)) next = 'greet';
      if (next === 'snug') {
        if (findBoardTarget('Snug', gridId)) lostSince = null;
        else if (lostSince == null) lostSince = Date.now();
        else if (Date.now() - lostSince > LOST_SNUG_MS) { setStage(null); return; }   // stand down, try another day
      }
      setStage((cur) => (cur === next ? cur : next));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [stage, gridId, setCurrentPlayer]);

  return stage ? STAGES[stage] : null;
}
