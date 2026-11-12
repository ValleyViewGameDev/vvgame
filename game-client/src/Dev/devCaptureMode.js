// devCaptureMode: a developer-only "Capture Mode" for recording ad footage and stills
// (docs/social-video-plan.md). ⌘+Ctrl+H toggles it; while ON the header, status bar, the
// floating HUD buttons (zoom, map, To Do, season, news), the nav bar (and so the Debug button)
// and the Ko-fi widget are hidden and the board fills the whole window. Nothing else changes:
// keys, clicks and taps play the game as usual, and a panel or modal that is open stays open, so
// open what the shot needs first (the Farming panel, an NPC), then toggle. Zoom still works on
// the + / - keys.
//
// It is one class on <html> (devCaptureMode.css); the board is resized by the camera's own
// ResizeObserver (PixiCamera.js), so there is no renderer code here.
//
// Gating: initDevCaptureMode() is called by App.js only once the player is a developer
// (tuning/developerUsernames.json). Works on production too: it changes nothing but this
// browser's layout. Console: window.__captureMode() toggles, __captureMode(true/false) sets.
import './devCaptureMode.css';

let captureOn = false;
let initialized = false;
let noticeEl = null;
let noticeTimer = null;

export function isCaptureModeOn() { return captureOn; }

export function setCaptureMode(on) {
  captureOn = on === undefined ? !captureOn : !!on;
  document.documentElement.classList.toggle('dev-capture-mode', captureOn);
  showNotice(captureOn ? 'Capture mode ON · ⌘+Ctrl+H to leave' : 'Capture mode off');
  return captureOn;
}

export function initDevCaptureMode() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('keydown', (e) => {
    if (e.metaKey && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      setCaptureMode();
    }
  }, true);
  window.__captureMode = setCaptureMode;
}

// A short notice that removes itself, so it is never in a recording for more than a moment.
function showNotice(text) {
  if (noticeEl) noticeEl.remove();
  clearTimeout(noticeTimer);
  noticeEl = document.createElement('div');
  noticeEl.className = 'dev-capture-notice';
  noticeEl.setAttribute('data-edit-exempt', '');
  noticeEl.textContent = text;
  document.body.appendChild(noticeEl);
  noticeTimer = setTimeout(() => { if (noticeEl) { noticeEl.remove(); noticeEl = null; } }, 1200);
}
