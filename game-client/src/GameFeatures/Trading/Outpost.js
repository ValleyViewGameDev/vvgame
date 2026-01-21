import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panels/Panel';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import TradingInventoryModal from '../../UI/Modals/TradingInventoryModal';
import ManageContentsModal from '../Inventory/ManageContentsModal';
import '../Inventory/ManageContentsModal.css';
import axios from 'axios';
import './TradeStall.css';
import '../../UI/Modals/Modal.css';
import '../../UI/Buttons/SharedButtons.css';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { isACrop } from '../../Utils/ResourceHelpers';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import { deriveWarehouseAndBackpackCapacity, isCurrency } from '../../Utils/InventoryManagement';

function Outpost({ onClose, backpack, setBackpack, currentPlayer, setCurrentPlayer, gridId, setModalContent, setIsModalOpen, isDeveloper, stationType, currentStationPosition, setResources, setInventory, TILE_SIZE, globalTuning }) {
  const strings = useStrings();
  const [tradeSlots, setTradeSlots] = useState([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);
  const [amounts, setAmounts] = useState({}); // Store amounts per resource
  const [resourceData, setResourceData] = useState([]); // Store resource data
  const { updateStatus } = useContext(StatusBarContext);
  const [masterResources, setMasterResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showSendHomeModal, setShowSendHomeModal] = useState(false);
  const [sendHomeAmounts, setSendHomeAmounts] = useState({});

  // Use Trading Post configuration from globalTuning
  const OUTPOST_SLOTS = 4;
  
  // Get slot-specific configuration
  const getSlotConfig = (slotIndex) => {
    const slotConfig = globalTuning?.tradeStallSlots?.find(slot => slot.slotIndex === slotIndex);
    return slotConfig || {
      maxAmount: 50,
      sellWaitTime: 300000
    };
  };

  // Initialize trade slots structure
  useEffect(() => {
    const initSlots = [];
    for (let i = 0; i < OUTPOST_SLOTS; i++) {
      initSlots.push({
        slotIndex: i,
        resource: null,
        amount: 0,
        price: 0,
        sellTime: null,
        boughtBy: null,
        boughtFor: null,
        sellerUsername: null,
        sellerId: null
      });
    }
    setTradeSlots(initSlots);
  }, []);

  // Fetch data on component mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch resource data for prices
        const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
        setResourceData(resourcesResponse.data);
        setMasterResources(resourcesResponse.data);

        // Fetch grid data to get outpost trade stall
        const gridResponse = await axios.get(`${API_BASE}/api/load-grid/${gridId}`);
        
        if (gridResponse.data.outpostTradeStall && Array.isArray(gridResponse.data.outpostTradeStall)) {
          setTradeSlots(gridResponse.data.outpostTradeStall);
        }
        // Otherwise keep the default slots initialized in the previous useEffect
      } catch (error) {
        console.error('Error fetching Outpost data:', error);
        updateStatus('Failed to load Outpost data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [gridId]);

  // Update current time every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const getSymbol = (resourceType) => {
    const resource = resourceData.find((res) => res.type === resourceType);
    return resource?.symbol || '';
  };

  const handleSlotClick = (index) => {
    const slot = tradeSlots[index];
    const isEmpty = !slot?.resource;
    
    // Only allow adding items to empty slots
    if (isEmpty) {
      setSelectedSlotIndex(index);
      // Reset amounts when opening modal to prevent quantity persistence bug
      setAmounts({});
    }
  };

  const handleAmountChange = (type, value) => {
    const resourceInBackpack = backpack.find((item) => item.type === type);
    const backpackAmount = resourceInBackpack ? resourceInBackpack.quantity : 0;
    const slotConfig = getSlotConfig(selectedSlotIndex);
    const maxAmount = Math.min(backpackAmount, slotConfig.maxAmount);

    setAmounts((prev) => ({
      ...prev,
      [type]: Math.min(Math.max(0, value), maxAmount),
    }));
  };

  const handleAddToSlot = async (transactionId, transactionKey, resource) => {
    let amount = amounts[resource] || 0;
    const resourceInBackpack = backpack.find((item) => item.type === resource);

    if (selectedSlotIndex === null || amount <= 0 || !resourceInBackpack || amount > resourceInBackpack.quantity) {
      console.warn('Invalid amount or resource exceeds available quantity.');
      return;
    }
    
    // Get slot configuration and enforce max amount limit
    const slotConfig = getSlotConfig(selectedSlotIndex);
    if (amount > slotConfig.maxAmount) {
      amount = slotConfig.maxAmount;
      console.log(`Amount adjusted to slot limit: ${amount} (max: ${slotConfig.maxAmount})`);
    }

    // Check if selling all of a crop item
    if (amount === resourceInBackpack.quantity && isACrop(resource, masterResources)) {
      const plotResource = masterResources.find(res => res.output === resource && res.category === 'farmplot');
      const plotHasCost = plotResource && plotResource.ingredient1qty > 0;
      
      if (plotHasCost) {
        setModalContent({
          title: '⚠️ Warning',
          message: `This will leave you with 0 ${resource}, so you will not be able to plant ${resource} again.`,
          message2: 'Are you sure?',
          size: 'small',
          onClose: () => setIsModalOpen(false),
          children: (
            <div className="shared-buttons" style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
              <button
                className="btn-basic btn-neutral"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn-basic btn-success"
                onClick={() => {
                  setIsModalOpen(false);
                  performAddToSlot(transactionId, transactionKey, resource, amount);
                }}
              >
                Proceed
              </button>
            </div>
          ),
        });
        setIsModalOpen(true);
        return;
      }
    }
    
    await performAddToSlot(transactionId, transactionKey, resource, amount);
  };

  const performAddToSlot = async (transactionId, transactionKey, resource, amount) => {
    const resourceDetails = resourceData.find((item) => item.type === resource);
    const price = resourceDetails?.minprice || 0;
    const slotConfig = getSlotConfig(selectedSlotIndex);

    try {
      // Update grid's outpost trade stall
      const response = await axios.post(`${API_BASE}/api/outpost/add-item`, {
        gridId,
        slotIndex: selectedSlotIndex,
        resource,
        amount,
        price,
        sellTime: Date.now() + slotConfig.sellWaitTime,
        sellerUsername: currentPlayer.username,
        sellerId: currentPlayer.playerId,
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        // Update local state
        setTradeSlots(response.data.outpostTradeStall);
        
        // Update backpack
        const updatedBackpack = backpack.map(item =>
          item.type === resource
            ? { ...item, quantity: item.quantity - amount }
            : item
        ).filter(item => item.quantity > 0);
        
        setBackpack(updatedBackpack);
        setCurrentPlayer(prev => ({
          ...prev,
          backpack: updatedBackpack
        }));
        
        setSelectedSlotIndex(null);
        updateStatus(`Added ${amount}x ${resource} to Outpost`);
      }
    } catch (error) {
      console.error('Error adding item to Outpost:', error);
      updateStatus('Failed to add item to Outpost');
      throw error;
    }
  };

  const handleBuyItem = async (transactionId, transactionKey, slotIndex) => {
    const slot = tradeSlots[slotIndex];
    if (!slot || !slot.resource || slot.boughtBy) return;

    const totalCost = slot.amount * slot.price;
    const currentMoney = currentPlayer.inventory?.find(item => item.type === 'Money')?.quantity || 0;
    
    if (totalCost > currentMoney) {
      updateStatus(152); // Not enough money
      return;
    }

    try {
      const response = await axios.post(`${API_BASE}/api/outpost/buy-item`, {
        gridId,
        slotIndex,
        buyerId: currentPlayer.playerId,
        buyerUsername: currentPlayer.username,
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        // Update local state
        setTradeSlots(response.data.outpostTradeStall);
        
        // Update player's inventory (money and purchased item)
        if (response.data.inventory) {
          setCurrentPlayer(prev => ({
            ...prev,
            inventory: response.data.inventory
          }));
        }
        
        updateStatus(`Bought ${slot.amount}x ${slot.resource} for ${totalCost}`);
      }
    } catch (error) {
      console.error('Error buying from Outpost:', error);
      updateStatus('Failed to buy item');
      throw error;
    }
  };

  const handleCollectPayment = async (transactionId, transactionKey, slotIndex) => {
    const slot = tradeSlots[slotIndex];
    if (!slot || slot.sellerId !== currentPlayer.playerId || !slot.boughtBy) return;

    try {
      const response = await axios.post(`${API_BASE}/api/outpost/collect-payment`, {
        gridId,
        slotIndex,
        playerId: currentPlayer.playerId,
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        // Update local state
        setTradeSlots(response.data.outpostTradeStall);
        
        // Update player's inventory (money)
        if (response.data.inventory) {
          setCurrentPlayer(prev => ({
            ...prev,
            inventory: response.data.inventory
          }));
        }
        
        updateStatus(`💰 Collected ${slot.boughtFor}.`);
      }
    } catch (error) {
      console.error('Error collecting payment:', error);
      updateStatus('Failed to collect payment');
      throw error;
    }
  };

  const handleSellStation = async (transactionId, transactionKey) => {
    await handleProtectedSelling({
      currentPlayer,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      setResources,
      stationType,
      currentStationPosition,
      gridId,
      TILE_SIZE,
      updateStatus,
      onClose,
      devOnly: true,
    });
  };

  // === Send Goods Home functionality ===
  const inventory = currentPlayer?.inventory || [];
  const finalCapacities = deriveWarehouseAndBackpackCapacity(currentPlayer, masterResources, globalTuning);

  const calculateTotalQuantity = (inv) =>
    inv.filter((item) => !isCurrency(item.type)).reduce((total, item) => total + item.quantity, 0);

  const handleSendHomeAmountChange = (amounts, setAmounts, type, value, maxValue) => {
    const clampedValue = Math.min(Math.max(0, value), maxValue);
    setAmounts((prev) => ({
      ...prev,
      [type]: clampedValue,
    }));
  };

  const handleSendHomeItem = async (item) => {
    const amount = sendHomeAmounts[item.type] || 0;
    if (amount <= 0) return;

    try {
      // Check warehouse capacity before moving
      const currentWarehouseUsage = calculateTotalQuantity(inventory);
      const spaceAvailable = finalCapacities.warehouse - currentWarehouseUsage;

      if (amount > spaceAvailable) {
        updateStatus(20); // Warehouse full message
        return;
      }

      // Build updated warehouse inventory
      const updatedWarehouse = [...inventory];
      const existingIndex = updatedWarehouse.findIndex(i => i.type === item.type);
      if (existingIndex !== -1) {
        updatedWarehouse[existingIndex].quantity += amount;
      } else {
        updatedWarehouse.push({ ...item, quantity: amount });
      }

      // Build updated backpack
      const updatedBackpack = backpack.map(i => {
        if (i.type === item.type) {
          const newQuantity = i.quantity - amount;
          return newQuantity > 0 ? { ...i, quantity: newQuantity } : null;
        }
        return i;
      }).filter(Boolean);

      // Call API to update inventory (sending to home warehouse from outpost)
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

      // Update parent component's state
      setInventory(updatedWarehouse);
      setBackpack(updatedBackpack);

      // Reset amount for this item
      setSendHomeAmounts(prev => ({
        ...prev,
        [item.type]: 0
      }));

      updateStatus(`📦 Sent ${amount}x ${getLocalizedString(item.type, strings)} to warehouse`);
    } catch (error) {
      console.error('Error sending item home:', error);
      updateStatus('Failed to send item home');
    }
  };

  const handleSendAllHome = async () => {
    try {
      // Filter out items with special category
      const itemsToMove = backpack.filter((item) => {
        const resource = masterResources.find(r => r.type === item.type);
        return resource?.category !== 'special';
      });

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

      // Keep items with special category in backpack
      const updatedBackpack = backpack.filter((item) => {
        const resource = masterResources.find(r => r.type === item.type);
        return resource?.category === 'special';
      });

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

      // Update parent component's state
      setInventory(updatedWarehouseInventory);
      setBackpack(updatedBackpack);

      updateStatus(`📦 Sent all items to warehouse`);
      setShowSendHomeModal(false);
    } catch (error) {
      console.error('Error sending all items home:', error);
      updateStatus('Failed to send items home');
    }
  };

  const handleSellToGame = async (transactionId, transactionKey, slotIndex) => {
    const slot = tradeSlots[slotIndex];
    if (!slot || !slot.resource || slot.sellerId !== currentPlayer.playerId) return;

    try {
      const response = await axios.post(`${API_BASE}/api/outpost/sell-to-game`, {
        gridId,
        slotIndex,
        playerId: currentPlayer.playerId,
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        // Update local state
        setTradeSlots(response.data.outpostTradeStall);
        
        // Update player's inventory (money)
        if (response.data.inventory) {
          setCurrentPlayer(prev => ({
            ...prev,
            inventory: response.data.inventory
          }));
        }
        
        updateStatus(`💰 Sold ${response.data.amount}x ${response.data.resource} for ${response.data.sold}.`);
      }
    } catch (error) {
      console.error('Error selling to game:', error);
      updateStatus('Failed to sell item');
      throw error;
    }
  };

  if (isLoading) {
    return (
      <Panel onClose={onClose} descriptionKey="1008" titleKey="1141" panelName="OutpostPanel">
        <div style={{ textAlign: 'center', padding: '20px' }}>
          {strings[98]} {/* Loading... */}
        </div>
      </Panel>
    );
  }

  return (
    <Panel onClose={onClose} descriptionKey="1008" titleKey="1141" panelName="OutpostPanel">
      
      {/* Send Goods Home button */}
      {backpack && backpack.filter(item => !isCurrency(item.type)).length > 0 && (
        <div className="shared-buttons" style={{ marginBottom: '10px' }}>
          <button
            className="btn-basic btn-success"
            onClick={() => {
              setSendHomeAmounts({});
              setShowSendHomeModal(true);
            }}
            title={strings[369] || 'Send items from your backpack directly to your warehouse at home.'}
          >
            🏠 {strings[368] || 'Send Goods Home'}
          </button>
        </div>
      )}

      <br />

      <hr className="inventory-divider" />

      {/* Trading header */}
      <h2>{strings?.[1108]}</h2>
      <div className="outpost-header"> {strings?.[179]} </div>

      {/* Trade slots */}
      <div className="trade-stall-slots shared-buttons">
        {tradeSlots.slice(0, OUTPOST_SLOTS).map((slot, index) => {
          const isEmpty = !slot?.resource;
          const isPurchased = slot?.boughtBy;
          const isOwnItem = slot?.sellerId === currentPlayer.playerId;
          const isReadyToSell = slot?.sellTime && slot.sellTime <= currentTime && isOwnItem;
          const hasTimer = slot?.sellTime && slot.sellTime > currentTime;

          return (
            <div key={index} className="trade-slot-container">
              <div
                className={`trade-slot btn-basic ${isEmpty ? 'btn-neutral' : ''} ${!isEmpty && !isPurchased && !isReadyToSell ? 'filled' : ''} ${isPurchased && isOwnItem ? 'btn-collect' : ''} ${isReadyToSell && isOwnItem ? 'btn-sell' : ''}`}
                onClick={() => {
                  if (isEmpty) {
                    handleSlotClick(index);
                  } else if (isPurchased && isOwnItem) {
                    // Handle collect payment
                    handleCollectPayment(`collect-${Date.now()}`, 'collect-payment', index);
                  } else if (isReadyToSell && isOwnItem) {
                    // Handle sell to game
                    handleSellToGame(`sell-${Date.now()}`, 'sell-to-game', index);
                  }
                }}
              >
                {isEmpty ? (
                  <div className="trade-slot-empty-text">
                    <div>➕ {strings[156]}</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      {strings[173]} {getSlotConfig(index).maxAmount}
                    </div>
                    <div style={{ fontSize: '0.8rem' }}>
                      {formatDuration(getSlotConfig(index).sellWaitTime / 1000)} {strings[174]}
                    </div>
                  </div>
                ) : (
                  <div className="trade-slot-content">
                    <div className="trade-slot-item-name">
                      {`${slot.amount}x ${getSymbol(slot.resource)} ${getLocalizedString(slot.resource, strings)}`}
                    </div>
                    {slot.sellerUsername && (
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>
                        {slot.sellerUsername}
                      </div>
                    )}
                    {isPurchased && (
                      <>
                        <div className="trade-slot-status">
                          {strings[157]} {slot.boughtBy}
                        </div>
                        {isOwnItem && (
                          <div className="trade-slot-status">
                            {strings[318]} 💰{slot.boughtFor}
                          </div>
                        )}
                      </>
                    )}
                    {hasTimer && !isPurchased && (
                      <div className="trade-slot-status timer">
                        {formatCountdown(slot.sellTime, currentTime)}
                      </div>
                    )}
                    {isReadyToSell && !isPurchased && (
                      <div className="trade-slot-status ready">
                        {strings[167]} 💰{slot.amount * slot.price}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons - only show for buy actions and non-own items */}
              {!isEmpty && !isOwnItem && !isPurchased && (
                <div className="trade-button-container">
                  <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                    <TransactionButton
                      className="btn-basic btn-success"
                      style={{ width: '100%' }}
                      onAction={(transactionId, transactionKey) => handleBuyItem(transactionId, transactionKey, index)}
                      transactionKey={`outpost-buy-${index}`}
                    >
                      Buy 💰{slot.amount * slot.price}
                    </TransactionButton>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* TRADING INVENTORY MODAL */}
      <TradingInventoryModal
        isOpen={selectedSlotIndex !== null}
        onClose={() => setSelectedSlotIndex(null)}
        inventory={backpack || []}
        resourceData={resourceData}
        amounts={amounts}
        handleAmountChange={handleAmountChange}
        handleAddToSlot={handleAddToSlot}
        getSlotConfig={getSlotConfig}
        selectedSlotIndex={selectedSlotIndex}
        transactionKeyPrefix="outpost-add"
      />

      {/* SEND GOODS HOME MODAL */}
      {showSendHomeModal && (() => {
        const nonSpecialItems = backpack.filter((item) => {
          const resource = masterResources.find(r => r.type === item.type);
          return resource?.category !== 'special';
        });
        const isAddAllDisabled = backpack.length === 0 || nonSpecialItems.length === 0;

        return (
          <div className="modal-overlay">
            <div className="modal-container modal-large">
              <button className="modal-close-btn" onClick={() => setShowSendHomeModal(false)}>×</button>
              <div className="modal-title">🏠 {strings[368] || 'Send Goods Home'}</div>
              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '10px', textAlign: 'center' }}>
                {strings[369] || 'Send items from your backpack directly to your warehouse at home.'}
              </p>

              <ManageContentsModal
                inventory={backpack}
                masterResources={masterResources}
                showActions={true}
                warehouseAmounts={sendHomeAmounts}
                setWarehouseAmounts={setSendHomeAmounts}
                handleAmountChange={handleSendHomeAmountChange}
                handleDiscardWarehouseItem={(item) => {
                  const resource = masterResources.find(r => r.type === item.type);
                  const isSpecialItem = resource?.category === 'special';

                  if (isSpecialItem || !(sendHomeAmounts[item.type] > 0 && sendHomeAmounts[item.type] <= item.quantity)) {
                    return;
                  }
                  handleSendHomeItem(item);
                }}
                actionButtonText={strings[196] || 'Add'}
                actionButtonClass="btn-success"
                strings={strings}
              />

              <div className="modal-buttons shared-buttons">
                <button
                  className="btn-basic btn-modal btn-success"
                  onClick={handleSendAllHome}
                  disabled={isAddAllDisabled}
                >
                  {strings[189] || 'Add All to Warehouse'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sell for Refund button - only visible for developers */}
      {isDeveloper && (
        <>
          <br />
          <div className="shared-buttons">
            <TransactionButton 
              className="btn-basic btn-success" 
              onAction={handleSellStation}
              transactionKey={`sell-refund-${stationType}-${currentStationPosition?.x}-${currentStationPosition?.y}-${gridId}`}
            >
              {strings[425] || 'Sell for Refund'}
            </TransactionButton>
          </div>
        </>
      )}
    </Panel>
  );
}

export default React.memo(Outpost);