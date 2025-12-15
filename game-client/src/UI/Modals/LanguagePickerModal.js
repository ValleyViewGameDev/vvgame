import API_BASE from '../../config';
import React, { useState } from 'react';
import './LanguagePickerModal.css';
import '../Buttons/SharedButtons.css';
import LANGUAGE_OPTIONS from '../Languages.json';
import axios from 'axios';
import { useStrings } from '../StringsContext';

// Only these languages have been localized - exported for use in CreateAccount
export const enabledLanguages = ['en', 'es', 'fr', 'de'];

export default function LanguagePickerModal({ currentPlayer, setCurrentPlayer, updateStatus, onClose, onSave }) {
  const strings = useStrings();
  const [selectedLanguage, setSelectedLanguage] = useState(currentPlayer.language || '');

  const handleLanguageClick = (langCode) => {
    if (enabledLanguages.includes(langCode)) {
      setSelectedLanguage(langCode);
    }
  };

const handleSave = async () => {
  try {
    const updatedPlayer = { ...currentPlayer, language: selectedLanguage };
    localStorage.setItem('player', JSON.stringify(updatedPlayer));
    setCurrentPlayer(updatedPlayer);

    await axios.post(`${API_BASE}/api/update-profile`, {
      playerId: currentPlayer._id,
      updates: { language: selectedLanguage },
    });

    updateStatus && updateStatus('Language updated!');
    onSave && onSave();

    // ✅ Only reload after successful DB update
    window.location.reload();
  } catch (error) {
    console.error('Error saving language:', error);
    updateStatus && updateStatus('Failed to update language');
  }
};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container modal-medium" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <div className="modal-title">{strings[130]}</div>
        <ul className="language-list">
          {LANGUAGE_OPTIONS.map(({ code, label, flag }) => {
            const isEnabled = enabledLanguages.includes(code);
            return (
              <li
                key={code}
                className={`language-item ${selectedLanguage === code ? 'selected' : ''} ${!isEnabled ? 'disabled' : ''}`}
                onClick={() => handleLanguageClick(code)}
                style={{
                  opacity: isEnabled ? 1 : 0.4,
                  cursor: isEnabled ? 'pointer' : 'not-allowed'
                }}
              >
                <span className="flag">{flag}</span> {label}
              </li>
            );
          })}
        </ul>
        <div className="modal-buttons shared-buttons">
          <button className="btn-basic btn-modal btn-success" onClick={handleSave}>{strings[131]}</button>
        </div>
      </div>
    </div>
  );
}