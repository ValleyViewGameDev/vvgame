import React from 'react';
import './Modal.css';
import './SharedButtons.css';

function RevivalModal({ 
  isOpen = true, 
  onAcceptDeath, 
  onRevive, 
  reviveCost = 50,
  strings = {} 
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container modal-small">
        <h2 className="modal-title">{strings["5004"] || "💀 You have fallen!"}</h2>
        
        <div className="modal-content">
          <p className="modal-message">{strings["5070"] || "Your journey doesn't have to end here..."}</p>
          <p className="modal-message">{strings["5071"] || "Choose your fate:"}</p>

          <div className="shared-buttons">
            <button
              className="btn-basic btn-gold btn-modal"
              onClick={onRevive}
              style={{ marginRight: '10px' }}
            >
              {strings["5072"] || "Revive for"}<br />💎 {reviveCost}
            </button>

            <button
              className="btn-basic btn-danger btn-modal"
              onClick={onAcceptDeath}
            >
              {strings["5073"] || "Accept Your Death"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RevivalModal;