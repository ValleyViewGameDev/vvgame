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

  const tradeStallHaircut = 0.25;
  const sellWaitTime = 10000; // 10 seconds

  const calculateTotalSlots = () => {
    const baseSlots = 4; // Free account base slots
    const accountStatusSlots = {
      Free: 0,
      Bronze: 0,
      Silver: 0,
      Gold: 2,
    };
    return baseSlots + (accountStatusSlots[currentPlayer.accountStatus] || 0);
  };

  // Lift fetchDataForViewedPlayer out of useEffect for reuse
  const fetchDataForViewedPlayer = async () => {
    try {
      // Fetch resource data (e.g., for prices)
      const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
      setResourceData(resourcesResponse.data);

      // Fetch inventory for the current player
      const currentInventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
      setInventory(currentInventoryResponse.data.inventory || []);

      // Fetch trade stall data for the viewed player
      const tradeStallResponse = await axios.get(`${API_BASE}/api/player-trade-stall`, {
        params: { playerId: viewedPlayer.playerId },
      });

      // Calculate slots
      const totalSlots = calculateTotalSlots(viewedPlayer);
      const existingSlots = tradeStallResponse.data.tradeStall || [];
      const filledSlots = Array(totalSlots).fill(null);
      existingSlots.forEach((slot, index) => {
        if (index < totalSlots && slot && slot.resource) {
          filledSlots[index] = { ...slot };
        }
      });
      // Ensure all unfilled slots remain null
      for (let i = 0; i < filledSlots.length; i++) {
        if (!filledSlots[i]) filledSlots[i] = null;
      }
      setTradeSlots(filledSlots);

      // Update totalSellValue only if viewing currentPlayer's stall
      if (viewedPlayer.playerId === currentPlayer.playerId) {
        const total = existingSlots.reduce((sum, slot) => {
          if (slot?.amount && slot?.price) {
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

    fetchDataForViewedPlayer();
    fetchSettlementPlayers();
    
  }, [viewedPlayer, currentPlayer]);
  

  const handleSlotClick = (index) => {
    const slot = tradeSlots[index];
    const isOwnStall = viewedPlayer.playerId === currentPlayer.playerId;

    if (slot && slot.amount > 0 && !slot.boughtBy) {
      if (isOwnStall) {
        updateStatus(11001); // Can't buy your own stuff
        return;
      }
      handleBuy(index); // Buy from another player's filled slot
    } else {
      updateStatus(151); // Treat slot with boughtBy as empty for other players
      return;
    }
  };
  
  const handleBuy = async (slotIndex) => {
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

      // Update the TradeStall to mark the slot as purchased by making it empty
      const updatedSlots = [...tradeSlots];
      updatedSlots[slotIndex] = {
        ...slot,
        boughtBy: currentPlayer.username,
        boughtFor: totalCost,
      };
      delete updatedSlots[slotIndex].sellTime;

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
    const amount = amounts[resource] || 0;
    const resourceInInventory = inventory.find((item) => item.type === resource);

    if (selectedSlotIndex === null || amount <= 0 || !resourceInInventory || amount > resourceInInventory.quantity) {
      console.warn('Invalid amount or resource exceeds available quantity.');
      return;
    }

    const resourceDetails = resourceData.find((item) => item.type === resource);
    const price = resourceDetails?.minprice || 0;

    const updatedSlots = [...tradeSlots];
    updatedSlots[selectedSlotIndex] = { resource, amount, price, sellTime: Date.now() + sellWaitTime };

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
    const slot = tradeSlots[slotIndex];
    if (!slot) return;

    // Re-fetch the latest trade stall state for the player
    const tradeStallResponse = await axios.get(`${API_BASE}/api/player-trade-stall`, {
      params: { playerId: currentPlayer.playerId },
    });
    const latestSlots = tradeStallResponse.data.tradeStall || [];
    const currentSlot = latestSlots[slotIndex];

    // If slot is null or bought, treat as already purchased
    if (!currentSlot || currentSlot.boughtBy) {
      updateStatus(153); // Item was already purchased
      fetchDataForViewedPlayer(); // Refresh UI
      return;
    }

    const sellValue = Math.floor(slot.amount * slot.price * tradeStallHaircut);

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

    // Track quest progress for selling this item
    await trackQuestProgress(currentPlayer, 'Sell', slot.resource, slot.amount, setCurrentPlayer);

    const updatedSlots = [...tradeSlots];
    updatedSlots[slotIndex] = null;

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
    const slot = tradeSlots[slotIndex];
    if (!slot || !slot.boughtFor) return;

    await gainIngredients({
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

    const updatedSlots = [...tradeSlots];
    updatedSlots[slotIndex] = null;

    await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
      playerId: currentPlayer.playerId,
      tradeStall: updatedSlots,
    });
 
    setTradeSlots(updatedSlots);
    calculateTotalSellValue(updatedSlots);
    updateStatus(6);
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
        {tradeSlots.map((slot, index) => (
          <div
            key={index}
            className={`trade-slot ${
              slot && !(slot.boughtBy && viewedPlayer.playerId !== currentPlayer.playerId) ? 'filled' : ''
            } ${
              slot && slot.boughtBy && viewedPlayer.playerId !== currentPlayer.playerId ? 'disabled' : ''
            }`}
            onClick={() => handleSlotClick(index)}
            style={slot ? { minHeight: '75px' } : {}}
          >
            {(slot && !(slot.boughtBy && viewedPlayer.playerId !== currentPlayer.playerId)) ? (
              <div
                style={{
                  textAlign: 'center',
                  fontSize: '1rem',
                  minHeight: '75px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ marginBottom: '6px' }}>
                  {`${slot.amount}x ${getSymbol(slot.resource)} ${slot.resource}`}
                </div>
                {viewedPlayer.playerId === currentPlayer.playerId && slot.sellTime && slot.sellTime > Date.now() && (
                  <div style={{ fontSize: '0.9rem' }}>{formatCountdown(slot.sellTime, Date.now())}</div>
                )}
                {viewedPlayer.playerId === currentPlayer.playerId && slot.sellTime && slot.sellTime <= Date.now() && (
                  <button
                    className="sell-button"
                    style={{ fontSize: '0.95rem', padding: '4px 8px', marginTop: '4px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSellSingle(index);
                    }}
                  >
                    Sell for 💰{Math.floor(slot.amount * slot.price * tradeStallHaircut)}
                  </button>
                )}

                {/* New block for collecting payment after purchase */}

                {viewedPlayer.playerId === currentPlayer.playerId && slot.boughtBy && (
                  <>
                    <div style={{ fontSize: '0.9rem' }}>Bought by {slot.boughtBy}</div>
                    <button
                      className="sell-button"
                      style={{ fontSize: '0.95rem', padding: '4px 8px', marginTop: '4px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCollectPayment(index);
                      }}
                    >
                      Collect 💰{slot.boughtFor}
                    </button>
                  </>
                )}

                {/* Show Buy for button if viewing another player's slot, item for sale, and not bought */}

                {viewedPlayer.playerId !== currentPlayer.playerId && !slot.boughtBy && (
                  <button
                    className="sell-button"
                    style={{ fontSize: '0.95rem', padding: '4px 8px', marginTop: '4px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBuy(index);
                    }}
                  >
                    Buy for 💰{slot.amount * slot.price}
                  </button>
                )}
              </div>
            ) : (
              'Empty'
            )}
          </div>
        ))}
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
                              !(amounts[item.type] > 0 && amounts[item.type] <= item.quantity) // Validate amount
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