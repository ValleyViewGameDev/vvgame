import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import LevelLock from '../../UI/Panels/LevelLock';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import ResourceModalSmall from '../../UI/Modals/ResourceModalSmall';
import TrainCompleteModal from '../../UI/Modals/TrainCompleteModal';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import { generateCompleteTrainData, getTrainBaseThreshold, splitTrainRewards } from './TrainOfferLogic';
import './Train.css';
import { formatCountdown } from '../../UI/Timers';
import { useStrings } from '../../UI/StringsContext';
import soundManager from '../../Sound/SoundManager';
import SaleBurst from '../../UI/SaleBurst';
import FloatingTextManager from '../../UI/FloatingText';

function NewTrainPanel({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  updateStatus,
  masterResources,
  setModalContent,
  setIsModalOpen,
  globalTuning,
  currentSeason,
  masterXPLevels
  })
{
  const strings = useStrings();

  // Get Train level requirement from masterResources
  const trainResource = masterResources?.find(r => r.type === 'Train');
  const trainRequiredLevel = trainResource?.level || 1;

  const [infoResource, setInfoResource] = useState(null); // ResourceModalSmall for an order you cannot fill

  const [trainPhase, setTrainPhase] = useState("loading");
  const [trainTimer, setTrainTimer] = useState("⏳");
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [playerTrainNumber, setPlayerTrainNumber] = useState(0);
  const [settlementTrainNumber, setSettlementTrainNumber] = useState(0);
  const [settlementTrainPhase, setSettlementTrainPhase] = useState("");
  const [currentTrainOffers, setCurrentTrainOffers] = useState([]);
  const [currentTrainRewards, setCurrentTrainRewards] = useState([]);
  const [nextTrainOffers, setNextTrainOffers] = useState([]);
  const [nextTrainRewards, setNextTrainRewards] = useState([]);
  const [isTrading, setIsTrading] = useState(false);
  // A completed order's burst: { index, id } (a new id replays it); no slide-in or flip, the order
  // simply turns completed
  const [orderFx, setOrderFx] = useState(null);
  const [rewardsDeliveredMessage, setRewardsDeliveredMessage] = useState("");
  const [showTrainComplete, setShowTrainComplete] = useState(false); // "All Train orders filled!" celebration

  // Mail this Train's rewards (message 101) through the server's atomic $push, which also lights
  // the mailbox badge; the local list gets the same entry so the UI agrees before the next fetch.
  // Throws on failure, so the caller leaves lastRewardDeliveryTrainNumber alone and the
  // departure check delivers them later instead.
  const mailTrainRewards = async (rewards) => {
    const customRewards = rewards.map(reward => ({ item: reward.item, qty: reward.quantity }));
    await axios.post(`${API_BASE}/api/send-mailbox-message`, {
      playerId: currentPlayer.playerId,
      messageId: 101,
      customRewards,
    });
    setCurrentPlayer(prev => ({
      ...prev,
      messages: [...(prev?.messages || []), { messageId: 101, receivedAt: new Date(), collected: false, neverPurge: false, rewards: customRewards }],
    }));
  };

  // Rewards are tiered (TrainOfferLogic.js): the base tier once every order but the aspirational
  // ones is filled, the full tier once all of them are. Mails whichever tier this Train has earned
  // and not yet mailed. Markers: lastBaseRewardTrainNumber (base) and lastRewardDeliveryTrainNumber
  // (full; also set at departure, which closes the Train). A tier whose mail fails is not marked,
  // so the next check retries it.
  const deliverEarnedTrainRewards = async (offers, rewards, trainNumber, trainData) => {
    const filled = (offers || []).filter(o => o.completed === true).length;
    const allFilled = offers?.length > 0 && filled === offers.length;
    const { base, full } = splitTrainRewards(rewards);
    const fullDone = (trainData?.lastRewardDeliveryTrainNumber || 0) >= trainNumber;
    const baseDone = fullDone || (trainData?.lastBaseRewardTrainNumber || 0) >= trainNumber;
    const markers = {};
    const delivered = [];
    let failed = false;

    if (!baseDone && offers?.length > 0 && filled >= getTrainBaseThreshold(offers)) {
      try {
        if (base.length > 0) { await mailTrainRewards(base); delivered.push(...base); }
        markers.lastBaseRewardTrainNumber = trainNumber;
      } catch (error) {
        console.error('❌ Error mailing base train rewards:', error);
        failed = true;
      }
    }
    if (!fullDone && allFilled && !failed) {
      try {
        if (full.length > 0) { await mailTrainRewards(full); delivered.push(...full); }
        markers.lastRewardDeliveryTrainNumber = trainNumber;
      } catch (error) {
        console.error('❌ Error mailing full train rewards:', error);
        failed = true;
      }
    }
    return { markers, delivered, failed };
  };

  const rewardSummaryText = (rewards) =>
    rewards.map(reward => `${getSymbol(reward.item)} ${reward.quantity} ${reward.item}`).join(', ');

  // Initialize train data on component load
  useEffect(() => {
    if (currentPlayer?.playerId && currentPlayer?.settlementId) {
      initializeTrainData();
    }
  }, [currentPlayer?.playerId, currentPlayer?.settlementId]);

  // Update timer from localStorage
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
      const trainTimerData = storedTimers.train || {};

      const phase = trainTimerData.phase;
      setTrainPhase(phase || "unknown");
      setSettlementTrainPhase(phase || "unknown");

      const endTime = trainTimerData.endTime;
      if (!endTime || isNaN(endTime)) {
        setTrainTimer("N/A");
        return;
      } else {
        setTrainTimer(formatCountdown(endTime, now));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Watch for train phase changes and trigger reward delivery
  useEffect(() => {
    if (!currentPlayer?.playerId || !settlementTrainPhase) return;
    
    const checkForRewardDelivery = async () => {
      const playerTrainNum = currentPlayer?.train?.currentTrainNumber || 0;
      const lastRewardDelivery = currentPlayer?.train?.lastRewardDeliveryTrainNumber || 0;
      
      // Check if we should deliver rewards for current train when it starts departing/arriving
      const shouldDeliverRewards = (
        playerTrainNum === settlementTrainNumber && 
        (settlementTrainPhase === 'departing' || settlementTrainPhase === 'arriving') &&
        playerTrainNum > lastRewardDelivery
      );
      
      if (shouldDeliverRewards) {
        console.log('🚂 [Reactive] Train phase changed to departing/arriving - checking for reward delivery');
        await checkAndDeliverCurrentTrainRewards(playerTrainNum);
      }
    };
    
    checkForRewardDelivery();
  }, [settlementTrainPhase, currentPlayer?.train?.currentTrainNumber, settlementTrainNumber]);

  // Clear rewards message when entering loading phase (new train cycle)
  useEffect(() => {
    if (trainPhase === "loading" && rewardsDeliveredMessage) {
      setRewardsDeliveredMessage("");
    }
  }, [trainPhase, rewardsDeliveredMessage]);


  const initializeTrainData = async () => {
    setIsContentLoading(true);
    try {
      console.log('🚂 Initializing personalized train data...');
      
      // Step 1: Get settlement train number
      const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${currentPlayer.settlementId}`);
      const trainlog = settlementResponse.data?.trainlog || [];
      const currentTrainLog = trainlog.find(log => log.status === "Current Train");
      const currentSettlementTrainNumber = currentTrainLog?.trainnumber || 1;
      
      setSettlementTrainNumber(currentSettlementTrainNumber);
      console.log('🚂 Settlement train number:', currentSettlementTrainNumber);

      // Step 2: Get player's current train number
      const currentPlayerTrainNumber = currentPlayer?.train?.currentTrainNumber || 0;
      setPlayerTrainNumber(currentPlayerTrainNumber);
      console.log('🚂 Player train number:', currentPlayerTrainNumber);

      // Step 3: Determine which train data to show based on comparison
      await determineTrainDataToShow(currentPlayerTrainNumber, currentSettlementTrainNumber, settlementTrainPhase);

    } catch (error) {
      console.error("❌ Error initializing train data:", error);
    } finally {
      setIsContentLoading(false);
    }
  };

  const determineTrainDataToShow = async (playerTrainNum, settlementTrainNum, settlementPhase) => {
    console.log('🚂 Determining train data to show:', { 
      playerTrainNum, 
      settlementTrainNum, 
      settlementPhase,
      lastRewardDelivery: currentPlayer?.train?.lastRewardDeliveryTrainNumber || 0 
    });
    
    // Check if we should deliver rewards for current train when it starts departing
    const shouldDeliverRewards = (
      playerTrainNum === settlementTrainNum && 
      (settlementPhase === 'departing' || settlementPhase === 'arriving') &&
      playerTrainNum > (currentPlayer?.train?.lastRewardDeliveryTrainNumber || 0)
    );
    
    // Check if player is behind on train numbers
    const isPlayerBehind = playerTrainNum < settlementTrainNum;
    
    if (shouldDeliverRewards) {
      // Player is on current train and it's departing/arriving - deliver rewards then show current data
      console.log('🚂 Train is departing/arriving - checking for reward delivery');
      await checkAndDeliverCurrentTrainRewards(playerTrainNum);
      await showCurrentTrainData();
    } else if (isPlayerBehind) {
      // Player is behind - advance them to current train
      console.log('🚂 Player is behind, advancing to current train');
      await advancePlayerToCurrentTrain(settlementTrainNum);
    } else if (playerTrainNum === settlementTrainNum) {
      // Player is on current train - show existing data or generate if missing
      console.log('🚂 Player is on current train');
      await showCurrentTrainData();
    } else {
      // Player is ahead (shouldn't happen, but handle gracefully)
      console.log('🚂 Player is ahead of settlement train - this should not happen');
      await showCurrentTrainData();
    }
  };

  const showCurrentTrainData = async () => {
    // Use existing player train data if available
    const existingCurrentOffers = currentPlayer?.train?.currentTrainOffers || [];
    const existingCurrentRewards = currentPlayer?.train?.currentTrainRewards || [];
    const existingNextOffers = currentPlayer?.train?.nextTrainOffers || [];
    const existingNextRewards = currentPlayer?.train?.nextTrainRewards || [];

    if (existingCurrentOffers.length === 0) {
      // Generate new train data for current train
      console.log('🚂 Generating new current train data');
      await generateAndSaveTrainData(settlementTrainNumber);
    } else {
      // Use existing data
      console.log('🚂 Using existing current train data');
      setCurrentTrainOffers(existingCurrentOffers);
      setCurrentTrainRewards(existingCurrentRewards);
      setNextTrainOffers(existingNextOffers);
      setNextTrainRewards(existingNextRewards);
    }
  };

  const checkAndDeliverCurrentTrainRewards = async (trainNumber) => {
    const existingCurrentOffers = currentPlayer?.train?.currentTrainOffers || [];
    const existingCurrentRewards = currentPlayer?.train?.currentTrainRewards || [];
    if (existingCurrentOffers.length === 0) return;

    // The Train is leaving: mail what was earned, then close it (lastRewardDeliveryTrainNumber)
    // unless a mail failed, so the next check retries.
    const { markers, delivered, failed } = await deliverEarnedTrainRewards(
      existingCurrentOffers, existingCurrentRewards, trainNumber, currentPlayer?.train);
    const updatedTrainData = {
      ...currentPlayer.train,
      ...markers,
      ...(failed ? {} : { lastRewardDeliveryTrainNumber: trainNumber })
    };
    try {
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { train: updatedTrainData }
      });
      if (response.data.success) {
        setCurrentPlayer(prev => ({ ...prev, train: updatedTrainData }));
      }
    } catch (error) {
      console.error('❌ Error updating train reward markers:', error);
    }
    if (delivered.length > 0) {
      updateStatus(`📦 Caravan rewards delivered to your mailbox: ${rewardSummaryText(delivered)}`);
      setRewardsDeliveredMessage(strings[2016] || "Caravan rewards have been delivered to your mailbox!");
    } else {
      const completedCount = existingCurrentOffers.filter(offer => offer.completed === true).length;
      console.log(`🚂 Train departing with ${completedCount}/${existingCurrentOffers.length} offers completed`);
    }
  };

  const checkAndDeliverPreviousTrainRewards = async () => {
    const existingCurrentOffers = currentPlayer?.train?.currentTrainOffers || [];
    const existingCurrentRewards = currentPlayer?.train?.currentTrainRewards || [];
    const previousTrainNumber = currentPlayer?.train?.currentTrainNumber || 0;
    if (existingCurrentOffers.length === 0 || previousTrainNumber === 0) return;

    // A Train that left while the player was away: mail any tier earned and not yet mailed. The
    // markers are not saved; the player's train data moves on to the new Train right after.
    const { delivered } = await deliverEarnedTrainRewards(
      existingCurrentOffers, existingCurrentRewards, previousTrainNumber, currentPlayer?.train);
    if (delivered.length > 0) {
      updateStatus(`📦 Caravan rewards delivered to your mailbox: ${rewardSummaryText(delivered)}`);
      setRewardsDeliveredMessage(strings[2016] || "Caravan rewards have been delivered to your mailbox!");
    } else if ((currentPlayer?.train?.lastRewardDeliveryTrainNumber || 0) < previousTrainNumber) {
      const completedCount = existingCurrentOffers.filter(offer => offer.completed === true).length;
      updateStatus(`🚂 Previous train left with ${completedCount}/${existingCurrentOffers.length} orders completed`);
    }
  };

  const advancePlayerToCurrentTrain = async (newTrainNumber) => {
    console.log('🚂 Advancing player to train', newTrainNumber);
    
    // Check if player completed all previous train offers and deliver rewards
    await checkAndDeliverPreviousTrainRewards();
    
    // Move next train data to current (if exists)
    const existingNextOffers = currentPlayer?.train?.nextTrainOffers || [];
    const existingNextRewards = currentPlayer?.train?.nextTrainRewards || [];
    
    let newCurrentOffers = [];
    let newCurrentRewards = [];
    
    if (existingNextOffers.length > 0) {
      // Use existing next train data as current
      newCurrentOffers = existingNextOffers;
      newCurrentRewards = existingNextRewards;
      console.log('🚂 Using existing next train data as current');
    } else {
      // Generate new current train data
      console.log('🚂 Generating new current train data');
      const trainData = generateCompleteTrainData(
        currentPlayer,
        masterResources,
        globalTuning,
        currentSeason,
        newTrainNumber,
        masterXPLevels
      );
      newCurrentOffers = trainData.offers;
      newCurrentRewards = trainData.rewards;
    }

    // Generate new next train data
    const nextTrainData = generateCompleteTrainData(
      currentPlayer,
      masterResources,
      globalTuning,
      currentSeason,
      newTrainNumber + 1,
      masterXPLevels
    );

    // Update player in database
    const updatedTrainData = {
      currentTrainNumber: newTrainNumber,
      lastRewardDeliveryTrainNumber: currentPlayer?.train?.lastRewardDeliveryTrainNumber || 0, // the no-double-mail guard
      lastBaseRewardTrainNumber: currentPlayer?.train?.lastBaseRewardTrainNumber || 0,
      currentTrainOffers: newCurrentOffers,
      currentTrainRewards: newCurrentRewards,
      nextTrainOffers: nextTrainData.offers,
      nextTrainRewards: nextTrainData.rewards
    };

    try {
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { train: updatedTrainData }
      });

      if (response.data.success) {
        // Update local state
        setCurrentPlayer(prev => ({
          ...prev,
          train: updatedTrainData
        }));
        
        setPlayerTrainNumber(newTrainNumber);
        setCurrentTrainOffers(newCurrentOffers);
        setCurrentTrainRewards(newCurrentRewards);
        setNextTrainOffers(nextTrainData.offers);
        setNextTrainRewards(nextTrainData.rewards);
        
        console.log('✅ Player advanced to train', newTrainNumber);
      }
    } catch (error) {
      console.error('❌ Error advancing player train:', error);
    }
  };

  const generateAndSaveTrainData = async (trainNumber) => {
    // Generate current and next train data
    const currentTrainData = generateCompleteTrainData(
      currentPlayer,
      masterResources,
      globalTuning,
      currentSeason,
      trainNumber,
      masterXPLevels
    );

    const nextTrainData = generateCompleteTrainData(
      currentPlayer,
      masterResources,
      globalTuning,
      currentSeason,
      trainNumber + 1,
      masterXPLevels
    );

    const updatedTrainData = {
      currentTrainNumber: trainNumber,
      lastRewardDeliveryTrainNumber: currentPlayer?.train?.lastRewardDeliveryTrainNumber || 0, // the no-double-mail guard
      lastBaseRewardTrainNumber: currentPlayer?.train?.lastBaseRewardTrainNumber || 0,
      currentTrainOffers: currentTrainData.offers,
      currentTrainRewards: currentTrainData.rewards,
      nextTrainOffers: nextTrainData.offers,
      nextTrainRewards: nextTrainData.rewards
    };

    try {
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { train: updatedTrainData }
      });

      if (response.data.success) {
        // Update local state
        setCurrentPlayer(prev => ({
          ...prev,
          train: updatedTrainData
        }));
        
        setCurrentTrainOffers(currentTrainData.offers);
        setCurrentTrainRewards(currentTrainData.rewards);
        setNextTrainOffers(nextTrainData.offers);
        setNextTrainRewards(nextTrainData.rewards);
        
        console.log('✅ Generated and saved new train data');
      }
    } catch (error) {
      console.error('❌ Error saving train data:', error);
    }
  };

  const getSymbol = (type) => {
    return masterResources.find(r => r.type === type)?.symbol || "❓";
  };

  // Check if loading phase has expired based on client timer
  const isLoadingPhaseExpired = () => {
    const now = Date.now();
    const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
    const trainTimerData = storedTimers.train || {};
    const endTime = trainTimerData.endTime;
    const phase = trainTimerData.phase;
    
    // If we're in loading phase and the timer has expired, consider it expired
    if (phase === "loading" && endTime && now >= endTime) {
      return true;
    }
    
    // If we're already in departing or arriving phase, definitely expired
    if (phase === "departing" || phase === "arriving") {
      return true;
    }
    
    return false;
  };

  const handleFulfillOffer = async (offer, offerIndex) => {
    if (!offer || !currentPlayer || isTrading) return;
    
    // Check if loading phase has expired (client-side authority)
    if (isLoadingPhaseExpired()) {
      updateStatus('❌ Train has already departed! Cannot fulfill orders.');
      return;
    }
    
    // Set trading flag to prevent spam clicks
    setIsTrading(true);

    // On the tap (house rule: never wait for the server): the card bursts into sparkles, the order
    // shows completed, and its Money rises from the card and flies into the header counter.
    // A refused delivery puts the order back.
    const offersBefore = currentTrainOffers;
    const earned = (masterResources.find(r => r.type === offer.item)?.maxprice || 100) * offer.quantity;
    const fxId = Date.now() + Math.random();
    setOrderFx({ index: offerIndex, id: fxId });
    setTimeout(() => setOrderFx((fx) => (fx?.id === fxId ? null : fx)), 900);
    setCurrentTrainOffers((prev) => prev.map((o, i) => (i === offerIndex ? { ...o, completed: true } : o)));
    soundManager.playSFX('collect_money');
    try { navigator.vibrate?.(35); } catch (_) { /* no haptics here */ }
    const card = document.querySelector(`[data-train-slot="${offerIndex}"]`);
    if (card) {
      const r = card.getBoundingClientRect();
      FloatingTextManager.addFloatingTextAt(`+${earned.toLocaleString()} ${getSymbol('Money')}`, r.left + r.width / 2, r.top + r.height / 2, { flyTo: 'money' });
    }
    let committed = false;   // the server saved the delivery

    try {
      // Spend the ingredients (the item being delivered)
      const success = await spendIngredients({
        playerId: currentPlayer.playerId,
        recipe: { 
          type: offer.item, 
          ingredient1: offer.item, 
          ingredient1qty: offer.quantity 
        },
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
      });
      
      if (!success) return;   // (finally puts the order back)
      // Calculate money reward
      const resource = masterResources.find(r => r.type === offer.item);
      const moneyReward = (resource?.maxprice || 100) * offer.quantity;

      // Award money for fulfillment
      await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: "Money",
        quantity: moneyReward,
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
        globalTuning,
      });

      // Mark the fulfilled offer as completed instead of removing it (the one tapped, by its slot)
      const updatedCurrentOffers = offersBefore.map((o, i) => (i === offerIndex ? { ...o, completed: true } : o));

      // Update player train data in database
      const updatedTrainData = {
        ...currentPlayer.train,
        currentTrainOffers: updatedCurrentOffers
      };

      // A reward tier earned by this order goes to the mailbox now, not when the Train departs:
      // the base tier on the order that reaches the threshold, the full tier on the last order.
      // The celebration opens at once (optimistic) when every order is filled.
      const trainNumber = currentPlayer?.train?.currentTrainNumber || playerTrainNumber;
      const allFilled = updatedCurrentOffers.length > 0 && updatedCurrentOffers.every(o => o.completed === true);
      if (allFilled && (currentPlayer?.train?.lastRewardDeliveryTrainNumber || 0) < trainNumber) {
        setShowTrainComplete(true);
      }
      const { markers, delivered } = await deliverEarnedTrainRewards(
        updatedCurrentOffers, currentTrainRewards, trainNumber, currentPlayer?.train);
      Object.assign(updatedTrainData, markers);
      const tierText = delivered.length > 0 ? ` 🚂 Rewards sent to your mailbox: ${rewardSummaryText(delivered)}` : '';

      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { train: updatedTrainData }
      });

      if (response.data.success) {
        // Update local state
        setCurrentPlayer(prev => ({
          ...prev,
          train: updatedTrainData
        }));

        setCurrentTrainOffers(updatedCurrentOffers);
        committed = true;

        updateStatus(`✅ Delivered ${offer.quantity} ${offer.item} for ${getSymbol('Money')} ${moneyReward.toLocaleString()}.${tierText}`);
      }
    } catch (error) {
      console.error("❌ Error fulfilling train offer:", error);
      updateStatus('❌ Trade failed. Please try again.');
    } finally {
      if (!committed) setCurrentTrainOffers(offersBefore);   // revert the optimistic completion
      // Always clear the trading flag
      setIsTrading(false);
    }
  };

  const handleGenerateOffers = async () => {
    if (isTrading) return;
    
    // Set trading flag to prevent spam clicks
    setIsTrading(true);
    
    console.log('🚂 [DEBUG] Regenerating train offers...');
    
    try {
      // Generate new current train data
      const currentTrainData = generateCompleteTrainData(
        currentPlayer,
        masterResources,
        globalTuning,
        currentSeason,
        playerTrainNumber,
        masterXPLevels
      );

      // Generate new next train data
      const nextTrainData = generateCompleteTrainData(
        currentPlayer,
        masterResources,
        globalTuning,
        currentSeason,
        playerTrainNumber + 1,
        masterXPLevels
      );

      const updatedTrainData = {
        ...currentPlayer.train,
        currentTrainOffers: currentTrainData.offers,
        currentTrainRewards: currentTrainData.rewards,
        nextTrainOffers: nextTrainData.offers,
        nextTrainRewards: nextTrainData.rewards
      };

      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { train: updatedTrainData }
      });

      if (response.data.success) {
        // Update local state
        setCurrentPlayer(prev => ({
          ...prev,
          train: updatedTrainData
        }));
        
        setCurrentTrainOffers(currentTrainData.offers);
        setCurrentTrainRewards(currentTrainData.rewards);
        setNextTrainOffers(nextTrainData.offers);
        setNextTrainRewards(nextTrainData.rewards);
        
        updateStatus('🚂 [DEBUG] Generated new train offers and rewards!');
        console.log('✅ [DEBUG] Train offers regenerated successfully');
      }
    } catch (error) {
      console.error("❌ [DEBUG] Error regenerating train offers:", error);
      updateStatus('❌ Failed to generate new offers');
    } finally {
      // Always clear the trading flag
      setIsTrading(false);
    }
  };

  const renderCurrentOffers = () => {
    if (currentTrainOffers.length === 0) return null;

    return (
      <div className="offer-section">
        <h4>Your Train Orders</h4>
        {currentTrainOffers.map((offer, index) => {
          const isCompleted = offer.completed || false;
          const playerQty = inventory?.find(item => item.type === offer.item)?.quantity || 0;
          const backpackQty = backpack?.find(item => item.type === offer.item)?.quantity || 0;
          const totalQty = playerQty + backpackQty;
          const loadingExpired = isLoadingPhaseExpired();
          const affordable = totalQty >= offer.quantity && !isCompleted && !loadingExpired;

          // Calculate money reward
          const resource = masterResources.find(r => r.type === offer.item);
          const moneyReward = (resource?.maxprice || 100) * offer.quantity;

          let costDisplay, details, buttonText;
          
          if (isCompleted) {
            costDisplay = `<span style="color: var(--color-text-positive);">${getSymbol(offer.item)} ${offer.item} ${offer.quantity}</span>`;
            details = `<div>${costDisplay}</div>Completed`;
            buttonText = '';
          } else if (loadingExpired) {
            costDisplay = `<span style="color: var(--color-text-muted);">${getSymbol(offer.item)} ${offer.item} ${offer.quantity} / ${totalQty}</span>`;
            details = `<div>${costDisplay}</div>Train Departed`;
            buttonText = '';
          } else {
            const costColor = affordable ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
            costDisplay = `<span style="color: ${costColor};">${getSymbol(offer.item)} ${offer.item} ${offer.quantity} / ${totalQty}</span>${offer.band === 'aspirational' ? ' ⭐' : ''}`;
            const rewardDisplay = `${getSymbol('Money')} ${moneyReward.toLocaleString()}`;
            details = `<div>${costDisplay}</div>${strings[42]} ${rewardDisplay}`;
            buttonText = '';
          }

          return (
            <div
              key={index}
              data-train-slot={index}
              className={`train-offer-wrap ${orderFx?.index === index ? 'train-fx-burst' : ''}`}
              style={{ position: 'relative' }}
              onClick={() => { if (!affordable && !isCompleted && !loadingExpired && !isTrading) setInfoResource(offer.item); }} // the disabled card lets the tap through (NewTrain.css): where to find the item
            >
              <ResourceButton
                className={`train-offer-card ${isCompleted ? 'completed' : ''}`}
                onClick={() => !isTrading && affordable && !isCompleted ? handleFulfillOffer(offer, index) : null}
                disabled={isCompleted || !affordable || isTrading}
                details={details}
                noClickSfx={true}
              >
                {buttonText}
              </ResourceButton>
              {isCompleted && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  right: '10px',
                  transform: 'translateY(-50%)',
                  fontSize: '2em', // style-ok: icon (the ✅ glyph)
                  color: 'var(--color-text-positive)',
                  pointerEvents: 'none',
                  zIndex: 10
                }}>
                  ✅
                </div>
              )}
              {orderFx?.index === index && <SaleBurst key={orderFx.id} />}
            </div>
          );
        })}
      </div>
    );
  };

  const renderCurrentRewards = () => {
    // Two tiers (TrainOfferLogic.js): the base tier for every order but the stretch (⭐) ones,
    // the full tier for all of them
    const { base, full } = splitTrainRewards(currentTrainRewards);
    const threshold = getTrainBaseThreshold(currentTrainOffers);
    const total = currentTrainOffers.length;
    const renderList = (rewards) => (
      <div className="train-rewards-container">
        {rewards.map((reward, index) => (
          <div key={index} className="train-reward-item">
            {getSymbol(reward.item)} {reward.quantity} {reward.item}
          </div>
        ))}
      </div>
    );
    return (
      <div className="reward-section">
        {currentTrainRewards.length === 0 && <p>No rewards available</p>}
        {base.length > 0 && threshold < total && (
          <>
            <h4>{(strings[2024] || 'Rewards for filling {n} of {m} orders:').replace('{n}', threshold).replace('{m}', total)}</h4>
            {renderList(base)}
          </>
        )}
        {(full.length > 0 || (base.length > 0 && threshold >= total)) && (
          <>
            <h4>{strings[2019]}</h4>
            {renderList(threshold >= total ? [...base, ...full] : full)}
          </>
        )}
      </div>
    );
  };

  const renderNextTrain = () => {
    if (nextTrainOffers.length === 0) return null;

    return (
      <div className="next-shipment-preview">
        <h4>{strings[2003]}</h4>
        <div className="next-shipment-container">
          <div style={{ marginBottom: '10px' }}>
            <strong>Orders:</strong>
          </div>
          {nextTrainOffers.map((offer, index) => (
            <div key={index} className="next-shipment-item">
              {getSymbol(offer.item)} {offer.item}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
    <Panel onClose={onClose} descriptionKey="1022" titleKey="1122" panelName="NewTrainPanel">
      <LevelLock
        currentPlayer={currentPlayer}
        masterXPLevels={masterXPLevels}
        requiredLevel={trainRequiredLevel}
        featureName="Train"
      >
        {(() => {
          const isInHomeSettlement = String(currentPlayer.location.s) === String(currentPlayer.settlementId);
          return !isInHomeSettlement;
        })() ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h2>{strings[2050] || "This is not your home settlement."}</h2>
          </div>
        ) : isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            <h3>Caravan is {trainPhase} (#{playerTrainNumber})</h3>
            <h2 className="countdown-timer">⏳ {trainTimer}</h2>

            {rewardsDeliveredMessage && (trainPhase === "departing" || trainPhase === "arriving") && (
              <div style={{
                backgroundColor: 'var(--color-success)',
                color: 'var(--color-text-white)',
                padding: '10px',
                margin: '10px 0',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'center',
                fontWeight: 'bold'
              }}>
                ✅ {rewardsDeliveredMessage}
              </div>
            )}

            {trainPhase === "loading" && (
              <>
                {renderCurrentRewards()}
                {renderCurrentOffers()}
              </>
            )}

            {(trainPhase === "loading" || trainPhase === "departing") && renderNextTrain()}
          </>
        )}
      </LevelLock>
    </Panel>
    {showTrainComplete && <TrainCompleteModal onClose={() => setShowTrainComplete(false)} />}
    {infoResource && <ResourceModalSmall resourceType={infoResource} masterResources={masterResources} onClose={() => setInfoResource(null)} />}
    </>
  );
}

export default NewTrainPanel;