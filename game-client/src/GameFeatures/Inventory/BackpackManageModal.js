import API_BASE from '../../config';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import '../../UI/Modals/Modal.css';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { deriveWarehouseAndBackpackCapacity, isCurrency } from '../../Utils/InventoryManagement';
import ManageContentsModal from './ManageContentsModal';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import CloseButton from '../../UI/Buttons/CloseButton';

/**
 * Backpack Management: the backpack's contents with an amount per item.
 *   canSendHome: the items go to the warehouse (at home, or at a Post House in the Valley, which
 *                sends them home by the post); otherwise the action discards them.
 * Special items (keys, secrets, artifacts) always stay in the backpack. Opened from the Inventory
 * panel and, on its own with no panel, from a Post House (App.js).
 */
export default function BackpackManageModal({
  currentPlayer, setCurrentPlayer, setInventory, setBackpack, masterResources, globalTuning,
  updateStatus, canSendHome, onClose, title,
}) {
  const strings = useStrings();
  const inventory = currentPlayer?.inventory || [];
  const backpack = currentPlayer?.backpack || [];
  const [amounts, setAmounts] = useState({});
  const capacities = deriveWarehouseAndBackpackCapacity(currentPlayer, masterResources, globalTuning);
  const total = (list) => list.filter((item) => !isCurrency(item.type)).reduce((n, item) => n + item.quantity, 0);
  const isSpecial = (type) => masterResources.find((r) => r.type === type)?.category === 'special';

  const handleAmountChange = (_amounts, setter, type, value, maxValue) => {
    const clamped = Math.min(Math.max(0, value), maxValue);
    setter((prev) => ({ ...prev, [type]: clamped }));
  };

  const save = async (updatedWarehouse, updatedBackpack) => {
    await axios.post(`${API_BASE}/api/update-inventory`, {
      playerId: currentPlayer.playerId,
      ...(updatedWarehouse ? { inventory: updatedWarehouse } : {}),
      backpack: updatedBackpack,
    });
    setCurrentPlayer({ ...currentPlayer, ...(updatedWarehouse ? { inventory: updatedWarehouse } : {}), backpack: updatedBackpack });
    if (updatedWarehouse) setInventory(updatedWarehouse);
    setBackpack(updatedBackpack);
  };

  const handleMoveItem = async (item) => {
    const amount = amounts[item.type] || 0;
    if (amount <= 0) return;
    const updatedBackpack = backpack.map((i) => {
      if (i.type !== item.type) return i;
      const left = i.quantity - amount;
      return left > 0 ? { ...i, quantity: left } : null;
    }).filter(Boolean);
    try {
      if (canSendHome) {
        if (amount > capacities.warehouse - total(inventory)) { updateStatus(20); return; } // Warehouse full
        const updatedWarehouse = inventory.map((i) => ({ ...i }));
        const existing = updatedWarehouse.find((i) => i.type === item.type);
        if (existing) existing.quantity += amount; else updatedWarehouse.push({ ...item, quantity: amount });
        await save(updatedWarehouse, updatedBackpack);
        updateStatus(`Moved ${amount}x ${getLocalizedString(item.type, strings)} to warehouse`);
      } else {
        await save(null, updatedBackpack);
        updateStatus(`❌ Discarded ${amount}x ${getLocalizedString(item.type, strings)}`);
      }
    } catch (error) {
      console.error('Error updating inventory:', error);
    }
  };

  const handleMoveAll = async () => {
    const toMove = backpack.filter((item) => !isSpecial(item.type));
    const kept = backpack.filter((item) => isSpecial(item.type));
    try {
      if (canSendHome) {
        if (total(toMove) > capacities.warehouse - total(inventory)) { updateStatus(20); return; } // Warehouse full
        const updatedWarehouse = inventory.map((i) => ({ ...i }));
        for (const item of toMove) {
          const existing = updatedWarehouse.find((i) => i.type === item.type);
          if (existing) existing.quantity += item.quantity; else updatedWarehouse.push({ ...item });
        }
        await save(updatedWarehouse, kept);
        updateStatus('Moved all items to warehouse');
      } else {
        await save(null, kept);
        updateStatus('❌ Discarded all items except special items');
      }
    } catch (error) {
      console.error('Error updating inventory:', error);
    }
  };

  const nothingToMove = backpack.length === 0 || backpack.every((item) => isSpecial(item.type));

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-container modal-large">
        <CloseButton corner onClick={onClose} />
        <div className="modal-title">{title || strings[187]}</div>
        <ManageContentsModal
          inventory={backpack}
          masterResources={masterResources}
          emptyMessage={strings[77]}
          showActions={true}
          warehouseAmounts={amounts}
          setWarehouseAmounts={setAmounts}
          handleAmountChange={handleAmountChange}
          handleDiscardWarehouseItem={(item) => {
            if (isSpecial(item.type) || !(amounts[item.type] > 0 && amounts[item.type] <= item.quantity)) return;
            handleMoveItem(item);
          }}
          actionButtonText={canSendHome ? strings[196] : strings[188]}
          actionButtonClass="btn-success"
          strings={strings}
        />
        <div className="modal-buttons shared-buttons">
          <TransactionButton
            className="btn-basic btn-modal btn-success"
            onAction={handleMoveAll}
            disabled={nothingToMove}
            transactionKey={`move-all-${currentPlayer?.gridId}`}
          >
            {canSendHome ? strings[189] : strings[190]}
          </TransactionButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
