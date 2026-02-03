import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panels/Panel'; // Use Panel instead of Modal
import TransactionButton from '../../UI/Buttons/TransactionButton';
import TradingInventoryModal from '../../UI/Modals/TradingInventoryModal';
import axios from 'axios';
import './TradeStall.css';
import '../../UI/Modals/Modal.css';
import '../../UI/Buttons/SharedButtons.css';
import { spendIngredients, gainIngredients, refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { isACrop } from '../../Utils/ResourceHelpers';
// import { handlePurchase } from '../../Store/Store'; // COMMENTED OUT - Gold Pass
import GlobalMarketModal from './GlobalMarketModal';

function TradeStall({ onClose, inventory, setInventory, backpack, setBackpack, currentPlayer, setCurrentPlayer, globalTuning, setModalContent, setIsModalOpen, masterResources }) {

  const strings = useStrings();
  const [tradeSlots, setTradeSlots] = useState([]);
  const [requestSlots, setRequestSlots] = useState([]);
  const [activeTab, setActiveTab] = useState('sell'); // 'sell' or 'request'
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);
  const [selectedRequestSlotIndex, setSelectedRequestSlotIndex] = useState(null);
  const [amounts, setAmounts] = useState({}); // Store amounts per resource
  const [requestAmounts, setRequestAmounts] = useState({}); // Store amounts for request modal
  const [totalSellValue, setTotalSellValue] = useState(0);
  const [resourceData, setResourceData] = useState([]); // Store resource data
  const { updateStatus } = useContext(StatusBarContext);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true); // Loading state for initial data fetch
  const [isGlobalMarketOpen, setIsGlobalMarketOpen] = useState(false); // Global Market modal state

  const tradeStallSlotConfig = globalTuning?.tradeStallSlots || [];
  const tradeStallRequestConfig = globalTuning?.tradeStallRequests || [];
  
  // Get slot-specific configuration
  const getSlotConfig = (slotIndex) => {
    const config = tradeStallSlotConfig.find(slot => slot.slotIndex === slotIndex);
    return config || {
      maxAmount: 50,
      sellWaitTime: 300000,
      unlocked: slotIndex === 0,
      unlockCost: 0,
      requiresGoldPass: false
    };
  };

  // Get request slot-specific configuration
  const getRequestSlotConfig = (slotIndex) => {
    const config = tradeStallRequestConfig.find(slot => slot.slotIndex === slotIndex);
    return config || {
      maxAmount: 10,
      unlocked: slotIndex === 0,
      unlockCost: 0,
      requiresGoldPass: false
    };
  };

  const isRequestSlotUnlocked = (slotIndex) => {
    const slot = requestSlots[slotIndex];
    const config = getRequestSlotConfig(slotIndex);

    if (!slot) return false;

    if (slot.locked === undefined) {
      if (slot.resource && slot.amount > 0) return true;
      return slotIndex === 0;
    }

    if (slot.locked === true) {
      if (config.requiresGoldPass && currentPlayer.accountStatus === 'Gold') {
        return true;
      }
      return false;
    }

    return true;
  };
  
  const isSlotUnlocked = (slotIndex) => {
    const slot = tradeSlots[slotIndex];
    const config = getSlotConfig(slotIndex);
    
    // If slot doesn't exist
    if (!slot) {
      return false;
    }
    
    // Handle backward compatibility - if locked field is undefined
    if (slot.locked === undefined) {
      // For backward compatibility: slots with items are considered unlocked
      if (slot.resource && slot.amount > 0) {
        return true;
      }
      // Otherwise, only first slot is unlocked by default
      return slotIndex === 0;
    }
    
    // If slot is explicitly locked
    if (slot.locked === true) {
      // Check if it's a Gold Pass slot and user has Gold Pass
      if (config.requiresGoldPass && currentPlayer.accountStatus === 'Gold') {
        return true; // Gold Pass overrides the locked state
      }
      return false;
    }
    
    return true; // If not locked, it's unlocked
  };
  
  const handleUnlockSlot = async (slotIndex) => {
    const config = getSlotConfig(slotIndex);
    if (!config || config.requiresGoldPass) return;
    
    try {
      // First, use spendIngredients to handle the wood cost properly
      const tempRecipe = { 
        ingredient1: 'Wood', 
        ingredient1qty: config.unlockCost 
      };
      
      const success = await spendIngredients({
        playerId: currentPlayer.playerId,
        recipe: tempRecipe,
        inventory: currentPlayer.inventory || inventory,
        backpack: currentPlayer.backpack || [],
        setInventory,
        setBackpack: () => {}, // No-op
        setCurrentPlayer,
        updateStatus,
      });
      
      if (!success) {
        console.warn('Not enough Wood to unlock this slot.');
        updateStatus(`${strings[177]} ${config.unlockCost} ${getSymbol('Wood')} ${strings[176]} ${strings[178]}`);
        return;
      }
      
      // If wood was spent successfully, update only this specific slot
      const updatedSlots = tradeSlots.map((slot, index) => {
        if (index === slotIndex) {
          return {
            ...slot,
            locked: false
          };
        }
        return slot;
      });
      
      // Update the trade stall on the server
      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        playerId: currentPlayer.playerId,
        tradeStall: updatedSlots
      });
      
      // Update local state
      setTradeSlots(updatedSlots);
      setCurrentPlayer({
        ...currentPlayer,
        tradeStall: updatedSlots
      });
      
      // Refresh player data to ensure consistency
      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
      
      // Re-fetch trade stall data to ensure UI is in sync
      await fetchDataForViewedPlayer(true); // Skip inventory fetch since it was just updated
      
      updateStatus(`${strings[170]}`);
    } catch (error) {
      console.error('Error unlocking slot:', error);
      updateStatus('Failed to unlock slot');
    }
  };


  // Lift fetchDataForViewedPlayer out of useEffect for reuse
  const fetchDataForViewedPlayer = async (skipInventoryFetch = false) => {
    try {
      if (!skipInventoryFetch) {
        setIsLoadingInitial(true);
      }
      // Fetch resource data (e.g., for prices)
      const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
      setResourceData(resourcesResponse.data);

      // Only fetch inventory if not skipping (to avoid overwriting during collections)
      if (!skipInventoryFetch) {
        const currentInventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setInventory(currentInventoryResponse.data.inventory || []);
      }

      // Fetch trade stall data for the current player
      const tradeStallResponse = await axios.get(`${API_BASE}/api/player-trade-stall`, {
        params: { playerId: currentPlayer.playerId },
      });

      // Always show all 6 slots
      const serverSlots = tradeStallResponse.data.tradeStall || [];

      // Ensure we have exactly 6 slots from server, preserve existing slot data
      const allSlots = Array.from({ length: 6 }, (_, index) => {
        const existingSlot = serverSlots.find(slot => slot && slot.slotIndex === index);
        if (existingSlot) {
          // Preserve all existing slot data including locked state
          return existingSlot;
        }
        // Only create default locked slot if it doesn't exist on server
        return {
          slotIndex: index,
          locked: true,
          resource: null,
          amount: 0,
          price: 0,
          sellTime: null,
          boughtBy: null,
          boughtFor: null
        };
      });

      setTradeSlots(allSlots);

      // Fetch request slots data
      const requestSlotsResponse = await axios.get(`${API_BASE}/api/player-trade-stall-requests`, {
        params: { playerId: currentPlayer.playerId },
      });

      const serverRequestSlots = requestSlotsResponse.data.tradeStallRequests || [];
      const allRequestSlots = Array.from({ length: 3 }, (_, index) => {
        const existingSlot = serverRequestSlots.find(slot => slot && slot.slotIndex === index);
        if (existingSlot) {
          return existingSlot;
        }
        return {
          slotIndex: index,
          locked: true,
          resource: null,
          amount: 0,
          price: 0,
          moneyCommitted: 0
        };
      });

      setRequestSlots(allRequestSlots);

      // Calculate total sell value for current player's stall
      const total = allSlots.reduce((sum, slot) => {
        if (slot?.resource && slot?.amount && slot?.price && !slot?.boughtBy) {
          return sum + slot.amount * slot.price;
        }
        return sum;
      }, 0);
      setTotalSellValue(total);
    } catch (error) {
      console.error('Error fetching TradeStall data:', error);
    } finally {
      setIsLoadingInitial(false);
    }
  };

  useEffect(() => {
    // Only fetch data for current player's own trade stall
    fetchDataForViewedPlayer();
  }, [currentPlayer?.playerId]); // Only depend on current player
  
  // Handle buying from global market
  const handleGlobalMarketBuy = async (playerId, slotIndex, transactionId, transactionKey) => {
    try {
      // Re-fetch latest data to confirm availability
      const tradeStallResponse = await axios.get(`${API_BASE}/api/player-trade-stall`, {
        params: { playerId },
      });
      const latestSlots = tradeStallResponse.data.tradeStall || [];
      const currentSlot = latestSlots[slotIndex];
      
      if (!currentSlot || currentSlot.boughtBy) {
        updateStatus(155); // Item was already purchased
        return;
      }

      const totalCost = currentSlot.amount * currentSlot.price;
      const currentMoney = inventory.find((item) => item.type === 'Money')?.quantity || 0;

      if (totalCost > currentMoney) {
        console.warn('Not enough money to complete the purchase.');
        updateStatus(152);
        return;
      }

      // Use the same purchase logic as the original handleBuy
      const tempRecipe = { ingredient1: 'Money', ingredient1qty: totalCost };

      const success = await spendIngredients({
        playerId: currentPlayer.playerId,
        recipe: tempRecipe,
        inventory: currentPlayer.inventory || inventory,
        backpack: currentPlayer.backpack || [],
        setInventory,
        setBackpack: () => {},
        setCurrentPlayer,
        updateStatus,
      });
      
      if (!success) {
        console.warn('Not enough Money to buy this item.');
        return;
      }

      const gainResult = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: currentSlot.resource,
        quantity: currentSlot.amount,
        inventory: currentPlayer.inventory || inventory,
        backpack: currentPlayer.backpack || [],
        setInventory,
        setBackpack: () => {},
        setCurrentPlayer,
        updateStatus,
        masterResources,
        globalTuning,
      });

      // Check if gaining items failed (e.g., warehouse full)
      if (gainResult && gainResult.success === false) {
        console.warn('Failed to add items to inventory:', gainResult.error?.message);

        // Rollback the money that was spent
        await gainIngredients({
          playerId: currentPlayer.playerId,
          currentPlayer,
          resource: 'Money',
          quantity: totalCost,
          inventory: currentPlayer.inventory || inventory,
          backpack: currentPlayer.backpack || [],
          setInventory,
          setBackpack: () => {},
          setCurrentPlayer,
          updateStatus: () => {}, // Don't show status for refund
          masterResources,
          globalTuning,
        });

        // Don't mark the item as sold, just return
        // Note: updateStatus was already called by gainIngredients to show warehouse full
        return;
      }

      // Update the seller's TradeStall to mark the slot as purchased
      const updatedSlots = [...latestSlots];
      updatedSlots[slotIndex] = {
        ...currentSlot,
        sellTime: null,
        boughtBy: currentPlayer.username,
        boughtFor: totalCost,
      };

      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        playerId: playerId,
        tradeStall: updatedSlots,
      });

      updateStatus(22); // Purchase successful
    } catch (error) {
      console.error('Error processing global market purchase:', error);
      throw error;
    }
  };

  // Handle fulfilling a request from global market (selling to a player's request)
  const handleGlobalMarketFulfillRequest = async (buyerPlayerId, slotIndex, transactionId, transactionKey) => {
    try {
      const response = await axios.post(`${API_BASE}/api/trade-stall/fulfill-request`, {
        sellerPlayerId: currentPlayer.playerId,
        buyerPlayerId,
        slotIndex,
        transactionId,
        transactionKey: `${transactionKey}-${slotIndex}`
      });

      if (response.data.success) {
        // Update seller's (current player's) inventory using the returned data
        setInventory(response.data.sellerInventory);
        setCurrentPlayer(prev => ({
          ...prev,
          inventory: response.data.sellerInventory
        }));

        updateStatus(`Sold ${response.data.amount}x ${getLocalizedString(response.data.resource, strings)} for 💰${response.data.earned}`);
      }
    } catch (error) {
      console.error('Error fulfilling request:', error);
      if (error.response?.status === 400) {
        updateStatus(error.response.data.error || 'Failed to fulfill request');
      } else {
        updateStatus('❌ Failed to fulfill request');
      }
      throw error;
    }
  };

  const handleSlotClick = (index) => {
    const slot = tradeSlots[index];
    const isEmpty = !slot?.resource;
    const slotUnlocked = isSlotUnlocked(index);
    const config = getSlotConfig(index);
    
    console.log('Slot clicked:', index, 'Is unlocked:', slotUnlocked, 'Is empty:', isEmpty);

    // If slot is locked
    if (!slotUnlocked) {
      if (config.requiresGoldPass && currentPlayer.accountStatus !== 'Gold') {
        // Gold Pass required - do nothing, button will handle it
        return;
      } else if (!config.requiresGoldPass) {
        // Regular unlock with wood - do nothing, button will handle it
        return;
      }
    }
    
    // Only allow slot clicks for empty, unlocked slots
    if (isEmpty && slotUnlocked) {
      setSelectedSlotIndex(index); // Open inventory modal
      // Reset amounts when opening modal to prevent quantity persistence bug
      setAmounts({});
    }
    // All other clicks do nothing
  };
  

  
  
  const handleAmountChange = (type, value) => {
    const resourceInInventory = inventory.find((item) => item.type === type);
    const inventoryAmount = resourceInInventory ? resourceInInventory.quantity : 0;
    const slotConfig = getSlotConfig(selectedSlotIndex);
    const maxAmount = Math.min(inventoryAmount, slotConfig.maxAmount);
  
    setAmounts((prev) => ({
      ...prev,
      [type]: Math.min(Math.max(0, value), maxAmount), // Ensure value is within 0 and maxAmount
    }));
  };

  const handleAddToSlot = async (transactionId, transactionKey, resource) => {
    let amount = amounts[resource] || 0;
    const resourceInInventory = inventory.find((item) => item.type === resource);

    if (selectedSlotIndex === null || amount <= 0 || !resourceInInventory || amount > resourceInInventory.quantity) {
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
          <div className="shared-buttons" style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
            <button
              className="btn-basic btn-neutral"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </button>
            <button 
              className="btn-basic btn-danger"
              onClick={async () => {
                setIsModalOpen(false);
                // Re-check slot limit in case it changed
                const slotConfig = getSlotConfig(selectedSlotIndex);
                const finalAmount = Math.min(amount, slotConfig.maxAmount);
                await performAddToSlot(transactionId, transactionKey, resource, finalAmount);
              }}
            >
              {strings[168]}
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
    const price = resourceDetails?.maxprice || 0;
    const slotConfig = getSlotConfig(selectedSlotIndex);

    const updatedSlots = [...tradeSlots];
    // Update the specific slot with the new item, preserving slotIndex
    updatedSlots[selectedSlotIndex] = { 
      slotIndex: selectedSlotIndex,
      resource, 
      amount, 
      price, 
      sellTime: Date.now() + slotConfig.sellWaitTime,
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
          // Also update currentPlayer to trigger UI updates
          setCurrentPlayer(prev => ({
            ...prev,
            tradeStall: response.data.tradeStall
          }));
        }
        if (response.data.inventory) {
          setInventory(response.data.inventory);
          // Also update currentPlayer's inventory to trigger UI updates
          setCurrentPlayer(prev => ({
            ...prev,
            inventory: response.data.inventory
          }));
        }
        
        // Track quest progress for selling this item
        await trackQuestProgress(currentPlayer, 'Sell', response.data.resource, response.data.amount, setCurrentPlayer);
        
        updateStatus(`${strings[141]} ${response.data.amount}x ${getLocalizedString(response.data.resource, strings)} (💰 ${response.data.sold}).`);
        
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

  // Handle request slot click
  const handleRequestSlotClick = (index) => {
    const slot = requestSlots[index];
    const isEmpty = !slot?.resource;
    const slotUnlocked = isRequestSlotUnlocked(index);

    if (isEmpty && slotUnlocked) {
      setSelectedRequestSlotIndex(index);
      setRequestAmounts({});
    }
  };

  // Handle request amount change
  const handleRequestAmountChange = (type, value) => {
    const slotConfig = getRequestSlotConfig(selectedRequestSlotIndex);
    const maxAmount = slotConfig.maxAmount;

    setRequestAmounts((prev) => ({
      ...prev,
      [type]: Math.min(Math.max(0, value), maxAmount)
    }));
  };

  // Handle creating a request (commits money)
  const handleCreateRequest = async (transactionId, transactionKey, resource) => {
    const amount = requestAmounts[resource] || 0;

    if (selectedRequestSlotIndex === null || amount <= 0) {
      console.warn('Invalid amount for request.');
      return;
    }

    const resourceDetails = resourceData.find((item) => item.type === resource);
    const price = resourceDetails?.maxprice || 0;
    const totalCost = amount * price;

    // Check if player has enough money
    const currentMoney = inventory.find((item) => item.type === 'Money')?.quantity || 0;
    if (totalCost > currentMoney) {
      updateStatus("You don't have enough money");
      return;
    }

    // Commit the money using spendIngredients
    const tempRecipe = { ingredient1: 'Money', ingredient1qty: totalCost };

    const success = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe: tempRecipe,
      inventory: currentPlayer.inventory || inventory,
      backpack: currentPlayer.backpack || [],
      setInventory,
      setBackpack: () => {},
      setCurrentPlayer,
      updateStatus,
    });

    if (!success) {
      console.warn('Not enough Money to create request.');
      updateStatus("You don't have enough money");
      return;
    }

    // Update request slots
    const updatedRequestSlots = [...requestSlots];
    updatedRequestSlots[selectedRequestSlotIndex] = {
      slotIndex: selectedRequestSlotIndex,
      resource,
      amount,
      price,
      moneyCommitted: totalCost
    };

    try {
      await axios.post(`${API_BASE}/api/update-player-trade-stall-requests`, {
        playerId: currentPlayer.playerId,
        tradeStallRequests: updatedRequestSlots
      });

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

      const refreshedInventory = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
      setInventory(refreshedInventory.data.inventory);

      setRequestSlots(updatedRequestSlots);
      setSelectedRequestSlotIndex(null);
      updateStatus(`Request posted for ${amount}x ${getLocalizedString(resource, strings)}`);
    } catch (error) {
      console.error('Error creating request:', error);
      throw error;
    }
  };

  // Handle canceling a request (refunds money)
  const handleCancelRequest = async (transactionId, transactionKey, slotIndex) => {
    const slot = requestSlots[slotIndex];

    if (!slot?.resource || !slot?.moneyCommitted) {
      console.warn('No request to cancel in this slot.');
      return;
    }

    try {
      // Refund the committed money
      await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: 'Money',
        quantity: slot.moneyCommitted,
        inventory: currentPlayer.inventory || inventory,
        backpack: currentPlayer.backpack || [],
        setInventory,
        setBackpack: () => {},
        setCurrentPlayer,
        updateStatus,
        masterResources,
        globalTuning,
      });

      // Clear the request slot
      const updatedRequestSlots = [...requestSlots];
      updatedRequestSlots[slotIndex] = {
        slotIndex,
        locked: slot.locked,
        resource: null,
        amount: 0,
        price: 0,
        moneyCommitted: 0
      };

      await axios.post(`${API_BASE}/api/update-player-trade-stall-requests`, {
        playerId: currentPlayer.playerId,
        tradeStallRequests: updatedRequestSlots
      });

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

      const refreshedInventory = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
      setInventory(refreshedInventory.data.inventory);

      setRequestSlots(updatedRequestSlots);
      updateStatus(`Request canceled. Refunded 💰${slot.moneyCommitted}`);
    } catch (error) {
      console.error('Error canceling request:', error);
      if (error.response?.status === 429) {
        updateStatus(471);
      } else {
        updateStatus('❌ Failed to cancel request');
      }
    }
  };

  // Handle unlocking a request slot
  const handleUnlockRequestSlot = async (slotIndex) => {
    const config = getRequestSlotConfig(slotIndex);
    if (!config || config.requiresGoldPass) return;

    try {
      const tempRecipe = {
        ingredient1: 'Wood',
        ingredient1qty: config.unlockCost
      };

      const success = await spendIngredients({
        playerId: currentPlayer.playerId,
        recipe: tempRecipe,
        inventory: currentPlayer.inventory || inventory,
        backpack: currentPlayer.backpack || [],
        setInventory,
        setBackpack: () => {},
        setCurrentPlayer,
        updateStatus,
      });

      if (!success) {
        console.warn('Not enough Wood to unlock this request slot.');
        updateStatus(`${strings[177]} ${config.unlockCost} ${getSymbol('Wood')} ${strings[176]} ${strings[178]}`);
        return;
      }

      const updatedSlots = requestSlots.map((slot, index) => {
        if (index === slotIndex) {
          return {
            ...slot,
            locked: false
          };
        }
        return slot;
      });

      await axios.post(`${API_BASE}/api/update-player-trade-stall-requests`, {
        playerId: currentPlayer.playerId,
        tradeStallRequests: updatedSlots
      });

      setRequestSlots(updatedSlots);
      setCurrentPlayer({
        ...currentPlayer,
        tradeStallRequests: updatedSlots
      });

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
      await fetchDataForViewedPlayer(true);

      updateStatus(`${strings[170]}`);
    } catch (error) {
      console.error('Error unlocking request slot:', error);
      updateStatus('Failed to unlock slot');
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1008" titleKey="1108" panelName="TradeStall">

      {/* GLOBAL MARKET BUTTON */}

        <div className="shared-buttons" style={{ margin: '2px 0' }}>
          <button
            className="btn-basic btn-success"
            onClick={() => setIsGlobalMarketOpen(true)}
          >
            🌍 {strings[362] || "Global Market"}
          </button>
        </div>

      {/* SEPARATOR AND HEADER */}
      <div style={{ margin: '16px 0' }}>
      </div>

      {/* TAB NAVIGATION */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'sell' ? 'active' : ''}`}
          onClick={() => setActiveTab('sell')}
        >
          Sell
        </button>
        <button
          className={`tab-button ${activeTab === 'request' ? 'active' : ''}`}
          onClick={() => setActiveTab('request')}
        >
          Request
        </button>
      </div>

      {/* LOADING INDICATOR */}
      {isLoadingInitial ? (
        <div style={{ textAlign: 'center', padding: '40px', fontSize: '1.2rem' }}>
          {strings[98]}
        </div>
      ) : (
        <>
          {/* SELL TAB - TRADE STALL SLOTS */}
          {activeTab === 'sell' && (
          <div className="trade-stall-slots shared-buttons">
        {tradeSlots.map((slot, index) => {
          const isOwnStall = true; // Always viewing own stall now
          const isEmpty = !slot?.resource;
          const isPurchased = slot?.boughtBy;
          const isReadyToSell = slot?.sellTime && slot.sellTime <= Date.now();
          const hasTimer = slot?.sellTime && slot.sellTime > Date.now();
          const slotUnlocked = isSlotUnlocked(index);
          const config = getSlotConfig(index);
          
          return (
            <React.Fragment key={index}>
              <div className="trade-slot-container">
                {/* 1. SLOT DISPLAY */}
                <div
                  className={`trade-slot btn-basic ${isEmpty && slotUnlocked ? 'btn-neutral' : ''} ${!isEmpty && !isPurchased && !isReadyToSell ? 'filled' : ''} ${isPurchased ? 'btn-collect' : ''} ${!slotUnlocked && index >= 4 ? 'locked gold-slot btn-gold' : !slotUnlocked ? 'locked' : ''} ${isReadyToSell && !isPurchased ? 'btn-sell' : ''}`}
                  onClick={() => {
                    if (isOwnStall && isEmpty && slotUnlocked) {
                      handleSlotClick(index);
                    } else if (isOwnStall && isPurchased) {
                      // Handle collect payment
                      handleCollectPayment(`collect-${Date.now()}`, 'collect-payment', index);
                    } else if (isOwnStall && isReadyToSell && !isPurchased) {
                      // Handle sell to game
                      handleSellSingle(`sell-${Date.now()}`, 'sell-to-game', index);
                    }
                  }}
                >
                  {(index >= 4 && currentPlayer.accountStatus !== 'Gold' && isOwnStall) ? (
                    // Always show Gold Pass required for slots 5-6 for non-Gold users
                    <div className="trade-slot-locked">
                      <div className="trade-slot-lock-icon">🔒</div>
                      <div className="trade-slot-lock-text">{strings[171]}</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        {strings[173]} {config.maxAmount}
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        {formatDuration(config.sellWaitTime / 1000)} {strings[174]}
                      </div>
                    </div>
                  ) : (!slotUnlocked && isOwnStall) ? (
                    // Show unlock UI for locked slots on own stall
                    <div className="trade-slot-locked">
                      <div className="trade-slot-lock-icon">🔒</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        {strings[173]} {config.maxAmount}
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        {formatDuration(config.sellWaitTime / 1000)} {strings[174]}
                      </div>
                    </div>
                  ) : isEmpty ? (
                    <div className="trade-slot-empty-text">
                      <div>➕ {strings[156]}</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        {strings[173]} {config.maxAmount}
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        {formatDuration(config.sellWaitTime / 1000)} {strings[174]}
                      </div>
                    </div>
                  ) : (
                    <div className="trade-slot-content">
                      <div className="trade-slot-item-name">
                        {`${slot.amount}x ${getSymbol(slot.resource)} ${getLocalizedString(slot.resource, strings)}`}
                      </div>
                      {isPurchased && (
                        <>
                          <div className="trade-slot-status">
                            {strings[157]} {slot.boughtBy}
                          </div>
                          <div className="trade-slot-status">
                            {strings[318]} 💰{slot.boughtFor.toLocaleString()}
                          </div>
                        </>
                      )}
                      {hasTimer && !isPurchased && (
                        <div className="trade-slot-status timer">
                          {formatCountdown(slot.sellTime, Date.now())}
                        </div>
                      )}
                      {isReadyToSell && !isPurchased && (
                        <div className="trade-slot-status ready">
                          {strings[167]} 💰{(slot.amount * slot.price).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. BUTTON CONTAINER */}
                {/* Gold Pass purchase button - COMMENTED OUT
                {(index >= 4 && currentPlayer.accountStatus !== 'Gold' && isOwnStall) ? (
                  // Show Gold Pass purchase button for slots 5-6
                  <div className="trade-button-container">
                    <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <button
                        className="btn-basic btn-gold"
                        style={{ width: '100%' }}
                        onClick={() => handlePurchase(1, currentPlayer, updateStatus)}
                      >
                        {strings[9061]}
                      </button>
                    </div>
                  </div>
                ) : */}
                {(!slotUnlocked && isOwnStall) ? (
                  // Show unlock button for locked non-Gold Pass slots
                  <div className="trade-button-container">
                    <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <button 
                        className="btn-basic btn-neutral"
                        style={{ width: '100%' }}
                        onClick={() => handleUnlockSlot(index)}
                      >
                        {strings[175]} {config.unlockCost} {getSymbol('Wood')} {strings[176]}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
          )}

          {/* REQUEST TAB - REQUEST SLOTS */}
          {activeTab === 'request' && (
          <div className="trade-stall-slots shared-buttons">
        {requestSlots.map((slot, index) => {
          const isEmpty = !slot?.resource;
          const slotUnlocked = isRequestSlotUnlocked(index);
          const config = getRequestSlotConfig(index);

          return (
            <React.Fragment key={index}>
              <div className="trade-slot-container">
                {/* 1. SLOT DISPLAY */}
                <div
                  className={`trade-slot btn-basic ${isEmpty && slotUnlocked ? 'btn-neutral' : ''} ${!isEmpty ? 'filled' : ''} ${!slotUnlocked && config.requiresGoldPass ? 'locked gold-slot btn-gold' : !slotUnlocked ? 'locked' : ''}`}
                  onClick={() => {
                    if (isEmpty && slotUnlocked) {
                      handleRequestSlotClick(index);
                    }
                  }}
                >
                  {(config.requiresGoldPass && currentPlayer.accountStatus !== 'Gold') ? (
                    // Gold Pass required
                    <div className="trade-slot-locked">
                      <div className="trade-slot-lock-icon">🔒</div>
                      <div className="trade-slot-lock-text">{strings[171]}</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        {strings[173]} {config.maxAmount}
                      </div>
                    </div>
                  ) : (!slotUnlocked) ? (
                    // Show unlock UI for locked slots
                    <div className="trade-slot-locked">
                      <div className="trade-slot-lock-icon">🔒</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        {strings[173]} {config.maxAmount}
                      </div>
                    </div>
                  ) : isEmpty ? (
                    <div className="trade-slot-empty-text">
                      <div>➕ Add Request</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        {strings[173]} {config.maxAmount}
                      </div>
                    </div>
                  ) : (
                    <div className="trade-slot-content">
                      <div className="trade-slot-item-name">
                        {`${slot.amount}x ${getSymbol(slot.resource)} ${getLocalizedString(slot.resource, strings)}`}
                      </div>
                      <div className="trade-slot-status">
                        You Pay: 💰{slot.moneyCommitted.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. BUTTON CONTAINER */}
                {/* Gold Pass purchase button - COMMENTED OUT
                {(config.requiresGoldPass && currentPlayer.accountStatus !== 'Gold') ? (
                  // Show Gold Pass purchase button
                  <div className="trade-button-container">
                    <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <button
                        className="btn-basic btn-gold"
                        style={{ width: '100%' }}
                        onClick={() => handlePurchase(1, currentPlayer, updateStatus)}
                      >
                        {strings[9061]}
                      </button>
                    </div>
                  </div>
                ) : */}
                {(!slotUnlocked) ? (
                  // Show unlock button for locked slots
                  <div className="trade-button-container">
                    <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <button
                        className="btn-basic btn-neutral"
                        style={{ width: '100%' }}
                        onClick={() => handleUnlockRequestSlot(index)}
                      >
                        {strings[175]} {config.unlockCost} {getSymbol('Wood')} {strings[176]}
                      </button>
                    </div>
                  </div>
                ) : (!isEmpty) ? (
                  // Show cancel button for active requests
                  <div className="trade-button-container">
                    <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <TransactionButton
                        className="btn-basic btn-danger"
                        style={{ width: '100%' }}
                        transactionKey={`cancel-request-${index}`}
                        onAction={(transactionId, transactionKey) => handleCancelRequest(transactionId, transactionKey, index)}
                      >
                        Cancel Request
                      </TransactionButton>
                    </div>
                  </div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
          )}
        </>
      )}

{/* TRADING INVENTORY MODAL */}
      <TradingInventoryModal
        isOpen={selectedSlotIndex !== null}
        onClose={() => setSelectedSlotIndex(null)}
        inventory={inventory}
        resourceData={resourceData}
        amounts={amounts}
        handleAmountChange={handleAmountChange}
        handleAddToSlot={handleAddToSlot}
        getSlotConfig={getSlotConfig}
        selectedSlotIndex={selectedSlotIndex}
        transactionKeyPrefix="add-to-trade-slot"
      />

      {/* REQUEST INVENTORY MODAL */}
      <TradingInventoryModal
        isOpen={selectedRequestSlotIndex !== null}
        onClose={() => setSelectedRequestSlotIndex(null)}
        inventory={resourceData
          .filter(res => res.category === 'doober')
          .map(res => {
            // Calculate actual quantity player has in inventory + backpack
            const inventoryQty = currentPlayer.inventory?.find(item => item.type === res.type)?.quantity || 0;
            const backpackQty = currentPlayer.backpack?.find(item => item.type === res.type)?.quantity || 0;
            const totalQty = inventoryQty + backpackQty;

            return {
              type: res.type,
              quantity: totalQty
            };
          })
        }
        resourceData={resourceData}
        amounts={requestAmounts}
        handleAmountChange={handleRequestAmountChange}
        handleAddToSlot={handleCreateRequest}
        getSlotConfig={getRequestSlotConfig}
        selectedSlotIndex={selectedRequestSlotIndex}
        transactionKeyPrefix="create-request"
        isRequestMode={true}
        playerMoney={inventory.find(item => item.type === 'Money')?.quantity || 0}
      />

      {/* GLOBAL MARKET MODAL */}
      <GlobalMarketModal
        isOpen={isGlobalMarketOpen}
        onClose={() => setIsGlobalMarketOpen(false)}
        currentPlayer={currentPlayer}
        onBuyItem={handleGlobalMarketBuy}
        onFulfillRequest={handleGlobalMarketFulfillRequest}
        masterResources={masterResources}
        globalTuning={globalTuning}
      />

    </Panel>
  );
};

export default TradeStall;