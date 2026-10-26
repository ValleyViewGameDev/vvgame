import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import '../Buttons/SharedButtons.css';
import './LevelUpModal.css';
import { useStrings } from '../StringsContext';
import { formatCountdown } from '../Timers';
import { playCelebrationFireworks } from '../../VFX/Celebration';
import CloseButton from '../Buttons/CloseButton';

/**
 * "All Train orders filled!": the celebration when the player fills the last order on their
 * Train (NewTrain.js). Same look as the Level Up modal (level-up-modal styles) and the same
 * fireworks. The rewards are mailed at that moment; the countdown is the time left before this
 * Train departs (the loading phase's end in the stored timers), ticking every second.
 */
const TrainCompleteModal = ({ onClose }) => {
  const strings = useStrings();
  const [departsIn, setDepartsIn] = useState('');

  useEffect(() => {
    const tick = () => {
      let train = {};
      try { train = (JSON.parse(localStorage.getItem('timers')) || {}).train || {}; } catch (_) { train = {}; }
      setDepartsIn(train.phase === 'loading' && train.endTime ? formatCountdown(train.endTime, Date.now()) : '');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Fireworks as the modal lands (once, even under StrictMode's double effect)
  const celebrated = useRef(false);
  useEffect(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    playCelebrationFireworks();
  }, []);

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-container modal-narrow level-up-modal">
        <CloseButton corner onClick={onClose} />

        <div className="modal-title">🚂 {strings[2021] || 'All Train orders filled!'}</div>

        <div className="modal-content">
          <div className="level-up-message">
            📬 {strings[2022] || 'Rewards will be sent to your mailbox.'}
          </div>
          {departsIn && (
            <div className="unlocked-resources">
              {strings[2023] || 'Caravan departs in'} {departsIn}
            </div>
          )}
          <div className="shared-buttons">
            <button className="btn-basic btn-success btn-modal" onClick={onClose}>
              {strings[796] || 'OK'}
            </button>
          </div>
        </div>
      </div>
    </div>
  , document.body);
};

export default TrainCompleteModal;
