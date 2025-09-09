import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import '../../UI/Panel.css';
import './InventoryPanel.css'; 
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { deriveWarehouseAndBackpackCapacity } from '../../Utils/InventoryManagement';
import { handlePurchase } from '../../Store/Store';

function InventoryPanel({ onClose, masterResources, currentPlayer, setCurrentPlayer, setInventory, setBackpack, updateStatus }) {

    const strings = useStrings();
    const inventory = currentPlayer?.inventory || [];
    const backpack = currentPlayer?.backpack || [];
    const baseWarehouseCapacity = currentPlayer?.warehouseCapacity || 0;
    const baseBackpackCapacity = currentPlayer?.backpackCapacity || 0;
    const [showBackpackModal, setShowBackpackModal] = useState(false);
    const [showWarehouseModal, setShowWarehouseModal] = useState(false);
    const [backpackAmounts, setBackpackAmounts] = useState({}); // Store amounts per resource for backpack
    const [warehouseAmounts, setWarehouseAmounts] = useState({}); // Store amounts per resource for warehouse
    const hasBackpackSkill = currentPlayer?.skills?.some(item => item.type === 'Backpack');
    const finalCapacities = deriveWarehouseAndBackpackCapacity(currentPlayer, masterResources);
    const calculateTotalQuantity = (inventory) =>
        inventory.filter((item) => item.type !== 'Money').reduce((total, item) => total + item.quantity, 0);
    
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
                await axios.post(`${API_BASE}/api/update-inventory`, {
                    playerId: currentPlayer.playerId,
                    backpack: [],
                });

                setCurrentPlayer({
                    ...currentPlayer,
                    backpack: [],
                });
                
                // Also update parent component's state
                setBackpack([]);

                updateStatus(`❌ Discarded all items`);
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
        } catch (error) {
            console.error('Error updating inventory:', error);
        }
    };

    return (
        <Panel onClose={onClose} descriptionKey="1001" titleKey="1101" panelName="InventoryPanel">
            {/* Gold Pass info for non-Gold users */}
            {currentPlayer.accountStatus !== 'Gold' && (
                <>
                    <div className="gold-pass-info">
                        {strings[199]}
                    </div>
                    <div className="standard-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '20px' }}>
                        <button 
                            className="btn-gold"
                            style={{ width: '100%' }}
                            onClick={() => handlePurchase(1, currentPlayer, updateStatus)}
                        >
                            {strings[9061]}
                        </button>
                    </div>
                </>
            )}
            <h3>{strings[182]}</h3>
            {hasBackpackSkill ? (
              <>
                <div className="capacity-display">{strings[183]} {calculateTotalQuantity(backpack)}/{finalCapacities.backpack}</div>

                {backpack.length > 0 && (
                <div className="panel-buttons">
                    <button className="btn-success" onClick={() => setShowBackpackModal(true)}>
                    {strings[78]}
                    </button>
                </div>
                )}

                <div className="inventory-table">
                    {backpack.filter(item => item.type !== 'Money').length > 0 ? (
                        backpack.filter(item => item.type !== 'Money').map((item, index) => (
                            <div className="inventory-row" key={index}>
                                <div className="inventory-cell name-cell">{getLocalizedString(item.type, strings)}</div>
                                <div className="inventory-cell quantity-cell">{item.quantity.toLocaleString()}</div>
                            </div>
                        ))
                    ) : (
                        <p>{strings[77]}</p>
                    )}
                </div>
              </>
            ) : (
              <div className="capacity-display">{strings[75]}</div>
            )}

            <hr className="inventory-divider" />

            <h3>{strings[181]}</h3>
            <div className="capacity-display">{strings[183]} {calculateTotalQuantity(inventory)}/{finalCapacities.warehouse}</div>

            {inventory.length > 0 && (
            <div className="panel-buttons">
                <button className="btn-success" onClick={() => setShowWarehouseModal(true)}>
                {strings[184]}
                </button>
            </div>
            )}

            <br></br>
            <br></br>
            <div className="inventory-table">
                {inventory.filter(item => item.type !== 'Money').length > 0 ? (
                    inventory.filter(item => item.type !== 'Money').map((item, index) => (
                        <div className="inventory-row" key={index}>
                            <div className="inventory-cell name-cell">{getLocalizedString(item.type, strings)}</div>
                            <div className="inventory-cell quantity-cell">{item.quantity.toLocaleString()}</div>
                        </div>
                    ))
                ) : (
                    <p>{strings[76]}</p>
                )}
            </div>


            {showBackpackModal && (() => {
                const isAtHome = currentPlayer.location.g === currentPlayer.gridId;
                const nonTentBoatItems = backpack.filter( (item) => item.type !== "Tent" && item.type !== "Boat" );
                const isAddAllDisabled = isAtHome && (backpack.length === 0 || nonTentBoatItems.length === 0);
                return (
                    <div className="inventory-modal">
                        <button className="close-button" onClick={() => setShowBackpackModal(false)}>✖</button>
                        <h2>{isAtHome ? strings[187] : strings[193]}</h2>

                        <div className="inventory-modal-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>{strings[191]}</th>
                                    <th>{strings[185]}</th>
                                    <th>{strings[186]}</th>
                                    <th>{strings[192]}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {backpack.map((item) => {
                                    const isTentAtHome = isAtHome && item.type === "Tent";
                                    const isBoatAtHome = isAtHome && item.type === "Boat";

                                    return (
                                        <tr key={item.type}>
                                            <td>{getLocalizedString(item.type, strings)}</td>
                                            <td>{item.quantity.toLocaleString()}</td>
                                            <td>
                                                <div className="amount-input">
                                                    <button
                                                        onClick={() =>
                                                            handleAmountChange(backpackAmounts, setBackpackAmounts, item.type, (backpackAmounts[item.type] || 0) - 1, item.quantity)
                                                        }
                                                        disabled={(backpackAmounts[item.type] || 0) <= 0}
                                                    >
                                                        -
                                                    </button>
                                                    <input
                                                        type="number"
                                                        value={backpackAmounts[item.type] || 0}
                                                        onChange={(e) =>
                                                            handleAmountChange(backpackAmounts, setBackpackAmounts, item.type, parseInt(e.target.value, 10) || 0, item.quantity)
                                                        }
                                                    />
                                                    <button
                                                        onClick={() =>
                                                            handleAmountChange(backpackAmounts, setBackpackAmounts, item.type, (backpackAmounts[item.type] || 0) + 1, item.quantity)
                                                        }
                                                        disabled={(backpackAmounts[item.type] || 0) >= item.quantity}
                                                    >
                                                        +
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            handleAmountChange(backpackAmounts, setBackpackAmounts, item.type, item.quantity, item.quantity)
                                                        }
                                                        style={{ marginLeft: '4px' }}
                                                    >
                                                        {strings[165]}
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                <button
                                                    className="add-button"
                                                    onClick={() => handleMoveItem(item)}
                                                    disabled={isTentAtHome || isBoatAtHome || !(backpackAmounts[item.type] > 0 && backpackAmounts[item.type] <= item.quantity)}
                                                >
                                                    {isAtHome ? strings[187] : strings[188]}
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
                            {isAtHome ? strings[189] : strings[190]}
                        </button>
                        </div>
                    </div>
                );
            })()}

            {showWarehouseModal && (
                <div className="inventory-modal">
                    <button className="close-button" onClick={() => setShowWarehouseModal(false)}>✖</button>
                    <h2>{strings[193]}</h2>

                    <div className="inventory-modal-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>{strings[191]}</th>
                                <th>{strings[185]}</th>
                                <th>{strings[186]}</th>
                                <th>{strings[192]}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {inventory.filter(item => item.type !== 'Money').map((item) => (
                                <tr key={item.type}>
                                    <td>{getLocalizedString(item.type, strings)}</td>
                                    <td>{item.quantity.toLocaleString()}</td>
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
                                        <button
                                            className="add-button"
                                            onClick={() => handleDiscardWarehouseItem(item)}
                                            disabled={!(warehouseAmounts[item.type] > 0 && warehouseAmounts[item.type] <= item.quantity)}
                                        >
                                            {strings[188]}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <button 
                        className="sell-button" 
                        onClick={handleDiscardAllWarehouse}
                    >
                        {strings[190]}
                    </button>
                    </div>
                </div>
            )}
        </Panel>
    );
}

export default InventoryPanel;