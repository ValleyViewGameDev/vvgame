import React, { useState } from 'react';
import { useStrings } from '../../UI/StringsContext';
import QuestForHopeModal from './QuestForHopeModal';
import './QuestForHope.css';

/**
 * HopeQuest Component
 *
 * A reusable component that displays the 7 boxes representing Oracle quest progress.
 * This component is pure/presentational - it does not make any API calls.
 * Uncollected slots show a very faint icon of the artifact; tapping the title or any slot opens
 * the QuestForHopeModal (list + hints, backlog W-8).
 *
 * @param {Array} inventory - Player's inventory items
 * @param {Array} backpack - Player's backpack items
 * @param {Array} masterResources - Master resources list (for symbols)
 * @param {Array} masterTraders - Master traders list (for Oracle recipe)
 * @param {boolean} showTitle - Whether to show the "Hope Quest" title (default: true)
 * @param {string} size - Size variant: 'normal' or 'small' (default: 'normal')
 */
function HopeQuest({
  inventory = [],
  backpack = [],
  masterResources = [],
  masterTraders = [],
  showTitle = true,
  size = 'normal'
}) {
  const strings = useStrings();
  const [modalOpen, setModalOpen] = useState(false);

  // Dynamically load Oracle recipe items from masterTraders
  const oracleRecipe = masterTraders?.find(trader => trader.trader === 'Oracle');
  const oracleItems = [];

  if (oracleRecipe) {
    // Extract all requires fields from the Oracle recipe
    for (let i = 1; i <= 7; i++) {
      const requiresKey = `requires${i}`;
      const qtyKey = `requires${i}qty`;
      if (oracleRecipe[requiresKey]) {
        oracleItems.push({
          name: oracleRecipe[requiresKey],
          qty: oracleRecipe[qtyKey] || 1
        });
      }
    }
  }

  // Helper to check if player has enough of the item
  const hasEnoughItems = (itemName, requiredQty) => {
    const invItem = inventory?.find(item => item?.type === itemName);
    const bpItem = backpack?.find(item => item?.type === itemName);

    // Try both 'qty' and 'quantity' for both inventory and backpack
    const invQty = invItem?.qty || invItem?.quantity || 0;
    const bpQty = bpItem?.qty || bpItem?.quantity || 0;
    const totalQty = invQty + bpQty;

    return totalQty >= requiredQty;
  };

  // Helper to get resource symbol
  const getSymbol = (itemName) => {
    const resource = masterResources?.find(r => r.type === itemName);
    return resource?.symbol || '?';
  };

  const items = oracleItems.map((item) => ({ name: item.name, symbol: getSymbol(item.name), collected: hasEnoughItems(item.name, item.qty) }));
  const open = () => setModalOpen(true);

  // Size-based styling
  const fontSize = size === 'small' ? '14px' : '20px';
  const gap = size === 'small' ? '2px' : '4px';
  const marginBottom = size === 'small' ? '8px' : '16px';

  return (
    <div className="hope-quest" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(); }}>
      {showTitle && (
        <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>
          {strings[200801]}
        </h2>
      )}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: gap,
        marginBottom: marginBottom,
        width: '100%'
      }}>
        {items.map((item, index) => {
          const playerHasItem = item.collected;

          return (
            <div key={index} style={{
              flex: 1,
              aspectRatio: '1',
              borderRadius: '4px',
              backgroundColor: playerHasItem ? 'var(--color-btn-primary)' : 'rgb(154, 106, 22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: fontSize
            }}>
              <span className={`hope-quest-slot-icon ${playerHasItem ? 'collected' : 'uncollected'}`}>{item.symbol}</span>
            </div>
          );
        })}
      </div>
      {modalOpen && (
        // the modal portals to <body>; stop its clicks bubbling back here through the React tree
        <div onClick={(e) => e.stopPropagation()}>
          <QuestForHopeModal items={items} onClose={() => setModalOpen(false)} />
        </div>
      )}
    </div>
  );
}

export default HopeQuest;
