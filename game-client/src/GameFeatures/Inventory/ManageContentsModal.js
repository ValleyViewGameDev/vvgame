import React, { useState, useMemo } from 'react';
import { getLocalizedString } from '../../Utils/stringLookup';
import { useStrings } from '../../UI/StringsContext';
import { isCurrency } from '../../Utils/InventoryManagement';
import './ManageContentsModal.css';
import '../../UI/Buttons/SharedButtons.css';

const ManageContentsModal = ({
  inventory,
  masterResources,
  showActions = false,
  warehouseAmounts,
  setWarehouseAmounts,
  handleAmountChange,
  handleDiscardWarehouseItem,
  // New props for backpack mode
  amounts,
  setAmounts,
  handleActionItem,
  actionButtonText,
  actionButtonClass = "btn-danger",
  isActionDisabled,
  // Props for second action button (To Backpack)
  handleSecondAction,
  secondActionButtonText,
  secondActionButtonClass = "btn-success",
  strings: passedStrings
}) => {
  const contextStrings = useStrings();
  const strings = passedStrings || contextStrings;
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  // Sort inventory data
  const sortedInventory = useMemo(() => {
    const filtered = inventory.filter(item => !isCurrency(item.type));
    
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
        case 'food':
          const aResource = masterResources.find(r => r.type === a.type);
          const bResource = masterResources.find(r => r.type === b.type);
          aValue = (aResource?.hp > 0) ? 1 : 0;
          bValue = (bResource?.hp > 0) ? 1 : 0;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [inventory, strings, sortField, sortDirection]);

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

  if (sortedInventory.length === 0) {
    return <p>{strings[76]}</p>;
  }

  return (
    <div className="manage-contents-container">
      <div className="manage-contents-header">
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort('food')} className="sortable-header">
                {getSortIcon('food')}
              </th>
              <th onClick={() => handleSort('name')} className="sortable-header">
                {strings[191] || "Item"} {getSortIcon('name')}
              </th>
              <th onClick={() => handleSort('quantity')} className="sortable-header">
                {strings[185] || "Quantity"} {getSortIcon('quantity')}
              </th>
              {showActions && (
                <>
                  <th>{strings[186] || "Amount"}</th>
                  <th>{strings[192] || "Action"}</th>
                  {handleSecondAction && <th>{strings[192] || "Action"}</th>}
                </>
              )}
            </tr>
          </thead>
        </table>
      </div>
      
      <div className="manage-contents-scroll">
        <table>
          <tbody>
            {sortedInventory.map((item, index) => {
              const resourceData = masterResources.find(r => r.type === item.type);
              const isFood = resourceData?.hp > 0;
              
              return (
                <tr key={index}>
                  <td>
                    {isFood ? `❤️‍🩹 +${resourceData.hp}` : ''}
                  </td>
                  <td>
                    {resourceData?.symbol || ''} {getLocalizedString(item.type, strings)}
                  </td>
                  <td>{item.quantity.toLocaleString()}</td>
                {showActions && (
                  <>
                    <td>
                      <div className="amount-input">
                        <button
                          onClick={() =>
                            handleAmountChange(warehouseAmounts, setWarehouseAmounts, item.type, (warehouseAmounts[item.type] || 0) - 1, item.quantity)
                          }
                          disabled={(warehouseAmounts[item.type] || 0) <= 0}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={warehouseAmounts[item.type] || 0}
                          onChange={(e) =>
                            handleAmountChange(warehouseAmounts, setWarehouseAmounts, item.type, parseInt(e.target.value, 10) || 0, item.quantity)
                          }
                        />
                        <button
                          onClick={() =>
                            handleAmountChange(warehouseAmounts, setWarehouseAmounts, item.type, (warehouseAmounts[item.type] || 0) + 1, item.quantity)
                          }
                          disabled={(warehouseAmounts[item.type] || 0) >= item.quantity}
                        >
                          +
                        </button>
                        <button
                          onClick={() =>
                            handleAmountChange(warehouseAmounts, setWarehouseAmounts, item.type, item.quantity, item.quantity)
                          }
                          style={{ marginLeft: '4px' }}
                        >
                          {strings[165]}
                        </button>
                      </div>
                    </td>
                    <td>
                      {resourceData?.category !== 'special' && (
                        <div className="shared-buttons">
                          <button
                            className={`btn-basic ${actionButtonClass || "btn-danger"} btn-mini`}
                            onClick={() => handleDiscardWarehouseItem(item)}
                            disabled={!(warehouseAmounts[item.type] > 0 && warehouseAmounts[item.type] <= item.quantity)}
                          >
                            {actionButtonText || strings[188]}
                          </button>
                        </div>
                      )}
                    </td>
                    {handleSecondAction && (
                      <td>
                        <div className="shared-buttons">
                          <button
                            className={`btn-basic ${secondActionButtonClass} btn-mini`}
                            onClick={() => handleSecondAction(item)}
                            disabled={!((amounts || warehouseAmounts)[item.type] > 0 && (amounts || warehouseAmounts)[item.type] <= item.quantity)}
                          >
                            {secondActionButtonText || strings[180]}
                          </button>
                        </div>
                      </td>
                    )}
                  </>
                )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ManageContentsModal;