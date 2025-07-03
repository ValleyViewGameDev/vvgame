import React from 'react';
import './ShareModal.css';
import './SharedButtons.css';
import { shareToNetwork, copyToClipboard } from '../Utils/share';

function ShareModal({ onClose }) {
  const url = window.location.href;

  return (
    <div className="modal-overlay">
      <div className="share-modal">
        <h2>📢 Share Valley View</h2>
        <p>Invite others to help out and join the adventure!</p>

        <div className="share-buttons">
          <button className="facebook-btn" onClick={() => shareToNetwork('facebook', url)}>Facebook</button>
          <button className="twitter-btn" onClick={() => shareToNetwork('twitter', url)}>Twitter / X</button>
          <button className="reddit-btn" onClick={() => shareToNetwork('reddit', url)}>Reddit</button>
        </div>

        <div className="copy-link">
          <input type="text" readOnly value={url} />
          <button className="shared-button" onClick={() => copyToClipboard(url)}>📋 Copy</button>
        </div>

<br />
        <div className="standard-buttons">
          <button className="btn-success" onClick={onClose}>Close</button>
        </div>

      </div>
    </div>
  );
}

export default ShareModal;