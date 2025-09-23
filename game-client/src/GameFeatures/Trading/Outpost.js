import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import TransactionButton from '../../UI/TransactionButton';
import axios from 'axios';
import './TradeStall.css';
import '../../UI/Modal.css';
import '../../UI/SharedButtons.css';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { isACrop } from '../../Utils/ResourceHelpers';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';

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

  // Use Trading Post configuration from globalTuning
  const OUTPOST_SLOTS = 4;
  const OUTPOST_HAIRCUT = globalTuning?.tradeStallHaircut || 0.25;
  
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
    const amount = amounts[resource] || 0;
    const resourceInBackpack = backpack.find((item) => item.type === resource);

    if (selectedSlotIndex === null || amount <= 0 || !resourceInBackpack || amount > resourceInBackpack.quantity) {
      console.warn('Invalid amount or resource exceeds available quantity.');
      return;
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
            <div className="standard-buttons" style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
              <button
                className="btn-neutral"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn-success"
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
      onClose
    });
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
      <Panel onClose={onClose} descriptionKey="1008" titleKey="1108" panelName="OutpostPanel">
        <div style={{ textAlign: 'center', padding: '20px' }}>
          {strings[98]} {/* Loading... */}
        </div>
      </Panel>
    );
  }

  return (
    <Panel onClose={onClose} descriptionKey="1008" titleKey="1108" panelName="OutpostPanel">
      
      {/* Outpost header */}
      <div className="outpost-header">
        {strings?.[179] || 'Outpost'}
      </div>

      {/* Trade slots */}
      <div className="trade-stall-slots">
        {tradeSlots.slice(0, OUTPOST_SLOTS).map((slot, index) => {
          const isEmpty = !slot?.resource;
          const isPurchased = slot?.boughtBy;
          const isOwnItem = slot?.sellerId === currentPlayer.playerId;
          const isReadyToSell = slot?.sellTime && slot.sellTime <= currentTime && isOwnItem;
          const hasTimer = slot?.sellTime && slot.sellTime > currentTime;

          return (
            <div key={index} className="trade-slot-container">
              <div
                className={`trade-slot ${isEmpty ? 'empty' : 'filled'} ${isPurchased ? 'purchased' : ''}`}
                onClick={() => handleSlotClick(index)}
                style={{ cursor: isEmpty ? 'pointer' : 'default' }}
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
                      <div className="trade-slot-status">
                        {strings[157]} {slot.boughtBy}
                      </div>
                    )}
                    {hasTimer && !isPurchased && (
                      <div className="trade-slot-status timer">
                        {formatCountdown(slot.sellTime, currentTime)}
                      </div>
                    )}
                    {isReadyToSell && !isPurchased && (
                      <div className="trade-slot-status ready">
                        {strings[159]}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {!isEmpty && (
                <div className="trade-button-container">
                  {isPurchased && isOwnItem ? (
                    <TransactionButton
                      className="trade-collect-button collect-payment"
                      onAction={(transactionId, transactionKey) => handleCollectPayment(transactionId, transactionKey, index)}
                      transactionKey={`outpost-collect-${index}`}
                    >
                      Collect 💰{slot.boughtFor}
                    </TransactionButton>
                  ) : !isPurchased && !isOwnItem ? (
                    <TransactionButton
                      className="trade-buy-button enabled"
                      onAction={(transactionId, transactionKey) => handleBuyItem(transactionId, transactionKey, index)}
                      transactionKey={`outpost-buy-${index}`}
                    >
                      Buy 💰{slot.amount * slot.price}
                    </TransactionButton>
                  ) : isReadyToSell && isOwnItem ? (
                    <TransactionButton
                      className="trade-collect-button sell-to-game"
                      onAction={(transactionId, transactionKey) => handleSellToGame(transactionId, transactionKey, index)}
                      transactionKey={`outpost-sell-${index}`}
                    >
                      Sell 💰{Math.floor(slot.amount * slot.price * OUTPOST_HAIRCUT)}
                    </TransactionButton>
                  ) : (
                    <button className="trade-collect-button disabled" disabled>
                      {hasTimer ? 'Wait...' : 'No Action'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Inventory modal for adding items */}
      {selectedSlotIndex !== null && (
        <div className="inventory-modal wider">
          <button
            className="close-button"
            onClick={() => setSelectedSlotIndex(null)}
          >
            ✖
          </button>
          <h3>{strings[160]}</h3>
          <p style={{ textAlign: 'center', margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
            {getSlotConfig(selectedSlotIndex).maxAmount} {strings[158]}
          </p>
          <div className="inventory-modal-scroll">
            <table>
              <thead>
                <tr>
                  <th>{strings[161]}</th>
                  <th>{strings[162]}</th>
                  <th>{strings[163]}</th>
                  <th>{strings[164]}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(backpack || [])
                  .filter(item => item.type !== 'Money' && item.type !== 'Gem')
                  .map((item) => {
                    const resourceDetails = resourceData.find((res) => res.type === item.type);
                    const price = resourceDetails?.minprice || 'N/A';

                    return (
                      <tr key={item.type}>
                        <td>{resourceDetails?.symbol} {getLocalizedString(item.type, strings)}</td>
                        <td>{item.quantity}</td>
                        <td>{price}</td>
                        <td>
                          <div className="amount-input">
                            <button
                              onClick={() =>
                                handleAmountChange(item.type, (amounts[item.type] || 0) - 1)
                              }
                              disabled={(amounts[item.type] || 0) <= 0}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={amounts[item.type] || 0}
                              onChange={(e) =>
                                handleAmountChange(item.type, parseInt(e.target.value, 10) || 0)
                              }
                            />
                            <button
                              onClick={() =>
                                handleAmountChange(item.type, (amounts[item.type] || 0) + 1)
                              }
                              disabled={(amounts[item.type] || 0) >= Math.min(item.quantity, getSlotConfig(selectedSlotIndex).maxAmount)}
                            >
                              +
                            </button>
                            <button
                              onClick={() =>
                                handleAmountChange(item.type, Math.min(item.quantity, getSlotConfig(selectedSlotIndex).maxAmount))
                              }
                              style={{ marginLeft: '5px' }}
                            >
                              {strings[165]}
                            </button>
                          </div>
                        </td>
                        <td>
                          <TransactionButton
                            className="add-button"
                            onAction={(transactionId, transactionKey) => handleAddToSlot(transactionId, transactionKey, item.type)}
                            transactionKey={`outpost-add-${item.type}`}
                            disabled={!(amounts[item.type] > 0 && amounts[item.type] <= item.quantity)}
                          >
                            {strings[166]}
                          </TransactionButton>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Sell for Refund button - only visible for developers */}
      {isDeveloper && (
        <>
          <br />
          <div className="standard-buttons">
            <TransactionButton 
              className="btn-success" 
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