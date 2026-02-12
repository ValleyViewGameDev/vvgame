import React, { useState } from 'react';
import './ChangeIconModal.css';
import '../Buttons/SharedButtons.css';
import { updatePlayerIcon } from '../../Authentication/ChangeIcon';
import ICON_OPTIONS from '../../Authentication/PlayerIcons.json';
import { handlePurchase } from '../../Store/Store';
import { useStrings } from '../StringsContext';

// Normalize emoji by removing variation selectors (U+FE0F) for consistent matching
const normalizeEmoji = (emoji) => {
  if (!emoji) return emoji;
  return emoji.replace(/\uFE0F/g, '');
};

// Build a static lookup map from emoji value to SVG filename (created once at module load)
const iconToSvgMap = new Map();
['free', 'paid', 'platinum'].forEach(tier => {
  (ICON_OPTIONS[tier] || []).forEach(icon => {
    if (icon.filename) {
      iconToSvgMap.set(normalizeEmoji(icon.value), icon.filename);
    }
  });
});

export default function ChangeIconModal({ currentPlayer, setCurrentPlayer, updateStatus, currentIcon, playerId, onClose, onSave, setModalContent, setModalIsOpen  }) {
  const [selectedIcon, setSelectedIcon] = useState(currentIcon);
  const strings = useStrings();
  
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
      <div className="modal-container modal-medium">
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <div className="modal-title">Choose Your Avatar</div>

        <br />

        <div className="icon-grid">
          {freeIcons.map(icon => {
            const svgFilename = iconToSvgMap.get(normalizeEmoji(icon.value));
            return (
              <button
                key={icon.value}
                className={`icon-button ${selectedIcon === icon.value ? 'selected' : ''}`}
                onClick={() => setSelectedIcon(icon.value)}
                disabled={false}
              >
                {svgFilename ? (
                  <img
                    src={`/assets/playerIcons/${svgFilename}`}
                    alt={icon.label}
                    style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                  />
                ) : (
                  icon.value
                )}
              </button>
            );
          })}
        </div>

        <h3>Premium Avatars</h3>

        {!isGold && (
          <div className="shared-buttons">
            <button className="btn-basic btn-modal btn-gold" style={{ width: '240px' }} onClick={() => handlePurchase(1, currentPlayer, updateStatus)}>Unlock Premium Avatars</button>
          </div>
        )}

        <div className="icon-grid">
          {paidIcons.map(icon => {
            const locked = !isGold;
            const svgFilename = iconToSvgMap.get(normalizeEmoji(icon.value));
            return (
              <button
                key={icon.value}
                className={`icon-button ${selectedIcon === icon.value ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                disabled={locked}
                onClick={() => {
                  if (!locked) setSelectedIcon(icon.value);
                }}
              >
                {svgFilename ? (
                  <img
                    src={`/assets/playerIcons/${svgFilename}`}
                    alt={icon.label}
                    style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                  />
                ) : (
                  icon.value
                )}
              </button>
            );
          })}
        </div>


        <div className="shared-buttons">
          <button className="btn-basic btn-modal" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}