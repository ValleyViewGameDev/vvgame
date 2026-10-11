import { play as playFireworks } from './fireworks';
import './Celebration.css';

/**
 * Fireworks over the open modal, exactly as House plays them (StreakModal, TournamentPrizeModal):
 * a canvas overlay above every modal, pointer-events none, removed when the last spark fades.
 * Used by the Level Up and All Train Orders Filled modals. Fire-and-forget.
 *
 * fireworks.js (verbatim from House) sizes its stage from House's <main> play panel, or else
 * from the host. VVGame has no <main> and its <body> has no height (everything in it is
 * positioned), so the host here is a viewport-sized layer above the modals, removed afterwards.
 */
export function playCelebrationFireworks() {
  try {
    const stage = document.createElement('div');
    stage.className = 'vfx-stage';
    document.body.appendChild(stage);
    return playFireworks({ rootEl: stage, overModal: true, overlayClass: 'vfx-overlay--over-modal' })
      .finally(() => stage.remove());
  } catch (err) {
    console.warn('[vfx] fireworks failed', err);
    return Promise.resolve();
  }
}
