import React, { useState } from 'react';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import '../Buttons/SharedButtons.css';
import './BeginModal.css';

/**
 * BeginModal: the one tap between a new visitor and the cave (docs/onboarding-plan.md §4.1).
 * It exists so a page load alone never creates an account: the silent account is made when
 * Begin is tapped. Not dismissable; "Already have a profile?" goes to the sign-in form.
 */
export default function BeginModal({ onBegin, onSignIn }) {
  const strings = useStrings();
  const [busy, setBusy] = useState(false);
  const begin = async () => {
    if (busy) return;
    setBusy(true);
    try { await onBegin(); } catch (_) { setBusy(false); }
  };
  return (
    <Modal size="small" className="begin-modal" onClose={() => {}} title={strings[0]}>
      <img className="begin-logo" src="/logo512.png" alt="" width="96" height="96" />
      <div className="shared-buttons">
        <button className="btn-basic btn-success begin-button" onClick={begin} disabled={busy}>
          {busy ? strings[4093] : strings[4096]}
        </button>
      </div>
      <p className="begin-signin">
        <a href="#" onClick={(e) => { e.preventDefault(); onSignIn(); }}>{strings[4010]}</a>
      </p>
    </Modal>
  );
}
