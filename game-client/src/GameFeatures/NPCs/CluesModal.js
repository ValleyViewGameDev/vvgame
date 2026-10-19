import React from 'react';
import Modal from '../../UI/Modals/Modal';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import RelationshipMatrix from '../Relationships/RelationshipMatrix.json';
import './CluesModal.css';

/**
 * CluesModal: the story dialogs a player has been shown with one NPC, to read again. Those
 * dialogs play once, as the relationship reaches a milestone (StoryModal from NPCsPanel.js), and
 * they carry clues, so this keeps them. The first is always the "when you met" story (it used to
 * sit in italics at the bottom of the NPC panel), then the others in the order earned.
 *
 * Which dialogs: the relationship's `clues` (status keys the server records the first time each
 * status is gained, kept even if the status is lost later; routes/playerRoutes.js
 * add-or-update-relationship-status) plus any status held now (players who met an NPC before
 * `clues` existed).
 */
export const DIALOG_KEYS = { met: 'dialogOnMet', friend: 'dialogOnFriend', love: 'dialogOnLove', married: 'dialogOnMarried', rival: 'dialogOnRival' };
const LABEL_KEYS = { met: 2101, friend: 2102, love: 2103, married: 2104, rival: 2105 };
const LABEL_FALLBACK = { met: 'When you met', friend: 'As friends', love: 'In love', married: 'Married', rival: 'As rivals' };

/** The clues to show for an NPC: [{ status, text }], "met" first. Empty when there are none. */
export function cluesFor(npcType, relationship, strings, username) {
  const matrix = RelationshipMatrix.find((r) => r.type === npcType);
  if (!matrix || !relationship) return [];
  const earned = [...(relationship.clues || [])];
  Object.keys(DIALOG_KEYS).forEach((status) => { if (relationship[status] && !earned.includes(status)) earned.push(status); });
  const ordered = earned.includes('met') ? ['met', ...earned.filter((s) => s !== 'met')] : earned;
  return ordered
    .map((status) => {
      const id = matrix[DIALOG_KEYS[status]];
      const raw = id ? strings[id] : null;
      return raw ? { status, text: raw.replace(/\{username\}/gi, username || 'Adventurer') } : null;
    })
    .filter(Boolean);
}

export default function CluesModal({ npcType, relationship, username, onClose }) {
  const strings = useStrings();
  const clues = cluesFor(npcType, relationship, strings, username);
  const symbol = RelationshipMatrix.find((r) => r.type === npcType)?.symbol;
  return (
    <Modal size="narrow" className="clues-modal" onClose={onClose} title={`${symbol ? symbol + ' ' : ''}${getLocalizedString(npcType, strings)}`}>
      <h3 className="modal-subtitle">{strings[2100] || 'Clues'}</h3>
      <ol className="clues-list">
        {clues.map((c) => (
          <li key={c.status} className="clue">
            <div className="clue-label">{strings[LABEL_KEYS[c.status]] || LABEL_FALLBACK[c.status]}</div>
            {c.text.split(/\n+/).map((para, i) => <p key={i} className="clue-text text-quote">{para}</p>)}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
