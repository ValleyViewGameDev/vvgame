import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel'; // Use Panel instead of Modal
import TransactionButton from '../../UI/TransactionButton';
import axios from 'axios';
import './TradeStall.css';
import '../../UI/Modal.css';
import '../../UI/SharedButtons.css';
import { spendIngredients, gainIngredients, refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { formatCountdown } from '../../UI/Timers';
import { incrementFTUEStep } from '../FTUE/FTUE';
import { isACrop } from '../../Utils/ResourceHelpers';

function TradeStall({ onClose, inventory, setInventory, currentPlayer, setCurrentPlayer, globalTuning, setModalContent, setIsModalOpen }) {

  const strings = useStrings();
  const [tradeSlots, setTradeSlots] = useState([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);
  const [amounts, setAmounts] = useState({}); // Store amounts per resource
  const [totalSellValue, setTotalSellValue] = useState(0);
  const [resourceData, setResourceData] = useState([]); // Store resource data
  const [settlementPlayers, setSettlementPlayers] = useState([]);
  const [viewedPlayer, setViewedPlayer] = useState(currentPlayer);
  const [viewedPlayerIndex, setViewedPlayerIndex] = useState(0); // Index of the currently viewed player
  const { updateStatus } = useContext(StatusBarContext);
  const [masterResources, setMasterResources] = useState([]); // Store master resources for isACrop check
  const [playerTradeStalls, setPlayerTradeStalls] = useState({}); // Cache of all players' trade stalls

  const tradeStallHaircut = globalTuning?.tradeStallHaircut || 0.25;
  // First time users get 10 second wait time, otherwise use global tuning
  const sellWaitTime = currentPlayer.firsttimeuser ? 10000 : (globalTuning?.sellWaitTime || 60000);

  const calculateTotalSlots = (player) => {
    // Base slots are now 4 for Free, Gold gets +2 (total 6)
    const accountStatusSlots = {
      Free: 4,
      Bronze: 4, 
      Silver: 4,
      Gold: 6,
    };
    return accountStatusSlots[player.accountStatus] || 4;
  };

  // Lift fetchDataForViewedPlayer out of useEffect for reuse
  const fetchDataForViewedPlayer = async (skipInventoryFetch = false) => {
    try {
      // Fetch resource data (e.g., for prices)
      const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
      setResourceData(resourcesResponse.data);
      setMasterResources(resourcesResponse.data); // Store for isACrop checks

      // Only fetch inventory if not skipping (to avoid overwriting during collections)
      if (!skipInventoryFetch) {
        const currentInventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setInventory(currentInventoryResponse.data.inventory || []);
      }

      // Fetch trade stall data for the viewed player
      const tradeStallResponse = await axios.get(`${API_BASE}/api/player-trade-stall`, {
        params: { playerId: viewedPlayer.playerId },
      });

      // Handle slots - server now provides 6 slots, client shows based on account status
      const totalSlots = calculateTotalSlots(viewedPlayer);
      const serverSlots = tradeStallResponse.data.tradeStall || [];
      
      // Ensure we have exactly 6 slots from server, create empty ones if missing
      const allSlots = Array.from({ length: 6 }, (_, index) => {
        const existingSlot = serverSlots.find(slot => slot && slot.slotIndex === index);
        return existingSlot || {
          slotIndex: index,
          resource: null,
          amount: 0,
          price: 0,
          sellTime: null,
          boughtBy: null,
          boughtFor: null
        };
      });
      
      // Only show slots based on account status (4 for Free, 6 for Gold)
      const visibleSlots = allSlots.slice(0, totalSlots);
      setTradeSlots(visibleSlots);

      // Update totalSellValue only if viewing currentPlayer's stall
      if (viewedPlayer.playerId === currentPlayer.playerId) {
        const total = visibleSlots.reduce((sum, slot) => {
          if (slot?.resource && slot?.amount && slot?.price && !slot?.boughtBy) {
            return sum + slot.amount * slot.price;
          }
          return sum;
        }, 0);
        setTotalSellValue(total);
      } else {
        setTotalSellValue(0); // Disable Sell functionality for other players
      }
    } catch (error) {
      console.error('Error fetching TradeStall data:', error);
    }
  };

  useEffect(() => {
    const fetchSettlementPlayers = async () => {
      try {
        const settlementPlayersResponse = await axios.get(`${API_BASE}/api/players-in-settlement`, {
          params: { settlementId: currentPlayer.location.s },
        });
        const players = settlementPlayersResponse.data.players || [];
        setSettlementPlayers(players);
        
        // Fetch trade stalls for all players to determine which have items
        const tradeStallsData = {};
        for (const player of players) {
          try {
            const response = await axios.get(`${API_BASE}/api/player-trade-stall`, {
              params: { playerId: player.playerId },
            });
            tradeStallsData[player.playerId] = response.data.tradeStall || [];
          } catch (error) {
            console.error(`Error fetching trade stall for player ${player.playerId}:`, error);
            tradeStallsData[player.playerId] = [];
          }
        }
        setPlayerTradeStalls(tradeStallsData);
      } catch (error) {
        console.error('Error fetching settlement players:', error);
      }
    };

    fetchDataForViewedPlayer();
    fetchSettlementPlayers();
    
  }, [viewedPlayer?.playerId, currentPlayer?.playerId]); // More stable dependencies
  

  const handleSlotClick = (index) => {
    const slot = tradeSlots[index];
    const isOwnStall = viewedPlayer.playerId === currentPlayer.playerId;
    const isEmpty = !slot?.resource;
    
    console.log('Slot clicked:', index, 'Slot data:', slot, 'Is own stall:', isOwnStall, 'Is empty:', isEmpty);

    // Only allow slot clicks for empty slots on your own stall
    if (isOwnStall && isEmpty) {
      setSelectedSlotIndex(index); // Open inventory modal for your own empty slot
    }
    // All other clicks (filled slots, other players' stalls) do nothing
    // Buy and Collect actions are handled by their respective buttons
  };
  
  const handleBuy = async (transactionId, transactionKey, slotIndex) => {
    const slot = tradeSlots[slotIndex];
    if (!slot || slot.amount <= 0) return; // No valid slot to buy from

    // Re-fetch latest data to confirm availability
    const tradeStallResponse = await axios.get(`${API_BASE}/api/player-trade-stall`, {
      params: { playerId: viewedPlayer.playerId },
    });
    const latestSlots = tradeStallResponse.data.tradeStall || [];
    const currentSlot = latestSlots[slotIndex];
    if (!currentSlot || currentSlot.boughtBy) {
      updateStatus(155); // Item was already purchased
      fetchDataForViewedPlayer();
      return;
    }

    const totalCost = slot.amount * slot.price;
    const currentMoney = inventory.find((item) => item.type === 'Money')?.quantity || 0;

    if (totalCost > currentMoney) {
      console.warn('Not enough money to complete the purchase.'); updateStatus(152);
      return;
    }

    try {
      const tempRecipe = { ingredient1: 'Money', ingredient1qty: totalCost };

      const success = await spendIngredients({
        playerId: currentPlayer.playerId,
        recipe: tempRecipe,
        inventory: currentPlayer.inventory || inventory,  // Use currentPlayer.inventory if available
        backpack: currentPlayer.backpack || [], // No backpack used here
        setInventory,
        setBackpack: () => {}, // No-op
        setCurrentPlayer,
        updateStatus,
      });
      if (!success) { console.warn('Not enough Money to buy this item.'); return; }

      await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: slot.resource,
        quantity: slot.amount,
        inventory: currentPlayer.inventory || inventory,  // Use currentPlayer.inventory if available
        backpack: currentPlayer.backpack || [], // no backpack logic needed here
        setInventory,
        setBackpack: () => {},
        setCurrentPlayer,
        updateStatus,
        masterResources: [], // optional; pass if available
      });

      // Update the TradeStall to mark the slot as purchased
      const updatedSlots = [...tradeSlots];
      updatedSlots[slotIndex] = {
        slotIndex: slotIndex,
        resource: slot.resource,
        amount: slot.amount,
        price: slot.price,
        sellTime: null, // Clear sell time since it's now purchased
        boughtBy: currentPlayer.username,
        boughtFor: totalCost,
      };

      // Remove this refresh call - spendIngredients and gainIngredients already handle it
      // refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
      
      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        playerId: viewedPlayer.playerId,
        tradeStall: updatedSlots,
      });

      setTradeSlots(updatedSlots);
      // Re-fetch the trade stall data for the viewed player to ensure up-to-date state
      // Skip inventory fetch to preserve the updated inventory from spendIngredients/gainIngredients
      await fetchDataForViewedPlayer(true);

      updateStatus(22);
    } catch (error) {
      console.error('Error processing purchase:', error);
      throw error; // Re-throw to let TransactionButton handle the error state
    }
  };

  const handleNextPlayer = () => {
    if (settlementPlayers.length > 0) {
      let nextIndex = viewedPlayerIndex;
      let attempts = 0;
      
      do {
        nextIndex = (nextIndex + 1) % settlementPlayers.length;
        attempts++;
        
        // If we've checked all players and none have items, just move to next
        if (attempts >= settlementPlayers.length) {
          setViewedPlayerIndex(nextIndex);
          setViewedPlayer(settlementPlayers[nextIndex]);
          return;
        }
      } while (nextIndex !== viewedPlayerIndex && !playerHasItems(settlementPlayers[nextIndex]));
      
      setViewedPlayerIndex(nextIndex);
      setViewedPlayer(settlementPlayers[nextIndex]);
    }
  };
  
  const handlePreviousPlayer = () => {
    if (settlementPlayers.length > 0) {
      let previousIndex = viewedPlayerIndex;
      let attempts = 0;
      
      do {
        previousIndex = (previousIndex - 1 + settlementPlayers.length) % settlementPlayers.length;
        attempts++;
        
        // If we've checked all players and none have items, just move to previous
        if (attempts >= settlementPlayers.length) {
          setViewedPlayerIndex(previousIndex);
          setViewedPlayer(settlementPlayers[previousIndex]);
          return;
        }
      } while (previousIndex !== viewedPlayerIndex && !playerHasItems(settlementPlayers[previousIndex]));
      
      setViewedPlayerIndex(previousIndex);
      setViewedPlayer(settlementPlayers[previousIndex]);
    }
  };
  
  // Helper function to check if a player has any items in their trade stall
  const playerHasItems = (player) => {
    // For current player being viewed, check current tradeSlots
    if (player.playerId === viewedPlayer.playerId) {
      return tradeSlots.some(slot => slot?.resource && slot?.amount > 0);
    }
    
    // For other players, check cached trade stall data
    const playerStall = playerTradeStalls[player.playerId];
    if (playerStall) {
      return playerStall.some(slot => slot?.resource && slot?.amount > 0);
    }
    
    // If we don't have data yet, assume they might have items
    return true;
  };
  
  
  const handleAmountChange = (type, value) => {
    const resourceInInventory = inventory.find((item) => item.type === type);
    const inventoryAmount = resourceInInventory ? resourceInInventory.quantity : 0;
    const maxTradeAmount = globalTuning?.maxTradeAmount || 50;
    const maxAmount = Math.min(inventoryAmount, maxTradeAmount);
  
    setAmounts((prev) => ({
      ...prev,
      [type]: Math.min(Math.max(0, value), maxAmount), // Ensure value is within 0 and maxAmount
    }));
  };

  const handleAddToSlot = async (transactionId, transactionKey, resource) => {
    const amount = amounts[resource] || 0;
    const resourceInInventory = inventory.find((item) => item.type === resource);

    if (selectedSlotIndex === null || amount <= 0 || !resourceInInventory || amount > resourceInInventory.quantity) {
      console.warn('Invalid amount or resource exceeds available quantity.');
      return;
    }

    // Check if selling all of a crop item
    if (amount === resourceInInventory.quantity && isACrop(resource, masterResources)) {
      // Check if the plot for this crop has a cost
      const plotResource = masterResources.find(res => res.output === resource && res.category === 'farmplot');
      const plotHasCost = plotResource && plotResource.ingredient1qty > 0;
      
      // Only show confirmation if the plot has a cost (e.g., Corn Plot costs 1 Corn)
      if (plotHasCost) {
        // Show confirmation modal using standard modal system
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
              className="btn-danger"
              onClick={async () => {
                setIsModalOpen(false);
                await performAddToSlot(transactionId, transactionKey, resource, amount);
              }}
            >
              Yes, Sell All
            </button>
          </div>
        ),
      });
      setIsModalOpen(true);
      return;
      }
    }

    // Continue with normal add to slot
    await performAddToSlot(transactionId, transactionKey, resource, amount);
  };

  const performAddToSlot = async (transactionId, transactionKey, resource, amount) => {
    const resourceDetails = resourceData.find((item) => item.type === resource);
    const price = resourceDetails?.minprice || 0;

    const updatedSlots = [...tradeSlots];
    // Update the specific slot with the new item, preserving slotIndex
    updatedSlots[selectedSlotIndex] = { 
      slotIndex: selectedSlotIndex,
      resource, 
      amount, 
      price, 
      sellTime: Date.now() + sellWaitTime,
      boughtBy: null,
      boughtFor: null
    };

    try {
      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        playerId: currentPlayer.playerId,
        tradeStall: updatedSlots,
      });

      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory: inventory.map((item) =>
          item.type === resource
            ? { ...item, quantity: item.quantity - amount }
            : item
        ).filter((item) => item.quantity > 0),
      });

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

      const refreshedInventory = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
      setInventory(refreshedInventory.data.inventory);

      setTradeSlots(updatedSlots);
      setSelectedSlotIndex(null);
      calculateTotalSellValue(updatedSlots);
      
      // Update the cache for current player
      setPlayerTradeStalls(prev => ({
        ...prev,
        [currentPlayer.playerId]: updatedSlots
      }));
    } catch (error) {
      console.error('Error adding item to Trade Stall:', error);
      throw error; // Re-throw to let TransactionButton handle the error state
    }
  };

  
  // Protected function to sell items to game using transaction system
  const handleSellSingle = async (transactionId, transactionKey, slotIndex) => {
    console.log(`🔒 [PROTECTED SELL] Starting protected sell for slot ${slotIndex}`);
    
    try {
      const response = await axios.post(`${API_BASE}/api/trade-stall/sell-to-game`, {
        playerId: currentPlayer.playerId,
        slotIndex,
        transactionId,
        transactionKey: `${transactionKey}-${slotIndex}`
      });

      if (response.data.success) {
        // Update local state with server response
        if (response.data.tradeStall) {
          setTradeSlots(response.data.tradeStall);
        }
        if (response.data.inventory) {
          setInventory(response.data.inventory);
        }
        
        // Track quest progress for selling this item
        await trackQuestProgress(currentPlayer, 'Sell', response.data.resource, response.data.amount, setCurrentPlayer);
        
        // Check if we should increment FTUE step after selling
        if (currentPlayer.ftuestep === 5) {
          console.log('🎓 Player at FTUE step 5 completed a sale, incrementing FTUE step');
          await incrementFTUEStep(currentPlayer.playerId, currentPlayer, setCurrentPlayer);
        }
        
        updateStatus(`💰 Sold ${response.data.amount}x ${response.data.resource} for ${response.data.sold}.`);
        
        // Refresh trade stall data to ensure consistency
        await fetchDataForViewedPlayer(true); // Skip inventory fetch to preserve server state
      }
    } catch (error) {
      console.error('Error in protected sell:', error);
      if (error.response?.status === 429) {
        updateStatus(471);
      } else {
        updateStatus('❌ Failed to sell item');
      }
    }
  };

  const calculateTotalSellValue = (slots) => {
    console.log('Inside calculateTotalSetllValue; Current Inventory:', inventory);
    const total = slots.reduce((sum, slot) => {
      if (slot?.amount && slot?.price) {
        return sum + slot.amount * slot.price;
      }
      return sum;
    }, 0);
    setTotalSellValue(total);
  };

  
  
  const getSymbol = (resourceType) => {
    const resource = resourceData.find((res) => res.type === resourceType);
    return resource?.symbol || '';
  };
  
  // Protected function to collect payment from a bought slot using transaction system
  const handleCollectPayment = async (transactionId, transactionKey, slotIndex) => {
    console.log(`🔒 [PROTECTED COLLECTION] Starting protected collection for slot ${slotIndex}`);
    
    try {
      const response = await axios.post(`${API_BASE}/api/trade-stall/collect-payment`, {
        playerId: currentPlayer.playerId,
        slotIndex,
        transactionId,
        transactionKey: `${transactionKey}-${slotIndex}`
      });

      if (response.data.success) {
        // Update local state with server response
        if (response.data.tradeStall) {
          setTradeSlots(response.data.tradeStall);
        }
        if (response.data.inventory) {
          setInventory(response.data.inventory);
          // Force update currentPlayer to trigger UI refresh
          setCurrentPlayer(prev => ({
            ...prev,
            inventory: response.data.inventory,
            tradeStall: response.data.tradeStall
          }));
        }

        // Track quest progress for selling this item
        await trackQuestProgress(currentPlayer, 'Sell', response.data.resource, response.data.amount, setCurrentPlayer);
        
        // Check if we should increment FTUE step after selling
        if (currentPlayer.ftuestep === 5) {
          console.log('🎓 Player at FTUE step 5 completed a sale, incrementing FTUE step');
          await incrementFTUEStep(currentPlayer.playerId, currentPlayer, setCurrentPlayer);
        }
        
        updateStatus(`💰 Collected ${response.data.collected}.`);
        
        // Refresh trade stall data to ensure consistency
        await fetchDataForViewedPlayer(true); // Skip inventory fetch to preserve server state
      }
    } catch (error) {
      console.error('Error in protected collection:', error);
      if (error.response?.status === 429) {
        updateStatus(471);
      } else {
        updateStatus('❌ Failed to collect payment');
      }
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1008" titleKey="1108" panelName="TradeStall">

      {/* USER NAME AND ARROWS */}

      <div className="username-container">
        <button className="arrow-button" onClick={handlePreviousPlayer}>👈</button>
        <span className="username" style={{ flexGrow: 1, textAlign: 'center' }}>
          {viewedPlayer?.playerId === currentPlayer?.playerId ? 'You' : (viewedPlayer?.username || 'N/A')}
        </span>
        <button className="arrow-button" onClick={handleNextPlayer}>👉</button>
      </div>
      <h3 style={{ textAlign: 'center' }}>
        {viewedPlayer?.playerId === currentPlayer?.playerId ? 'are selling:' : 'is selling:'}
      </h3>
      <br />

      {/* TRADE STALL SLOTS */}

      <div className="trade-stall-slots">
        {tradeSlots.map((slot, index) => {
          const isOwnStall = viewedPlayer.playerId === currentPlayer.playerId;
          const isEmpty = !slot?.resource;
          const isPurchased = slot?.boughtBy;
          const isReadyToSell = slot?.sellTime && slot.sellTime <= Date.now();
          const hasTimer = slot?.sellTime && slot.sellTime > Date.now();
          
          return (
            <div key={index} className="trade-slot-container">
              {/* 1. SLOT DISPLAY */}
              <div
                className={`trade-slot ${isEmpty ? 'empty' : 'filled'} ${isPurchased ? 'purchased' : ''}`}
                onClick={() => handleSlotClick(index)}
                style={{ cursor: (isOwnStall && isEmpty) ? 'pointer' : 'default' }}
              >
                {isEmpty ? (
                  <div className="trade-slot-empty-text">
                    {strings[156]}
                  </div>
                ) : (
                  <div className="trade-slot-content">
                    <div className="trade-slot-item-name">
                      {`${slot.amount}x ${getSymbol(slot.resource)} ${slot.resource}`}
                    </div>
                    {isPurchased && (
                      <div className="trade-slot-status">
                        {strings[157]} {slot.boughtBy}
                      </div>
                    )}
                    {hasTimer && !isPurchased && (
                      <div className="trade-slot-status timer">
                        {formatCountdown(slot.sellTime, Date.now())}
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

              {/* 2. BUTTON CONTAINER */}
              {!isEmpty && (
                <div className="trade-button-container">
                  {/* 3. BUY BUTTON (left 50%) */}
                  <TransactionButton
                    className={`trade-buy-button ${(isOwnStall || isPurchased) ? 'disabled' : 'enabled'}`}
                    disabled={isOwnStall || isPurchased}
                    transactionKey={`buy-trade-${viewedPlayer.playerId}-${index}`}
                    onAction={(transactionId, transactionKey) => handleBuy(transactionId, transactionKey, index)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isPurchased ? 'Sold' : `Buy 💰${slot.amount * slot.price}`}
                  </TransactionButton>

                  {/* 4. COLLECT BUTTON (right 50%) */}
                  {isPurchased ? (
                    <TransactionButton
                      className={`trade-collect-button collect-payment`}
                      disabled={!isOwnStall}
                      transactionKey="collect-payment"
                      onAction={(transactionId, transactionKey) => handleCollectPayment(transactionId, transactionKey, index)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Collect 💰{slot.boughtFor}
                    </TransactionButton>
                  ) : isReadyToSell ? (
                    <TransactionButton
                      className={`trade-collect-button sell-to-game`}
                      disabled={!isOwnStall}
                      transactionKey="sell-to-game"
                      onAction={(transactionId, transactionKey) => handleSellSingle(transactionId, transactionKey, index)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Sell 💰{Math.floor(slot.amount * slot.price * tradeStallHaircut)}
                    </TransactionButton>
                  ) : (
                    <button
                      className={`trade-collect-button ${
                        !isOwnStall ? 'not-yours' : 'disabled'
                      }`}
                      disabled={true}
                    >
                      {!isOwnStall ? 'Not Yours' : 
                       hasTimer ? 'Wait...' : 'No Action'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>


{/* //////////////////  INVENTORY MODAL  ///////////////////*/}

      {selectedSlotIndex !== null && (
        <div className="inventory-modal">
          <button
            className="close-button"
            onClick={() => setSelectedSlotIndex(null)}
          >
            ✖
          </button>
          <h3>{strings[160]}</h3>
          <p style={{ textAlign: 'center', margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
            {globalTuning?.maxTradeAmount || 50} {strings[158]}
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
                {inventory
                  .filter((item) => {
                    const resourceDetails = resourceData.find((res) => res.type === item.type);
                    return (
                      item.type !== 'Money'
                    );
                  })
                  .map((item) => {
                    const resourceDetails = resourceData.find((res) => res.type === item.type);
                    const price = resourceDetails?.minprice || 'N/A';

                    return (
                      <tr key={item.type}>
                        <td>{resourceDetails?.symbol} {item.type}</td>
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
                              disabled={(amounts[item.type] || 0) >= Math.min(item.quantity, globalTuning?.maxTradeAmount || 50)}
                            >
                              +
                            </button>
                            <button
                              onClick={() =>
                                handleAmountChange(item.type, Math.min(item.quantity, globalTuning?.maxTradeAmount || 50))
                              }
                              style={{ marginLeft: '4px' }}
                            >
                              All
                            </button>
                          </div>
                        </td>
                        <td>
                          <TransactionButton
                            className="add-button"
                            onAction={(transactionId, transactionKey) => handleAddToSlot(transactionId, transactionKey, item.type)}
                            transactionKey={`add-to-trade-slot-${item.type}`}
                            disabled={
                              !(amounts[item.type] > 0 && amounts[item.type] <= item.quantity) // Validate amount
                            }
                          >
                            Add
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

    </Panel>
  );
};

export default TradeStall;