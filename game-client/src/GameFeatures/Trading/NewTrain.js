import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import { generateCompleteTrainData } from './TrainOfferLogic';
import './Train.css';
import { formatCountdown } from '../../UI/Timers';
import { useStrings } from '../../UI/StringsContext';

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
  currentSeason
  }) 
{
  const strings = useStrings();
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
  const [rewardsDeliveredMessage, setRewardsDeliveredMessage] = useState("");

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
    
    // Check if all current offers were completed
    if (existingCurrentOffers.length > 0) {
      const allOffersCompleted = existingCurrentOffers.every(offer => offer.completed === true);
      
      if (allOffersCompleted && existingCurrentRewards.length > 0) {
        console.log('🚂 All current train offers completed! Delivering rewards to mailbox:', existingCurrentRewards);
        
        // Generate a unique message ID based on timestamp
        const messageId = Date.now();
        
        // Create the message for the mailbox
        const newMessage = {
          messageId: 101,
          timestamp: new Date(),
          rewards: existingCurrentRewards.map(reward => ({
            item: reward.item,
            qty: reward.quantity
          })),
          read: false,
          collected: false,
          neverPurge: false
        };
        
        try {
          // Add the message to player's messages array AND update lastRewardDeliveryTrainNumber
          const currentMessages = currentPlayer?.messages || [];
          const updatedMessages = [...currentMessages, newMessage];
          
          const updatedTrainData = {
            ...currentPlayer.train,
            lastRewardDeliveryTrainNumber: trainNumber
          };
          
          const response = await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { 
              messages: updatedMessages,
              train: updatedTrainData
            }
          });
          
          if (response.data.success) {
            // Update local player state
            setCurrentPlayer(prev => ({
              ...prev,
              messages: updatedMessages,
              train: updatedTrainData
            }));
            
            // Create reward summary for status message
            const rewardSummary = existingCurrentRewards.map(reward => 
              `${getSymbol(reward.item)} ${reward.quantity} ${reward.item}`
            ).join(', ');
            
            updateStatus(`🚂 Train rewards delivered to your mailbox: ${rewardSummary}`);
            setRewardsDeliveredMessage(strings[2016] || "Train rewards have been delivered to your mailbox!");
            console.log('✅ Current train rewards successfully delivered to mailbox');
          }
        } catch (error) {
          console.error('❌ Error delivering current train rewards to mailbox:', error);
        }
      } else {
        // Some offers were not completed
        const completedCount = existingCurrentOffers.filter(offer => offer.completed === true).length;
        console.log(`🚂 Train departing with ${completedCount}/${existingCurrentOffers.length} offers completed`);
        
        // Still update lastRewardDeliveryTrainNumber to prevent future attempts
        try {
          const updatedTrainData = {
            ...currentPlayer.train,
            lastRewardDeliveryTrainNumber: trainNumber
          };
          
          const response = await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { train: updatedTrainData }
          });
          
          if (response.data.success) {
            setCurrentPlayer(prev => ({
              ...prev,
              train: updatedTrainData
            }));
          }
        } catch (error) {
          console.error('❌ Error updating lastRewardDeliveryTrainNumber:', error);
        }
      }
    }
  };

  const checkAndDeliverPreviousTrainRewards = async () => {
    const existingCurrentOffers = currentPlayer?.train?.currentTrainOffers || [];
    const existingCurrentRewards = currentPlayer?.train?.currentTrainRewards || [];
    
    // Check if all current offers were completed
    if (existingCurrentOffers.length > 0) {
      const allOffersCompleted = existingCurrentOffers.every(offer => offer.completed === true);
      
      if (allOffersCompleted && existingCurrentRewards.length > 0) {
        console.log('🚂 All train offers completed! Delivering rewards to mailbox:', existingCurrentRewards);
        
        // Generate a unique message ID based on timestamp
        const messageId = Date.now();
        
        // Create the message for the mailbox
        const newMessage = {
          messageId: 101,
          timestamp: new Date(),
          rewards: existingCurrentRewards.map(reward => ({
            item: reward.item,
            qty: reward.quantity
          })),
          read: false,
          collected: false,
          neverPurge: false
        };
        
        try {
          // Add the message to player's messages array
          const currentMessages = currentPlayer?.messages || [];
          const updatedMessages = [...currentMessages, newMessage];
          
          const response = await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { messages: updatedMessages }
          });
          
          if (response.data.success) {
            // Update local player state
            setCurrentPlayer(prev => ({
              ...prev,
              messages: updatedMessages
            }));
            
            // Create reward summary for status message
            const rewardSummary = existingCurrentRewards.map(reward => 
              `${getSymbol(reward.item)} ${reward.quantity} ${reward.item}`
            ).join(', ');
            
            updateStatus(`🚂 Train rewards delivered to your mailbox: ${rewardSummary}`);
            setRewardsDeliveredMessage(strings[2016] || "Train rewards have been delivered to your mailbox!");
            console.log('✅ Train rewards successfully delivered to mailbox');
          }
        } catch (error) {
          console.error('❌ Error delivering train rewards to mailbox:', error);
        }
      } else if (existingCurrentOffers.length > 0) {
        // Some offers were not completed
        const completedCount = existingCurrentOffers.filter(offer => offer.completed === true).length;
        console.log(`🚂 Train expired with ${completedCount}/${existingCurrentOffers.length} offers completed`);
        updateStatus(`🚂 Previous train left with ${completedCount}/${existingCurrentOffers.length} orders completed`);
      }
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
        newTrainNumber
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
      newTrainNumber + 1
    );

    // Update player in database
    const updatedTrainData = {
      currentTrainNumber: newTrainNumber,
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
      trainNumber
    );
    
    const nextTrainData = generateCompleteTrainData(
      currentPlayer, 
      masterResources, 
      globalTuning, 
      currentSeason, 
      trainNumber + 1
    );

    const updatedTrainData = {
      currentTrainNumber: trainNumber,
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

  const handleFulfillOffer = async (offer) => {
    if (!offer || !currentPlayer || isTrading) return;
    
    // Check if loading phase has expired (client-side authority)
    if (isLoadingPhaseExpired()) {
      updateStatus('❌ Train has already departed! Cannot fulfill orders.');
      return;
    }
    
    // Set trading flag to prevent spam clicks
    setIsTrading(true);
    
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
      
      if (!success) return;
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

      // Mark the fulfilled offer as completed instead of removing it
      const updatedCurrentOffers = currentTrainOffers.map(o => {
        if (o.item === offer.item && o.quantity === offer.quantity && !o.completed) {
          return { ...o, completed: true };
        }
        return o;
      });

      // Update player train data in database
      const updatedTrainData = {
        ...currentPlayer.train,
        currentTrainOffers: updatedCurrentOffers
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
        
        setCurrentTrainOffers(updatedCurrentOffers);
        updateStatus(`✅ Delivered ${offer.quantity} ${offer.item} for ${getSymbol('Money')} ${moneyReward.toLocaleString()}.`);
      }
    } catch (error) {
      console.error("❌ Error fulfilling train offer:", error);
      updateStatus('❌ Trade failed. Please try again.');
    } finally {
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
        playerTrainNumber
      );
      
      // Generate new next train data
      const nextTrainData = generateCompleteTrainData(
        currentPlayer, 
        masterResources, 
        globalTuning, 
        currentSeason, 
        playerTrainNumber + 1
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
            costDisplay = `<span style="color: green;">${getSymbol(offer.item)} ${offer.item} ${offer.quantity}</span>`;
            details = `<div>${costDisplay}</div>Completed`;
            buttonText = '';
          } else if (loadingExpired) {
            costDisplay = `<span style="color: gray;">${getSymbol(offer.item)} ${offer.item} ${offer.quantity} / ${totalQty}</span>`;
            details = `<div>${costDisplay}</div>Train Departed`;
            buttonText = '';
          } else {
            const costColor = affordable ? 'green' : 'red';
            costDisplay = `<span style="color: ${costColor};">${getSymbol(offer.item)} ${offer.item} ${offer.quantity} / ${totalQty}</span>`;
            const rewardDisplay = `${getSymbol('Money')} ${moneyReward.toLocaleString()}`;
            details = `<div>${costDisplay}</div>${strings[42]} ${rewardDisplay}`;
            buttonText = '';
          }

          return (
            <div key={index} style={{ position: 'relative' }}>
              <ResourceButton
                className={`train-offer-card ${isCompleted ? 'completed' : ''}`}
                onClick={() => !isTrading && affordable && !isCompleted ? handleFulfillOffer(offer) : null}
                disabled={isCompleted || !affordable || isTrading}
                details={details}
              >
                {buttonText}
              </ResourceButton>
              {isCompleted && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  right: '10px',
                  transform: 'translateY(-50%)',
                  fontSize: '2em',
                  color: 'green',
                  pointerEvents: 'none',
                  zIndex: 10
                }}>
                  ✅
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderCurrentRewards = () => {
    return (
      <div className="reward-section">
        <h4>{strings[2019]}</h4>
        {currentTrainRewards.length > 0 ? (
          <div className="train-rewards-container">
            {currentTrainRewards.map((reward, index) => (
              <div key={index} className="train-reward-item">
                {getSymbol(reward.item)} {reward.quantity} {reward.item}
              </div>
            ))}
          </div>
        ) : (
          <p>No rewards available</p>
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
    <Panel onClose={onClose} descriptionKey="1022" titleKey="1122" panelName="NewTrainPanel">
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
          <h3>(New) Train is {trainPhase} (#{playerTrainNumber})</h3>
          <h2>⏳ {trainTimer}</h2>

          {rewardsDeliveredMessage && (trainPhase === "departing" || trainPhase === "arriving") && (
            <div style={{
              backgroundColor: 'var(--color-success)',
              color: 'var(--color-text-white)',
              padding: '10px',
              margin: '10px 0',
              borderRadius: '5px',
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

    </Panel>
  );
}

export default NewTrainPanel;