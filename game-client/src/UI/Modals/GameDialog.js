import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import '../Buttons/SharedButtons.css';
import { useStrings } from '../StringsContext';
import CloseButton from '../Buttons/CloseButton';

/**
 * The game's own confirm and alert (docs/ui-conventions.md §2): never the browser's
 * window.confirm / window.alert, which look like the OS and not like the game.
 *
 *   if (!(await gameConfirm({ message: strings[2032], confirmLabel: strings[2033], danger: true }))) return;
 *   gameAlert({ message: strings[2038] });
 *
 * Both return promises (confirm: true / false; alert: resolves when dismissed) and work from
 * anywhere, React or not. One <GameDialogHost /> is mounted at the app root (index.js), above
 * every panel and modal. Gem spends have their own confirm (GemSpendConfirm.js).
 */
let showRequest = null; // set by the mounted host

export function gameConfirm({ title, message, confirmLabel, cancelLabel, danger = false } = {}) {
  if (!showRequest) return Promise.resolve(window.confirm(message)); // only before the host mounts
  return new Promise((resolve) => showRequest({ kind: 'confirm', title, message, confirmLabel, cancelLabel, danger, resolve }));
}

export function gameAlert({ title, message, okLabel } = {}) {
  if (!showRequest) { window.alert(message); return Promise.resolve(); }
  return new Promise((resolve) => showRequest({ kind: 'alert', title, message, okLabel, resolve: () => resolve() }));
}

export const GameDialogHost = () => {
  const strings = useStrings();
  const [request, setRequest] = useState(null);

  useEffect(() => {
    showRequest = (next) => setRequest((prev) => {
      if (prev) prev.resolve(false); // a second ask replaces an unanswered one
      return next;
    });
    return () => { showRequest = null; };
  }, []);

  if (!request) return null;
  const answer = (ok) => { request.resolve(ok); setRequest(null); };
  const isConfirm = request.kind === 'confirm';

  return createPortal(
    <div className="modal-overlay game-dialog-overlay">
      <div className="modal-container modal-small game-dialog">
        <CloseButton corner onClick={() => answer(false)} />
        <div className="modal-title">{request.title || (isConfirm ? (strings[2026] || 'Confirm') : '')}</div>
        <div className="modal-content">
          <p className="modal-message">{request.message}</p>
          <div className="modal-buttons shared-buttons">
            {isConfirm && (
              <button className="btn-basic btn-neutral btn-modal" onClick={() => answer(false)}>
                {request.cancelLabel || strings[2029] || 'Cancel'}
              </button>
            )}
            <button
              className={`btn-basic ${request.danger ? 'btn-danger' : 'btn-success'} btn-modal`}
              onClick={() => answer(true)}
              autoFocus
            >
              {isConfirm ? (request.confirmLabel || strings[2028] || 'Yes') : (request.okLabel || strings[2037] || 'OK')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
