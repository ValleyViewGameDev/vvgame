import React, { useState } from 'react';
import './ChangeIconModal.css';
import '../UI/SharedButtons.css';
import { updatePlayerIcon } from '../Authentication/ChangeIcon';
import ICON_OPTIONS from '../Authentication/PlayerIcons.json';
import { handlePurchase } from '../Store/Store';

export default function ChangeIconModal({ currentPlayer, setCurrentPlayer, updateStatus, currentIcon, playerId, onClose, onSave, setModalContent, setModalIsOpen  }) {
  const [selectedIcon, setSelectedIcon] = useState(currentIcon);

  const handleSave = async () => {
    try {
      // Save the emoji label instead of the ID
      await updatePlayerIcon(currentPlayer, setCurrentPlayer, playerId, selectedIcon);
      onSave(selectedIcon);
    } catch (err) {
      alert("Failed to update icon.");
    }
  };

  // Determine gold status
  const isGold = currentPlayer.accountStatus === 'Gold';

  // Split icons into free and paid
  const freeIcons = ICON_OPTIONS.free || [];
  const paidIcons = ICON_OPTIONS.paid || [];

  return (
    <div className="modal-overlay">
      <div className="icon-modal">
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <h2>Choose Your Avatar</h2>

        <br />

        <div className="icon-grid">
          {freeIcons.map(icon => (
            <button
              key={icon.value}
              className={`icon-button ${selectedIcon === icon.value ? 'selected' : ''}`}
              onClick={() => setSelectedIcon(icon.value)}
              disabled={false}
            >
              {icon.value}
            </button>
          ))}
        </div>

        <h3>Premium Avatars</h3>

        {!isGold && (
          <div className="standard-buttons">
            <button className="btn-purchase" onClick={() => handlePurchase(1, currentPlayer, updateStatus)}>Unlock Premium Avatars</button>
          </div>
        )}

        <div className="icon-grid">
          {paidIcons.map(icon => {
            const locked = !isGold;
            return (
              <button
                key={icon.value}
                className={`icon-button ${selectedIcon === icon.value ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                disabled={locked}
                onClick={() => {
                  if (!locked) setSelectedIcon(icon.value);
                }}
              >
                {icon.value}
              </button>
            );
          })}
        </div>


        <div className="standard-buttons">
          <button className="btn-success" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}