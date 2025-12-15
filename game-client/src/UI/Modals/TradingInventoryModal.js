import React, { useState, useMemo } from 'react';
import { getLocalizedString } from '../../Utils/stringLookup';
import TransactionButton from '../Buttons/TransactionButton';
import { useStrings } from '../StringsContext';
import './TradingInventoryModal.css';

const TradingInventoryModal = ({
  isOpen,
  onClose,
  inventory,
  resourceData,
  amounts,
  handleAmountChange,
  handleAddToSlot,
  getSlotConfig,
  selectedSlotIndex,
  transactionKeyPrefix = 'add-to-trade-slot',
  isRequestMode = false,
  playerMoney = 0
}) => {
  const strings = useStrings();
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  // Sort inventory data
  const sortedInventory = useMemo(() => {
    const filtered = inventory.filter(item => item.type !== 'Money' && item.type !== 'Gem');
    
    return filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'name':
          aValue = getLocalizedString(a.type, strings).toLowerCase();
          bValue = getLocalizedString(b.type, strings).toLowerCase();
          break;
        case 'quantity':
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        case 'price':
          const aResource = resourceData.find(res => res.type === a.type);
          const bResource = resourceData.find(res => res.type === b.type);
          aValue = aResource?.maxprice || 0;
          bValue = bResource?.maxprice || 0;
          break;
        case 'amount':
          aValue = amounts[a.type] || 0;
          bValue = amounts[b.type] || 0;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [inventory, resourceData, amounts, strings, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '⬆️' : '⬇️';
  };

  if (!isOpen) return null;

  const slotConfig = getSlotConfig(selectedSlotIndex);

  return (
    <div className="inventory-modal wider">
      <button className="close-button" onClick={onClose}>✖</button>

      <h2>{isRequestMode ? strings[10180] : strings[160]}</h2>

      <p className="trading-modal-subtitle">
        {slotConfig.maxAmount} {isRequestMode ? strings[10181] : strings[158]}
      </p>
      
      <div className="inventory-modal-container">
        <div className="inventory-modal-header">
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('name')} className="sortable-header">
                  {strings[161]} {getSortIcon('name')}
                </th>
                <th onClick={() => handleSort('quantity')} className="sortable-header">
                  {strings[162]} {getSortIcon('quantity')}
                </th>
                <th onClick={() => handleSort('price')} className="sortable-header">
                  {strings[163]} {getSortIcon('price')}
                </th>
                <th onClick={() => handleSort('amount')} className="sortable-header">
                  {isRequestMode ? 'Amount to Request' : strings[164]} {getSortIcon('amount')}
                </th>
                <th></th>
              </tr>
            </thead>
          </table>
        </div>
        
        <div className="inventory-modal-scroll">
          <table>
            <tbody>
              {sortedInventory.map((item) => {
                const resourceDetails = resourceData.find((res) => res.type === item.type);
                const price = resourceDetails?.maxprice || 0;
                const currentAmount = amounts[item.type] || 0;
                const totalCost = currentAmount * price;

                // Calculate max affordable amount in request mode
                const maxAffordable = isRequestMode ? Math.floor(playerMoney / price) : item.quantity;
                const maxAllowed = Math.min(isRequestMode ? maxAffordable : item.quantity, slotConfig.maxAmount);

                return (
                  <tr key={item.type}>
                    <td>{resourceDetails?.symbol} {getLocalizedString(item.type, strings)}</td>
                    <td>{item.quantity}</td>
                    <td>💰 {price}</td>
                    <td>
                      <div className="amount-input">
                        <button
                          onClick={() =>
                            handleAmountChange(item.type, currentAmount - 1)
                          }
                          disabled={currentAmount <= 0}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={currentAmount}
                          onChange={(e) =>
                            handleAmountChange(item.type, parseInt(e.target.value, 10) || 0)
                          }
                        />
                        <button
                          onClick={() =>
                            handleAmountChange(item.type, currentAmount + 1)
                          }
                          disabled={currentAmount >= maxAllowed}
                        >
                          +
                        </button>
                        <button
                          onClick={() =>
                            handleAmountChange(item.type, maxAllowed)
                          }
                          style={{ marginLeft: '4px' }}
                        >
                          {strings[165]}
                        </button>
                      </div>
                    </td>
                    <td>
                      <TransactionButton
                        className="add-button"
                        onAction={(transactionId, transactionKey) =>
                          handleAddToSlot(transactionId, transactionKey, item.type)
                        }
                        transactionKey={`${transactionKeyPrefix}-${item.type}`}
                        disabled={
                          isRequestMode
                            ? !(currentAmount > 0 && totalCost <= playerMoney)
                            : !(currentAmount > 0 && currentAmount <= item.quantity)
                        }
                      >
                        {isRequestMode ? 'Request' : strings[166]}
                      </TransactionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TradingInventoryModal;