import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import ResourceButton from '../../UI/ResourceButton';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import './Train.css';
import FloatingTextManager from '../../UI/FloatingText';
import { formatCountdown } from '../../UI/Timers';
import { useStrings } from '../../UI/StringsContext';

function TrainPanel({ 
  onClose, 
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer, 
  setCurrentPlayer, 
  updateStatus,
  masterResources,
  }) 
{
  const strings = useStrings();
  const [trainOffers, setTrainOffers] = useState([]);
  const [trainPhase, setTrainPhase] = useState("loading");
  const [trainTimer, setTrainTimer] = useState("⏳");
  const [nextOffers, setNextOffers] = useState([]);
  const [trainRewards, setTrainRewards] = useState([]);

  // 1. Initial load for the player
  useEffect(() => {
    if (currentPlayer?.settlementId) {
      fetchTrainOffers();
    }
  }, [currentPlayer]);


  // 2. Fetch fresh train offers on *every* phase change
  useEffect(() => {
    if (currentPlayer?.settlementId) {
      fetchTrainOffers(); // ✅ fixes stale data after phase transitions
    }
  }, [trainPhase]);


  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();

      const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
      const trainTimerData = storedTimers.train || {};

      const phase = trainTimerData.phase;
      setTrainPhase(phase || "unknown");

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

  const fetchTrainOffers = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/get-settlement/${currentPlayer.settlementId}`);
      setTrainOffers(response.data?.currentoffers || []);
      setNextOffers(response.data?.nextoffers || []);
      setTrainRewards(response.data?.trainrewards || []);
    } catch (error) {
      console.error("❌ Error fetching train offers:", error);
    }
  };


  const getSymbol = (type) => {
    return masterResources.find(r => r.type === type)?.symbol || "❓";
  };

  const handleClaim = async (offer) => {
    if (!offer || offer.claimedBy) return;

    try {
      await axios.post(`${API_BASE}/api/update-train-offer/${currentPlayer.settlementId}`, {
        updateOffer: {
          ...offer,
          claimedBy: currentPlayer.playerId,
        },
      });

      setTrainOffers(prev => prev.map(o => o === offer ? { ...o, claimedBy: currentPlayer.playerId } : o));
    } catch (err) {
      console.error("❌ Error claiming train offer:", err);
    }
  };

  const handleFulfill = async (offer) => {
    if (!offer || offer.claimedBy !== currentPlayer.playerId) return;

    // Spend the ingredients (the item being delivered)
    const success = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe: { type: offer.itemBought, ingredient1: offer.itemBought, qtyingredient1: offer.qtyBought },
      inventory,
      backpack,
      setInventory,
      setBackpack,
      updateStatus,
    });
    if (!success) return;

    try {
      // First update the train offer
      await axios.post(`${API_BASE}/api/update-train-offer/${currentPlayer.settlementId}`, {
        updateOffer: {
          ...offer,
          filled: true,
        },
      });

      console.log('Offer = ',offer);
      console.log('Offer.qtyGiven = ',offer.qtyGiven);
      
    // Award Money for fulfillment
    await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: "Money",
      quantity: offer.qtyGiven,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
      masterResources,
    });

      // Update local state in correct order
      setTrainOffers(prev => prev.map(o =>
        o.itemBought === offer.itemBought &&
        o.qtyBought === offer.qtyBought &&
        o.claimedBy === currentPlayer.playerId
          ? { ...o, filled: true }
          : o
      ));

      updateStatus(`✅ Delivered ${offer.qtyBought} ${offer.itemBought}.`);

    } catch (error) {
      console.error("❌ Error fulfilling offer:", error);
      fetchTrainOffers(); // Refresh offers on error to ensure sync
    }
  };

  const renderNextShipment = () => {
    if (!["loading", "departing"].includes(trainPhase)) return null;
    if (!nextOffers.length) return null;
  
    // ✅ Deduplicate by itemBought
    const seen = new Set();
    const uniqueOffers = nextOffers.filter((offer) => {
      if (seen.has(offer.itemBought)) return false;
      seen.add(offer.itemBought);
      return true;
    });
  
    return (
      <div className="next-shipment-preview">
        <h4>📦 Next Shipment Preview:</h4>
        <ul>
          {uniqueOffers.map((offer, index) => (
            <li key={index}>
              {getSymbol(offer.itemBought)} {offer.itemBought}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderRewardSection = () => {
    if (!trainRewards.length || trainPhase !== "loading") return null;
  
    // ✅ Deduplicate by reward.item
    const seen = new Set();
    const uniqueRewards = trainRewards.filter((reward) => {
      if (seen.has(reward.item)) return false;
      seen.add(reward.item);
      return true;
    });
  
    return (
      <div className="reward-section">
        <h4>🎁 Rewards for filling all orders:</h4>
        <ul className="reward-list">
          {uniqueRewards.map((reward, index) => (
            <li key={index}>
              {getSymbol(reward.item)} {reward.item}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderOfferSection = (title, offers) => {
    if (!offers.length) return null;
    return (
      <div className="offer-section">
        <h4>{title}</h4>
        {offers.map((offer, index) => {
          const isYours = offer.claimedBy === currentPlayer.playerId;
          const isCompleted = offer.filled;
          const affordable = inventory?.some(
            (item) => item.type === offer.itemBought && item.quantity >= offer.qtyBought
          ) || false;

          const playerQty = inventory?.find(inv => inv.type === offer.itemBought)?.quantity || 0;
          const costColor = playerQty >= offer.qtyBought ? 'green' : 'red';
          const costDisplay = `<span style="color: ${costColor};">${getSymbol(offer.itemBought)} ${offer.itemBought} ${offer.qtyBought} / ${playerQty}</span>`;
          const rewardDisplay = `+${getSymbol(offer.itemGiven)} ${offer.itemGiven} ${offer.qtyGiven.toLocaleString()}`;
          const details = `Offer:<div>${costDisplay}</div><br>Reward:<div>${rewardDisplay}</div>`;

          let buttonText = '';
          if (isCompleted) {
            buttonText = '✅ Completed';
          } else if (isYours && affordable) {
            buttonText = 'Click to fulfill';
          } else if (isYours) {
            buttonText = 'Your Order';
          } else if (offer.claimedBy) {
            buttonText = 'Claimed';
          } else {
            buttonText = 'Claim Order';
          }

          return (
            <ResourceButton
              key={index}
              className={`train-offer-card ${
                !offer.claimedBy ? 'unclaimed' : 
                'resource-button'
              }`}
              onClick={() =>
                isCompleted ? null :
                isYours ? handleFulfill(offer) :
                !offer.claimedBy ? handleClaim(offer) : null
              }
              disabled={isCompleted || (!isYours && offer.claimedBy) || (isYours && !affordable)}
              details={details}
            >

            </ResourceButton>
          );
        })}
      </div>
    );
  };

  const claimedByYou = trainOffers.filter(o => o.claimedBy === currentPlayer.playerId && !o.filled);
  const available = trainOffers.filter(o => !o.claimedBy);
  const claimedByOthers = trainOffers.filter(o => o.claimedBy && o.claimedBy !== currentPlayer.playerId && !o.filled);
  const completed = trainOffers.filter(o => o.filled);

  const allOrdersFilled = trainPhase === 'departing' || trainPhase === 'arriving'
  ? trainOffers.length > 0 && trainOffers.every(o => o.filled)
  : false;


  return (
    <Panel onClose={onClose} descriptionKey="1022" titleKey="1122" panelName="TrainPanel">
      <h3>Train is {trainPhase}</h3>
      <h2>⏳ {trainTimer}</h2>

      {trainPhase === "loading" && (
        <>
          {renderRewardSection()}
          {renderOfferSection("Claimed by you:", claimedByYou)}
          {renderOfferSection("Available to claim:", available)}
          {renderOfferSection("Claimed by others:", claimedByOthers)}
          {renderOfferSection("Completed:", completed)}
        </>
      )}

      {allOrdersFilled && (
        <div className="train-rewards-banner">
          ✅ All orders were completed! Rewards have been mailed out.
        </div>
      )}

      {(trainPhase === "loading" || trainPhase === "departing") && renderNextShipment()}      
    </Panel>
  );
}

export default TrainPanel;