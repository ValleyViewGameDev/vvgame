import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel'; // Use Panel instead of Modal
import axios from 'axios';
import './TradeStall.css';
import { spendIngredients, gainIngredients, refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { formatCountdown } from '../../UI/Timers';
import { useUILock } from '../../UI/UILockContext';

function TradeStall({ onClose, inventory, setInventory, currentPlayer, setCurrentPlayer }) {

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
  const { setUILocked } = useUILock();
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
  const COOLDOWN_DURATION = 2000;

  const tradeStallHaircut = 0.25;
  const sellWaitTime = 30 * 1000; // DEBUG 30 s
//  const sellWaitTime = 60 * 60 * 1000; // 1 hour

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
    console.log("🔍 [FETCH DEBUG] fetchDataForViewedPlayer called, skipInventoryFetch:", skipInventoryFetch);
    console.trace("🔍 [FETCH DEBUG] Call stack for fetchDataForViewedPlayer");
    try {
      // Fetch resource data (e.g., for prices)
      const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
      setResourceData(resourcesResponse.data);

      // Only fetch inventory if not skipping (to avoid overwriting during collections)
      if (!skipInventoryFetch) {
        console.log("🔍 [FETCH DEBUG] About to fetch inventory from server");
        const currentInventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        console.log("🔍 [FETCH DEBUG] Server returned inventory:", currentInventoryResponse.data.inventory);
        console.log("🔍 [FETCH DEBUG] Previous local inventory was:", inventory);
        setInventory(currentInventoryResponse.data.inventory || []);
      } else {
        console.log("🔍 [FETCH DEBUG] Skipping inventory fetch to preserve local state");
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
        setSettlementPlayers(settlementPlayersResponse.data.players || []);
      } catch (error) {
        console.error('Error fetching settlement players:', error);
      }
    };

    console.log("🔍 [EFFECT DEBUG] TradeStall useEffect triggered - viewedPlayer:", viewedPlayer?.playerId, "currentPlayer:", currentPlayer?.playerId);
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
  
  const handleBuy = async (slotIndex) => {
    // Cooldown guard to prevent buy spamming
    if (isActionCoolingDown) return;
    setIsActionCoolingDown(true);
    setUILocked(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
      setUILocked(false);
    }, COOLDOWN_DURATION);

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
    console.log('Current inventory:', inventory);
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
        inventory,
        backpack: [], // No backpack used here
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
        inventory,
        backpack: [], // no backpack logic needed here
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

      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        playerId: viewedPlayer.playerId,
        tradeStall: updatedSlots,
      });

      setTradeSlots(updatedSlots);
      // Re-fetch the trade stall data for the viewed player to ensure up-to-date state
      await fetchDataForViewedPlayer();

      updateStatus(22);
      console.log(`Purchased ${slot.amount}x ${slot.resource} for ${totalCost}`);
    } catch (error) {
      console.error('Error processing purchase:', error);
    }
  };

  const handleNextPlayer = () => {
    if (settlementPlayers.length > 0) {
      const nextIndex = (viewedPlayerIndex + 1) % settlementPlayers.length;
      setViewedPlayerIndex(nextIndex);
      setViewedPlayer(settlementPlayers[nextIndex]);
    }
  };
  
  const handlePreviousPlayer = () => {
    if (settlementPlayers.length > 0) {
      const previousIndex =
        (viewedPlayerIndex - 1 + settlementPlayers.length) % settlementPlayers.length;
      setViewedPlayerIndex(previousIndex);
      setViewedPlayer(settlementPlayers[previousIndex]);
    }
  };
  
  
  const handleAmountChange = (type, value) => {
    const resourceInInventory = inventory.find((item) => item.type === type);
    const maxAmount = resourceInInventory ? resourceInInventory.quantity : 0;
  
    setAmounts((prev) => ({
      ...prev,
      [type]: Math.min(Math.max(0, value), maxAmount), // Ensure value is within 0 and maxAmount
    }));
  };

  const handleAddToSlot = async (resource) => {
    // Cooldown guard to prevent add spamming
    if (isActionCoolingDown) return;
    setIsActionCoolingDown(true);
    setUILocked(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
      setUILocked(false);
    }, COOLDOWN_DURATION);

    const amount = amounts[resource] || 0;
    const resourceInInventory = inventory.find((item) => item.type === resource);

    if (selectedSlotIndex === null || amount <= 0 || !resourceInInventory || amount > resourceInInventory.quantity) {
      console.warn('Invalid amount or resource exceeds available quantity.');
      return;
    }

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
    } catch (error) {
      console.error('Error adding item to Trade Stall:', error);
    }
  };

  
  const handleSellSingle = async (slotIndex) => {
    // Cooldown guard to prevent sell spamming
    if (isActionCoolingDown) return;
    setIsActionCoolingDown(true);
    setUILocked(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
      setUILocked(false);
    }, COOLDOWN_DURATION);

    console.log("💬 [DEBUG] Inventory snapshot at function start:", inventory);
    console.log("💬 [DEBUG] Trade slot state at function start:", tradeSlots);
    console.warn(`🧪 handleSellSingle(${slotIndex}) - slot:`, tradeSlots[slotIndex]);
    // Re-fetch the latest trade stall state for the player
    const tradeStallResponse = await axios.get(`${API_BASE}/api/player-trade-stall`, {
      params: { playerId: currentPlayer.playerId },
    });
    const latestSlots = tradeStallResponse.data.tradeStall || [];
    const currentSlot = latestSlots[slotIndex];

    if (!currentSlot || currentSlot.boughtBy) {
      console.warn(`🚫 [handleSellSingle] Slot already bought or invalid:`, currentSlot);
      updateStatus(153); // Item was already purchased
      fetchDataForViewedPlayer(); // Refresh UI
      return;
    }

    const sellValue = Math.floor(currentSlot.amount * currentSlot.price * tradeStallHaircut);
    console.log("🪙 [SELL DEBUG] Selling slot", slotIndex, "for", sellValue, "Money. Resource sold:", currentSlot.resource);

    await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: 'Money',
      quantity: sellValue,
      inventory,
      backpack: [],
      setInventory,
      setBackpack: () => {},
      setCurrentPlayer,
      updateStatus,
      masterResources: [],
    });
    console.log("🪙 [SELL DEBUG] Inventory after selling:", inventory);

    // Track quest progress for selling this item
    await trackQuestProgress(currentPlayer, 'Sell', currentSlot.resource, currentSlot.amount, setCurrentPlayer);

    const updatedSlots = [...tradeSlots];
    // Clear the slot but preserve the slotIndex structure
    updatedSlots[slotIndex] = {
      slotIndex: slotIndex,
      resource: null,
      amount: 0,
      price: 0,
      sellTime: null,
      boughtBy: null,
      boughtFor: null
    };

    await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
      playerId: currentPlayer.playerId,
      tradeStall: updatedSlots,
    });

    setTradeSlots(updatedSlots);
    calculateTotalSellValue(updatedSlots);
    updateStatus(6);
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
  
  // New function to collect payment from a bought slot
  const handleCollectPayment = async (slotIndex) => {
    console.log("💬 [DEBUG] Inventory snapshot at function start:", inventory);
    console.log("💬 [DEBUG] Trade slot state at function start:", tradeSlots);
    console.warn(`🧪 handleCollectPayment(${slotIndex}) - slot:`, tradeSlots[slotIndex]);
    console.log(`🔍 [COLLECTION DEBUG] Starting collection for slot ${slotIndex}`);
    console.log(`🔍 [COLLECTION DEBUG] Current inventory before collection:`, inventory);
    console.log(`🔍 [COLLECTION DEBUG] Current tradeSlots:`, tradeSlots);
    
    if (isActionCoolingDown) return;
    setIsActionCoolingDown(true);
    setUILocked(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
      setUILocked(false);
    }, COOLDOWN_DURATION);

    const slot = tradeSlots[slotIndex];
    console.log(`🔍 [COLLECTION DEBUG] Slot data:`, slot);
    if (!slot || !slot.boughtFor) return;

    try {
      console.log("📦 [COLLECTION DEBUG] Calling gainIngredients with Money:", slot.boughtFor);
      const success = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: 'Money',
        quantity: slot.boughtFor,
        inventory,
        backpack: [],
        setInventory,
        setBackpack: () => {},
        setCurrentPlayer,
        updateStatus,
        masterResources: [],
      });
      console.log("📦 [COLLECTION DEBUG] Inventory after gainIngredients:", inventory);

      if (!success) {
        updateStatus('❌ Failed to collect payment.');
        return;
      }

      // Clear the trade slot but preserve the slotIndex structure
      const updatedSlots = [...tradeSlots];
      updatedSlots[slotIndex] = {
        slotIndex: slotIndex,
        resource: null,
        amount: 0,
        price: 0,
        sellTime: null,
        boughtBy: null,
        boughtFor: null
      };
      console.log(`🔍 [COLLECTION DEBUG] Updated slots after clearing:`, updatedSlots);

      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        playerId: currentPlayer.playerId,
        tradeStall: updatedSlots,
      });
   
      setTradeSlots(updatedSlots);
      calculateTotalSellValue(updatedSlots);
      updateStatus(`Collected ${slot.boughtFor} Money.`);
      
      console.log(`🔍 [COLLECTION DEBUG] Collection complete for slot ${slotIndex}`);
      
      // Refresh trade stall data but skip inventory fetch to preserve gainIngredients state
      console.log("🔍 [COLLECTION DEBUG] Refreshing trade stall data without inventory fetch");
      await fetchDataForViewedPlayer(true); // Skip inventory fetch
    } catch (error) {
      console.error('Error collecting payment:', error);
      updateStatus('❌ Failed to collect payment.');
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
                    Empty
                  </div>
                ) : (
                  <div className="trade-slot-content">
                    <div className="trade-slot-item-name">
                      {`${slot.amount}x ${getSymbol(slot.resource)} ${slot.resource}`}
                    </div>
                    {isPurchased && (
                      <div className="trade-slot-status">
                        Bought by {slot.boughtBy}
                      </div>
                    )}
                    {hasTimer && !isPurchased && (
                      <div className="trade-slot-status timer">
                        Timer: {formatCountdown(slot.sellTime, Date.now())}
                      </div>
                    )}
                    {isReadyToSell && !isPurchased && (
                      <div className="trade-slot-status ready">
                        Ready to sell
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. BUTTON CONTAINER */}
              {!isEmpty && (
                <div className="trade-button-container">
                  {/* 3. BUY BUTTON (left 50%) */}
                  <button
                    className={`trade-buy-button ${(isOwnStall || isPurchased) ? 'disabled' : 'enabled'}`}
                    disabled={isOwnStall || isPurchased || isActionCoolingDown}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isOwnStall && !isPurchased) {
                        handleBuy(index);
                      }
                    }}
                  >
                    {isPurchased ? 'Sold' : `Buy 💰${slot.amount * slot.price}`}
                  </button>

                  {/* 4. COLLECT BUTTON (right 50%) */}
                  <button
                    className={`trade-collect-button ${
                      !isOwnStall ? 'not-yours' :
                      isPurchased ? 'collect-payment' :
                      isReadyToSell ? 'sell-to-game' : 'disabled'
                    }`}
                    disabled={!isOwnStall || (!isPurchased && !isReadyToSell) || isActionCoolingDown}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isOwnStall) {
                        if (isPurchased) {
                          handleCollectPayment(index);
                        } else if (isReadyToSell) {
                          handleSellSingle(index);
                        }
                      }
                    }}
                  >
                    {!isOwnStall ? 'Not Yours' : 
                     isPurchased ? `Collect 💰${slot.boughtFor}` :
                     isReadyToSell ? `Sell 💰${Math.floor(slot.amount * slot.price * tradeStallHaircut)}` :
                     hasTimer ? 'Wait...' : 'No Action'}
                  </button>
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
          <h3>Items to Sell</h3>
          <div className="inventory-modal-scroll">
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Available</th>
                  <th>Price</th>
                  <th>Amount</th>
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
                              disabled={item.quantity <= (amounts[item.type] || 0)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            className="add-button"
                            onClick={() => handleAddToSlot(item.type)}
                            disabled={
                              !(amounts[item.type] > 0 && amounts[item.type] <= item.quantity) || isActionCoolingDown // Validate amount and cooldown
                            }
                          >
                            Add
                          </button>
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