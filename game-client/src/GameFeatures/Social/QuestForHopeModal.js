import React, { useState } from 'react';
import Modal from '../../UI/Modals/Modal';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import stringsEN from '../../UI/Strings/stringsEN.json';
import './QuestForHope.css';

// One mysterious hint per artifact (strings 200811-200817, 200822), keyed by the resource type so the
// Oracle's recipe order can change without the hints going to the wrong item.
const HINT_STRING = {
  "Prospero's Orb": 200811,
  "King's Crown": 200812,
  'Trident': 200813,
  'Brass Bell': 200814,
  'Phoenix Feather': 200815,
  "Vampire's Blood": 200816,
  'Scroll': 200817, // the seventh artifact until 2026-10-19
  'Brief Candle': 200822,
};

/**
 * QuestForHopeModal (backlog W-8): who to bring them to (the Oracle, string 200860), then the seven
 * artifacts she asks for, listed with their icons and names; collected ones in full colour, the rest faint. Tapping an uncollected one
 * opens a small "Hint:" modal with a riddle about where to look.
 *
 * @param {Array} items - [{ name, symbol, collected }] in the Oracle's order (from HopeQuest)
 * @param {function} onClose
 */
export default function QuestForHopeModal({ items = [], onClose }) {
  const strings = useStrings();
  const [hintFor, setHintFor] = useState(null);
  // the partly translated languages lack these keys: fall back to the English text
  const t = (id) => strings[id] || stringsEN[id] || '';
  const title = t(200801).replace(/\s*:\s*$/, '');

  return (
    <>
      <Modal onClose={onClose} title={title} className="modal-narrow quest-for-hope-modal">
        {/* where the seven go: the Oracle is the quest's end, so it is said here, not as a quest */}
        <p className="qfh-oracle">{t(200860)}</p>
        <div className="qfh-list">
          {items.map((item) => (
            <button
              key={item.name}
              type="button"
              className={`qfh-row ${item.collected ? 'collected' : 'uncollected'}`}
              onClick={item.collected ? undefined : () => setHintFor(item)}
              disabled={item.collected}
            >
              <span className="qfh-icon" aria-hidden="true">{item.symbol}</span>
              <span className="qfh-name">{getLocalizedString(item.name, strings)}</span>
              <span className="qfh-mark" aria-hidden="true">{item.collected ? '✅' : '?'}</span>
            </button>
          ))}
        </div>
        <div className="modal-buttons shared-buttons">
          <button className="btn-basic btn-modal btn-success" onClick={onClose}>{t(796)}</button>
        </div>
      </Modal>

      {hintFor && (
        <Modal size="small" onClose={() => setHintFor(null)} title={t(200803)} className="qfh-hint-modal">
          <div className="qfh-hint-icon" aria-hidden="true">{hintFor.symbol}</div>
          <p className="qfh-hint-text text-quote">{t(HINT_STRING[hintFor.name])}</p>
          <div className="modal-buttons shared-buttons">
            <button className="btn-basic btn-modal btn-success" onClick={() => setHintFor(null)}>{t(796)}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
