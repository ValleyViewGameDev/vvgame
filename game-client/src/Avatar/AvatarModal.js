/**
 * AvatarModal - the avatar editor, for every player (docs/avatar-plan.md §2.6; it replaced the
 * icon chooser 2026-11-10). Opened by Change Avatar in the Player panel and by the FTUE's avatar
 * step (`intro`). It composes the figure from the catalogue exactly as the board does
 * (avatarLook + avatarCompositor), with a tab per slot, swatches per colour, the breath and the
 * blink, and Save, which writes the spec to the Player through POST /api/player/avatar; the
 * board, the header and the panels then draw it. A player who never saves one keeps their old
 * icon. Developers also see the equipment feed, the part names and Copy spec.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import API_BASE from '../config';
import '../UI/Modals/Modal.css';
import '../UI/Buttons/SharedButtons.css';
import './AvatarModal.css';
import { loadAvatarCatalogue } from '../Utils/TuningManager';
import { SLOT_OF_SPEC_KEY, PALETTE_OF_SPEC_KEY, partsInSlot, partsFor, bodyOf, palette, defaultSpec, lookFor, equipFor, validateSpec, cleanSpec, withEyes } from './avatarLook';
import { renderLookDataUrl } from './avatarCompositor';
import { BLINK, breathLevel, breathDeform, breathingAllowed } from '../Render/PixiRenderer/breathing';
import CloseButton from '../UI/Buttons/CloseButton';
import { useStrings } from '../UI/StringsContext';

import ResourceIcon from '../UI/Icons/ResourceIcon';
// UI/Strings keys: the tabs, the colour rows and the two bodies
const SLOT_LABEL = { skin: 4131, hair: 4132, facialHair: 4133, eyes: 4134, hat: 4135, top: 4136 };
const COLOR_LABEL = { skinTone: 4137, hairColor: 4138, eyeColor: 4139 };
const BODY_LABEL = { female: 4140, male: 4141 };
const COLORS_FOR_TAB = { skin: ['skinTone'], hair: ['hairColor'], facialHair: ['hairColor'], eyes: ['eyeColor'], hat: [], top: [] };
const PREVIEW_PX = 256;
const SOURCE_PX = 512; // the composed square every view crops from

// What part of the composed figure square (512 px, the figure in its middle column) a view shows,
// as fractions of the square: the whole figure for the stage (about 1 x 2), the head for hair /
// hat / facial hair / eyes, the body below the neck for clothes (owner 2026-11-10)
const CROP = {
  figure: { x: 0.25, y: 0, w: 0.5, h: 1 },
  head: { x: 0.27, y: 0, w: 0.46, h: 0.46 },
  clothes: { x: 0.2, y: 0.3, w: 0.6, h: 0.7 },
};
// where each body's head ends (tools/art/parts.js eyes on the two faces): the breath leaves everything above it rigid
const BREATH_TOP = { female: 0.345, male: 0.294 };
const CROP_FOR_TAB = { hair: 'head', facialHair: 'head', eyes: 'head', hat: 'head', top: 'clothes' };

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

export default function AvatarModal({ currentPlayer, setCurrentPlayer, masterResources, updateStatus, onClose, onSaved, intro = null, isDeveloper = false }) {
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
      setSpec((prev) => prev || (sane ? withEyes(d.catalogue, sane) : starter));
    });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the equipment feed as the board will apply it: the equipped weapon and armour, and the
  // put-away rule for the grid the player is standing on
  const equip = useMemo(() => (data ? equipFor(currentPlayer, masterResources, currentPlayer?.location?.gtype) : null), [currentPlayer, masterResources, data]);
  const look = useMemo(() => (data && spec ? lookFor(spec, data, equip) : null), [data, spec, equip]);
  // a developer wears any part (the server allows it too); a player only what they bought
  const owned = useMemo(() => (isDeveloper && data ? [...data.catalogue, ...data.palettes].filter((r) => r.tier === 'paid').map((r) => r.id) : [...(currentPlayer?.avatarParts || [])]), [currentPlayer, isDeveloper, data]);

  const set = (key, value) => { dirtyRef.current = true; setSpec((prev) => withEyes(data.catalogue, { ...prev, [key]: value })); setProblems([]); };

  /** The thumbnail for one part: the current bust with just that slot swapped. */
  const thumbLook = (key, id) => lookFor({ ...spec, [key]: id }, data, equip);

  const handleSave = async () => {
    if (!spec || saving) return;
    const check = validateSpec(spec, data.catalogue, data.palettes, { owned });
    if (check.length) { setProblems(check); return; }
    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/api/player/avatar`, { playerId: currentPlayer.playerId || currentPlayer._id, avatar: spec });
      if (res.data?.success && res.data.player) {
        const next = { ...currentPlayer, avatar: res.data.player.avatar, avatarParts: res.data.player.avatarParts };
        localStorage.setItem('player', JSON.stringify(next));
        setCurrentPlayer?.(next);
        dirtyRef.current = false;
        updateStatus?.(strings[4144]);
        (onSaved || onClose)?.();
      }
    } catch (err) {
      // a rejected spec names its problems (a part that is not owned); anything else is "try again"
      const body = err.response?.data;
      setProblems(body?.problems || [strings[4145]]);
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
  const tierBadge = (row) => {
    const tier = row.tier || 'free';
    if (tier !== 'paid') return null;
    const bought = (currentPlayer?.avatarParts || []).includes(row.id);
    return <span className={`avatar-badge ${bought ? 'owned' : ''}`}>{bought ? strings[98016] : <>{row.gemcost || '?'} <ResourceIcon type="Gem" /></>}</span>;
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-container modal-large avatar-modal">
        <CloseButton corner onClick={onClose} />
        <div className="modal-title">{strings[4130]}</div>
        {intro && <p className="avatar-intro">{intro}</p>}

        <div className="avatar-editor">
          <div className="avatar-stage">
            <AvatarPreview look={look} crop={CROP.figure} width={128} height={256} breathe fluid className="avatar-stage-figure" breathTop={BREATH_TOP[bodyOf(data.catalogue, spec)] || undefined} />
            {isDeveloper && (
              <div className="avatar-muted avatar-small">
                {currentPlayer?.settings?.equippedWeapon || 'no weapon'}{equip?.weaponHand ? '' : ' (no hand art)'}, {currentPlayer?.settings?.equippedArmor || 'no armour'}{equip?.armorTop ? '' : ' (no top art)'}
              </div>
            )}
          </div>

          <div className="avatar-controls">
            <div className="avatar-tabs">
              {Object.keys(SLOT_OF_SPEC_KEY).map((key) => (
                <button key={key} className={`avatar-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{strings[SLOT_LABEL[key]]}</button>
              ))}
            </div>

            {/* the eyes come with the face: this tab is a close-up and the eye colours */}
            {tab === 'eyes' && <AvatarPreview look={look} className="avatar-eyes-closeup" crop={CROP.head} width={144} height={144} />}
            <div className="avatar-part-grid">
              {parts.map((row) => (
                <button key={row.id} className={`avatar-part ${spec[tab] === row.id ? 'selected' : ''}`} title={isDeveloper ? row.label || row.id : undefined} onClick={() => set(tab, row.id)}>
                  {tab === 'skin'
                    ? <span className="avatar-body-sign" aria-hidden="true">{row.body === 'male' ? '\u2642' : '\u2640'}</span>
                    : <AvatarPreview look={thumbLook(tab, row.id)} blink={false} className="avatar-thumb" crop={CROP[CROP_FOR_TAB[tab]] || CROP.head} width={72} height={72} />}
                  {/* a picture names a hairstyle or a hat better than a word; only the two bodies are told apart by one (developers see every row's catalogue name) */}
                  {tab === 'skin' ? <span className="avatar-part-label">{strings[BODY_LABEL[row.body || 'female']]}</span> : (isDeveloper ? <span className="avatar-part-label">{row.label || row.id}</span> : null)}
                  {tierBadge(row)}
                </button>
              ))}
            </div>

            {COLORS_FOR_TAB[tab].map((colorKey) => (
              <div key={colorKey} className="avatar-colors">
                <div className="avatar-colors-label">{strings[COLOR_LABEL[colorKey]]}</div>
                <div className="avatar-swatches">
                  {palette(data.palettes, PALETTE_OF_SPEC_KEY[colorKey]).map((sw) => (
                    <button key={sw.id} className={`avatar-swatch ${spec[colorKey] === sw.id ? 'selected' : ''}`} style={{ background: sw.hex }} title={isDeveloper ? sw.label || sw.id : undefined} onClick={() => set(colorKey, sw.id)}>
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
          {/* Reset: the starter look of the body being edited */}
          <button className="btn-basic btn-neutral" onClick={() => { setSpec(defaultSpec(data.catalogue, data.palettes, bodyOf(data.catalogue, spec))); setProblems([]); dirtyRef.current = true; }}>{strings[4142]}</button>
          {isDeveloper && <button className="btn-basic btn-neutral" onClick={() => navigator.clipboard?.writeText(JSON.stringify(spec)).then(() => updateStatus?.('Avatar spec copied'))}>Copy spec</button>}
          <button className="btn-basic btn-success" disabled={saving} onClick={handleSave}>{saving ? strings[4143] : strings[4102]}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
