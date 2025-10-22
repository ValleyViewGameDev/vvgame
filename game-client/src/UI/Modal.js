// src/UI/Modal.js
import React from 'react';
import './Modal.css';
import './SharedButtons.css';

function Modal({ isOpen = true, onClose, title, children, custom, message, message2, size = "standard", className }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className={`modal-container ${size === "small" ? "modal-small" : ""} ${className || ""}`}>
        {/* Close Button (X style) */}
        <button className="modal-close-btn" onClick={onClose}>
          &times;
        </button>

        {title && <h2 className="modal-title">{title}</h2>}

        <div className="modal-content">
          {message && <p className="modal-message">{message}</p>}
          {message2 && <p className="modal-message">{message2}</p>}
          {children}
          {custom}
        </div>
      </div>
    </div>
  );
}

export default Modal;