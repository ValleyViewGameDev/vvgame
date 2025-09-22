import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import './ProgressModal.css';

function ProgressModal({ isOpen, title, message }) {
  const [progress, setProgress] = useState(0);
  
  console.log('ProgressModal render:', { isOpen, title, message });
  
  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      return;
    }
    
    // Animate progress bar over 2 seconds minimum
    const duration = 2000; // 2 seconds
    const interval = 20; // Update every 20ms for smooth animation
    const increment = 100 / (duration / interval);
    
    const timer = setInterval(() => {
      setProgress(prev => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          return 100;
        }
        return next;
      });
    }, interval);
    
    return () => clearInterval(timer);
  }, [isOpen]);
  
  if (!isOpen) {
    console.log('ProgressModal not open, returning null');
    return null;
  }
  
  console.log('ProgressModal rendering modal with progress:', progress);
  
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
        
        <div className="progress-bar-container">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="progress-percentage">{Math.floor(progress)}%</div>
      </div>
    </Modal>
  );
}

export default ProgressModal;