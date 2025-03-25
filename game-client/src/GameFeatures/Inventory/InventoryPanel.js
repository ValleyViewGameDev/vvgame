import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import './InventoryPanel.css';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';

function InventoryPanel({ onClose, currentPlayer, setCurrentPlayer, updateStatus }) {
  const [allResources, setAllResources] = useState([]);  
  const warehouseInventory = currentPlayer?.inventory || [];
  const backpackInventory = currentPlayer?.backpack || [];
  const warehouseCapacity = currentPlayer?.warehouseCapacity;
  const backpackCapacity = currentPlayer?.backpackCapacity;
  const [showBackpackModal, setShowBackpackModal] = useState(false);

  useEffect(() => {
    if (currentPlayer?.playerId) {
      const fetchData = async () => {
        try {
          const inventoryResponse = await axios.get(`http://localhost:3001/api/inventory/${currentPlayer.playerId}`);
          const updatedPlayer = {
            ...currentPlayer,
            inventory: inventoryResponse.data.inventory || [],
            backpack: inventoryResponse.data.backpack || [],
          };

          setCurrentPlayer(updatedPlayer);

          const resourcesResponse = await axios.get('http://localhost:3001/api/resources');
          setAllResources(resourcesResponse.data || []);
          updateStatus('Inventory loaded successfully');
        } catch (error) {
          console.error('Error fetching inventory or resources:', error);
          updateStatus('Error loading inventory');
        }
      };

      fetchData();
    }
  }, [onClose, currentPlayer?.playerId, setCurrentPlayer, updateStatus]);

  const calculateTotalQuantity = (inventory) =>
    inventory.filter((item) => item.type !== 'Money').reduce((total, item) => total + item.quantity, 0);

  // ✅ Move item to warehouse or discard it
  const handleMoveItem = async (item) => {
    const isAtHome = currentPlayer.location.g === currentPlayer.gridId;

    if (isAtHome) {
      const updatedWarehouseInventory = [...warehouseInventory];
      const existingIndex = updatedWarehouseInventory.findIndex((invItem) => invItem.type === item.type);
      if (existingIndex !== -1) {
        updatedWarehouseInventory[existingIndex].quantity += item.quantity;
      } else {
        updatedWarehouseInventory.push(item);
      }

      await axios.post('http://localhost:3001/api/update-inventory', {
        playerId: currentPlayer.playerId,
        inventory: updatedWarehouseInventory,
        backpack: backpackInventory.filter((i) => i.type !== item.type), // Remove from backpack
      });

      setCurrentPlayer((prev) => ({
        ...prev,
        inventory: updatedWarehouseInventory,
        backpack: prev.backpack.filter((i) => i.type !== item.type),
      }));

      updateStatus(`✅ Moved ${item.quantity}x ${item.type} to warehouse`);
    } else {
      await axios.post('http://localhost:3001/api/update-inventory', {
        playerId: currentPlayer.playerId,
        backpack: backpackInventory.filter((i) => i.type !== item.type),
      });

      setCurrentPlayer((prev) => ({
        ...prev,
        backpack: prev.backpack.filter((i) => i.type !== item.type),
      }));

      updateStatus(`❌ Discarded ${item.quantity}x ${item.type}`);
    }
  };

  // ✅ Move ALL items at once
  const handleMoveAll = async () => {
    const isAtHome = currentPlayer.location.g === currentPlayer.gridId;

    if (isAtHome) {
      const itemsToMove = backpackInventory.filter((item) => item.type !== "Tent");

      const updatedWarehouseInventory = [...warehouseInventory];

      itemsToMove.forEach((item) => {
        const existingIndex = updatedWarehouseInventory.findIndex((invItem) => invItem.type === item.type);
        if (existingIndex !== -1) {
            updatedWarehouseInventory[existingIndex].quantity += item.quantity;
        } else {
            updatedWarehouseInventory.push(item);
        }
     });
      // ✅ Keep only Tents in the backpack
      const updatedBackpack = backpackInventory.filter((item) => item.type === "Tent");

      await axios.post('http://localhost:3001/api/update-inventory', {
        playerId: currentPlayer.playerId,
        inventory: updatedWarehouseInventory,
        backpack: updatedBackpack,
      });

      setCurrentPlayer((prev) => ({
        ...prev,
        inventory: updatedWarehouseInventory,
        backpack: [],
      }));
      updateStatus(33);
    } else {
      await axios.post('http://localhost:3001/api/update-inventory', {
        playerId: currentPlayer.playerId,
        backpack: [],
      });
      setCurrentPlayer((prev) => ({
        ...prev,
        backpack: [],
      }));
      updateStatus(34);
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1001" titleKey="1101" panelName="InventoryPanel">
      <h3>🏚️ Warehouse</h3>
      <div className="capacity-display">Capacity: {calculateTotalQuantity(warehouseInventory)}/{warehouseCapacity}</div>

      <div className="inventory-table">
        {warehouseInventory.length > 0 ? (
          warehouseInventory.map((item, index) => (
            <div className="inventory-row" key={index}>
              <div className="inventory-cell name-cell">{item.type}</div>
              <div className="inventory-cell quantity-cell">{item.quantity}</div>
            </div>
          ))
        ) : (
          <p>Warehouse is empty.</p>
        )}
      </div>

      <hr className="inventory-divider" />

      <h3>🎒 Backpack</h3>
      <div className="capacity-display">Capacity: {calculateTotalQuantity(backpackInventory)}/{backpackCapacity}</div>

      {backpackInventory.length > 0 && (
        <button className="empty-backpack-button" onClick={() => setShowBackpackModal(true)}>
          Manage Backpack
        </button>
      )}
      <br></br>
      <br></br>
      <div className="inventory-table">
        {backpackInventory.length > 0 ? (
          backpackInventory.map((item, index) => (
            <div className="inventory-row" key={index}>
              <div className="inventory-cell name-cell">{item.type}</div>
              <div className="inventory-cell quantity-cell">{item.quantity}</div>
            </div>
          ))
        ) : (
          <p>Backpack is empty.</p>
        )}
      </div>

      {/* ✅ Backpack Management Modal */}
      {showBackpackModal && (() => {
        // ✅ Move calculations outside of `.map()` so they are computed once
        const isAtHome = currentPlayer.location.g === currentPlayer.gridId;
        const nonTentItems = backpackInventory.filter((item) => item.type !== "Tent");
        const isAddAllDisabled = isAtHome && (backpackInventory.length === 0 || nonTentItems.length === 0);

        return (
          <div className="inventory-modal">
            <button className="close-button" onClick={() => setShowBackpackModal(false)}>✖</button>
            <h3>{isAtHome ? 'Add Items to Warehouse' : 'Discard Items'}</h3>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {backpackInventory.map((item) => {
                  const isTentAtHome = isAtHome && item.type === "Tent";

                  return (
                    <tr key={item.type}>
                      <td>{item.type}</td>
                      <td>{item.quantity}</td>
                      <td>
                        <button
                          className="add-button"
                          onClick={() => handleMoveItem(item)}
                          disabled={isTentAtHome} // ✅ Disable button if Tent + at home grid
                        >
                          {isAtHome ? "Add to Warehouse" : "Discard"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <button 
              className="sell-button" 
              onClick={handleMoveAll} 
              disabled={isAddAllDisabled} // ✅ Disable if only Tents or empty
            >
              {isAtHome ? "Add All to Warehouse" : "Discard All"}
            </button>
          </div>
        );
      })()}
    </Panel>
  );
}

export default InventoryPanel;