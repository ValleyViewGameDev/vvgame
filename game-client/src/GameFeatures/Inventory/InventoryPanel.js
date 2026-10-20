import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Panels/Panel.css';
import '../../UI/Buttons/SharedButtons.css';
import './InventoryPanel.css';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { deriveWarehouseAndBackpackCapacity, isCurrency, hasRoomFor } from '../../Utils/InventoryManagement';
import ManageContentsModal from './ManageContentsModal';
import BackpackManageModal from './BackpackManageModal';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import CloseButton from '../../UI/Buttons/CloseButton';

function InventoryPanel({ onClose, masterResources, globalTuning, currentPlayer, setCurrentPlayer, setInventory, setBackpack, updateStatus, openPanel, setActiveStation, setModalContent, setIsModalOpen, autoOpenBackpackModal = false, onBackpackModalAutoOpened }) {

    const strings = useStrings();
    const inventory = currentPlayer?.inventory || [];
    const backpack = currentPlayer?.backpack || [];
    const baseWarehouseCapacity = currentPlayer?.warehouseCapacity || 0;
    const baseBackpackCapacity = currentPlayer?.backpackCapacity || 0;
    const [showBackpackModal, setShowBackpackModal] = useState(false);
    const [showWarehouseModal, setShowWarehouseModal] = useState(false);
    // App asks for Backpack Management on returning home with a loaded backpack (App.js)
    useEffect(() => {
        if (!autoOpenBackpackModal) return;
        setShowBackpackModal(true);
        if (onBackpackModalAutoOpened) onBackpackModalAutoOpened();
    }, [autoOpenBackpackModal]); // eslint-disable-line react-hooks/exhaustive-deps
    const [inventorySortField, setInventorySortField] = useState('name');
    const [inventorySortDirection, setInventorySortDirection] = useState('asc');
    const [backpackSortField, setBackpackSortField] = useState('name');
    const [backpackSortDirection, setBackpackSortDirection] = useState('asc');
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
                    {/* Column 1: Money, Gems, and Home Deed */}
                    <div className="currency-column">
                        <div className="currency-item" title={getLocalizedString('Money', strings)} style={{ cursor: 'help' }}>
                            <span className="currency-emoji">💰</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Money')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                        <div className="currency-item" title={getLocalizedString('Gem', strings)} style={{ cursor: 'help' }}>
                            <span className="currency-emoji">💎</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Gem')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                        <div className="currency-item" title={getLocalizedString('Home Deed', strings)} style={{ cursor: 'help' }}>
                            <span className="currency-emoji">🏠</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Home Deed')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                    </div>
                    {/* Column 2: Hearts */}
                    <div className="currency-column">
                        <div className="currency-item" title={getLocalizedString('Yellow Heart', strings)} style={{ cursor: 'help' }}>
                            <span className="currency-emoji">💛</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Yellow Heart')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                        <div className="currency-item" title={getLocalizedString('Green Heart', strings)} style={{ cursor: 'help' }}>
                            <span className="currency-emoji">💚</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Green Heart')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                        <div className="currency-item" title={getLocalizedString('Purple Heart', strings)} style={{ cursor: 'help' }}>
                            <span className="currency-emoji">💜</span>
                            <span className="currency-amount">{(inventory.find(item => item.type === 'Purple Heart')?.quantity || 0).toLocaleString('en-US')}</span>
                        </div>
                    </div>
                </div>
                {/* Row 3: Keys */}
                <div className="currency-keys-row" style={{ display: 'flex', justifyContent: 'flex-start', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {masterResources
                        .filter(r => isCurrency(r.type) && r.type.includes('Key'))
                        .map(resourceDef => {
                            const quantity = inventory.find(item => item.type === resourceDef.type)?.quantity || 0;
                            return (
                                <div
                                    key={resourceDef.type}
                                    className="currency-item"
                                    title={getLocalizedString(resourceDef.type, strings)}
                                    style={{ cursor: 'help' }}
                                >
                                    <span className="currency-emoji">{resourceDef.symbol || '🔑'}</span>
                                    <span className="currency-amount">{quantity}</span>
                                </div>
                            );
                        })
                    }
                </div>
            </div>

            <hr className="inventory-divider" />

            {/* BACKPACK */}

            <div className="inventory-section-header">
                <h3>{strings[182]}</h3>
                {hasBackpackSkill && (
                    <div className="capacity-info">
                        {calculateTotalQuantity(backpack)} / {" "}
                        <span style={currentPlayer?.accountStatus === "Gold" ? {color: "var(--color-text-title)"} : {}}>
                            {finalCapacities.backpack}
                        </span>
                    </div>
                )}
            </div>

            {hasBackpackSkill ? (
              <>
                {currentPlayer?.accountStatus === "Gold" && (
                    <div style={{fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", marginTop: "-5px", textAlign: "center", marginBottom: "8px"}}>
                        (+{backpackGoldBonus.toLocaleString()} {strings[89] || "additional capacity for Gold Pass"})
                    </div>
                )}

                {backpack.length > 0 && (
                <div className="shared-buttons" style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-basic" style={{ flex: 1 }} onClick={() => setShowBackpackModal(true)}>
                    {strings[184]}
                    </button>
                    <div style={{ flex: 1 }}></div>
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

            <div className="inventory-section-header">
                <h3>{strings[181]}</h3>
                <div className="capacity-info">
                    {calculateTotalQuantity(inventory)} / {" "}
                    <span style={currentPlayer?.accountStatus === "Gold" ? {color: "var(--color-text-title)"} : {}}>
                        {finalCapacities.warehouse}
                    </span>
                </div>
            </div>

            {currentPlayer?.accountStatus === "Gold" && (
                <div style={{fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", marginTop: "-5px", textAlign: "center", marginBottom: "8px"}}>
                    (+{warehouseGoldBonus.toLocaleString()} {strings[89] || "additional capacity for Gold Pass"})
                </div>
            )}

            <div className="shared-buttons" style={{ display: 'flex', gap: '8px' }}>
                {inventory.length > 0 && (
                <button
                    className="btn-basic"
                    style={{ flex: 1 }}
                    onClick={() => setShowWarehouseModal(true)}
                    disabled={currentPlayer.location.g !== currentPlayer.gridId}
                    title={currentPlayer.location.g !== currentPlayer.gridId ? "Must be at homestead to manage warehouse" : ""}
                >
                {strings[184]}
                </button>
                )}
                <button className="btn-basic btn-success" style={{ flex: 1 }} onClick={() => {
                    onClose();
                    setTimeout(() => {
                        openPanel('WarehousePanel');
                    }, 0);
                }}>
                {strings[194]}
                </button>
            </div>

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


            {showBackpackModal && (
                <BackpackManageModal
                    currentPlayer={currentPlayer}
                    setCurrentPlayer={setCurrentPlayer}
                    setInventory={setInventory}
                    setBackpack={setBackpack}
                    masterResources={masterResources}
                    globalTuning={globalTuning}
                    updateStatus={updateStatus}
                    canSendHome={currentPlayer.location.g === currentPlayer.gridId}
                    onClose={() => setShowBackpackModal(false)}
                />
            )}

            {showWarehouseModal && createPortal(
                <div className="modal-overlay">
                    <div className="modal-container modal-large">
                        <CloseButton corner onClick={() => setShowWarehouseModal(false)} />
                        <div className="modal-title">{strings[193]}</div>

                        <ManageContentsModal
                        inventory={inventory}
                        masterResources={masterResources}
                        showActions={true}
                        warehouseAmounts={warehouseAmounts}
                        setWarehouseAmounts={setWarehouseAmounts}
                        handleAmountChange={handleAmountChange}
                        handleDiscardWarehouseItem={handleTransferToBackpack}
                        actionButtonText={strings[180]}
                        actionButtonClass="btn-success"
                        strings={strings}
                    />
                    </div>
                </div>
                , document.body)}
        </Panel>
    );
}

export default InventoryPanel;