// Shows the server's service mode (see game-server/utils/serviceMode.js).
//  - notice: dismissable update notice, shown on every app load, to everyone.
//  - maintenance: blocking screen; developers get an "Ignore" button so they can test.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStrings } from '../StringsContext';
import stringsEN from '../Strings/stringsEN.json';
import './Modal.css';
import '../Buttons/SharedButtons.css';

function ServiceStatusModal({ status, isDeveloper, onIgnoreMaintenance }) {
  const strings = useStrings();
  const t = (id) => strings[id] ?? stringsEN[id];
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  if (!status || status.mode === 'normal') return null;

  if (status.mode === 'notice') {
    if (noticeDismissed) return null;
    return createPortal(
      <div className="modal-overlay" style={{ zIndex: 100000 }}>
        <div className="modal-container">
          <button className="modal-close-btn" onClick={() => setNoticeDismissed(true)}>&times;</button>
          <h2 className="modal-title">{t(10010)}</h2>
          <div className="modal-content">
            <p className="modal-message">{t(10011)}</p>
            {status.message && <p className="modal-message">{status.message}</p>}
            <div className="modal-buttons shared-buttons">
              <button className="btn-success" onClick={() => setNoticeDismissed(true)}>{t(10015)}</button>
            </div>
          </div>
        </div>
      </div>
    , document.body);
  }

  // maintenance
  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div className="modal-container">
        <h2 className="modal-title">{t(10012)}</h2>
        <div className="modal-content">
          <p className="modal-message">{status.message || t(10013)}</p>
          {isDeveloper && (
            <div className="modal-buttons shared-buttons">
              <button className="btn-danger" onClick={onIgnoreMaintenance}>{t(10014)}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  , document.body);
}

export default ServiceStatusModal;
