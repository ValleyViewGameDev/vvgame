import React from 'react';
import '../../../game-client/src/UI/Modals/Modal.css';

const Modal = ({ isOpen, onClose, title, children, size = 'modal-medium' }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-container ${size}`} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
