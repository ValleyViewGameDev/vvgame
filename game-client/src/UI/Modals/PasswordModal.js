import React, { useState } from 'react';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import { authErrorText } from '../../Authentication/authErrors';
import { savePassword, MIN_PASSWORD_LENGTH } from '../../Authentication/savePassword';
import '../Buttons/SharedButtons.css';
import './EmailModal.css';

/**
 * PasswordModal: "Add Password", the nudge to secure a passwordless profile (owner 2026-11-11).
 * App.js shows it once when the level-up modal for level 8 or above closes (moment
 * 'passwordAsk') and after every store purchase while the profile has no password. Optional,
 * never blocks: "Maybe later" is the decline. Saving goes through the same /player/change-password
 * as Profile (Authentication/savePassword.js). Styled with the email ask's sheet (same layout).
 */
export default function PasswordModal({ currentPlayer, setCurrentPlayer, onClose }) {
  const strings = useStrings();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ kind: '', text: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) { setStatus({ kind: 'bad', text: strings[4086] }); return; }
    setSaving(true);
    try {
      await savePassword({ currentPlayer, setCurrentPlayer, newPassword: password });
      setStatus({ kind: 'ok', text: strings[4080] });
      setTimeout(() => onClose(true), 700);
    } catch (err) {
      setStatus({ kind: 'bad', text: authErrorText(err, strings, strings[4086]) });
      setSaving(false);
    }
  };

  return (
    <Modal size="small" className="email-modal password-modal" onClose={() => onClose(false)} title={strings[4148]}>
      <p className="email-modal-why">{strings[4149]}</p>
      <label className="email-modal-label" htmlFor="password-modal-input">{strings[4079]}</label>
      <input
        id="password-modal-input"
        className="email-modal-input"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !saving) save(); }}
        autoFocus
      />
      <p className={`email-modal-status email-modal-status--${status.kind}`}>{status.text || ' '}</p>
      <div className="shared-buttons email-modal-actions">
        <button className="btn-basic btn-neutral" onClick={() => onClose(false)} disabled={saving}>{strings[4101]}</button>
        <button className={`btn-basic btn-success${saving ? ' is-busy' : ''}`} onClick={save} disabled={saving || !password} aria-busy={saving}>
          {saving ? <span className="btn-spinner" /> : strings[4102]}
        </button>
      </div>
    </Modal>
  );
}
