/**
 * AvatarModal - the avatar editor, for every player (docs/avatar-plan.md §2.6; it replaced the
 * icon chooser 2026-11-10). Opened by Change Avatar in the Player panel and by the FTUE's avatar
 * step (`intro`). It composes the figure from the catalogue exactly as the board does
 * (avatarLook + avatarCompositor), with a tab per slot, swatches per colour, the breath and the
 * blink, and Save, which writes the spec to the Player through POST /api/player/avatar; the
 * board, the header and the panels then draw it. A player who has not saved one is drawn in the
 * default look (avatarLook.specFor), which is also where the editor starts.
 *
 * PAID PARTS (owner 2026-11-10): a part with `tier: paid` shows its gem price until the player
 * owns it. It can be tried on freely; while the look holds parts the player does not own, Save
 * becomes "Buy for N gems", asks (GemSpendConfirm), and the server buys them and saves the look
 * in one write (POST /api/player/avatar with `buy: true`).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import API_BASE from '../config';
import '../UI/Modals/Modal.css';
import '../UI/Panels/Panel.css'; // the tabs are the shared .tab-button row, as the Buy Deco catalogue's sub-sorts are
import '../UI/Buttons/SharedButtons.css';
import '../UI/Buttons/ResourceButton.css'; // the price is the shared gem chip (.gem-button)
import './AvatarModal.css';
import { loadAvatarCatalogue } from '../Utils/TuningManager';
import { SLOT_OF_SPEC_KEY, PALETTE_OF_SPEC_KEY, partsInSlot, partsFor, bodyOf, palette, defaultSpec, lookFor, equipFor, validateSpec, cleanSpec, withEyes, ownedBy, toBuy, randomSpec } from './avatarLook';
import { renderLookDataUrl } from './avatarCompositor';
import { BLINK, breathLevel, breathDeform, breathingAllowed } from '../Render/PixiRenderer/breathing';
import CloseButton from '../UI/Buttons/CloseButton';
import { confirmGemSpend } from '../UI/Modals/GemSpendConfirm';
import { gameAlert } from '../UI/Modals/GameDialog';
import { useStrings } from '../UI/StringsContext';

import ResourceIcon from '../UI/Icons/ResourceIcon';
// UI/Strings keys: the tabs and the colour rows (a part has no caption: its picture is its name)
const SLOT_LABEL = { skin: 4131, hair: 4132, facialHair: 4133, eyes: 4134, hat: 4135, top: 4136 };
const COLOR_LABEL = { skinTone: 4137, hairColor: 4138, eyeColor: 4139 };
// a slot's None (no hair, no beard, no hat, No Clothes: a row with no drawing, or marked `none`) is the no-entry sign, not a picture of the figure without it
const isNone = (row) => !row.file || row.none;
// the swatch rows of each tab. The Eyes tab has none: its pictures ARE the eye colours (the eyes come with the face)
const COLORS_FOR_TAB = { skin: ['skinTone'], hair: ['hairColor'], facialHair: ['hairColor'], eyes: [], hat: [], top: [] };
const PREVIEW_PX = 256;
const SOURCE_PX = 512; // the composed square every view crops from

// What part of the composed figure square (512 px, the figure in its middle column) a view shows,
// as fractions of the square: the whole figure for the stage (about 1 x 2), the head for hair /
// hat / facial hair, just the eyes for the eye colours, the body below the neck for clothes
// (owner 2026-11-10)
const CROP = {
  figure: { x: 0.25, y: 0, w: 0.5, h: 1 },
  head: { x: 0.27, y: 0, w: 0.46, h: 0.46 },
  eyes: { x: 0.42, y: 0.075, w: 0.2, h: 0.2 }, // both bodies' eyes sit inside it (female at y 0.185, male at 0.165)
  clothes: { x: 0.2, y: 0.3, w: 0.6, h: 0.7 },
};
// where each body's head ends (tools/art/parts.js eyes on the two faces): the breath leaves everything above it rigid
const BREATH_TOP = { female: 0.345, male: 0.294 };
const CROP_FOR_TAB = { hair: 'head', facialHair: 'head', eyes: 'eyes', hat: 'head', top: 'clothes' };

/**
 * The figure, breathing (owner 2026-11-10): the board's own deformation (BreathSprite.js) drawn on
 * a canvas so it can be judged up close. The composed square is drawn in thin horizontal strips;
 * each strip is lifted (a stretch pivoted at the square's bottom edge, the feet) and widened about
 * the centre line by the chest bell, at the breath level of the moment.
 */
function BreathingFigure({ src, srcClosed = null, closed = false, crop, width, height, className = '', top, fluid = false }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);       // eyes open
  const closedImgRef = useRef(null); // the blink frame, loaded once so a 130 ms blink never waits on a decode
  const closedRef = useRef(false);
  closedRef.current = closed;
  useEffect(() => {
    if (!src) return undefined;
    const img = new Image();
    img.onload = () => { imgRef.current = img; };
    img.src = src;
    return () => { img.onload = null; };
  }, [src]);
  useEffect(() => {
    closedImgRef.current = null;
    if (!srcClosed) return undefined;
    const img = new Image();
    img.onload = () => { closedImgRef.current = img; };
    img.src = srcClosed;
    return () => { img.onload = null; };
  }, [srcClosed]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    const STRIPS = 96;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const img = (closedRef.current && closedImgRef.current) || imgRef.current;
      if (!img) return;
      const L = breathingAllowed() ? breathLevel(performance.now(), 0) : 0;
      const S = img.naturalWidth;                 // the composed square, in image px
      const full = (width / crop.w) * dpr;        // the whole square, in canvas px
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < STRIPS; i++) {
        const v0 = crop.y + (crop.h * i) / STRIPS, v1 = crop.y + (crop.h * (i + 1)) / STRIPS; // fractions of the square, from its top
        // where the strip's edges and its width go (breathing.js: the head rigid, the body up, the chest out)
        const [, d0] = breathDeform(0, v0, L, top), [, d1] = breathDeform(0, v1, L, top);
        const [bulge] = breathDeform(1, (v0 + v1) / 2, L, top);
        const y0 = (d0 - crop.y) * full, y1 = (d1 - crop.y) * full;
        const dw = canvas.width * bulge;
        ctx.drawImage(img, crop.x * S, v0 * S, crop.w * S, (v1 - v0) * S, (canvas.width - dw) / 2, y0, dw, y1 - y0 + 0.75);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [crop, width, height, top]);
  // `fluid`: the stylesheet sizes the canvas (the stage is smaller on a phone); width x height is then only its bitmap
  return <canvas ref={canvasRef} className={`avatar-preview ${className}`} style={fluid ? undefined : { width, height }} />;
}

/** One composed figure as an <img>, blinking when the look has a blink frame. `crop` (a CROP entry) shows that region in a width x height box. */
function AvatarPreview({ look, size = PREVIEW_PX, blink = true, className = '', crop = null, width = null, height = null, breathe = false, breathTop, fluid = false }) {
  const [urls, setUrls] = useState({ open: null, closed: null });
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const px = crop ? SOURCE_PX : size;
      const open = await renderLookDataUrl(look.layers, { size: px });
      const shut = look.blinkLayers ? await renderLookDataUrl(look.blinkLayers, { size: px }) : null;
      if (live) setUrls({ open, closed: shut });
    })();
    return () => { live = false; };
  }, [look, size, crop]);
  useEffect(() => {
    if (!blink || !urls.closed) return undefined;
    let t2 = null;
    const t = setInterval(() => { setClosed(true); t2 = setTimeout(() => setClosed(false), BLINK.closedMs); }, BLINK.everyMs[0] + Math.random() * (BLINK.everyMs[1] - BLINK.everyMs[0]));
    return () => { clearInterval(t); if (t2) clearTimeout(t2); };
  }, [blink, urls.closed]);
  const src = closed && urls.closed ? urls.closed : urls.open;
  if (crop) {
    // the square is scaled so the crop's width fills the box, then shifted so the crop's corner is the box's
    const w = width || size, h = height || Math.round(w * (crop.h / crop.w));
    if (breathe) return <BreathingFigure src={urls.open} srcClosed={urls.closed} closed={closed} crop={crop} width={w} height={h} className={className} top={breathTop} fluid={fluid} />;
    const full = w / crop.w;
    return (
      <div className={`avatar-preview avatar-crop ${className}`} style={{ width: w, height: h }}>
        {src && <img src={src} alt="" draggable={false} style={{ width: full, height: full, left: -crop.x * full, top: -crop.y * full }} />}
      </div>
    );
  }
  return src ? <img className={`avatar-preview ${className}`} src={src} alt="" width={size} height={size} draggable={false} /> : <div className={`avatar-preview avatar-preview-empty ${className}`} style={{ width: size, height: size }} />;
}

// startRandomBody ('male' / 'female'): open on a fresh Random look of that body instead of the saved
// one, as if the player had pressed Random (the FTUE's avatar step, owner 2026-11-10)
export default function AvatarModal({ currentPlayer, setCurrentPlayer, setInventory, setBackpack, masterResources, updateStatus, onClose, onSaved, intro = null, startRandomBody = null }) {
  const strings = useStrings();
  const [data, setData] = useState(null);           // { catalogue, palettes }
  const [spec, setSpec] = useState(null);
  const [tab, setTab] = useState('skin');
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState([]);
  const dirtyRef = useRef(false);

  // Load once: App replaces `currentPlayer` often (saves, inventory), and the spec being
  // edited must not reset under the cursor.
  useEffect(() => {
    let live = true;
    loadAvatarCatalogue().then((d) => {
      if (!live) return;
      setData(d);
      // the saved spec, with any id the catalogue no longer has (a part retired since it was
      // saved) replaced by the starter look's choice for that slot
      const starter = defaultSpec(d.catalogue, d.palettes);
      const known = new Set([...d.catalogue, ...d.palettes].map((r) => r.id));
      const own = currentPlayer?.avatar && currentPlayer.avatar.skin ? cleanSpec(currentPlayer.avatar) : null;
      const sane = own ? Object.fromEntries(Object.entries(own).map(([k, v]) => [k, k === 'v' || v == null || known.has(v) ? v : starter[k]])) : null;
      if (startRandomBody) {
        dirtyRef.current = true; // as the Random button: the look is a change the player can save
        setSpec((prev) => prev || randomSpec(d.catalogue, d.palettes, Math.random, startRandomBody));
        return;
      }
      setSpec((prev) => prev || (sane ? withEyes(d.catalogue, sane) : starter));
    });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the equipment feed as the board will apply it: the equipped weapon and armour, and the
  // put-away rule for the grid the player is standing on
  const equip = useMemo(() => (data ? equipFor(currentPlayer, masterResources, currentPlayer?.location?.gtype) : null), [currentPlayer, masterResources, data]);
  const look = useMemo(() => (data && spec ? lookFor(spec, data, equip) : null), [data, spec, equip]);
  // what the player owns (bought, or already wearing), and what this look would have them buy
  const owned = useMemo(() => (data ? ownedBy(currentPlayer, data) : []), [currentPlayer, data]);
  const buying = useMemo(() => (data && spec ? toBuy(spec, data, owned) : []), [data, spec, owned]);
  const gems = buying.reduce((sum, row) => sum + (Number(row.gemcost) || 0), 0);

  const set = (key, value) => { dirtyRef.current = true; setSpec((prev) => withEyes(data.catalogue, { ...prev, [key]: value })); setProblems([]); };

  /** The thumbnail for one part: the current bust with just that slot swapped. */
  const thumbLook = (key, id) => lookFor({ ...spec, [key]: id }, data, equip);

  const handleSave = async () => {
    if (!spec || saving) return;
    const check = validateSpec(spec, data.catalogue, data.palettes, { owned: [...owned, ...buying.map((r) => r.id)] });
    if (check.length) { setProblems(check); return; }
    // the look holds parts the player does not own: this Save buys them. The server holds the gems, so it waits for the answer.
    if (buying.length && !(await confirmGemSpend({ gems, oneShot: false }))) return;
    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/api/player/avatar`, { playerId: currentPlayer.playerId || currentPlayer._id, avatar: spec, ...(buying.length ? { buy: true } : {}) });
      if (res.data?.success && res.data.player) {
        const spent = res.data.inventory ? { inventory: res.data.inventory, backpack: res.data.backpack } : {};
        const next = { ...currentPlayer, avatar: res.data.player.avatar, avatarParts: res.data.player.avatarParts, ...spent };
        localStorage.setItem('player', JSON.stringify(next));
        setCurrentPlayer?.(next);
        if (res.data.inventory) { setInventory?.(res.data.inventory); if (res.data.backpack) setBackpack?.(res.data.backpack); }
        dirtyRef.current = false;
        updateStatus?.(strings[4144]);
        (onSaved || onClose)?.();
      }
    } catch (err) {
      // a rejected spec names its problems (a part that is not owned); anything else is "try again"
      const body = err.response?.data;
      if (body?.code === 'not-enough-gems') gameAlert({ message: strings[10217] });
      else setProblems(body?.problems || [strings[4145]]);
    } finally { setSaving(false); }
  };

  if (!data || !spec || !look) {
    return createPortal(
      <div className="modal-overlay"><div className="modal-container modal-large avatar-modal"><CloseButton corner onClick={onClose} /><div className="modal-title">{strings[4130]}</div><p className="avatar-muted">{strings[3054]}</p></div></div>,
      document.body,
    );
  }

  const slot = SLOT_OF_SPEC_KEY[tab];
  // "None" (no drawing) leads; the Eyes tab lists no parts (the eyes follow the face), only the colour
  // the Face tab lists both bodies; every other tab only what the chosen face's body can wear
  const parts = tab === 'eyes' ? [] : (tab === 'skin' ? partsInSlot(data.catalogue, slot) : partsFor(data.catalogue, slot, bodyOf(data.catalogue, spec))).filter((p) => (p.tier || 'free') !== 'npc').sort((a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0));
  // a paid part shows its price until it is owned; an owned one looks like any other. The price is the
  // gem chip (UI/Buttons/ResourceButton.css .gem-button) centred on the thumbnail's bottom edge, half
  // over it, as a crafting station's slot wears its price (owner 2026-11-10)
  const priceBadge = (row) => ((row.tier || 'free') === 'paid' && !owned.includes(row.id)
    ? <span className="gem-button avatar-price"><img className="gem-button-icon" src="/assets/resources/item-gem.svg" alt="" draggable="false" /><span className="gem-button-cost">{row.gemcost}</span></span>
    : null);

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-container modal-large avatar-modal">
        <CloseButton corner onClick={onClose} />
        <div className="modal-title">{strings[4130]}</div>
        {intro && <p className="avatar-intro">{intro}</p>}

        <div className="avatar-editor">
          <div className="avatar-stage">
            <AvatarPreview look={look} crop={CROP.figure} width={128} height={256} breathe fluid className="avatar-stage-figure" breathTop={BREATH_TOP[bodyOf(data.catalogue, spec)] || undefined} />
          </div>

          <div className="avatar-controls">
            {/* the tabs: text with an underline, the shared .tab-button row (as the Buy Deco catalogue's sub-sorts) */}
            <div className="tab-navigation buy-deco-tabs avatar-tabs">
              {Object.keys(SLOT_OF_SPEC_KEY).map((key) => (
                <button key={key} className={`tab-button ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{strings[SLOT_LABEL[key]]}</button>
              ))}
            </div>

            <div className="avatar-part-grid">
              {/* the eyes come with the face, so the Eyes tab's pictures are the eye COLOURS: the same size as every other tab's, framed on the eyes alone */}
              {tab === 'eyes' && palette(data.palettes, 'eyeColor').map((sw) => (
                <button key={sw.id} className={`avatar-part ${spec.eyeColor === sw.id ? 'selected' : ''}`} onClick={() => set('eyeColor', sw.id)}>
                  <AvatarPreview look={thumbLook('eyeColor', sw.id)} blink={false} className="avatar-thumb" crop={CROP.eyes} width={72} height={72} />
                  {priceBadge(sw)}
                </button>
              ))}
              {parts.map((row) => (
                <button key={row.id} className={`avatar-part ${spec[tab] === row.id ? 'selected' : ''}`} onClick={() => set(tab, row.id)}>
                  {/* no captions (owner 2026-11-10): a body is its sign, a None the no-entry sign, every other part its picture */}
                  {tab === 'skin'
                    ? <span className="avatar-thumb avatar-sign" aria-hidden="true">{row.body === 'male' ? '\u2642' : '\u2640'}</span>
                    : isNone(row)
                      ? <span className="avatar-thumb avatar-sign avatar-sign-none" aria-hidden="true">{'\u{1F6AB}'}</span>
                      : <AvatarPreview look={thumbLook(tab, row.id)} blink={false} className="avatar-thumb" crop={CROP[CROP_FOR_TAB[tab]] || CROP.head} width={72} height={72} />}
                  {priceBadge(row)}
                </button>
              ))}
            </div>

            {COLORS_FOR_TAB[tab].map((colorKey) => (
              <div key={colorKey} className="avatar-colors">
                <div className="avatar-colors-label">{strings[COLOR_LABEL[colorKey]]}</div>
                <div className="avatar-swatches">
                  {palette(data.palettes, PALETTE_OF_SPEC_KEY[colorKey]).map((sw) => (
                    <button key={sw.id} className={`avatar-swatch ${spec[colorKey] === sw.id ? 'selected' : ''}`} style={{ background: sw.hex }} onClick={() => set(colorKey, sw.id)}>
                      {sw.tier === 'paid' && !owned.includes(sw.id) ? <span className="avatar-swatch-lock"><ResourceIcon type="Gem" /></span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {problems.length > 0 && <div className="avatar-problems">{problems.join('. ')}</div>}

        <div className="shared-buttons avatar-actions">
          {/* Random: a look from the free parts, either body, to flick through without customising */}
          <button className="btn-basic btn-neutral" onClick={() => { setSpec(randomSpec(data.catalogue, data.palettes)); setProblems([]); dirtyRef.current = true; }}>{strings[4147]}</button>
          {/* Reset: the starter look of the body being edited */}
          <button className="btn-basic btn-neutral" onClick={() => { setSpec(defaultSpec(data.catalogue, data.palettes, bodyOf(data.catalogue, spec))); setProblems([]); dirtyRef.current = true; }}>{strings[4142]}</button>
          {/* Save, or, while the look holds parts the player does not own, the gem button that buys them and saves */}
          <button className={`btn-basic ${gems ? 'btn-gold' : 'btn-success'}`} disabled={saving} onClick={handleSave}>
            {saving ? strings[4143] : gems ? <>{strings[4146]} <ResourceIcon type="Gem" /> {gems.toLocaleString()}</> : strings[4102]}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
