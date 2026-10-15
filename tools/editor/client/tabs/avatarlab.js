/**
 * Avatar Lab tab (docs/avatar-plan.md §2.4, slice 0): compose a bust from the catalogue the
 * way the game does, part by part, with the equipment feed and the blink frame, and browse
 * every part file and every deconstruction candidate under public/assets/avatar/_lab/.
 *
 * Uses the client's own modules served raw by the editor server
 * (/game-client/avatarLook.js, /game-client/avatarCompositor.js) so what you see here is what
 * the game draws. Reads only; parts are edited on disk (and in the AVATAR PARTS sheet).
 */
import { el, clear, $ } from '../core/dom.js';
import { local } from '../core/api.js';
import { toast, setStatus } from '../core/ui.js';
import * as look from '/game-client/avatarLook.js';
import { renderLook, setAvatarAssetBase, clearAvatarCaches, loadPartImage } from '/game-client/avatarCompositor.js';

setAvatarAssetBase('/avatar-assets/');

const PREVIEW = 512;
const SPEC_PART_KEYS = Object.keys(look.SLOT_OF_SPEC_KEY);
const SPEC_COLOR_KEYS = Object.keys(look.PALETTE_OF_SPEC_KEY);

export function avatarLabTab() {
  let data = null;          // { catalogue, palettes }
  let files = null;         // { folders: {slot: [file]}, lab: {source: [file]} }
  let spec = null;
  let equip = { weaponHand: null, armorTop: null, gtype: 'valley' };
  let blinking = true;
  let blinkTimer = null;
  let showRig = false;
  let selectionEl; let editorEl;
  let missing = new Set();

  async function load() {
    const [parts, palettes, f] = await Promise.all([local.tuning('avatarParts'), local.tuning('avatarPalettes'), local.avatarFiles()]);
    data = { catalogue: parts.data || [], palettes: palettes.data || [] };
    files = f;
    if (!spec) spec = look.defaultSpec(data.catalogue, data.palettes);
  }

  // ---------------------------------------------------------------- preview
  let drawSeq = 0; // quick successive changes: only the latest draw may paint
  async function drawPreview() {
    const canvasEl = $('#lab-preview', editorEl);
    if (!canvasEl) return;
    const seq = ++drawSeq;
    if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
    missing = new Set();
    const l = look.lookFor(spec, data, equip);
    const onMissing = (src) => missing.add(src);
    const open = await renderLook(l.layers, { size: PREVIEW, onMissing });
    const blink = l.blinkLayers ? await renderLook(l.blinkLayers, { size: PREVIEW, onMissing }) : null;
    if (seq !== drawSeq) return; // a newer draw is on its way
    const ctx = canvasEl.getContext('2d');
    const paint = (c) => { ctx.clearRect(0, 0, PREVIEW, PREVIEW); ctx.drawImage(c, 0, 0); if (showRig) drawRig(ctx); };
    paint(open);
    if (blink && blinking) {
      blinkTimer = setInterval(() => { if (seq !== drawSeq) return; paint(blink); setTimeout(() => { if (seq === drawSeq) paint(open); }, 120); }, 3000 + Math.random() * 3000);
    }
    const layersEl = $('#lab-layers', editorEl);
    clear(layersEl);
    layersEl.appendChild(el('div', { class: 'lab-key' }, `look key: ${l.key || '(empty)'}`));
    l.layers.forEach((layer, i) => layersEl.appendChild(el('div', { class: 'lab-layer' + (missing.has(layer.src) ? ' missing' : '') }, [
      el('span', { class: 'z' }, String(i + 1)),
      el('span', { class: 'src' }, layer.src),
      layer.tint ? el('span', { class: 'swatch', style: `background:${layer.tint}` }, layer.tint) : el('span', { class: 'muted' }, 'as drawn'),
      missing.has(layer.src) ? el('span', { class: 'bad' }, 'file missing') : '',
    ])));
    if (l.blinkLayers) layersEl.appendChild(el('div', { class: 'muted' }, `blink: ${l.blinkLayers.length} layers`));
    setStatus(missing.size ? `${missing.size} part file(s) missing` : '');
  }

  let body = null; // public/assets/avatar/body.json: the contours every part conforms to
  async function loadBody() { try { body = await (await fetch('/avatar-assets/body.json', { cache: 'no-store' })).json(); } catch (e) { body = null; } }
  function drawRig(ctx) {
    if (!body) return;
    const s = PREVIEW / 256;
    ctx.save(); ctx.scale(s, s); ctx.lineWidth = 1 / s;
    const stroke = (d, color, dash) => { ctx.strokeStyle = color; ctx.setLineDash(dash || []); ctx.stroke(new Path2D(d)); };
    stroke(body.bust, 'rgba(60,60,200,0.8)'); ctx.strokeRect(body.neck.x, body.neck.y, body.neck.w, body.neck.h);
    stroke(body.female.headRig, 'rgba(200,60,60,0.8)'); stroke(body.male.headRig, 'rgba(50,100,220,0.8)', [3, 2]);
    ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(200,60,60,0.8)'; ctx.beginPath(); ctx.moveTo(64, body.eyeLine); ctx.lineTo(192, body.eyeLine); ctx.stroke();
    ctx.setLineDash([6, 3]); ctx.strokeStyle = 'rgba(170,100,170,0.8)'; ctx.beginPath(); ctx.moveTo(40, body.hairTop); ctx.lineTo(216, body.hairTop); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(200,140,40,0.8)'; ctx.beginPath(); ctx.arc(body.handSlot.cx, body.handSlot.cy, body.handSlot.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- selection panel
  function renderSelection() {
    clear(selectionEl);
    selectionEl.appendChild(el('h2', {}, 'Avatar Lab'));
    selectionEl.appendChild(el('p', { class: 'muted small' }, 'Composes a bust exactly as the game does from the AVATAR PARTS and AVATAR COLOURS sheets. Edit files on disk, then Reload.'));
    const row = (label, control) => el('label', { class: 'lab-row' }, [el('span', {}, label), control]);
    const select = (value, options, onChange) => {
      const s = el('select', { onchange: (e) => onChange(e.target.value || null) });
      s.appendChild(el('option', { value: '' }, '(none)'));
      for (const o of options) s.appendChild(el('option', { value: o.id, selected: o.id === value ? 'selected' : undefined }, `${o.label || o.id}${o.tier && o.tier !== 'free' ? ` [${o.tier}${o.gemcost ? ' ' + o.gemcost + '💎' : ''}]` : ''}`));
      return s;
    };
    for (const key of SPEC_PART_KEYS) {
      selectionEl.appendChild(row(key, select(spec[key], look.partsInSlot(data.catalogue, look.SLOT_OF_SPEC_KEY[key]), (v) => { spec[key] = v; drawPreview(); })));
    }
    for (const key of SPEC_COLOR_KEYS) {
      const slot = look.PALETTE_OF_SPEC_KEY[key];
      const wrap = el('div', { class: 'lab-swatches' });
      for (const sw of look.palette(data.palettes, slot)) {
        wrap.appendChild(el('button', { class: 'lab-swatch' + (spec[key] === sw.id ? ' on' : ''), title: `${sw.label || sw.id} ${sw.hex}`, style: `background:${sw.hex}`, onclick: () => { spec[key] = sw.id; renderSelection(); drawPreview(); } }));
      }
      selectionEl.appendChild(row(key, wrap));
    }
    selectionEl.appendChild(el('h3', {}, 'Equipment'));
    selectionEl.appendChild(row('weapon hand', select(equip.weaponHand, look.partsInSlot(data.catalogue, 'hand'), (v) => { equip.weaponHand = v; drawPreview(); })));
    selectionEl.appendChild(row('armour top', select(equip.armorTop, look.partsInSlot(data.catalogue, 'top'), (v) => { equip.armorTop = v; drawPreview(); })));
    selectionEl.appendChild(row('grid kind', select(equip.gtype, ['homestead', 'town', 'valley', 'dungeon'].map((id) => ({ id, label: id })), (v) => { equip.gtype = v; drawPreview(); })));
    selectionEl.appendChild(el('h3', {}, 'View'));
    selectionEl.appendChild(el('label', { class: 'lab-row' }, [el('input', { type: 'checkbox', checked: blinking ? 'checked' : undefined, onchange: (e) => { blinking = e.target.checked; drawPreview(); } }), ' blink']));
    selectionEl.appendChild(el('label', { class: 'lab-row' }, [el('input', { type: 'checkbox', checked: showRig ? 'checked' : undefined, onchange: (e) => { showRig = e.target.checked; drawPreview(); } }), ' show rig guides']));
    selectionEl.appendChild(el('div', { class: 'lab-actions' }, [
      el('button', { onclick: async () => { clearAvatarCaches(); await load(); renderSelection(); renderEditor(); toast('Reloaded catalogue and files'); } }, 'Reload'),
      el('button', { onclick: () => { spec = look.defaultSpec(data.catalogue, data.palettes); renderSelection(); drawPreview(); } }, 'Starter look'),
      el('button', { onclick: () => navigator.clipboard?.writeText(JSON.stringify(spec)).then(() => toast('Spec copied')) }, 'Copy spec'),
    ]));
    const problems = look.validateSpec(spec, data.catalogue, data.palettes, { allowNpc: true, owned: [...data.catalogue, ...data.palettes].map((r) => r.id) });
    if (problems.length) selectionEl.appendChild(el('div', { class: 'bad small' }, problems.join('; ')));
  }

  // ---------------------------------------------------------------- editor area
  function renderEditor() {
    clear(editorEl);
    const top = el('div', { class: 'lab-top' }, [
      el('canvas', { id: 'lab-preview', width: PREVIEW, height: PREVIEW, class: 'lab-canvas' }),
      el('div', { id: 'lab-layers', class: 'lab-layers' }),
    ]);
    editorEl.appendChild(top);
    editorEl.appendChild(el('h3', { class: 'lab-h' }, 'Part files (public/assets/avatar/<folder>/)'));
    const grid = el('div', { class: 'lab-grid' });
    for (const [folder, list] of Object.entries(files.folders || {})) {
      for (const file of list) grid.appendChild(thumb(`${folder}/${file}`, `${folder}/${file}`, inCatalogue(folder, file)));
    }
    editorEl.appendChild(grid);
    editorEl.appendChild(el('h3', { class: 'lab-h' }, 'Lab candidates (public/assets/avatar/_lab/<source>/)'));
    for (const [source, list] of Object.entries(files.lab || {})) {
      editorEl.appendChild(el('h4', { class: 'lab-h' }, `${source} (${list.length})`));
      const g = el('div', { class: 'lab-grid' });
      for (const file of list) {
        if (!file.endsWith('.svg') && !file.endsWith('.png')) continue;
        g.appendChild(thumb(`_lab/${source}/${file}`, file, true));
      }
      editorEl.appendChild(g);
    }
    drawPreview();
  }

  function inCatalogue(folder, file) {
    return data.catalogue.some((r) => ['file', 'fileMale', 'file2', 'backFile', 'underHat', 'blinkFile'].some((w) => r[w] === file && look.partFolder(r.slot, w) === folder));
  }

  function thumb(src, label, known) {
    const img = el('img', { src: `/avatar-assets/${src}`, alt: label, loading: 'lazy', class: 'lab-thumb' + (known ? '' : ' unknown'), title: known ? src : `${src} (not in the catalogue)` });
    return el('figure', { class: 'lab-fig', onclick: () => inspect(src) }, [img, el('figcaption', {}, label)]);
  }

  /** Show one file large over the rig guides (a candidate or a part). */
  async function inspect(src) {
    const canvasEl = $('#lab-preview', editorEl);
    if (!canvasEl) return;
    if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    try {
      const img = await loadPartImage(src);
      ctx.drawImage(img, 0, 0, PREVIEW, PREVIEW);
    } catch (e) { toast(e.message, 'error'); }
    drawRig(ctx);
    const layersEl = $('#lab-layers', editorEl);
    clear(layersEl).appendChild(el('div', {}, [el('strong', {}, src), el('div', { class: 'muted small' }, 'alone, over the rig guides. Pick a part on the left to go back to the composed bust.')]));
  }

  return {
    id: 'avatarlab', label: 'Avatar Lab', icon: '🧑‍🎨', group: 'avatar',
    async mount(sel, ed) {
      selectionEl = sel; editorEl = ed;
      await Promise.all([load(), loadBody()]);
      renderSelection();
      renderEditor();
    },
    unmount() { if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; } },
  };
}
