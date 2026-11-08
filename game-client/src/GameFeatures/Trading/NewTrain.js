import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import LevelLock from '../../UI/Panels/LevelLock';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import ResourceIcon, { resourceIconHtml } from '../../UI/Icons/ResourceIcon';
import ResourceModalSmall from '../../UI/Modals/ResourceModalSmall';
import TrainCompleteModal from '../../UI/Modals/TrainCompleteModal';
import { getPlayerQuantity } from '../../Utils/InventoryManagement';
import { getTrainBaseThreshold, splitTrainRewards } from './TrainOfferLogic';
import './Train.css';
import { formatCountdown } from '../../UI/Timers';
import { useStrings } from '../../UI/StringsContext';
import soundManager from '../../Sound/SoundManager';
import SaleBurst from '../../UI/SaleBurst';
import FloatingTextManager from '../../UI/FloatingText';
import { getLocalizedString } from '../../Utils/stringLookup';

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

  // The Caravan is the server's (game-server/routes/caravanRoutes.js, utils/caravan.js): it makes
  // the orders and rewards, fills an order and mails each reward tier the moment it is earned; the
  // train scheduler's departure mails anything a failed send left behind, so no login is needed.
  // This panel shows what the server holds and reacts on the tap.
  const rewardSummaryText = (rewards) =>
    rewards.map(reward => `{res:${reward.item}} ${reward.quantity} ${getLocalizedString(reward.item, strings)}`).join(', ');

  // The server's answer is the truth: train, holdings and mail land together
  const applyServerState = (data) => {
    const train = data.train || {};
    setCurrentPlayer(prev => ({
      ...prev,
      train,
      ...(data.inventory ? { inventory: data.inventory } : {}),
      ...(data.backpack ? { backpack: data.backpack } : {}),
      ...(data.messages ? { messages: data.messages } : {}),
    }));
    if (data.inventory) setInventory(data.inventory);
    if (data.backpack) setBackpack(data.backpack);
    setPlayerTrainNumber(train.currentTrainNumber || 0);
    setCurrentTrainOffers(train.currentTrainOffers || []);
    setCurrentTrainRewards(train.currentTrainRewards || []);
    setNextTrainOffers(train.nextTrainOffers || []);
    setNextTrainRewards(train.nextTrainRewards || []);
    if (data.delivered?.length > 0) {
      setRewardsDeliveredMessage(strings[2016] || "Caravan rewards have been delivered to your mailbox!");
    }
  };

  // Bring this player's Caravan up to the settlement's (or make one); the earned rewards of a
  // Caravan that left while they were away were already mailed at departure
  const syncCaravan = async () => {
    setIsContentLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/api/caravan/sync`, { playerId: currentPlayer.playerId });
      if (data?.success) {
        applyServerState(data);
        if (data.delivered?.length > 0) updateStatus(`Caravan rewards delivered to your mailbox: ${rewardSummaryText(data.delivered)}`);
      }
    } catch (error) {
      console.error("❌ Error syncing the Caravan:", error);
    } finally {
      setIsContentLoading(false);
    }
  };

  // Load on open
  useEffect(() => {
    if (currentPlayer?.playerId && currentPlayer?.settlementId) syncCaravan();
  }, [currentPlayer?.playerId, currentPlayer?.settlementId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Update timer from localStorage
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
      const trainTimerData = storedTimers.train || {};
      setTrainPhase(trainTimerData.phase || "unknown");
      const endTime = trainTimerData.endTime;
      setTrainTimer(!endTime || isNaN(endTime) ? "N/A" : formatCountdown(endTime, now));
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // A new Caravan starts loading while the panel is open: fetch its orders
  useEffect(() => {
    if (trainPhase === "loading" && currentPlayer?.playerId) syncCaravan();
  }, [trainPhase]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Clear rewards message when entering loading phase (new train cycle)
  useEffect(() => {
    if (trainPhase === "loading" && rewardsDeliveredMessage) {
      setRewardsDeliveredMessage("");
    }
  }, [trainPhase]);   // eslint-disable-line react-hooks/exhaustive-deps

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
    if (phase === "loading" && endTime && now >= endTime) return true;
    if (phase === "departing" || phase === "arriving") return true;
    return false;
  };

  const handleFulfillOffer = async (offer, offerIndex) => {
    if (!offer || !currentPlayer || isTrading) return;

    if (isLoadingPhaseExpired()) {
      updateStatus(strings[2119] || '❌ The Caravan has already departed! Cannot fulfill orders.');
      return;
    }
    // Room for the Money is never a question (Money has no slot), and the goods are checked here
    // so a refusal is rare; the server checks both again
    if (getPlayerQuantity(offer.item, inventory, backpack) < offer.quantity) return;

    setIsTrading(true);

    // On the tap (house rule: never wait for the server): the card bursts into sparkles, the order
    // shows completed, and its Money rises from the card and flies into the header counter.
    // A refused delivery puts the order back.
    const offersBefore = currentTrainOffers;
    const earned = (masterResources.find(r => r.type === offer.item)?.maxprice || 100) * offer.quantity;
    const fxId = Date.now() + Math.random();
    setOrderFx({ index: offerIndex, id: fxId });
    setTimeout(() => setOrderFx((fx) => (fx?.id === fxId ? null : fx)), 900);
    const optimistic = offersBefore.map((o, i) => (i === offerIndex ? { ...o, completed: true } : o));
    setCurrentTrainOffers(optimistic);
    if (optimistic.every(o => o.completed === true) && (currentPlayer?.train?.lastRewardDeliveryTrainNumber || 0) < playerTrainNumber) {
      setShowTrainComplete(true);
    }
    soundManager.playSFX('collect_money');
    try { navigator.vibrate?.(35); } catch (_) { /* no haptics here */ }
    const card = document.querySelector(`[data-train-slot="${offerIndex}"]`);
    if (card) {
      const r = card.getBoundingClientRect();
      FloatingTextManager.addFloatingTextAt(`+${earned.toLocaleString()} {res:Money}`, r.left + r.width / 2, r.top + r.height / 2, { flyTo: 'money' });
    }

    try {
      const transactionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const { data } = await axios.post(`${API_BASE}/api/caravan/fill`, { playerId: currentPlayer.playerId, offerIndex, transactionId });
      if (!data?.success) throw new Error(data?.error || 'fill failed');
      applyServerState(data);
      const tierText = data.delivered?.length > 0 ? ` 🚂 Rewards sent to your mailbox: ${rewardSummaryText(data.delivered)}` : '';
      updateStatus(`✅ Delivered ${offer.quantity} ${offer.item} for {res:Money} ${data.money.toLocaleString()}.${tierText}`);
    } catch (error) {
      const code = error?.response?.data?.error;
      console.error("❌ Error fulfilling Caravan order:", code || error);
      setCurrentTrainOffers(offersBefore);   // revert the optimistic completion
      setShowTrainComplete(false);
      if (code === 'departed') updateStatus(strings[2119] || '❌ The Caravan has already departed! Cannot fulfill orders.');
      else updateStatus('❌ Trade failed. Please try again.');
      if (code === 'stale-train' || code === 'already-filled') syncCaravan();
    } finally {
      setIsTrading(false);
    }
  };

  const renderCurrentOffers = () => {
    if (currentTrainOffers.length === 0) return null;

    return (
      <div className="offer-section">
        <h3>{strings[2117] || 'Your Caravan Orders'}</h3>
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
            costDisplay = `<span style="color: var(--color-text-positive);">${resourceIconHtml(offer.item, masterResources)} ${offer.item} ${offer.quantity}</span>`;
            details = `<div>${costDisplay}</div>Completed`;
            buttonText = '';
          } else if (loadingExpired) {
            costDisplay = `<span style="color: var(--color-text-muted);">${resourceIconHtml(offer.item, masterResources)} ${offer.item} ${offer.quantity} / ${totalQty}</span>`;
            details = `<div>${costDisplay}</div>${strings[2118] || 'Caravan Departed'}`;
            buttonText = '';
          } else {
            const costColor = affordable ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
            costDisplay = `<span style="color: ${costColor};">${resourceIconHtml(offer.item, masterResources)} ${offer.item} ${offer.quantity} / ${totalQty}</span>${offer.band === 'aspirational' ? ' ⭐' : ''}`;
            const rewardDisplay = `${resourceIconHtml('Money', masterResources)} ${moneyReward.toLocaleString()}`;
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
            <ResourceIcon type={reward.item} masterResources={masterResources} /> {reward.quantity} {reward.item}
          </div>
        ))}
      </div>
    );
    return (
      <div className="reward-section">
        {currentTrainRewards.length === 0 && <p>No rewards available</p>}
        {base.length > 0 && threshold < total && (
          <>
            <h3>{(strings[2024] || 'Rewards for filling {n} of {m} orders:').replace('{n}', threshold).replace('{m}', total)}</h3>
            {renderList(base)}
          </>
        )}
        {(full.length > 0 || (base.length > 0 && threshold >= total)) && (
          <>
            <h3>{strings[2019]}</h3>
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
        <h3>{strings[2003]}</h3>
        <div className="next-shipment-container">
          <div style={{ marginBottom: '10px' }}>
            <strong>Orders:</strong>
          </div>
          {nextTrainOffers.map((offer, index) => (
            <div key={index} className="next-shipment-item">
              <ResourceIcon type={offer.item} masterResources={masterResources} /> {offer.item}
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
        featureName={getLocalizedString('Train', strings)}
      >
        {(() => {
          const isInHomeSettlement = String(currentPlayer.location.s) === String(currentPlayer.settlementId);
          return !isInHomeSettlement;
        })() ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h3>{strings[2050] || "This is not your home settlement."}</h3>
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