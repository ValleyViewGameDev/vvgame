// A reason-counted lock on player input. App.js's key handler checks it before moving the
// avatar; the FTUE scrim and cutscenes (Utils/cutscene.js) take it while they run. Taps are
// blocked separately by whichever overlay is up (the scrim's dark area, the cutscene blocker).
const reasons = new Set();
export function lockInput(reason = 'lock') { reasons.add(reason); }
export function unlockInput(reason = 'lock') { reasons.delete(reason); }
export function isInputLocked() { return reasons.size > 0; }
