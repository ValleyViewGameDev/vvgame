import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import '../../UI/Panel.css';
import '../../UI/SharedButtons.css';
import './InventoryPanel.css'; 
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { deriveWarehouseAndBackpackCapacity, isCurrency, hasRoomFor } from '../../Utils/InventoryManagement';
import { handlePurchase } from '../../Store/Store';
import ManageContentsModal from './ManageContentsModal';

function InventoryPanel({ onClose, masterResources, globalTuning, currentPlayer, setCurrentPlayer, setInventory, setBackpack, updateStatus, openPanel, setActiveStation, setModalContent, setIsModalOpen }) {

    const strings = useStrings();
    const inventory = currentPlayer?.inventory || [];
    const backpack = currentPlayer?.backpack || [];
    const baseWarehouseCapacity = currentPlayer?.warehouseCapacity || 0;
    const baseBackpackCapacity = currentPlayer?.backpackCapacity || 0;
    const [showBackpackModal, setShowBackpackModal] = useState(false);
    const [showWarehouseModal, setShowWarehouseModal] = useState(false);
    const [inventorySortField, setInventorySortField] = useState('name');
    const [inventorySortDirection, setInventorySortDirection] = useState('asc');
    const [backpackSortField, setBackpackSortField] = useState('name');
    const [backpackSortDirection, setBackpackSortDirection] = useState('asc');
    const [backpackAmounts, setBackpackAmounts] = useState({}); // Store amounts per resource for backpack
    const [warehouseAmounts, setWarehouseAmounts] = useState({}); // Store amounts per resource for warehouse
    const hasBackpackSkill = currentPlayer?.skills?.some(item => item.type === 'Backpack');
    const finalCapacities = deriveWarehouseAndBackpackCapacity(currentPlayer, masterResources, globalTuning);
    
    // Get Gold bonuses from globalTuning prop
    const warehouseGoldBonus = globalTuning?.warehouseCapacityGold || 100000;
    const backpackGoldBonus = globalTuning?.backpackCapacityGold || 5000;
    
    const calculateTotalQuantity = (inventory) =>
        inventory.filter((item) => !isCurrency(item.type)).reduce((total, item) => total + item.quantity, 0);
    
    // Inventory sorting functions
    const handleInventorySort = (field) => {
        if (inventorySortField === field) {
            setInventorySortDirection(inventorySortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setInventorySortField(field);
            setInventorySortDirection('asc');
        }
    };

    const getInventorySortIcon = (field) => {
        if (inventorySortField !== field) return '↕️';
        return inventorySortDirection === 'asc' ? '⬆️' : '⬇️';
    };

    const getSortedInventory = () => {
        const filtered = inventory.filter(item => !isCurrency(item.type));
        
        return filtered.sort((a, b) => {
            let aValue, bValue;
            
            switch (inventorySortField) {
                case 'name':
                    aValue = getLocalizedString(a.type, strings).toLowerCase();
                    bValue = getLocalizedString(b.type, strings).toLowerCase();
                    break;
                case 'quantity':
                    aValue = a.quantity;
                    bValue = b.quantity;
                    break;
                default:
                    return 0;
            }
            
            if (aValue < bValue) return inventorySortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return inventorySortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    };

    // Backpack sorting functions
    const handleBackpackSort = (field) => {
        if (backpackSortField === field) {
            setBackpackSortDirection(backpackSortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setBackpackSortField(field);
            setBackpackSortDirection('asc');
        }
    };

    const getBackpackSortIcon = (field) => {
        if (backpackSortField !== field) return '↕️';
        return backpackSortDirection === 'asc' ? '⬆️' : '⬇️';
    };

    const getSortedBackpack = () => {
        const filtered = backpack.filter(item => !isCurrency(item.type));
        
        return filtered.sort((a, b) => {
            let aValue, bValue;
            
            switch (backpackSortField) {
                case 'name':
                    aValue = getLocalizedString(a.type, strings).toLowerCase();
                    bValue = getLocalizedString(b.type, strings).toLowerCase();
                    break;
                case 'quantity':
                    aValue = a.quantity;
                    bValue = b.quantity;
                    break;
                default:
                    return 0;
            }
            
            if (aValue < bValue) return backpackSortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return backpackSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const handleAmountChange = (amounts, setAmounts, type, value, maxValue) => {
        const clampedValue = Math.min(Math.max(0, value), maxValue);
        setAmounts((prev) => ({
            ...prev,
            [type]: clampedValue,
        }));
    };


    const handleMoveItem = async (item) => {
        const isAtHome = currentPlayer.location.g === currentPlayer.gridId;
        const amount = backpackAmounts[item.type] || 0;
        
        if (amount <= 0) return;

        try {
            if (isAtHome) {
                // Check warehouse capacity before moving
                const currentWarehouseUsage = calculateTotalQuantity(inventory);
                const spaceAvailable = finalCapacities.warehouse - currentWarehouseUsage;
                
                if (amount > spaceAvailable) {
                    updateStatus(20); // Warehouse full message
                    return;
                }
                
                const updatedWarehouse = [...inventory];
                const existingIndex = updatedWarehouse.findIndex(i => i.type === item.type);
                if (existingIndex !== -1) {
                    updatedWarehouse[existingIndex].quantity += amount;
                } else {
                    updatedWarehouse.push({ ...item, quantity: amount });
                }

                const updatedBackpack = backpack.map(i => {
                    if (i.type === item.type) {
                        const newQuantity = i.quantity - amount;
                        return newQuantity > 0 ? { ...i, quantity: newQuantity } : null;
                    }
                    return i;
                }).filter(Boolean);

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
                
                // Also update parent component's state
                setInventory(updatedWarehouse);
                setBackpack(updatedBackpack);

                updateStatus(`Moved ${amount}x ${getLocalizedString(item.type, strings)} to warehouse`);
            } else {
                const updatedBackpack = backpack.map(i => {
                    if (i.type === item.type) {
                        const newQuantity = i.quantity - amount;
                        return newQuantity > 0 ? { ...i, quantity: newQuantity } : null;
                    }
                    return i;
                }).filter(Boolean);

                await axios.post(`${API_BASE}/api/update-inventory`, {
                    playerId: currentPlayer.playerId,
                    backpack: updatedBackpack,
                });

                setCurrentPlayer({
                    ...currentPlayer,
                    backpack: updatedBackpack,
                });
                
                // Also update parent component's state
                setBackpack(updatedBackpack);

                updateStatus(`❌ Discarded ${amount}x ${getLocalizedString(item.type, strings)}`);
            }
        } catch (error) {
            console.error('Error updating inventory:', error);
        }
    };

    const handleMoveAll = async () => {
        const isAtHome = currentPlayer.location.g === currentPlayer.gridId;

        try {
            if (isAtHome) {
                const itemsToMove = backpack.filter((item) => item.type !== "Tent" && item.type !== "Boat");
                
                // Calculate total quantity to move
                const totalToMove = itemsToMove.reduce((sum, item) => sum + item.quantity, 0);
                const currentWarehouseUsage = calculateTotalQuantity(inventory);
                const spaceAvailable = finalCapacities.warehouse - currentWarehouseUsage;
                
                if (totalToMove > spaceAvailable) {
                    updateStatus(20); // Warehouse full message
                    return;
                }

                const updatedWarehouseInventory = [...inventory];

                itemsToMove.forEach((item) => {
                    const existingIndex = updatedWarehouseInventory.findIndex((invItem) => invItem.type === item.type);
                    if (existingIndex !== -1) {
                        updatedWarehouseInventory[existingIndex].quantity += item.quantity;
                    } else {
                        updatedWarehouseInventory.push(item);
                    }
                });

                const updatedBackpack = backpack.filter((item) => item.type === "Tent" || item.type === "Boat");

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
                
                // Also update parent component's state
                setInventory(updatedWarehouseInventory);
                setBackpack(updatedBackpack);

                updateStatus(`Moved all items to warehouse`);
            } else {
                // When not at home, discard all items except Tent and Boat
                const itemsToKeep = backpack.filter((item) => item.type === "Tent" || item.type === "Boat");
                
                await axios.post(`${API_BASE}/api/update-inventory`, {
                    playerId: currentPlayer.playerId,
                    backpack: itemsToKeep,
                });

                setCurrentPlayer({
                    ...currentPlayer,
                    backpack: itemsToKeep,
                });
                
                // Also update parent component's state
                setBackpack(itemsToKeep);

                updateStatus(`❌ Discarded all items except Tent and Boat`);
            }
        } catch (error) {
            console.error('Error updating inventory:', error);
        }
    };

    const handleDiscardWarehouseItem = async (item) => {
        try {
            const amount = warehouseAmounts[item.type] || 0;
            
            if (amount <= 0) return;
            
            const updatedWarehouse = inventory.map(i => {
                if (i.type === item.type) {
                    const newQuantity = i.quantity - amount;
                    return newQuantity > 0 ? { ...i, quantity: newQuantity } : null;
                }
                return i;
            }).filter(Boolean);

            await axios.post(`${API_BASE}/api/update-inventory`, {
                playerId: currentPlayer.playerId,
                inventory: updatedWarehouse,
            });

            setCurrentPlayer({
                ...currentPlayer,
                inventory: updatedWarehouse,
            });
            
            // Also update parent component's state
            setInventory(updatedWarehouse);

            updateStatus(`❌ Discarded ${amount}x ${getLocalizedString(item.type, strings)}`);
        } catch (error) {
            console.error('Error updating inventory:', error);
        }
    };

    const handleDiscardAllWarehouse = async () => {
        try {
            await axios.post(`${API_BASE}/api/update-inventory`, {
                playerId: currentPlayer.playerId,
                inventory: [],
            });

            setCurrentPlayer({
                ...currentPlayer,
                inventory: [],
            });
            
            // Also update parent component's state
            setInventory([]);

            updateStatus(`❌ Discarded all warehouse items`);
            setShowWarehouseModal(false);
        } catch (error) {
            console.error('Error updating inventory:', error);
        }
    };

    const handleTransferToBackpack = async (item) => {
        try {
            const amount = warehouseAmounts[item.type] || 0;
            
            if (amount <= 0) return;

            // Check backpack capacity before transferring
            const hasRoom = hasRoomFor({
                resource: item.type,
                quantity: amount,
                currentPlayer,
                inventory,
                backpack,
                masterResources,
                globalTuning
            });
            
            if (!hasRoom) {
                const currentBackpackUsage = calculateTotalQuantity(backpack);
                const spaceAvailable = finalCapacities.backpack - currentBackpackUsage;
                updateStatus(`❌ Insufficient backpack capacity. Need ${amount - spaceAvailable} more slots.`);
                return;
            }

            // Call the new transfer API
            const response = await axios.post(`${API_BASE}/api/transfer-inventory`, {
                playerId: currentPlayer.playerId,
                transfers: [{ itemType: item.type, quantity: amount }],
                direction: 'warehouse-to-backpack'
            });

            if (response.data.success) {
                // Update local state with the response data
                setCurrentPlayer({
                    ...currentPlayer,
                    inventory: response.data.inventory,
                    backpack: response.data.backpack,
                });
                
                // Also update parent component's state
                setInventory(response.data.inventory);
                setBackpack(response.data.backpack);

                // Reset the amount for this item
                setWarehouseAmounts(prev => ({
                    ...prev,
                    [item.type]: 0
                }));

                updateStatus(`✅ Moved ${amount}x ${getLocalizedString(item.type, strings)} to backpack`);
            }
        } catch (error) {
            console.error('Error transferring to backpack:', error);
            if (error.response?.data?.error) {
                updateStatus(`❌ ${error.response.data.error}`);
            } else {
                updateStatus('❌ Transfer failed. Please try again.');
            }
        }
    };

    return (
        <Panel onClose={onClose} descriptionKey="1001" titleKey="1101" panelName="InventoryPanel">
            

            {/* CURRENCIES */}
            <div className="currency-section">
                <div className="currency-display">
                    {/* Column 1: Money and Gems */}
                    <div className="currency-column">
                        <div className="currency-item">
                            <span className="currency-emoji">💰</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Money')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                        <div className="currency-item">
                            <span className="currency-emoji">💎</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Gem')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                    </div>
                    {/* Column 2: Hearts */}
                    <div className="currency-column">
                        <div className="currency-item">
                            <span className="currency-emoji">💛</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Yellow Heart')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                        <div className="currency-item">
                            <span className="currency-emoji">💚</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Green Heart')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                        <div className="currency-item">
                            <span className="currency-emoji">💜</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Purple Heart')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                    </div>
                </div>
            </div>

            <hr className="inventory-divider" />

            {/* Gold Pass info for non-Gold users */}
            {currentPlayer.accountStatus !== 'Gold' && (
                <>
                    <div className="gold-pass-info">
                        {strings[199]}
                    </div>
                    <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '20px' }}>
                        <button 
                            className="btn-basic btn-gold"
                            onClick={() => handlePurchase(1, currentPlayer, updateStatus)}
                        >
                            {strings[9061]}
                        </button>
                    </div>
                </>
            )}


            {/* BACKPACK */}

            <h3>{strings[182]}</h3>

            {hasBackpackSkill ? (
              <>
                <div className="capacity-display">
                    {strings[183]} {calculateTotalQuantity(backpack)}/
                    <span style={currentPlayer?.accountStatus === "Gold" ? {color: "#B8860B"} : {}}>
                        {finalCapacities.backpack}
                    </span>
                    {currentPlayer?.accountStatus === "Gold" && (
                        <div style={{fontSize: "12px", color: "#666", marginTop: "2px"}}>
                            (+{backpackGoldBonus.toLocaleString()} {strings[89] || "additional capacity for Gold Pass"})
                        </div>
                    )}
                </div>

                {backpack.length > 0 && (
                <div className="shared-buttons">
                    <button className="btn-basic" onClick={() => setShowBackpackModal(true)}>
                    {strings[184]}
                    </button>
                </div>
                )}
                <div className="backpack-table-container" style={{height: 'auto', maxHeight: '300px'}}>
                    {backpack.filter(item => !isCurrency(item.type)).length > 0 ? (
                        <>
                            <div className="backpack-table-header">
                                <table>
                                    <thead>
                                        <tr>
                                            <th onClick={() => handleBackpackSort('name')} className="sortable-header">
                                                {strings[191] || "Item"} {getBackpackSortIcon('name')}
                                            </th>
                                            <th onClick={() => handleBackpackSort('quantity')} className="sortable-header">
                                                {strings[185] || "Quantity"} {getBackpackSortIcon('quantity')}
                                            </th>
                                        </tr>
                                    </thead>
                                </table>
                            </div>
                            <div className="backpack-table-scroll">
                                <table>
                                    <tbody>
                                        {getSortedBackpack().map((item, index) => (
                                            <tr key={index}>
                                                <td>{masterResources.find(r => r.type === item.type)?.symbol || ''} {getLocalizedString(item.type, strings)}</td>
                                                <td>{item.quantity.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <p>{strings[77]}</p>
                    )}
                </div>
              </>
            ) : (
              <div className="capacity-display">{strings[75]}</div>
            )}

            <hr className="inventory-divider" />

            {/* WAREHOUSE */}

            <h3>{strings[181]}</h3>

            <div className="capacity-display">
                {strings[183]} {calculateTotalQuantity(inventory)}/
                <span style={currentPlayer?.accountStatus === "Gold" ? {color: "#B8860B"} : {}}>
                    {finalCapacities.warehouse}
                </span>
                {currentPlayer?.accountStatus === "Gold" && (
                    <div style={{fontSize: "12px", color: "#666", marginTop: "2px"}}>
                        (+{warehouseGoldBonus.toLocaleString()} {strings[89] || "additional capacity for Gold Pass"})
                    </div>
                )}
            </div>

            <div className="shared-buttons">
                <button className="btn-basic btn-success" onClick={() => {
                    onClose();
                    setTimeout(() => {
                        openPanel('WarehousePanel');
                    }, 0);
                }}>
                {strings[194]}
                </button>
            </div>

            {inventory.length > 0 && (
            <div className="shared-buttons">
                <button className="btn-basic" onClick={() => setShowWarehouseModal(true)}>
                {strings[184]}
                </button>
            </div>
            )}

            {/* INGREDIENT LIST */}

            <div className="inventory-table-container">
                {inventory.filter(item => !isCurrency(item.type)).length > 0 ? (
                    <>
                        <div className="inventory-table-header">
                            <table>
                                <thead>
                                    <tr>
                                        <th onClick={() => handleInventorySort('name')} className="sortable-header">
                                            {strings[191] || "Item"} {getInventorySortIcon('name')}
                                        </th>
                                        <th onClick={() => handleInventorySort('quantity')} className="sortable-header">
                                            {strings[185] || "Quantity"} {getInventorySortIcon('quantity')}
                                        </th>
                                    </tr>
                                </thead>
                            </table>
                        </div>
                        <div className="inventory-table-scroll">
                            <table>
                                <tbody>
                                    {getSortedInventory().map((item, index) => (
                                        <tr key={index}>
                                            <td>{masterResources.find(r => r.type === item.type)?.symbol || ''} {getLocalizedString(item.type, strings)}</td>
                                            <td>{item.quantity.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <p>{strings[76]}</p>
                )}
            </div>


            {showBackpackModal && (() => {
                const isAtHome = currentPlayer.location.g === currentPlayer.gridId;
                const nonTentBoatItems = backpack.filter( (item) => item.type !== "Tent" && item.type !== "Boat" );
                const isAddAllDisabled = isAtHome ? (backpack.length === 0 || nonTentBoatItems.length === 0) : 
                                        (backpack.length === 0 || nonTentBoatItems.length === 0);
                return (
                    <div className="modal-overlay">
                        <div className="modal-container modal-large">
                            <button className="modal-close-btn" onClick={() => setShowBackpackModal(false)}>×</button>
                            <div className="modal-title">{strings[187]}</div>

                        <ManageContentsModal
                            inventory={backpack}
                            masterResources={masterResources}
                            showActions={true}
                            warehouseAmounts={backpackAmounts}
                            setWarehouseAmounts={setBackpackAmounts}
                            handleAmountChange={handleAmountChange}
                            handleDiscardWarehouseItem={(item) => {
                                const isTentAtHome = isAtHome && item.type === "Tent";
                                const isBoatAtHome = isAtHome && item.type === "Boat";
                                const isTentOrBoatNotHome = !isAtHome && (item.type === "Tent" || item.type === "Boat");
                                
                                if (isTentAtHome || isBoatAtHome || isTentOrBoatNotHome || !(backpackAmounts[item.type] > 0 && backpackAmounts[item.type] <= item.quantity)) {
                                    return;
                                }
                                handleMoveItem(item);
                            }}
                            actionButtonText={isAtHome ? strings[196] : strings[188]}
                            actionButtonClass="btn-success"
                            strings={strings}
                        />

                        <div className="modal-buttons shared-buttons">
                            <button 
                                className="btn-basic btn-modal btn-success" 
                                onClick={handleMoveAll} 
                                disabled={isAddAllDisabled}
                            >
                                {isAtHome ? strings[189] : strings[190]}
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}

            {showWarehouseModal && (
                <div className="modal-overlay">
                    <div className="modal-container modal-large">
                        <button className="modal-close-btn" onClick={() => setShowWarehouseModal(false)}>×</button>
                        <div className="modal-title">{strings[193]}</div>

                        <ManageContentsModal
                        inventory={inventory}
                        masterResources={masterResources}
                        showActions={true}
                        warehouseAmounts={warehouseAmounts}
                        setWarehouseAmounts={setWarehouseAmounts}
                        handleAmountChange={handleAmountChange}
                        handleDiscardWarehouseItem={handleDiscardWarehouseItem}
                        handleSecondAction={handleTransferToBackpack}
                        secondActionButtonText={strings[180]}
                        secondActionButtonClass="btn-success"
                        strings={strings}
                    />

                    <div className="modal-buttons shared-buttons">
                        <button 
                            className="btn-basic btn-modal btn-danger" 
                            onClick={() => {
                            setModalContent({
                                title: "Are you sure?",
                                message: "This will permanently discard ALL items in your warehouse!",
                                message2: "This action cannot be undone.",
                                custom: (
                                    <div className="shared-buttons" style={{ marginTop: '20px' }}>
                                        <button 
                                            className="btn-basic btn-danger" 
                                            onClick={() => {
                                                handleDiscardAllWarehouse();
                                                setIsModalOpen(false);
                                            }}
                                        >
                                            Yes, Discard All
                                        </button>
                                        <button 
                                            className="btn-basic btn-success" 
                                            onClick={() => setIsModalOpen(false)}
                                            style={{ marginLeft: '10px' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )
                            });
                            setIsModalOpen(true);
                        }}
                        >
                            {strings[190]}
                        </button>
                    </div>
                    </div>
                </div>
            )}
        </Panel>
    );
}

export default InventoryPanel;