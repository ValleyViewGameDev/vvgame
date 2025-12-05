import React from 'react';
import { useStrings } from '../../UI/StringsContext';

/**
 * HopeQuest Component
 *
 * A reusable component that displays the 7 boxes representing Oracle quest progress.
 * This component is pure/presentational - it does not make any API calls.
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

  // Size-based styling
  const fontSize = size === 'small' ? '14px' : '20px';
  const qtyFontSize = size === 'small' ? '8px' : '10px';
  const gap = size === 'small' ? '2px' : '4px';
  const marginBottom = size === 'small' ? '8px' : '16px';

  return (
    <>
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
        {oracleItems.map((item, index) => {
          const playerHasItem = hasEnoughItems(item.name, item.qty);
          const symbol = getSymbol(item.name);

          return (
            <div key={index} style={{
              flex: 1,
              aspectRatio: '1',
              borderRadius: '4px',
              backgroundColor: playerHasItem ? '#74ee66' : 'rgb(154, 106, 22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              fontSize: fontSize
            }}>
              {playerHasItem ? symbol : ''}
              <div style={{
                position: 'absolute',
                bottom: '2px',
                right: '4px',
                fontSize: qtyFontSize,
                color: 'white',
                fontWeight: 'bold'
              }}>
                {item.qty}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default HopeQuest;
