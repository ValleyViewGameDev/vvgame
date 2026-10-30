import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panels/Panel'; // Use Panel instead of Modal
import LevelLock from '../../UI/Panels/LevelLock';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import TradingInventoryModal from '../../UI/Modals/TradingInventoryModal';
import axios from 'axios';
import './TradeStall.css';
import '../../UI/Modals/Modal.css';
import '../../UI/Buttons/SharedButtons.css';
import { spendIngredients, gainIngredients, refreshPlayerAfterInventoryUpdate, getPlayerQuantity, mergeHoldings, ensureRoomFor } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { isACrop } from '../../Utils/ResourceHelpers';
// import { handlePurchase } from '../../Store/Store'; // COMMENTED OUT - Gold Pass
import GlobalMarketModal from './GlobalMarketModal';
import SaleBurst, { runCardReturn, CARD_CYCLE } from '../../UI/SaleBurst';
import FloatingTextManager from '../../UI/FloatingText';
import soundManager from '../../Sound/SoundManager';
import { loadMasterTraders } from '../../Utils/TuningManager';
import { hopeArtifacts } from '../../Utils/hopeArtifacts';
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';

function TradeStall({ onClose, inventory, setInventory, backpack, setBackpack, currentPlayer, setCurrentPlayer, globalTuning, setModalContent, setIsModalOpen, masterResources, masterXPLevels, stationType, currentStationPosition, isDeveloper }) {
  // Level gate (like the Bank, Train and Carnival): the station's `level` in resources.json; the
  // Trading Post and the Trade Stall both open this panel and carry the same level
  const tradeStallRequiredLevel = (masterResources?.find(r => r.type === 'Trading Post') || masterResources?.find(r => r.type === 'Trade Stall'))?.level || 1;

  const strings = useStrings();
  const [tradeSlots, setTradeSlots] = useState([]);
  // One card in motion per tab, like Kent's and the Bank's slots (runCardReturn, UI/SaleBurst.js):
  // { slot, id, phase: 'pop' | 'leave' | 'slidein' }. Only that card moves; the rest of the panel
  // never re-renders into a loading state.
  const [cardFx, setCardFx] = useState(null);        // Sell tab
  const [requestFx, setRequestFx] = useState(null);  // Request tab
  // On the tap (house rule: never wait for the server): "+💰 N" rises from the slot and flies into
  // the money counter (UI/FlyToTarget.js); the card itself pops away under the burst (cycleSellCard)
  const celebrateSlot = (index, money) => {
    soundManager.playSFX('collect_money');
    try { navigator.vibrate?.(35); } catch (_) { /* no haptics here */ }
    const el = document.querySelector(`[data-trade-slot="${index}"]`);
    if (el && money > 0) {
      const r = el.getBoundingClientRect();
      FloatingTextManager.addFloatingTextAt(`+${Number(money).toLocaleString()} 💰`, r.left + r.width / 2, r.top + r.height / 2, { flyTo: 'money' });
    }
  };
  const [requestSlots, setRequestSlots] = useState([]);
  const [activeTab, setActiveTab] = useState('sell'); // 'sell' or 'request'
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);
  const [selectedRequestSlotIndex, setSelectedRequestSlotIndex] = useState(null);
  const [amounts, setAmounts] = useState({}); // Store amounts per resource
  const [requestAmounts, setRequestAmounts] = useState({}); // Store amounts for request modal
  const [totalSellValue, setTotalSellValue] = useState(0);
  const [resourceData, setResourceData] = useState([]); // Store resource data
  // Quest for Hope artifacts never go on sale or on request here (Utils/hopeArtifacts.js)
  const [hopeItems, setHopeItems] = useState(() => new Set());
  useEffect(() => { loadMasterTraders().then((t) => setHopeItems(hopeArtifacts(t))); }, []);
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
      unlockCost: 0
    };
  };

  // Get request slot-specific configuration
  const getRequestSlotConfig = (slotIndex) => {
    const config = tradeStallRequestConfig.find(slot => slot.slotIndex === slotIndex);
    return config || {
      maxAmount: 10,
      unlocked: slotIndex === 0,
      unlockCost: 0
    };
  };

  const isRequestSlotUnlocked = (slotIndex) => {
    const slot = requestSlots[slotIndex];

    if (!slot) return false;

    if (slot.locked === undefined) {
      if (slot.resource && slot.amount > 0) return true;
      return slotIndex === 0;
    }

    if (slot.locked === true) {
      return false;
    }

    return true;
  };
  
  const isSlotUnlocked = (slotIndex) => {
    const slot = tradeSlots[slotIndex];

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
      return false;
    }

    return true; // If not locked, it's unlocked
  };
  
  const handleUnlockSlot = async (slotIndex) => {
    const config = getSlotConfig(slotIndex);
    if (!config) return;
    
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


  // The Sell tab always shows 4 slots in index order, whatever shape the server sends back (it may
  // omit a slot it never saved): a server reply must never reshape the grid under the player.
  const SELL_SLOT_COUNT = 4;
  const emptySellSlot = (index, locked) => ({
    slotIndex: index, locked, resource: null, amount: 0, price: 0, sellTime: null, boughtBy: null, boughtFor: null,
  });
  const normalizeSellSlots = (serverSlots) => Array.from({ length: SELL_SLOT_COUNT }, (_, index) => {
    const existing = (serverSlots || []).find((slot) => slot && slot.slotIndex === index)
      || ((serverSlots || [])[index] && (serverSlots[index].slotIndex === undefined) ? { ...serverSlots[index], slotIndex: index } : null);
    return existing || emptySellSlot(index, true);
  });
  const sellTotal = (slots) => slots.reduce((sum, slot) => (
    slot?.resource && slot?.amount && slot?.price && !slot?.boughtBy ? sum + slot.amount * slot.price : sum
  ), 0);

  /**
   * A sold or collected card: it pops away under the burst, and while it is gone the slot turns
   * into its empty "Click to sell" card, which slides in (the Kent / Bank cycle). `request` is the
   * server call; its reply is applied after the pop so the old card never changes mid-animation,
   * and a failure brings the old card back. Returns the server's data (or null on failure).
   */
  const cycleSellCard = async (index, request) => {
    const before = tradeSlots;
    const revert = runCardReturn(setCardFx, index, { returnMs: 900 });
    const hidden = new Promise((resolve) => setTimeout(resolve, CARD_CYCLE.popMs));
    hidden.then(() => setTradeSlots((slots) => slots.map((slot, i) => (i === index ? emptySellSlot(index, false) : slot))));
    try {
      const data = await request();
      await hidden;
      if (data?.tradeStall) {
        const next = normalizeSellSlots(data.tradeStall);
        setTradeSlots(next);
        setTotalSellValue(sellTotal(next));
      }
      return data;
    } catch (error) {
      await hidden;
      revert();
      setTradeSlots(before);
      throw error;
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

      const allSlots = normalizeSellSlots(tradeStallResponse.data.tradeStall || []);
      setTradeSlots(allSlots);

      // Fetch request slots data
      const requestSlotsResponse = await axios.get(`${API_BASE}/api/player-trade-stall-requests`, {
        params: { playerId: currentPlayer.playerId },
      });

      const serverRequestSlots = requestSlotsResponse.data.tradeStallRequests || [];
      const allRequestSlots = Array.from({ length: 1 }, (_, index) => {
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

      // Room first, money second: a full Warehouse or Backpack says so and no Money is taken
      if (!ensureRoomFor({ resource: currentSlot.resource, quantity: currentSlot.amount, currentPlayer, inventory: currentPlayer.inventory || inventory, backpack: currentPlayer.backpack || [], masterResources, globalTuning, updateStatus })) return;

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
        // Update seller's (current player's) holdings using the returned data (the items may
        // have come out of the backpack: utils/playerHoldings.js takes backpack first)
        setInventory(response.data.sellerInventory);
        if (response.data.sellerBackpack) setBackpack(response.data.sellerBackpack);
        setCurrentPlayer(prev => ({
          ...prev,
          inventory: response.data.sellerInventory,
          ...(response.data.sellerBackpack ? { backpack: response.data.sellerBackpack } : {}),
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

    console.log('Slot clicked:', index, 'Is unlocked:', slotUnlocked, 'Is empty:', isEmpty);

    // If slot is locked, do nothing - button will handle unlock
    if (!slotUnlocked) {
      return;
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
    const inventoryAmount = getPlayerQuantity(type, inventory, backpack); // backpack + warehouse
    const slotConfig = getSlotConfig(selectedSlotIndex);
    const maxAmount = Math.min(inventoryAmount, slotConfig.maxAmount);
  
    setAmounts((prev) => ({
      ...prev,
      [type]: Math.min(Math.max(0, value), maxAmount), // Ensure value is within 0 and maxAmount
    }));
  };

  const handleAddToSlot = async (transactionId, transactionKey, resource) => {
    let amount = amounts[resource] || 0;
    const held = getPlayerQuantity(resource, inventory, backpack); // backpack + warehouse

    if (selectedSlotIndex === null || amount <= 0 || held <= 0 || amount > held) {
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
    if (amount === held && isACrop(resource, masterResources)) {
      // Warn only when replanting this crop COSTS this crop (Corn Plot costs 1 Corn), so selling
      // the last one ends it. Not for crops off self-regenerating trees (Olive, Apple: the doober
      // is `repeatable` and its tree costs Money), nor for any plot that costs something else.
      const cropDef = masterResources.find(res => res.type === resource);
      const plotResource = masterResources.find(res => res.output === resource && res.category === 'farmplot');
      const plotCostsTheCrop = !!plotResource && Array.from({ length: 10 }, (_, i) => i + 1)
        .some(i => plotResource[`ingredient${i}`] === resource && plotResource[`ingredient${i}qty`] > 0);
      const plotHasCost = plotCostsTheCrop && cropDef?.repeatable !== true;

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
      // The goods leave the player first, the standard way (backpack, then the warehouse), so a
      // failed spend never puts goods in the stall
      const spent = await spendIngredients({
        playerId: currentPlayer.playerId,
        recipe: { type: resource, ingredient1: resource, ingredient1qty: amount },
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
      });
      if (!spent) throw new Error('Not enough to add to the Trade Stall');

      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        playerId: currentPlayer.playerId,
        tradeStall: updatedSlots,
      });

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
      const data = await cycleSellCard(slotIndex, async () => {
        const response = await axios.post(`${API_BASE}/api/trade-stall/sell-to-game`, {
          playerId: currentPlayer.playerId,
          slotIndex,
          transactionId,
          transactionKey: `${transactionKey}-${slotIndex}`
        });
        if (!response.data.success) throw new Error('sell-to-game refused');
        return response.data;
      });
      const response = { data };

      if (response.data.success) {
        // the slot itself was updated by cycleSellCard
        if (response.data.tradeStall) {
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
        // no refetch: the reply already holds the stall, and a refetch re-laid the whole grid (the flash)
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
      const data = await cycleSellCard(slotIndex, async () => {
        const response = await axios.post(`${API_BASE}/api/trade-stall/collect-payment`, {
          playerId: currentPlayer.playerId,
          slotIndex,
          transactionId,
          transactionKey: `${transactionKey}-${slotIndex}`
        });
        if (!response.data.success) throw new Error('collect-payment refused');
        return response.data;
      });
      const response = { data };

      if (response.data.success) {
        // the slot itself was updated by cycleSellCard
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
        // no refetch: the reply already holds the stall, and a refetch re-laid the whole grid (the flash)
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
      return true;
    } catch (error) {
      console.error('Error canceling request:', error);
      if (error.response?.status === 429) {
        updateStatus(471);
      } else {
        updateStatus('❌ Failed to cancel request');
      }
      return false;
    }
  };

  // Cancel with the card cycle: the request card leaves, the slot turns into its empty "Add
  // Request" card while hidden, which slides in; a failed cancel brings the request back
  const cancelRequestWithMotion = async (transactionId, transactionKey, slotIndex) => {
    const before = requestSlots;
    const revert = runCardReturn(setRequestFx, slotIndex, { out: 'leave', returnMs: 700 });
    const hidden = new Promise((resolve) => setTimeout(resolve, CARD_CYCLE.popMs));
    hidden.then(() => setRequestSlots((slots) => slots.map((slot, i) => (i === slotIndex
      ? { slotIndex, locked: slot.locked, resource: null, amount: 0, price: 0, moneyCommitted: 0 } : slot))));
    const ok = await handleCancelRequest(transactionId, transactionKey, slotIndex);
    if (!ok) { await hidden; revert(); setRequestSlots(before); }
  };

  // Handle unlocking a request slot
  const handleUnlockRequestSlot = async (slotIndex) => {
    const config = getRequestSlotConfig(slotIndex);
    if (!config) return;

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

  // Sell section (UI/Panels/SellSection.js): the Trading Post can be moved on the player's own
  // homestead but never sold, by anyone (owner 2026-10-25); none when opened without a building
  const sellFooter = (stationType && currentStationPosition) ? sellSection({
    sellLocked: true,
    canMove: currentPlayer?.location?.gtype === 'homestead',
    isDeveloper,
    resourceType: stationType,
    masterResources,
    onMove: () => requestMove({ type: stationType, x: currentStationPosition.x, y: currentStationPosition.y }),
  }) : null;

  return (
    <Panel footer={sellFooter} onClose={onClose} titleKey="1108" panelName="TradeStall">
      <LevelLock
        currentPlayer={currentPlayer}
        masterXPLevels={masterXPLevels}
        requiredLevel={tradeStallRequiredLevel}
        featureName={getLocalizedString('Trading Post', strings)}
      >

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
        <div style={{ textAlign: 'center', padding: '40px', fontSize: 'var(--text-xl)' }}>
          {strings[98]}
        </div>
      ) : (
        <>
          {/* SELL TAB - TRADE STALL SLOTS */}
          {activeTab === 'sell' && (
          <div className="trade-stall-slots trade-stall-slots--grid shared-buttons">
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
              <div className="trade-slot-container card-fx-slot" data-trade-slot={index}>
                {cardFx?.slot === index && cardFx.phase === 'pop' && <SaleBurst key={cardFx.id} />}
                <div className={`trade-slot-motion ${cardFx?.slot === index ? `card-fx-${cardFx.phase}` : ''}`}>
                <div
                  className={`trade-slot btn-basic ${isEmpty && slotUnlocked ? 'btn-neutral' : ''} ${!isEmpty && !isPurchased && !isReadyToSell ? 'filled' : ''} ${isPurchased ? 'btn-collect' : ''} ${!slotUnlocked ? 'locked' : ''} ${isReadyToSell && !isPurchased ? 'btn-sell' : ''}`}
                  onClick={() => {
                    if (isOwnStall && !slotUnlocked) {
                      // a locked card is its own "Unlock for N Wood" button
                      handleUnlockSlot(index);
                    } else if (isOwnStall && isEmpty && slotUnlocked) {
                      handleSlotClick(index);
                    } else if (isOwnStall && isPurchased) {
                      // Handle collect payment
                      celebrateSlot(index, slot.boughtFor);
                      handleCollectPayment(`collect-${Date.now()}`, 'collect-payment', index);
                    } else if (isOwnStall && isReadyToSell && !isPurchased) {
                      // Handle sell to game
                      celebrateSlot(index, slot.amount * slot.price);
                      handleSellSingle(`sell-${Date.now()}`, 'sell-to-game', index);
                    }
                  }}
                >
                  {(!slotUnlocked && isOwnStall) ? (
                    // Show unlock UI for locked slots on own stall
                    <div className="trade-slot-locked">
                      <div className="trade-slot-lock-icon">🔒</div>
                      <div className="trade-slot-status">{strings[173]} {config.maxAmount}</div>
                      <div className="trade-slot-status">{formatDuration(config.sellWaitTime / 1000)} {strings[174]}</div>
                      <div className="trade-slot-unlock-cta">
                        <span>{strings[175]}</span>
                        <span className="trade-slot-unlock-cost" title={strings[176]}>{config.unlockCost.toLocaleString()} {getSymbol('Wood')}</span>
                      </div>
                    </div>
                  ) : isEmpty ? (
                    <div className="trade-slot-empty-text">
                      <div className="trade-slot-item-name">➕ {strings[156]}</div>
                      <div className="trade-slot-status">{strings[173]} {config.maxAmount}</div>
                      <div className="trade-slot-status">{formatDuration(config.sellWaitTime / 1000)} {strings[174]}</div>
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
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
          )}

          {/* REQUEST TAB - REQUEST SLOTS */}
          {activeTab === 'request' && (
          <div className="trade-stall-slots trade-stall-slots--grid shared-buttons">
        {requestSlots.map((slot, index) => {
          const isEmpty = !slot?.resource;
          const slotUnlocked = isRequestSlotUnlocked(index);
          const config = getRequestSlotConfig(index);

          return (
            <React.Fragment key={index}>
              <div className="trade-slot-container card-fx-slot">
                <div className={`trade-slot-motion ${requestFx?.slot === index ? `card-fx-${requestFx.phase}` : ''}`}>
                <div
                  className={`trade-slot btn-basic ${isEmpty && slotUnlocked ? 'btn-neutral' : ''} ${!isEmpty ? 'filled' : ''} ${!slotUnlocked ? 'locked' : ''}`}
                  onClick={() => {
                    if (!slotUnlocked) {
                      // a locked card is its own "Unlock for N Wood" button
                      handleUnlockRequestSlot(index);
                    } else if (isEmpty) {
                      handleRequestSlotClick(index);
                    }
                  }}
                >
                  {(!slotUnlocked) ? (
                    <div className="trade-slot-locked">
                      <div className="trade-slot-lock-icon">🔒</div>
                      <div className="trade-slot-status">{strings[173]} {config.maxAmount}</div>
                      <div className="trade-slot-unlock-cta">
                        <span>{strings[175]}</span>
                        <span className="trade-slot-unlock-cost" title={strings[176]}>{config.unlockCost.toLocaleString()} {getSymbol('Wood')}</span>
                      </div>
                    </div>
                  ) : isEmpty ? (
                    <div className="trade-slot-empty-text">
                      <div className="trade-slot-item-name">➕ {strings[2120] || 'Add Request'}</div>
                      <div className="trade-slot-status">{strings[173]} {config.maxAmount}</div>
                    </div>
                  ) : (
                    <div className="trade-slot-content">
                      <div className="trade-slot-item-name">
                        {`${slot.amount}x ${getSymbol(slot.resource)} ${getLocalizedString(slot.resource, strings)}`}
                      </div>
                      <div className="trade-slot-status">
                        {strings[2121] || 'You pay:'} 💰{slot.moneyCommitted.toLocaleString()}
                      </div>
                      {/* the card's own Cancel line (only this line cancels; the card itself does not) */}
                      <TransactionButton
                        className="trade-slot-cancel-cta"
                        transactionKey={`cancel-request-${index}`}
                        onAction={(transactionId, transactionKey) => cancelRequestWithMotion(transactionId, transactionKey, index)}
                      >
                        {strings[2122] || 'Cancel Request'}
                      </TransactionButton>
                    </div>
                  )}
                </div>
                </div>
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
        inventory={mergeHoldings(inventory, backpack).filter((item) => !hopeItems.has(item.type))}
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
          .filter(res => res.category === 'doober' && !hopeItems.has(res.type))
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

    </LevelLock>
    </Panel>
  );
};

export default TradeStall;