/**
 * AvatarModal - the parts-based avatar editor (docs/avatar-plan.md §2.6).
 *
 * Developer scaffolding for now (slice 2 preview): opened from the Player panel's "Edit
 * Avatar" button, it composes a bust from the catalogue exactly as the game will
 * (avatarLook + avatarCompositor), with a tab per slot, swatches per colour, a blink, the
 * equipment feed (the equipped weapon and armour, and the grid kind) and Save, which writes
 * the spec to the Player through POST /api/player/avatar. The board does NOT draw it yet.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import API_BASE from '../config';
import '../UI/Modals/Modal.css';
import '../UI/Buttons/SharedButtons.css';
import './AvatarModal.css';
import { loadAvatarCatalogue } from '../Utils/TuningManager';
import { SLOT_OF_SPEC_KEY, PALETTE_OF_SPEC_KEY, partsInSlot, palette, defaultSpec, lookFor, equipFor, validateSpec, cleanSpec, withEyes } from './avatarLook';
import { renderLookDataUrl } from './avatarCompositor';
import CloseButton from '../UI/Buttons/CloseButton';

const SLOT_LABEL = { skin: 'Face', hair: 'Hair', facialHair: 'Facial hair', eyes: 'Eyes', hat: 'Hat', top: 'Clothes' };
const COLOR_LABEL = { skinTone: 'Skin tone', hairColor: 'Hair colour', eyeColor: 'Eye colour' };
const COLORS_FOR_TAB = { skin: ['skinTone'], hair: ['hairColor'], facialHair: ['hairColor'], eyes: ['eyeColor'], hat: [], top: [] };
const PREVIEW_PX = 256;

/** One composed bust as an <img>, blinking when the look has a blink frame. */
function AvatarPreview({ look, size = PREVIEW_PX, blink = true, className = '' }) {
  const [urls, setUrls] = useState({ open: null, closed: null });
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const open = await renderLookDataUrl(look.layers, { size });
      const shut = look.blinkLayers ? await renderLookDataUrl(look.blinkLayers, { size }) : null;
      if (live) setUrls({ open, closed: shut });
    })();
    return () => { live = false; };
  }, [look, size]);
  useEffect(() => {
    if (!blink || !urls.closed) return undefined;
    let t2 = null;
    const t = setInterval(() => { setClosed(true); t2 = setTimeout(() => setClosed(false), 120); }, 3000 + Math.random() * 3000);
    return () => { clearInterval(t); if (t2) clearTimeout(t2); };
  }, [blink, urls.closed]);
  const src = closed && urls.closed ? urls.closed : urls.open;
  return src ? <img className={`avatar-preview ${className}`} src={src} alt="" width={size} height={size} draggable={false} /> : <div className={`avatar-preview avatar-preview-empty ${className}`} style={{ width: size, height: size }} />;
}

export default function AvatarModal({ currentPlayer, setCurrentPlayer, masterResources, updateStatus, onClose, isDeveloper = false }) {
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
        updateStatus?.('Avatar saved (the board does not draw it yet).');
        onClose?.();
      }
    } catch (err) {
      const body = err.response?.data;
      setProblems(body?.problems || [body?.error || err.message]);
    } finally { setSaving(false); }
  };

  if (!data || !spec || !look) {
    return createPortal(
      <div className="modal-overlay"><div className="modal-container modal-large avatar-modal"><CloseButton corner onClick={onClose} /><div className="modal-title">Edit Avatar</div><p className="avatar-muted">Loading the catalogue…</p></div></div>,
      document.body,
    );
  }

  const slot = SLOT_OF_SPEC_KEY[tab];
  // "None" (no drawing) leads; the Eyes tab lists no parts (the eyes follow the face), only the colour
  const parts = tab === 'eyes' ? [] : partsInSlot(data.catalogue, slot).filter((p) => (p.tier || 'free') !== 'npc').sort((a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0));
  const tierBadge = (row) => {
    const tier = row.tier || 'free';
    if (tier !== 'paid') return null;
    const bought = (currentPlayer?.avatarParts || []).includes(row.id);
    return <span className={`avatar-badge ${bought ? 'owned' : ''}`}>{bought ? 'owned' : `${row.gemcost || '?'} 💎`}</span>;
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-container modal-large avatar-modal">
        <CloseButton corner onClick={onClose} />
        <div className="modal-title">Edit Avatar <span className="avatar-dev-tag">developer preview</span></div>

        <div className="avatar-editor">
          <div className="avatar-stage">
            <AvatarPreview look={look} />
            <div className="avatar-muted avatar-small">
              {currentPlayer?.settings?.equippedWeapon || 'no weapon'}{equip?.weaponHand ? '' : ' (no hand art)'}, {currentPlayer?.settings?.equippedArmor || 'no armour'}{equip?.armorTop ? '' : ' (no top art)'}
            </div>
          </div>

          <div className="avatar-controls">
            <div className="avatar-tabs">
              {Object.keys(SLOT_OF_SPEC_KEY).map((key) => (
                <button key={key} className={`avatar-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{SLOT_LABEL[key]}</button>
              ))}
            </div>

            {tab === 'eyes' && <div className="avatar-muted avatar-small-left">The eyes come with the face. Pick their colour.</div>}
            <div className="avatar-part-grid">
              {parts.map((row) => (
                <button key={row.id} className={`avatar-part ${spec[tab] === row.id ? 'selected' : ''}`} title={row.label || row.id} onClick={() => set(tab, row.id)}>
                  <AvatarPreview look={thumbLook(tab, row.id)} size={96} blink={false} className="avatar-thumb" />
                  <span className="avatar-part-label">{row.label || row.id}</span>
                  {tierBadge(row)}
                </button>
              ))}
            </div>

            {COLORS_FOR_TAB[tab].map((colorKey) => (
              <div key={colorKey} className="avatar-colors">
                <div className="avatar-colors-label">{COLOR_LABEL[colorKey]}</div>
                <div className="avatar-swatches">
                  {palette(data.palettes, PALETTE_OF_SPEC_KEY[colorKey]).map((sw) => (
                    <button key={sw.id} className={`avatar-swatch ${spec[colorKey] === sw.id ? 'selected' : ''}`} style={{ background: sw.hex }} title={`${sw.label || sw.id}${sw.tier === 'paid' ? ` (${sw.gemcost || '?'} gems)` : ''}`} onClick={() => set(colorKey, sw.id)}>
                      {sw.tier === 'paid' && !owned.includes(sw.id) ? <span className="avatar-swatch-lock">💎</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {problems.length > 0 && <div className="avatar-problems">{problems.join('. ')}</div>}

        <div className="shared-buttons avatar-actions">
          <button className="btn-basic btn-neutral" onClick={() => { setSpec(defaultSpec(data.catalogue, data.palettes)); dirtyRef.current = true; }}>Starter look</button>
          <button className="btn-basic btn-neutral" onClick={() => navigator.clipboard?.writeText(JSON.stringify(spec)).then(() => updateStatus?.('Avatar spec copied'))}>Copy spec</button>
          <button className="btn-basic btn-success" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
