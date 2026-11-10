import React from 'react';
import ResourceIcon from '../../UI/Icons/ResourceIcon';
import { getMasterResources } from '../../Utils/TuningManager';
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
 *
 * Quest clues (2026-11-03): a quest with a `clueKey` (questsEN.json) plays that story as the
 * reward is collected (NPCsPanel handleGetReward), and every completed quest of this giver that
 * has one is listed here after the milestone clues, under the quest's title. Nothing is stored:
 * it follows from player.completedQuests.
 */
export const DIALOG_KEYS = { met: 'dialogOnMet', friend: 'dialogOnFriend', love: 'dialogOnLove', married: 'dialogOnMarried', rival: 'dialogOnRival' };
const LABEL_KEYS = { met: 2101, friend: 2102, love: 2103, married: 2104, rival: 2105 };
const LABEL_FALLBACK = { met: 'When you met', friend: 'As friends', love: 'In love', married: 'Married', rival: 'As rivals' };

/** The completed quests of this giver that carry a clue: [{ title, clueKey }], in quests.json order. */
export function questCluesFor(npcType, allQuests, completedQuests) {
  const done = new Set((completedQuests || []).map((q) => q?.questId));
  return (allQuests || []).filter((q) => q.giver === npcType && q.clueKey && done.has(q.title)).map((q) => ({ title: q.title, clueKey: q.clueKey }));
}

/**
 * Trade clues (owner 2026-11-06): a trader offer with a `clueKey` (traders.json, e.g. Caliban's
 * Yorick's Skull) plays that story when the trade is made (NPCsPanel handleTrade), and the server
 * records `trade:<gives>` in the relationship's clues (routes/actionRoutes.js /action/npc-trade).
 * Same shape as questCluesFor, titled with the item's name: [{ title, clueKey }].
 */
export function tradeCluesFor(npcType, relationship, masterTraders, strings) {
  const earned = new Set(relationship?.clues || []);
  return (masterTraders || [])
    .filter((o) => o.trader === npcType && o.clueKey && earned.has(`trade:${o.gives}`))
    .map((o) => ({ title: getLocalizedString(o.gives, strings), clueKey: o.clueKey }));
}

/** The clues to show for an NPC: [{ status, text, label? }], "met" first, then quest clues. Empty when there are none. */
export function cluesFor(npcType, relationship, strings, username, questClues = []) {
  const fill = (raw) => raw.replace(/\{username\}/gi, username || 'Adventurer');
  const fromQuests = questClues
    .map((q) => (strings[q.clueKey] ? { status: `quest:${q.title}`, label: q.title, text: fill(strings[q.clueKey]) } : null))
    .filter(Boolean);
  const matrix = RelationshipMatrix.find((r) => r.type === npcType);
  if (!matrix || !relationship) return fromQuests;
  const earned = [...(relationship.clues || [])];
  Object.keys(DIALOG_KEYS).forEach((status) => { if (relationship[status] && !earned.includes(status)) earned.push(status); });
  const ordered = earned.includes('met') ? ['met', ...earned.filter((s) => s !== 'met')] : earned;
  return ordered
    .map((status) => {
      const id = matrix[DIALOG_KEYS[status]];
      const raw = id ? strings[id] : null;
      return raw ? { status, text: fill(raw) } : null;
    })
    .filter(Boolean)
    .concat(fromQuests);
}

export default function CluesModal({ npcType, relationship, username, questClues, onClose }) {
  const strings = useStrings();
  const clues = cluesFor(npcType, relationship, strings, username, questClues);
  const symbol = RelationshipMatrix.find((r) => r.type === npcType)?.symbol;
  const row = (getMasterResources() || []).find((r) => r.type === npcType && r.category === 'npc');
  // the head crop (ResourceIcon) before the name; the matrix glyph only when the row has no art
  const title = row && (row.iconFile || row.filename)
    ? <><ResourceIcon resource={row} size={22} className="clues-title-icon" /> {getLocalizedString(npcType, strings)}</>
    : `${symbol ? symbol + ' ' : ''}${getLocalizedString(npcType, strings)}`;
  return (
    <Modal size="narrow" className="clues-modal" onClose={onClose} title={title}>
      <h3 className="modal-subtitle">{strings[2100] || 'Clues'}</h3>
      <ol className="clues-list">
        {clues.map((c) => (
          <li key={c.status} className="clue">
            <div className="clue-label">{c.label || strings[LABEL_KEYS[c.status]] || LABEL_FALLBACK[c.status]}</div>
            {c.text.split(/\n+/).map((para, i) => <p key={i} className="clue-text text-quote">{para}</p>)}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
