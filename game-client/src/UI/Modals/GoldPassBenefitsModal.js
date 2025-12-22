import React from 'react';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import '../Buttons/SharedButtons.css';
import './Modal.css';

function GoldPassBenefitsModal({ isOpen, onClose }) {
  const strings = useStrings();

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={strings[10131] || "Gold Pass Benefits"} size="medium">
      <div style={{
        textAlign: 'left',
        padding: '0 10px',
        fontFamily: 'var(--font-text-1-family)',
        fontSize: 'var(--font-text-1-size)',
        color: 'var(--font-text-1-color)',
      }}>
        <h3 style={{
          textAlign: 'center',
          marginBottom: '16px',
          fontFamily: 'var(--font-title-3-family)',
          fontSize: 'var(--font-title-3-size)',
          fontWeight: 'var(--font-title-3-weight)',
          color: 'var(--font-title-3-color)',
        }}>
          {strings[9050]}
        </h3>
        <p style={{ marginBottom: '8px' }}>{strings[9051]}</p>
        <p style={{ marginBottom: '8px' }}>{strings[9052]}</p>
        <p style={{ marginBottom: '8px' }}>{strings[9053]}</p>
        <p style={{ marginBottom: '8px' }}>{strings[9054]}</p>
        <p style={{ marginBottom: '8px' }}>{strings[9055]}</p>
        <p style={{ marginBottom: '8px' }}>{strings[9056]}</p>
        <p style={{ marginBottom: '8px' }}>{strings[9057]}</p>
        <p style={{ marginBottom: '8px' }}>{strings[9058]}</p>
      </div>

      <div className="modal-buttons shared-buttons">
        <button className="btn-basic btn-success btn-modal" onClick={onClose}>
          OK
        </button>
      </div>
    </Modal>
  );
}

export default GoldPassBenefitsModal;
