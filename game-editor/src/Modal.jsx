// game-editor/src/Modal.jsx
import React from 'react';
import './Modal.css';

const Modal = ({ onClose, children }) => {
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-content">
          {children}
        </div>
        <button className="modal-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default Modal;