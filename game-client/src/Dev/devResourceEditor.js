// devResourceEditor: the RESOURCE half of dev Edit Mode (the CSS half and the mode toggle live in
// devEditMode.js, the string half in devStringEditor.js). While Edit Mode is on, a click on a
// placed thing's art on the board opens this little panel for that thing's resources.json row.
//
// For now it edits one field, `artSpan` (the square art's size in tiles, anchored at the
// footprint's bottom-centre: docs/art/buildings-bible.md §5). Each change is applied at once to
// the in-memory row (the same objects App and the renderer hold, Utils/TuningManager.js) and the
// board redraws (PixiRenderer listens for DEV_ART_CHANGED), so the scale can be tuned by eye.
// Save writes the value into game-server/tuning/resources.json through POST /api/dev/edit-resource
// (local dev, developers only); Cancel puts the original value back. Nothing persists until Save.
import axios from 'axios';
import API_BASE from '../config';
import { getMasterResources } from '../Utils/TuningManager';

export const DEV_ART_CHANGED = 'vv:dev-art-changed';
const STEP = 0.05;

let panel = null;

/** The placed thing whose RENDERED art is under a viewport point (frontmost first), or null. */
export function findBoardResourceAt(clientX, clientY) {
  const app = window.__pixiApp; // PixiRenderer's dev hook (never set in production)
  const canvas = app?.view;
  if (!app || !canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  // screen px -> the stage's px (the canvas may be drawn at a different resolution than its CSS box)
  const sx = (clientX - rect.left) * (app.screen.width / rect.width);
  const sy = (clientY - rect.top) * (app.screen.height / rect.height);
  let best = null;
  const visit = (node) => {
    for (const child of node.children || []) {
      if (!child.visible || child.worldAlpha === 0) continue;
      if (child.__res && child.__res.type) {
        const b = child.getBounds();
        if (sx >= b.x && sx <= b.x + b.width && sy >= b.y && sy <= b.y + b.height) {
          // the frontmost: the further south row draws in front (the objects layer's y-sort)
          if (!best || (child.zIndex ?? 0) >= (best.zIndex ?? 0)) best = child;
        }
      }
      if (child.children?.length) visit(child);
    }
  };
  visit(app.stage);
  return best ? best.__res : null;
}

export function closeResourcePanel() {
  if (panel) { panel.remove(); panel = null; }
}

function redraw() { window.dispatchEvent(new Event(DEV_ART_CHANGED)); }

/** Open the panel for a placed resource. Returns false when its row cannot be found. */
export function openResourceEditorFor(resource, { playerId, onSaved } = {}) {
  closeResourcePanel();
  const row = (getMasterResources() || []).find((r) => r.type === resource?.type);
  if (!row) return false;
  const original = row.artSpan;
  const footprint = Number(row.size) || 1;
  let value = Number(original) > 0 ? Number(original) : footprint;

  panel = document.createElement('div');
  panel.setAttribute('data-edit-exempt', '');
  panel.className = 'dev-resource-panel';
  panel.style.cssText = 'position:fixed;top:4rem;right:1rem;z-index:10000;width:240px;background:#1d1b16;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:10px 12px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,0.5)';
  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:2px"></div>
    <div style="opacity:0.7;margin-bottom:8px;font-size:11px"></div>
    <label style="display:block;margin-bottom:4px">artSpan (tiles)</label>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <button data-d="-1" style="width:28px">−</button>
      <input type="number" step="${STEP}" min="${footprint}" max="12" style="flex:1;min-width:0;padding:2px 4px" />
      <button data-d="1" style="width:28px">+</button>
    </div>
    <input type="range" min="${footprint}" max="${Math.max(8, footprint + 4)}" step="${STEP}" style="width:100%;margin-bottom:8px" />
    <div style="display:flex;gap:6px">
      <button data-act="save" style="flex:1">Save</button>
      <button data-act="cancel" style="flex:1">Cancel</button>
    </div>
    <div data-msg style="margin-top:6px;font-size:11px;opacity:0.8"></div>`;
  panel.children[0].textContent = row.type;
  panel.children[1].textContent = `footprint ${footprint} x ${footprint} · saved artSpan ${original ?? '(none)'}`;
  const input = panel.querySelector('input[type=number]');
  const slider = panel.querySelector('input[type=range]');
  const msg = panel.querySelector('[data-msg]');

  const apply = (next) => {
    // the renderer only draws artSpan when it is bigger than the footprint (PixiRenderer.js), so the
    // footprint is the floor (and, saved, means "no artSpan")
    value = Math.max(footprint, Math.min(12, Math.round(Number(next) / STEP) * STEP));
    value = parseFloat(value.toFixed(2));
    input.value = String(value);
    slider.value = String(value);
    row.artSpan = value; // live: the renderer reads the row on its next pass
    redraw();
  };
  apply(value);
  input.addEventListener('input', () => { if (Number(input.value) > 0) apply(input.value); });
  slider.addEventListener('input', () => apply(slider.value));
  panel.querySelectorAll('button[data-d]').forEach((b) => b.addEventListener('click', () => apply(value + Number(b.dataset.d) * STEP)));

  panel.querySelector('[data-act=cancel]').addEventListener('click', () => {
    if (original === undefined) delete row.artSpan; else row.artSpan = original;
    redraw();
    closeResourcePanel();
  });
  panel.querySelector('[data-act=save]').addEventListener('click', async () => {
    msg.textContent = 'Saving...';
    try {
      await axios.post(`${API_BASE}/api/dev/edit-resource`, { playerId, type: row.type, field: 'artSpan', value });
      onSaved?.(row.type, value);
      closeResourcePanel();
    } catch (err) {
      msg.textContent = `❌ ${err?.response?.data?.error || err?.message || 'Save failed'}`;
    }
  });
  document.body.appendChild(panel);
  input.focus();
  return true;
}
