import React, { useMemo, useState } from 'react';
import Modal from '../../UI/Modals/Modal';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { getNPCRelationship } from '../Relationships/RelationshipUtils';
import { CITIZEN_ACTIONS } from './NPCCitizenBehavior';
import './CitizenRelationshipsDebug.css';

/**
 * Developer-only "Relationships" button on every Citizen's panel (NPC panel, Farm Hand panel):
 * opens a matrix of citizen-to-citizen relationships as THIS player's world has them
 * (currentPlayer.npcRelationships, docs/citizens.md), so autonomous socializing can be watched
 * over time. Each cell is the pair's score, coloured red (rival) to green (friend), with ♥ for
 * love; grey italics = no talks yet (the static RelationshipMatrix seed); the small number is
 * how many conversations the pair has had. Default rows: citizens with a socializing state;
 * "All citizens" adds the rest.
 */
export default function CitizenRelationshipsDebug({ isDeveloper, currentPlayer, masterResources }) {
  const strings = useStrings();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const types = useMemo(() => {
    const citizens = (masterResources || []).filter((r) => r.category === 'npc' && CITIZEN_ACTIONS.includes(r.action));
    const shown = showAll ? citizens : citizens.filter((r) => Number(r.stateSocializing) > 0);
    return shown.map((r) => r.type).sort();
  }, [masterResources, showAll]);

  if (!isDeveloper) return null;

  const cell = (a, b) => {
    if (a === b) return <td key={b} className="crd-self" />;
    const rel = getNPCRelationship(currentPlayer, a, b);
    const score = Math.round(rel.relscore || 0);
    const hue = Math.max(0, Math.min(120, 60 + score * 0.6)); // -100 red .. 0 yellow .. +100 green
    return (
      <td
        key={b}
        className={`crd-cell ${rel.seeded ? 'crd-seeded' : ''}`}
        style={{ backgroundColor: `hsla(${hue}, 70%, 55%, ${rel.seeded ? 0.18 : 0.45})` }}
      >
        {rel.love ? '♥' : ''}{score}
        {rel.talks > 0 && <sup>{rel.talks}</sup>}
      </td>
    );
  };

  return (
    <>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger btn-modal-small" onClick={() => setOpen(true)}>Relationships</button>
      </div>
      {open && (
        <Modal onClose={() => setOpen(false)} title="Citizen Relationships (dev)" className="modal-xlarge citizen-rel-debug">
          <label className="crd-toggle">
            <input type="checkbox" checked={showAll} onChange={() => setShowAll(!showAll)} /> All citizens
          </label>
          <p className="crd-legend">Score -100 to 100 · ♥ love · superscript = talks · grey italics = static seed, no talks yet</p>
          <div className="crd-scroll">
            <table className="crd-table">
              <thead>
                <tr>
                  <th />
                  {types.map((t) => <th key={t} className="crd-col"><span>{getLocalizedString(t, strings)}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {types.map((a) => (
                  <tr key={a}>
                    <th className="crd-row">{getLocalizedString(a, strings)}</th>
                    {types.map((b) => cell(a, b))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}
