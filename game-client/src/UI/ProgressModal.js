import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import './ProgressModal.css';

function ProgressModal({ isOpen, title, message, onComplete, duration = 4000, minDuration = 5000 }) {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      return;
    }
    
    // Use the longer of the provided duration or minDuration
    const effectiveDuration = Math.max(duration, minDuration);
    const interval = 20; // Update every 20ms for smooth animation
    const increment = 100 / (effectiveDuration / interval);
    
    const timer = setInterval(() => {
      setProgress(prev => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          // Call onComplete callback when animation finishes
          if (onComplete) {
            setTimeout(onComplete, 100); // Small delay to show 100% briefly
          }
          return 100;
        }
        return next;
      });
    }, interval);
    
    return () => clearInterval(timer);
  }, [isOpen, onComplete, duration, minDuration]);
  
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