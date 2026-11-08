import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import { isInAppBrowser } from '../../Utils/pageviewBeacon';
import { openInExternalBrowser, opensDefaultBrowser } from '../../Utils/openInBrowser';
import '../Buttons/SharedButtons.css';
import './BeginModal.css';

/**
 * BeginModal: the one tap between a new visitor and the cave (docs/onboarding-plan.md §4.1).
 * It exists so a page load alone never creates an account: the silent account is made when
 * Begin is tapped. Not dismissable; "Already have a profile?" goes to the sign-in form.
 *
 * Inside a Meta/TikTok in-app browser the primary action is "Play in Safari" (iOS) or "Play in
 * your browser" (Android, the default browser) with the
 * reason (the way back is easy to find); Begin drops to a "Play here anyway" link, and there is
 * no sign-in link (owner, 2026-11-01).
 * If the page is still showing after the hand-off, the ⋯-menu instructions, a pointer at the
 * menu and a Copy link button take over (docs/launch-checklist.md).
 */
export default function BeginModal({ onBegin, onSignIn }) {
  const strings = useStrings();
  const [busy, setBusy] = useState(false);
  const [inApp] = useState(isInAppBrowser);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  // Android opens the default browser, so its copy names none (4127-4129); iOS names Safari.
  const toDefault = opensDefaultBrowser();
  const fill = (s) => String(s || '').replace('{browser}', 'Safari');

  const begin = async () => {
    if (busy) return;
    setBusy(true);
    try { await onBegin(); } catch (_) { setBusy(false); }
  };

  const openExternal = () => {
    if (!openInExternalBrowser()) { setShowHelp(true); return; }
    // A hand-off that worked hides this page; one the in-app browser swallowed leaves it showing.
    setTimeout(() => { if (document.visibilityState === 'visible') setShowHelp(true); }, 1500);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch (_) {
      window.prompt('', window.location.href); // clipboard refused: let the player copy it by hand
    }
  };

  return (
    <Modal size="small" className="begin-modal" overlayClassName="modal-overlay--scene" onClose={() => {}} title={strings[0]}>
      <img className="begin-logo" src="/logo512.png" alt="" width="96" height="96" />
      {inApp ? (
        <>
          <p className="begin-inapp-reason">{toDefault ? strings[4128] : fill(strings[4122])}</p>
          <div className="shared-buttons">
            <button className="btn-basic btn-success begin-button" onClick={openExternal}>
              {toDefault ? strings[4127] : fill(strings[4121])}
            </button>
          </div>
          {showHelp && (
            <div className="begin-inapp-help">
              <p>{strings[4123]}</p>
              <div className="shared-buttons">
                <button className="btn-basic btn-neutral" onClick={copyLink}>{strings[4124]}</button>
              </div>
              {copied && <p className="begin-inapp-copied">{toDefault ? strings[4129] : fill(strings[4125])}</p>}
            </div>
          )}
          {showHelp && ReactDOM.createPortal(<div className="begin-inapp-pointer" aria-hidden="true">☝️</div>, document.body)}
          <p className="begin-signin begin-inapp-anyway">
            <a href="#" onClick={(e) => { e.preventDefault(); begin(); }}>{busy ? strings[4093] : strings[4126]}</a>
          </p>
        </>
      ) : (
        <>
          <div className="shared-buttons">
            <button className="btn-basic btn-success begin-button" onClick={begin} disabled={busy}>
              {busy ? strings[4093] : strings[4096]}
            </button>
          </div>
          <p className="begin-signin">
            <a href="#" onClick={(e) => { e.preventDefault(); onSignIn(); }}>{strings[4010]}</a>
          </p>
        </>
      )}
    </Modal>
  );
}
