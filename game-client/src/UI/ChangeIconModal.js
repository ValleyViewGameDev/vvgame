import React, { useState } from 'react';
import './ChangeIconModal.css';
import { updatePlayerIcon } from '../Authentication/ChangeIcon';

const ICON_OPTIONS = [
  { id: 'bear', label: '🐻', locked: false },
  { id: 'fox', label: '🦊', locked: false },
  { id: 'wizard', label: '🧙‍♂️', locked: true },
  { id: 'alien', label: '👽', locked: true },
  // Add more...
];

export default function ChangeIconModal({ currentPlayer, setCurrentPlayer, currentIcon, playerId, onClose, onSave }) {
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

  return (
    <div className="modal-overlay">
      <div className="icon-modal">
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <h2>Choose Your Avatar</h2>
        <div className="icon-grid">
          {ICON_OPTIONS.map(icon => (
            <button
              key={icon.id}
              className={`icon-button ${selectedIcon === icon.label ? 'selected' : ''} ${icon.locked ? 'locked' : ''}`}
              disabled={icon.locked}
              onClick={() => setSelectedIcon(icon.label)}
            >
              {icon.label}
            </button>
          ))}
        </div>
        <div className="modal-buttons">
          <button className="btn-success" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}