import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import '../Buttons/SharedButtons.css';
import { useStrings } from '../StringsContext';
import CloseButton from '../Buttons/CloseButton';

/**
 * "Confirm / Spend X Gems?": asked before any spend of GEM_CONFIRM_MIN gems or more.
 *
 *   if (!(await confirmGemSpend({ gems, items }))) return;
 *
 * `items` lists the other resources the same action spends ([{ symbol, name, amount }]).
 * Resolves true straight away under the threshold. One <GemSpendConfirmHost /> is mounted at
 * the app root (index.js), above every panel and modal.
 */
export const GEM_CONFIRM_MIN = 10;

let showRequest = null; // set by the mounted host

export function confirmGemSpend({ gems, items = [] }) {
  if (!(Number(gems) >= GEM_CONFIRM_MIN)) return Promise.resolve(true);
  if (!showRequest) return Promise.resolve(window.confirm(`Spend ${gems} Gems?`));
  return new Promise((resolve) => showRequest({ gems, items, resolve }));
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : n);

export const GemSpendConfirmHost = () => {
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
  const items = (request.items || []).filter((i) => i && i.amount);

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 2147482000 }}>
      <div className="modal-container modal-small">
        <CloseButton corner onClick={() => answer(false)} />
        <div className="modal-title">{strings[2026] || 'Confirm'}</div>
        <div className="modal-content">
          <p className="modal-message">💎 {(strings[2027] || 'Spend {n} Gems?').replace('{n}', fmt(request.gems))}</p>
          {items.length > 0 && (
            <div className="modal-message">
              <div>{strings[2031] || 'This also uses:'}</div>
              {items.map((i, idx) => (
                <div key={idx}>{i.symbol} {fmt(i.amount)} {i.name}</div>
              ))}
            </div>
          )}
          <div className="modal-buttons shared-buttons">
            <button className="btn-basic btn-success btn-modal" onClick={() => answer(true)}>
              {strings[2028] || 'Yes'}
            </button>
            <button className="btn-basic btn-neutral btn-modal" onClick={() => answer(false)}>
              {strings[2029] || 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
