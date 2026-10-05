import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import { authErrorText } from '../../Authentication/authErrors';
import { trackAccountCreation } from '../../Utils/conversionTracking';
import '../Buttons/SharedButtons.css';
import './NameDeedModal.css';

/**
 * NameDeedModal: a silent account picks its name when Constable Elbow writes the Home Deed
 * (docs/onboarding-plan.md §4.2). Prefilled with the generated name so a tap-through still works;
 * the name is checked live (/check-username). On success the profile is `named`, the ad pixels
 * get their sign_up, and `onNamed()` lets the deed purchase continue.
 */
export default function NameDeedModal({ currentPlayer, setCurrentPlayer, onNamed, onCancel }) {
  const strings = useStrings();
  const [name, setName] = useState(currentPlayer?.username || '');
  const [status, setStatus] = useState({ kind: 'ok', text: '' }); // ok | checking | bad
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  useEffect(() => {
    const value = name.trim();
    if (!value || value === currentPlayer?.username) { setStatus({ kind: 'ok', text: '' }); return; }
    setStatus({ kind: 'checking', text: strings[4093] });
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await axios.post(`${API_BASE}/api/check-username`, { username: value });
        if (res.data?.available) setStatus({ kind: 'ok', text: strings[4094] });
        else setStatus({ kind: 'bad', text: authErrorText({ code: res.data?.reason }, strings, strings[4082]) });
      } catch (_) { setStatus({ kind: 'ok', text: '' }); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  const sign = async () => {
    const value = name.trim();
    if (!value) { setStatus({ kind: 'bad', text: strings[4081] }); return; }
    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/api/player/name`, { playerId: currentPlayer.playerId, username: value });
      const named = res.data?.player || {};
      const updated = { ...currentPlayer, username: named.username || value, named: true };
      setCurrentPlayer(updated);
      try { localStorage.setItem('player', JSON.stringify({ ...JSON.parse(localStorage.getItem('player') || '{}'), username: updated.username, named: true })); } catch (_) { /* storage off */ }
      trackAccountCreation(updated.username, currentPlayer.playerId);
      window.dispatchEvent(new CustomEvent('vv:named'));
      onNamed(updated);
    } catch (err) {
      setStatus({ kind: 'bad', text: authErrorText(err, strings, strings[4082]) });
      setSaving(false);
    }
  };

  return (
    <Modal size="small" className="name-deed-modal" onClose={onCancel} title={strings[4090]}>
      <p className="name-deed-question">{strings[4091]}</p>
      <input
        ref={inputRef}
        className="name-deed-input"
        type="text"
        value={name}
        maxLength={20}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && status.kind !== 'bad' && !saving) sign(); }}
      />
      <p className={`name-deed-status name-deed-status--${status.kind}`}>{status.text || '\u00a0'}</p>
      <div className="shared-buttons">
        <button className="btn-basic btn-success" onClick={sign} disabled={saving || status.kind === 'bad' || status.kind === 'checking' || !name.trim()}>
          {strings[4092]}
        </button>
      </div>
      <p className="name-deed-note">{strings[4095]}</p>
    </Modal>
  );
}
