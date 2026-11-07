import React, { useState } from 'react';
import Modal from '../../UI/Modals/Modal';
import ResourceModalSmall from '../../UI/Modals/ResourceModalSmall';
import HelpBadge from '../../UI/Buttons/HelpBadge';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { isKey, getPlayerQuantity } from '../../Utils/InventoryManagement';
import stringsEN from '../../UI/Strings/stringsEN.json';
import './CurrenciesModal.css';

// "Where it comes from" for the currencies resources.json has no `source` for (strings 98009-98012).
// Keys have a source (the NPC who hands them over), so ResourceModalSmall describes those itself.
const SOURCE_LINE = {
  Money: 98009,
  Gem: 98010,
  'Home Deed': 98011,
  'Yellow Heart': 98012,
  'Green Heart': 98012,
  'Purple Heart': 98012,
};
const CURRENCIES = ['Money', 'Gem', 'Home Deed', 'Yellow Heart', 'Green Heart', 'Purple Heart'];

/**
 * CurrenciesModal ("Currencies & Keys", string 98008): the Inventory panel's top section spelled
 * out in two columns of compact one-line rows (icon, amount, full name, the ? badge). Every row opens
 * ResourceModalSmall with the icon, the name and where it comes from, like the Quest for Hope
 * list. Sized to fit a phone without scrolling: two columns, no paragraphs.
 * Opened from the Inventory panel (tapping its currency section, or the info button there).
 */
export default function CurrenciesModal({ inventory = [], backpack = [], masterResources = [], onClose }) {
  const strings = useStrings();
  const [infoFor, setInfoFor] = useState(null);
  // the partly translated languages lack these keys: fall back to the English text
  const t = (id) => strings[id] || stringsEN[id] || '';
  const qty = (type) => getPlayerQuantity(type, inventory, backpack);
  const def = (type) => masterResources.find((r) => r.type === type);
  const keys = masterResources.filter((r) => isKey(r.type)).map((r) => r.type); // keys + Hecate's Torch

  const row = (type) => {
    const r = def(type);
    const n = qty(type);
    return (
      <button key={type} type="button" className={`cur-row ${n ? '' : 'cur-row--none'}`} onClick={() => setInfoFor(type)}>
        <span className="cur-icon" aria-hidden="true">
          {r?.filename ? <img src={`/assets/resources/${r.filename}`} alt="" /> : (r?.symbol || '❓')}
        </span>
        {/* one line: icon, amount, name, then the ? at the right (owner 2026-11-06) */}
        <span className="cur-amount">{n.toLocaleString()}</span>
        <span className="cur-name">{getLocalizedString(type, strings)}</span>
        <HelpBadge size="sm" className="cur-mark" />
      </button>
    );
  };

  return (
    <>
      <Modal onClose={onClose} title={t(98008)} className="modal-narrow currencies-modal">
        <div className="cur-list">{CURRENCIES.map(row)}</div>
        {keys.length > 0 && <div className="cur-list cur-list--keys">{keys.map(row)}</div>}
        <div className="modal-buttons shared-buttons">
          <button className="btn-basic btn-modal btn-success" onClick={onClose}>{t(796)}</button>
        </div>
      </Modal>

      {infoFor && (
        <ResourceModalSmall
          resourceType={infoFor}
          masterResources={masterResources}
          line={SOURCE_LINE[infoFor] ? t(SOURCE_LINE[infoFor]) : undefined}
          onClose={() => setInfoFor(null)}
        />
      )}
    </>
  );
}
