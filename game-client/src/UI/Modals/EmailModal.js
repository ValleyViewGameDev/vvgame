import React, { useRef, useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import { authErrorText } from '../../Authentication/authErrors';
import '../Buttons/SharedButtons.css';
import './EmailModal.css';

/**
 * EmailModal: the one in-game ask for an email (docs/onboarding-plan.md §4.5). Shown once,
 * after the first crop harvest (in-app browsers: right after the Home Deed), and reachable
 * again from Profile. Optional, never blocks; "Maybe later" is the decline. Saving goes
 * through /player/email, which also sends the welcome email once.
 */
export default function EmailModal({ currentPlayer, setCurrentPlayer, onClose, inApp = false, mode = 'pitch' }) {
  const strings = useStrings();
  const [email, setEmail] = useState(currentPlayer?.email || '');
  const [status, setStatus] = useState({ kind: '', text: '' });
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const save = async () => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setStatus({ kind: 'bad', text: strings[4104] }); return; }
    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/api/player/email`, { playerId: currentPlayer.playerId, email: value });
      const saved = res.data?.player || {};
      const updated = { ...currentPlayer, email: saved.email || value, email_source: 'manual', email_prompt_seen_at: saved.email_prompt_seen_at || new Date().toISOString() };
      setCurrentPlayer(updated);
      try { localStorage.setItem('player', JSON.stringify({ ...JSON.parse(localStorage.getItem('player') || '{}'), email: updated.email })); } catch (_) { /* storage off */ }
      setStatus({ kind: 'ok', text: strings[4103] });
      setTimeout(() => onClose(true), 700);
    } catch (err) {
      setStatus({ kind: 'bad', text: authErrorText(err, strings, strings[4104]) });
      setSaving(false);
    }
  };

  return (
    <Modal size="small" className="email-modal" onClose={() => onClose(false)} title={strings[4097]}>
      {mode === 'pitch' && <p className="email-modal-why">{strings[4098]}</p>}
      {inApp && <p className="email-modal-inapp">{strings[4105]}</p>}
      <label className="email-modal-label" htmlFor="email-modal-input">{strings[4100]}</label>
      <input
        id="email-modal-input"
        ref={inputRef}
        className="email-modal-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !saving) save(); }}
        autoFocus
      />
      <p className={`email-modal-status email-modal-status--${status.kind}`}>{status.text || '\u00a0'}</p>
      <div className="shared-buttons email-modal-actions">
        <button className="btn-basic btn-neutral" onClick={() => onClose(false)} disabled={saving}>{strings[4101]}</button>
        <button className="btn-basic btn-success" onClick={save} disabled={saving || !email.trim()}>{strings[4102]}</button>
      </div>
      <p className="email-modal-assurance">{strings[4099]}</p>
      <p className="email-modal-privacy"><a href="/privacy/index.html" target="_blank" rel="noopener noreferrer">{strings[4110]}</a></p>
    </Modal>
  );
}
