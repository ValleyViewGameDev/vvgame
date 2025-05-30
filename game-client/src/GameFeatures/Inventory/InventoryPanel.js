import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import './InventoryPanel.css';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';

function InventoryPanel({ onClose, currentPlayer, setCurrentPlayer, updateStatus }) {
    const [allResources, setAllResources] = useState([]);
    // Use currentPlayer's inventory directly instead of local state
    const inventory = currentPlayer?.inventory || [];
    const backpack = currentPlayer?.backpack || [];
    const warehouseCapacity = currentPlayer?.warehouseCapacity;
    const backpackCapacity = currentPlayer?.backpackCapacity;
    const [showBackpackModal, setShowBackpackModal] = useState(false);

    // Only fetch resources once when panel opens
    useEffect(() => {
        const fetchResources = async () => {
            try {
                const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
                setAllResources(resourcesResponse.data || []);
            } catch (error) {
                console.error('Error fetching resources:', error);
            }
        };

        fetchResources();
    }, []);

    const calculateTotalQuantity = (inventory) =>
        inventory.filter((item) => item.type !== 'Money').reduce((total, item) => total + item.quantity, 0);

    const handleMoveItem = async (item) => {
        const isAtHome = currentPlayer.location.g === currentPlayer.gridId;

        try {
            if (isAtHome) {
                const updatedWarehouse = [...inventory];
                const existingIndex = updatedWarehouse.findIndex(i => i.type === item.type);
                if (existingIndex !== -1) {
                    updatedWarehouse[existingIndex].quantity += item.quantity;
                } else {
                    updatedWarehouse.push(item);
                }

                const updatedBackpack = backpack.filter(i => i.type !== item.type);

                await axios.post(`${API_BASE}/api/update-inventory`, {
                    playerId: currentPlayer.playerId,
                    inventory: updatedWarehouse,
                    backpack: updatedBackpack,
                });

                setCurrentPlayer({
                    ...currentPlayer,
                    inventory: updatedWarehouse,
                    backpack: updatedBackpack,
                });

                updateStatus(`✅ Moved ${item.quantity}x ${item.type} to warehouse`);
            } else {
                const updatedBackpack = backpack.filter(i => i.type !== item.type);

                await axios.post(`${API_BASE}/api/update-inventory`, {
                    playerId: currentPlayer.playerId,
                    backpack: updatedBackpack,
                });

                setCurrentPlayer({
                    ...currentPlayer,
                    backpack: updatedBackpack,
                });

                updateStatus(`❌ Discarded ${item.quantity}x ${item.type}`);
            }
        } catch (error) {
            console.error('Error updating inventory:', error);
        }
    };

    const handleMoveAll = async () => {
        const isAtHome = currentPlayer.location.g === currentPlayer.gridId;

        try {
            if (isAtHome) {
                const itemsToMove = backpack.filter((item) => item.type !== "Tent");

                const updatedWarehouseInventory = [...inventory];

                itemsToMove.forEach((item) => {
                    const existingIndex = updatedWarehouseInventory.findIndex((invItem) => invItem.type === item.type);
                    if (existingIndex !== -1) {
                        updatedWarehouseInventory[existingIndex].quantity += item.quantity;
                    } else {
                        updatedWarehouseInventory.push(item);
                    }
                });

                const updatedBackpack = backpack.filter((item) => item.type === "Tent");

                await axios.post(`${API_BASE}/api/update-inventory`, {
                    playerId: currentPlayer.playerId,
                    inventory: updatedWarehouseInventory,
                    backpack: updatedBackpack,
                });

                setCurrentPlayer({
                    ...currentPlayer,
                    inventory: updatedWarehouseInventory,
                    backpack: updatedBackpack,
                });

                updateStatus(`✅ Moved all items to warehouse`);
            } else {
                await axios.post(`${API_BASE}/api/update-inventory`, {
                    playerId: currentPlayer.playerId,
                    backpack: [],
                });

                setCurrentPlayer({
                    ...currentPlayer,
                    backpack: [],
                });

                updateStatus(`❌ Discarded all items`);
            }
        } catch (error) {
            console.error('Error updating inventory:', error);
        }
    };

    return (
        <Panel onClose={onClose} descriptionKey="1001" titleKey="1101" panelName="InventoryPanel">
            <h3>🎒 Backpack</h3>
            <div className="capacity-display">Capacity: {calculateTotalQuantity(backpack)}/{backpackCapacity}</div>

            {backpack.length > 0 && (
                <button className="empty-backpack-button" onClick={() => setShowBackpackModal(true)}>
                    Manage Backpack
                </button>
            )}
            <br></br>
            <br></br>
            <div className="inventory-table">
                {backpack.length > 0 ? (
                    backpack.map((item, index) => (
                        <div className="inventory-row" key={index}>
                            <div className="inventory-cell name-cell">{item.type}</div>
                            <div className="inventory-cell quantity-cell">{item.quantity.toLocaleString()}</div>
                        </div>
                    ))
                ) : (
                    <p>Backpack is empty.</p>
                )}
            </div>

            <hr className="inventory-divider" />

            <h3>🏚️ Warehouse</h3>
            <div className="capacity-display">Capacity: {calculateTotalQuantity(inventory)}/{warehouseCapacity}</div>

            <div className="inventory-table">
                {inventory.length > 0 ? (
                    inventory.map((item, index) => (
                        <div className="inventory-row" key={index}>
                            <div className="inventory-cell name-cell">{item.type}</div>
                            <div className="inventory-cell quantity-cell">{item.quantity.toLocaleString()}</div>
                        </div>
                    ))
                ) : (
                    <p>Warehouse is empty.</p>
                )}
            </div>


            {showBackpackModal && (() => {
                const isAtHome = currentPlayer.location.g === currentPlayer.gridId;
                const nonTentItems = backpack.filter((item) => item.type !== "Tent");
                const isAddAllDisabled = isAtHome && (backpack.length === 0 || nonTentItems.length === 0);

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
                                {backpack.map((item) => {
                                    const isTentAtHome = isAtHome && item.type === "Tent";

                                    return (
                                        <tr key={item.type}>
                                            <td>{item.type}</td>
                                            <td>{item.quantity.toLocaleString()}</td>
                                            <td>
                                                <button
                                                    className="add-button"
                                                    onClick={() => handleMoveItem(item)}
                                                    disabled={isTentAtHome}
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
                            disabled={isAddAllDisabled}
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