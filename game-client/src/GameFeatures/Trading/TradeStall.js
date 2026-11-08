import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panels/Panel'; // Use Panel instead of Modal
import LevelLock from '../../UI/Panels/LevelLock';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import ResourceIcon from '../../UI/Icons/ResourceIcon';
import TradingInventoryModal from '../../UI/Modals/TradingInventoryModal';
import axios from 'axios';
import './TradeStall.css';
import '../../UI/Modals/Modal.css';
import '../../UI/Buttons/SharedButtons.css';
import { getPlayerQuantity, mergeHoldings, ensureRoomFor } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { isACrop } from '../../Utils/ResourceHelpers';
// import { handlePurchase } from '../../Store/Store'; // COMMENTED OUT - Gold Pass
import GlobalMarketModal from './GlobalMarketModal';
import SaleBurst, { runCardReturn, CARD_CYCLE } from '../../UI/SaleBurst';
import FloatingTextManager from '../../UI/FloatingText';
import soundManager from '../../Sound/SoundManager';
import { loadMasterTraders, loadMasterResources } from '../../Utils/TuningManager';
import { hopeArtifacts } from '../../Utils/hopeArtifacts';
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';

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
      FloatingTextManager.addFloatingTextAt(`+${Number(money).toLocaleString()} {res:Money}`, r.left + r.width / 2, r.top + r.height / 2, { flyTo: 'money' });
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
  // Quest for Hope artifacts (Utils/hopeArtifacts.js) and resources marked noTradeStall (the
  // Diamond Ring) never go on sale or on request here; the server refuses them too
  const [hopeItems, setHopeItems] = useState(() => new Set());
  useEffect(() => {
    loadMasterTraders().then((t) => setHopeItems(new Set([
      ...hopeArtifacts(t),
      ...(masterResources || []).filter((r) => r.offerBlocks?.tradeStall || r.noTradeStall === true).map((r) => r.type),
    ])));
  }, [masterResources]);
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
  
  // Applies a stall action's answer: the player delta and both stall arrays
  const applyStallAnswer = (data) => {
    applyPlayerDelta(data, { setCurrentPlayer, setInventory, setBackpack });
    if (data?.tradeStall) setCurrentPlayer((prev) => (prev ? { ...prev, tradeStall: data.tradeStall, tradeStallRequests: data.tradeStallRequests } : prev));
  };
  const stallRefusal = (reason) => {
    if (reason === 'no-backpack') updateStatus(19);
    else if (reason === 'backpack-full') updateStatus(21);
    else if (reason === 'warehouse-full') updateStatus(20);
    else if (reason === 'short-Money') updateStatus(152);
    else if (reason === 'gone') updateStatus(155);
    else updateStatus(`❌ ${reason || 'Failed'}`);
  };

  // ONE request (game-server routes/stallActionRoutes.js /action/stall-unlock): the Wood is the
  // slot's unlockCost from globalTuning, charged on the server
  const handleUnlockSlot = async (slotIndex) => {
    const config = getSlotConfig(slotIndex);
    if (!config) return;
    const answer = await postAction('/api/action/stall-unlock', { playerId: currentPlayer.playerId, slotIndex });
    applyStallAnswer(answer.data);
    if (!answer.ok) {
      if (answer.reason === 'short-Wood') updateStatus(`${strings[177]} ${config.unlockCost} {res:Wood} ${strings[176]} ${strings[178]}`);
      else stallRefusal(answer.reason);
      return;
    }
    if (answer.data.tradeStall) setTradeSlots(normalizeSellSlots(answer.data.tradeStall));
    updateStatus(`${strings[170]}`);
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
      const resourcesData = await loadMasterResources(); // cached at boot: no round trip
      setResourceData(resourcesData);

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
  // Buying another player's listing: ONE request (/action/stall-buy). The server claims the
  // seller's slot atomically (nobody else can buy it at the same time), takes the Money and gives
  // the goods (room first); the seller collects the Money later.
  const handleGlobalMarketBuy = async (playerId, slotIndex) => {
    const answer = await postAction('/api/action/stall-buy', { playerId: currentPlayer.playerId, sellerPlayerId: playerId, slotIndex });
    applyStallAnswer(answer.data);
    if (!answer.ok) {
      if (answer.status === 0) throw new Error('network');
      stallRefusal(answer.reason);
      return;
    }
    updateStatus(22); // Purchase successful
  };
  // Filling another player's request: ONE request (/action/request-fulfill); the server claims the
  // request atomically, takes the goods, pays the held Money and fills the buyer's warehouse
  const handleGlobalMarketFulfillRequest = async (buyerPlayerId, slotIndex) => {
    const answer = await postAction('/api/action/request-fulfill', { playerId: currentPlayer.playerId, buyerPlayerId, slotIndex });
    applyStallAnswer(answer.data);
    if (!answer.ok) {
      if (answer.status === 0) { updateStatus('❌ Failed to fulfill request'); throw new Error('network'); }
      updateStatus(answer.reason === 'buyer-full' ? 'Buyer does not have enough warehouse space' : answer.reason === 'gone' ? 'That request was already filled' : 'Failed to fulfill request');
      throw new Error(answer.reason || 'refused');
    }
    updateStatus(`Sold ${answer.data.amount}x ${getLocalizedString(answer.data.resource, strings)} for {res:Money}${answer.data.earned}`);
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

  // Listing goods: ONE request (game-server routes/stallActionRoutes.js /action/stall-list). The
  // server takes the goods (backpack first), prices them at maxprice and starts the slot's wait.
  const performAddToSlot = async (transactionId, transactionKey, resource, amount) => {
    const answer = await postAction('/api/action/stall-list', { playerId: currentPlayer.playerId, slotIndex: selectedSlotIndex, resource, amount });
    applyStallAnswer(answer.data);
    if (!answer.ok) {
      stallRefusal(answer.reason);
      throw new Error(answer.reason || 'refused'); // let TransactionButton show the error state
    }
    const next = normalizeSellSlots(answer.data.tradeStall);
    setTradeSlots(next);
    setSelectedSlotIndex(null);
    calculateTotalSellValue(next);
  };
  // Protected function to sell items to game using transaction system
  const handleSellSingle = async (transactionId, transactionKey, slotIndex) => {
    try {
      // ONE request (/action/stall-sell-to-game): paid at the listing's price, Sell quests on the server
      const data = await cycleSellCard(slotIndex, async () => {
        const answer = await postAction('/api/action/stall-sell-to-game', { playerId: currentPlayer.playerId, slotIndex });
        applyStallAnswer(answer.data);
        if (!answer.ok) throw new Error(answer.reason || 'sell-to-game refused');
        return answer.data;
      });
      updateStatus(`${strings[141]} ${data.sold.qty}x ${getLocalizedString(data.sold.type, strings)} ({res:Money} ${data.money}).`);
    } catch (error) {
      console.error('Error in protected sell:', error);
      updateStatus('❌ Failed to sell item');
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

  
  
  
  // Protected function to collect payment from a bought slot using transaction system
  const handleCollectPayment = async (transactionId, transactionKey, slotIndex) => {
    try {
      // ONE request (/action/stall-collect): the Money a buyer paid, Sell quests on the server
      const data = await cycleSellCard(slotIndex, async () => {
        const answer = await postAction('/api/action/stall-collect', { playerId: currentPlayer.playerId, slotIndex });
        applyStallAnswer(answer.data);
        if (!answer.ok) throw new Error(answer.reason || 'collect-payment refused');
        return answer.data;
      });
      updateStatus(`Collected ${data.money} {res:Money}.`);
    } catch (error) {
      console.error('Error collecting payment:', error);
      updateStatus('❌ Failed to collect payment');
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
  // ONE request (game-server routes/stallActionRoutes.js /action/request-create): priced at
  // maxprice on the server, the Money held (escrow) until the request is filled or cancelled
  const handleCreateRequest = async (transactionId, transactionKey, resource) => {
    const amount = requestAmounts[resource] || 0;
    if (selectedRequestSlotIndex === null || amount <= 0) return;
    const answer = await postAction('/api/action/request-create', { playerId: currentPlayer.playerId, slotIndex: selectedRequestSlotIndex, resource, amount });
    applyStallAnswer(answer.data);
    if (!answer.ok) {
      updateStatus(answer.reason === 'short-Money' ? "You don't have enough money" : `❌ ${answer.reason || 'Failed'}`);
      if (answer.status === 0) throw new Error('network');
      return;
    }
    if (answer.data.tradeStallRequests) setRequestSlots(answer.data.tradeStallRequests);
    setSelectedRequestSlotIndex(null);
    updateStatus(`Request posted for ${amount}x ${getLocalizedString(resource, strings)}`);
  };
  // Handle canceling a request (refunds money)
  // ONE request (/action/request-cancel): the held Money comes back
  const handleCancelRequest = async (transactionId, transactionKey, slotIndex) => {
    const slot = requestSlots[slotIndex];
    if (!slot?.resource || !slot?.moneyCommitted) return false;
    const answer = await postAction('/api/action/request-cancel', { playerId: currentPlayer.playerId, slotIndex });
    applyStallAnswer(answer.data);
    if (!answer.ok) { updateStatus('❌ Failed to cancel request'); return false; }
    if (answer.data.tradeStallRequests) setRequestSlots(answer.data.tradeStallRequests);
    updateStatus(`Request canceled. Refunded {res:Money}${answer.data.refunded}`);
    return true;
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
  // ONE request (/action/request-unlock): the slot's unlockCost in Wood, charged on the server
  const handleUnlockRequestSlot = async (slotIndex) => {
    const config = getRequestSlotConfig(slotIndex);
    if (!config) return;
    const answer = await postAction('/api/action/request-unlock', { playerId: currentPlayer.playerId, slotIndex });
    applyStallAnswer(answer.data);
    if (!answer.ok) {
      if (answer.reason === 'short-Wood') updateStatus(`${strings[177]} ${config.unlockCost} {res:Wood} ${strings[176]} ${strings[178]}`);
      else updateStatus('Failed to unlock slot');
      return;
    }
    if (answer.data.tradeStallRequests) setRequestSlots(answer.data.tradeStallRequests);
    updateStatus(`${strings[170]}`);
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
                        <span className="trade-slot-unlock-cost" title={strings[176]}>{config.unlockCost.toLocaleString()} <ResourceIcon type="Wood" masterResources={resourceData} /></span>
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
                        {slot.amount}x <ResourceIcon type={slot.resource} masterResources={resourceData} /> {getLocalizedString(slot.resource, strings)}
                      </div>
                      {isPurchased && (
                        <>
                          <div className="trade-slot-status">
                            {strings[157]} {slot.boughtBy}
                          </div>
                          <div className="trade-slot-status">
                            {strings[318]} <ResourceIcon type="Money" masterResources={resourceData} />{slot.boughtFor.toLocaleString()}
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
                          {strings[167]} <ResourceIcon type="Money" masterResources={resourceData} />{(slot.amount * slot.price).toLocaleString()}
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
                        <span className="trade-slot-unlock-cost" title={strings[176]}>{config.unlockCost.toLocaleString()} <ResourceIcon type="Wood" masterResources={resourceData} /></span>
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
                        {slot.amount}x <ResourceIcon type={slot.resource} masterResources={resourceData} /> {getLocalizedString(slot.resource, strings)}
                      </div>
                      <div className="trade-slot-status">
                        {strings[2121] || 'You pay:'} <ResourceIcon type="Money" masterResources={resourceData} />{slot.moneyCommitted.toLocaleString()}
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