import React from 'react';
import './Modal.css';
import './SharedButtons.css';
import './LevelUpModal.css';
import { useStrings } from './StringsContext';

const LevelUpModal = ({ 
  isOpen, 
  onClose, 
  currentLevel, 
  previousLevel,
  updateStatus 
}) => {

  const strings = useStrings();
  
  if (!isOpen) return null;

  const handleClose = () => {
    if (updateStatus) {
      updateStatus(`Level up! You are now level ${currentLevel}!`);
    }
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container modal-medium level-up-modal">
        <button className="modal-close-btn" onClick={handleClose}>×</button>
        
        <div className="modal-title">⬆️ Level Up!</div>
        
        <div className="modal-content">
          <div className="level-up-message">
            🎉 Congratulations! You've reached level {currentLevel}! 🎉
          </div>
        
          
          <div className="shared-buttons">
            <button 
              className="btn-basic btn-success btn-modal" 
              onClick={handleClose}
            >
              {strings[360]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LevelUpModal;