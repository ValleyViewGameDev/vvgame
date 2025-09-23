import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel'; // Use Panel instead of Modal
import TransactionButton from '../../UI/TransactionButton';
import axios from 'axios';
import './TradeStall.css';
import '../../UI/Modal.css';
import '../../UI/SharedButtons.css';
import { spendIngredients, gainIngredients, refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { incrementFTUEStep } from '../FTUE/FTUE';
import { isACrop } from '../../Utils/ResourceHelpers';
import { handlePurchase } from '../../Store/Store';

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
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false); // Show/hide player dropdown
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false); // Loading state for dropdown

  const tradeStallHaircut = globalTuning?.tradeStallHaircut || 0.25;
  const tradeStallSlotConfig = globalTuning?.tradeStallSlots || [];
  
  // Get slot-specific configuration
  const getSlotConfig = (slotIndex) => {
    const config = tradeStallSlotConfig.find(slot => slot.slotIndex === slotIndex);
    return config || {
      maxAmount: 50,
      sellWaitTime: currentPlayer.firsttimeuser ? 5000 : 300000,
      unlocked: slotIndex === 0,
      unlockCost: 0,
      requiresGoldPass: false
    };
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

      // Update totalSellValue only if viewing currentPlayer's stall
      if (viewedPlayer.playerId === currentPlayer.playerId) {
        const total = allSlots.reduce((sum, slot) => {
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
        
        // Fetch trade stalls for all players in parallel
        const promises = players.map(player => 
          axios.get(`${API_BASE}/api/player-trade-stall`, {
            params: { playerId: player.playerId },
          }).then(response => ({
            playerId: player.playerId,
            tradeStall: response.data.tradeStall || []
          })).catch(error => ({
            playerId: player.playerId,
            tradeStall: []
          }))
        );
        
        const results = await Promise.all(promises);
        const tradeStallsData = {};
        results.forEach(result => {
          tradeStallsData[result.playerId] = result.tradeStall;
        });
        
        setPlayerTradeStalls(tradeStallsData);
        window.tradeStallLastFetch = Date.now();
      } catch (error) {
        console.error('Error fetching settlement players:', error);
      }
    };

    fetchDataForViewedPlayer();
    fetchSettlementPlayers();
    
  }, [viewedPlayer?.playerId, currentPlayer?.playerId]); // More stable dependencies
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showPlayerDropdown && !event.target.closest('.username-container')) {
        setShowPlayerDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showPlayerDropdown]);
  
  // Auto-set max Wheat amount for FTUE users at step 3 or less
  useEffect(() => {
    if (selectedSlotIndex !== null && currentPlayer.firsttimeuser === true && currentPlayer.ftuestep <= 3) {
      // Find wheat in inventory
      const wheatItem = inventory.find(item => item.type === 'Wheat');
      if (wheatItem) {
        const slotConfig = getSlotConfig(selectedSlotIndex);
        const maxAmount = Math.min(wheatItem.quantity, slotConfig.maxAmount);
        setAmounts(prev => ({
          ...prev,
          'Wheat': maxAmount
        }));
      }
    }
  }, [selectedSlotIndex, currentPlayer.firsttimeuser, currentPlayer.ftuestep, inventory]);

  const handleSlotClick = (index) => {
    const slot = tradeSlots[index];
    const isOwnStall = viewedPlayer.playerId === currentPlayer.playerId;
    const isEmpty = !slot?.resource;
    const slotUnlocked = isSlotUnlocked(index);
    const config = getSlotConfig(index);
    
    console.log('Slot clicked:', index, 'Is unlocked:', slotUnlocked, 'Is own stall:', isOwnStall, 'Is empty:', isEmpty);

    // If it's own stall and slot is locked
    if (isOwnStall && !slotUnlocked) {
      if (config.requiresGoldPass && currentPlayer.accountStatus !== 'Gold') {
        // Gold Pass required - do nothing, button will handle it
        return;
      } else if (!config.requiresGoldPass) {
        // Regular unlock with wood - do nothing, button will handle it
        return;
      }
    }
    
    // Only allow slot clicks for empty, unlocked slots on your own stall
    if (isOwnStall && isEmpty && slotUnlocked) {
      setSelectedSlotIndex(index); // Open inventory modal for your own empty slot
    }
    // All other clicks do nothing
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
    setShowPlayerDropdown(false); // Close dropdown when clicking arrow
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
    setShowPlayerDropdown(false); // Close dropdown when clicking arrow
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
  
  // Helper function to check if a player has any unsold items in their trade stall
  const playerHasItems = (player) => {
    // Always allow navigation to current player
    if (player.playerId === currentPlayer.playerId) {
      return true;
    }
    
    // For current player being viewed, check current tradeSlots for unsold items
    if (player.playerId === viewedPlayer.playerId) {
      return tradeSlots.some(slot => 
        slot?.resource && 
        slot?.amount > 0 && 
        !slot?.boughtBy
      );
    }
    
    // For other players, check cached trade stall data for unsold items
    const playerStall = playerTradeStalls[player.playerId];
    if (playerStall) {
      return playerStall.some(slot => 
        slot?.resource && 
        slot?.amount > 0 && 
        !slot?.boughtBy
      );
    }
    
    // If we don't have data yet, assume they might have items
    return true;
  };
  
  // Get list of players who have items in their trade stalls (plus current player)
  const getPlayersWithItems = () => {
    const playersWithItems = settlementPlayers.filter(player => {
      // Always include current player
      if (player.playerId === currentPlayer.playerId) return true;
      
      // Include other players only if they have unsold items
      const stall = playerTradeStalls[player.playerId];
      return stall && stall.some(slot => 
        slot?.resource && 
        slot?.amount > 0 && 
        !slot?.boughtBy // Only include if not sold
      );
    });
    
    // Sort to put current player first
    return playersWithItems.sort((a, b) => {
      if (a.playerId === currentPlayer.playerId) return -1;
      if (b.playerId === currentPlayer.playerId) return 1;
      return 0;
    });
  };
  
  // Get unique resource symbols for a player's trade stall (excluding sold items)
  const getPlayerResourceSymbols = (playerId) => {
    const stall = playerTradeStalls[playerId];
    if (!stall) return [];
    
    const uniqueResources = new Set();
    stall.forEach(slot => {
      if (slot?.resource && slot?.amount > 0 && !slot?.boughtBy) {
        uniqueResources.add(slot.resource);
      }
    });
    
    return Array.from(uniqueResources).map(resourceType => getSymbol(resourceType));
  };
  
  // Handle selecting a player from the dropdown
  const handleSelectPlayer = (player) => {
    const playerIndex = settlementPlayers.findIndex(p => p.playerId === player.playerId);
    if (playerIndex !== -1) {
      setViewedPlayerIndex(playerIndex);
      setViewedPlayer(player);
    }
    setShowPlayerDropdown(false);
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
          // Also update currentPlayer to trigger UI updates
          setCurrentPlayer(prev => ({
            ...prev,
            tradeStall: response.data.tradeStall
          }));
          // Update the cache for current player
          setPlayerTradeStalls(prev => ({
            ...prev,
            [currentPlayer.playerId]: response.data.tradeStall
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
        
        // Check if we should increment FTUE step after selling
        if (currentPlayer.ftuestep === 3) {
          console.log('🎓 Player at FTUE step 3 sold wheat, incrementing FTUE step');
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
          // Update the cache for current player
          setPlayerTradeStalls(prev => ({
            ...prev,
            [currentPlayer.playerId]: response.data.tradeStall
          }));
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
        if (currentPlayer.ftuestep === 3) {
          console.log('🎓 Player at FTUE step 3 sold wheat, incrementing FTUE step');
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
        <div style={{ flexGrow: 1, textAlign: 'center', position: 'relative' }}>
          <span 
            className="username clickable" 
            onClick={async () => {
              if (!showPlayerDropdown) {
                setShowPlayerDropdown(true);
                
                // Only refetch if we don't have recent data (within last 30 seconds)
                const now = Date.now();
                const lastFetchTime = window.tradeStallLastFetch || 0;
                const needsRefresh = (now - lastFetchTime) > 30000; // 30 seconds
                
                if (needsRefresh || Object.keys(playerTradeStalls).length === 0) {
                  setIsLoadingPlayers(true);
                  
                  try {
                    // Fetch all trade stalls in parallel
                    const promises = settlementPlayers
                      .filter(player => player.location?.s === currentPlayer.location.s) // Same settlement only
                      .map(player => 
                        axios.get(`${API_BASE}/api/player-trade-stall`, {
                          params: { playerId: player.playerId },
                        }).then(response => ({
                          playerId: player.playerId,
                          tradeStall: response.data.tradeStall || []
                        })).catch(error => ({
                          playerId: player.playerId,
                          tradeStall: []
                        }))
                      );
                    
                    const results = await Promise.all(promises);
                    const tradeStallsData = {};
                    results.forEach(result => {
                      tradeStallsData[result.playerId] = result.tradeStall;
                    });
                    
                    setPlayerTradeStalls(tradeStallsData);
                    window.tradeStallLastFetch = now;
                  } catch (error) {
                    console.error('Error fetching player trade stalls:', error);
                  } finally {
                    setIsLoadingPlayers(false);
                  }
                }
              } else {
                setShowPlayerDropdown(false);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            {viewedPlayer?.playerId === currentPlayer?.playerId ? 'You' : (viewedPlayer?.username || 'N/A')}
          </span>
          {showPlayerDropdown && (
            <div className="player-dropdown">
              {isLoadingPlayers ? (
                <div className="player-dropdown-loading">⏳</div>
              ) : (
                getPlayersWithItems().length > 0 ? (
                  getPlayersWithItems().map(player => {
                    const resourceSymbols = getPlayerResourceSymbols(player.playerId);
                    return (
                      <div 
                        key={player.playerId}
                        className="player-dropdown-item"
                        onClick={() => handleSelectPlayer(player)}
                      >
                        <div>{player.playerId === currentPlayer.playerId ? 'You' : player.username}</div>
                        {resourceSymbols.length > 0 && (
                          <div className="player-resources">
                            {resourceSymbols.join(' ')}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="player-dropdown-item" style={{ textAlign: 'center', color: '#999', justifyContent: 'center' }}>
                    No players with items
                  </div>
                )
              )}
            </div>
          )}
        </div>
        <button className="arrow-button" onClick={handleNextPlayer}>👉</button>
      </div>


      {/* TRADE STALL SLOTS */}

      <div className="trade-stall-slots">
        {tradeSlots.map((slot, index) => {
          // Check if we should hide this slot for FTUE users
          if (currentPlayer.firsttimeuser === true && currentPlayer.ftuestep <= 3 && index > 0) {
            return null; // Don't render slots after the first one for new players at step 3 or less
          }
          const isOwnStall = viewedPlayer.playerId === currentPlayer.playerId;
          const isEmpty = !slot?.resource;
          const isPurchased = slot?.boughtBy;
          const isReadyToSell = slot?.sellTime && slot.sellTime <= Date.now();
          const hasTimer = slot?.sellTime && slot.sellTime > Date.now();
          const slotUnlocked = isSlotUnlocked(index);
          const config = getSlotConfig(index);
          
          return (
            <>
              <div key={index} className="trade-slot-container">
                {/* 1. SLOT DISPLAY */}
                <div
                  className={`trade-slot ${isEmpty ? 'empty' : 'filled'} ${isPurchased ? 'purchased' : ''} ${!slotUnlocked ? 'locked' : ''} ${index >= 4 ? 'gold-slot' : ''}`}
                  onClick={() => handleSlotClick(index)}
                  style={{ cursor: (isOwnStall && isEmpty && slotUnlocked) ? 'pointer' : 'default' }}
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
                {(index >= 4 && currentPlayer.accountStatus !== 'Gold' && isOwnStall) ? (
                  // Show Gold Pass purchase button for slots 5-6
                  <div className="trade-button-container">
                    <div className="standard-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <button 
                        className="btn-gold"
                        style={{ width: '100%' }}
                        onClick={() => handlePurchase(1, currentPlayer, updateStatus)}
                      >
                        {strings[9061]}
                      </button>
                    </div>
                  </div>
                ) : (!slotUnlocked && isOwnStall) ? (
                  // Show unlock button for locked non-Gold Pass slots
                  <div className="trade-button-container">
                    <div className="standard-buttons" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <button 
                        className="btn-success"
                        style={{ width: '100%' }}
                        onClick={() => handleUnlockSlot(index)}
                      >
                        {strings[175]} {config.unlockCost} {getSymbol('Wood')} {strings[176]}
                      </button>
                    </div>
                  </div>
                ) : !isEmpty && (
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
            </>
          );
        })}
      </div>


{/* //////////////////  INVENTORY MODAL  ///////////////////*/}

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
                {inventory
                  .filter((item) => {
                    const resourceDetails = resourceData.find((res) => res.type === item.type);
                    return (
                      item.type !== 'Money' && item.type !== 'Gem'
                    );
                  })
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
                              style={{ marginLeft: '4px' }}
                            >
                              {strings[165]}
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

    </Panel>
  );
};

export default TradeStall;