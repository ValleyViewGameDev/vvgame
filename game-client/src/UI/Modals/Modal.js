// src/UI/Modals/Modal.js
import React from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import '../Buttons/SharedButtons.css';

function Modal({ isOpen = true, onClose, title, children, custom, message, message2, size = "standard", className }) {
  if (!isOpen) return null;

  // Portal to <body> so a modal opened from inside a panel is positioned by the viewport,
  // not by the panel (phones animate panels with a transform, which would otherwise capture
  // the fixed overlay)
  return createPortal(
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
    </div>,
    document.body
  );
}

export default Modal;