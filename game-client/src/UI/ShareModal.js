import React from 'react';
import { shareToNetwork, copyToClipboard } from '../Utils/share';
import { useStrings } from './StringsContext';
import './Modal.css';
import './ShareModal.css';
import './SharedButtons.css';

function ShareModal({ onClose }) {

  const strings = useStrings();
  const url = window.location.href;

  return (
    <div className="modal-overlay">
      <div className="share-modal">
        <h2>📢 Share Valley View</h2>
        <p>{strings[95]}</p>
        

        <div className="shared-buttons">
          <button className="btn-basic facebook-btn btn-modal" onClick={() => shareToNetwork('facebook', url)}>Facebook</button>
          <button className="btn-basic twitter-btn btn-modal" onClick={() => shareToNetwork('twitter', url)}>Twitter / X</button>
          <button className="btn-basic reddit-btn btn-modal" onClick={() => shareToNetwork('reddit', url)}>Reddit</button>
        </div>

        <div className="copy-link">
          <input type="text" readOnly value={url} />
          <div className="shared-buttons">
            <button className="btn-basic btn-modal-small" onClick={() => copyToClipboard(url)}>📋 Copy</button>
          </div>
        </div>

        <div className="discord-section">
          <p>and</p>
          <div className="shared-buttons">
            <button
              className="btn-basic discord-btn btn-modal"
              onClick={() => window.open('https://discord.gg/mQgRP2K9', '_blank')}
            >
              Join our Discord
            </button>
          </div>
        </div>

<br />
        <div className="shared-buttons">
          <button className="btn-basic btn-modal btn-success" onClick={onClose}>{strings[796]}</button>
        </div>

      </div>
    </div>
  );
}

export default ShareModal;