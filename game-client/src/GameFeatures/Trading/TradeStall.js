import API_BASE from '../../config';
import strings from '../../UI/strings';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel'; // Use Panel instead of Modal
import axios from 'axios';
import './TradeStall.css';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';

function TradeStall({ onClose, inventory, setInventory, currentPlayer, setCurrentPlayer }) {

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

  useEffect(() => {
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
          if (index < totalSlots) filledSlots[index] = slot;
        });
  
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

    // Prevent interaction with empty slots in other players' trade stalls
    const isOwnStall = viewedPlayer.playerId === currentPlayer.playerId;
    if (!isOwnStall) {
        updateStatus(151);
      return; // Do nothing if viewing another player's stall
    }

    if (slot && slot.amount > 0) {
      handleBuy(index); // Trigger the Buy action for filled slots
    } else {
      setSelectedSlotIndex(index); // Open inventory modal for empty slots
    }
  };
  
  const handleBuy = async (slotIndex) => {
    const slot = tradeSlots[slotIndex];
  
    if (!slot || slot.amount <= 0) return; // No valid slot to buy from
  
    const totalCost = slot.amount * slot.price;
    console.log('Current inventory:', inventory);
    const currentMoney = inventory.find((item) => item.type === 'Money')?.quantity || 0;
         
    if (totalCost > currentMoney) {
      console.warn('Not enough money to complete the purchase.');
      updateStatus(152);
      return;
    }
  
    try {
      // Deduct money from currentPlayer
      const updatedInventory = inventory.map((item) =>
        item.type === 'Money'
          ? { ...item, quantity: item.quantity - totalCost }
          : item
      );
  
      // Add the purchased resource to currentPlayer's inventory
      const existingResourceIndex = updatedInventory.findIndex((item) => item.type === slot.resource);
      if (existingResourceIndex >= 0) {
        updatedInventory[existingResourceIndex].quantity += slot.amount;
      } else {
        updatedInventory.push({ type: slot.resource, quantity: slot.amount });
      }
  
      // Update the TradeStall to reduce or clear the slot
      const updatedSlots = [...tradeSlots];
      updatedSlots[slotIndex] = null;
  
      // Server API calls
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
      });
  
      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        playerId: viewedPlayer.playerId,
        tradeStall: updatedSlots,
      });
  
      // Update local state
      setInventory(updatedInventory);
      setTradeSlots(updatedSlots);
  
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
    updatedSlots[selectedSlotIndex] = { resource, amount, price };
  
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

  const handleSell = async () => {
  
    try {
      // Calculate new inventory with updated Money (50% of item value)
      const halfSellValue = Math.floor(totalSellValue * tradeStallHaircut);
      const updatedInventory = inventory.map((item) =>
        item.type === 'Money'
          ? { ...item, quantity: (item.quantity || 0) + halfSellValue }
          : item
      );
  
      // Update inventory on the server
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
      });
  
      // Clear the TradeStall on the server
      const clearedSlots = tradeSlots.map(() => null);
      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        playerId: currentPlayer.playerId,
        tradeStall: clearedSlots,
      });
  
      // Re-fetch inventory from server to ensure consistency
      const refreshedInventoryResponse = await axios.get(
        `${API_BASE}/api/inventory/${currentPlayer.playerId}`
      );
      const refreshedInventory = refreshedInventoryResponse.data.inventory || [];
  
      // Update local state
      setInventory(refreshedInventory);
      setTradeSlots(clearedSlots);
      setTotalSellValue(0);
  
      // Update currentPlayer state for Money
      const updatedPlayer = {
        ...currentPlayer,
        inventory: refreshedInventory,
        money: refreshedInventory.find((item) => item.type === 'Money')?.quantity || 0,
      };
      setCurrentPlayer(updatedPlayer);
  
      // Sync local storage
      localStorage.setItem('player', JSON.stringify(updatedPlayer));
  
      updateStatus(6); // status bar text
      console.log(`Items sold successfully! Total earned: ${halfSellValue}`);
    } catch (error) {
      console.error('Error selling items:', error);
    }
  };
  
  const getSymbol = (resourceType) => {
    const resource = resourceData.find((res) => res.type === resourceType);
    return resource?.symbol || '';
  };
  
  return (
    <Panel onClose={onClose} descriptionKey="1008" titleKey="1108" panelName="TradeStall">
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
      <div className="trade-stall-slots">
        {tradeSlots.map((slot, index) => (
          <div
            key={index}
            className={`trade-slot ${slot ? 'filled' : ''}`}
            onClick={() => handleSlotClick(index)}
          >
            {slot ? `${slot.amount}x ${getSymbol(slot.resource)} ${slot.resource} (${slot.price ?? 0} ea.)` : 'Empty'}
          </div>
        ))}
      </div>

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


<div className="sell-button-container">
  <button
    className="sell-button"
    onClick={handleSell}
    disabled={totalSellValue === 0}
  >
    Sell for {Math.floor(totalSellValue * tradeStallHaircut)}
  </button>
</div>

    </Panel>
  );
};

export default TradeStall;
