import API_BASE from '../config';
import Modal from './Modal';
import React, { useState } from 'react';
import './LanguagePickerModal.css';
import './SharedButtons.css';
import LANGUAGE_OPTIONS from './Languages.json';
import axios from 'axios';

export default function LanguagePickerModal({ currentPlayer, setCurrentPlayer, updateStatus, onClose, onSave }) {
  const [selectedLanguage, setSelectedLanguage] = useState(currentPlayer.language || '');

  const handleLanguageClick = (langCode) => {
    setSelectedLanguage(langCode);
  };

  const handleSave = async () => {
    try {
        const updatedPlayer = { ...currentPlayer, language: selectedLanguage };
        localStorage.setItem('player', JSON.stringify(updatedPlayer)); // 👈 THIS is the key line
        setCurrentPlayer(updatedPlayer);
        window.location.reload();
        await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer._id,
            updates: { language: selectedLanguage },
        });
        updateStatus && updateStatus('Language updated!');
        onSave && onSave();
    } catch (error) {
        console.error('Error saving language:', error);
        updateStatus && updateStatus('Failed to update language');
    }
  };

  return (
    <Modal onClose={onClose} className="modal-LanguagePicker" size="standard">
      <div className="language-modal">
        <h2>Select Your Language</h2>
        <ul className="language-list">
          {LANGUAGE_OPTIONS.map(({ code, label, flag }) => (
            <li
              key={code}
              className={`language-item ${selectedLanguage === code ? 'selected' : ''}`}
              onClick={() => handleLanguageClick(code)}
            >
              <span className="flag">{flag}</span> {label}
            </li>
          ))}
        </ul>
        <div className="modal-buttons">
          <button className="shared-button" onClick={handleSave}>Save</button>
          <button className="shared-button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}