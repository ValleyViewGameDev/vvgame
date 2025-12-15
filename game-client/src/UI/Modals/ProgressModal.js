import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import './ProgressModal.css';

function ProgressModal({ isOpen, title, message }) {
  const [frame, setFrame] = useState(0);
  const hourglassFrames = ['⏳', '⌛'];
  
  useEffect(() => {
    if (!isOpen) {
      setFrame(0);
      return;
    }
    
    // Animate hourglass every 500ms
    const timer = setInterval(() => {
      setFrame(prev => (prev + 1) % hourglassFrames.length);
    }, 500);
    
    return () => clearInterval(timer);
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // No close button during operation
      title={title}
      size="small"
      className="progress-modal"
    >
      <div className="progress-modal-content">
        <div className="progress-message">{message}</div>
        
        <div className="progress-hourglass">
          {hourglassFrames[frame]}
        </div>
      </div>
    </Modal>
  );
}

export default ProgressModal;