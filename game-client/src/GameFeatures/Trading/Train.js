import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import ResourceButton from '../../UI/ResourceButton';
import { checkAndDeductIngredients } from '../../Utils/InventoryManagement';
import './Train.css';
import FloatingTextManager from '../../UI/FloatingText';

function TrainPanel({ onClose, currentPlayer, setCurrentPlayer, updateStatus }) {
  const [trainOffers, setTrainOffers] = useState([]);
  const [trainPhase, setTrainPhase] = useState("loading");
  const [trainTimer, setTrainTimer] = useState("⏳");
  const [allResources, setAllResources] = useState([]);
  const [nextOffers, setNextOffers] = useState([]);
  const [trainRewards, setTrainRewards] = useState([]);

  // 1. Initial load for the player
  useEffect(() => {
    if (currentPlayer?.settlementId) {
      fetchTrainOffers();
      fetchResources(); // ✅ important!
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
      const endTime = trainTimerData.endTime;
      const phase = trainTimerData.phase;

      if (!endTime || isNaN(endTime)) {
        setTrainTimer("N/A");
        setTrainPhase("unknown");
        return;
      }

      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;

      setTrainPhase(phase || "unknown");
      setTrainTimer(`${h}h ${m}m ${s}s`);
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

  const fetchResources = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/resources`);
      setAllResources(res.data || []);
    } catch (err) {
      console.error("❌ Error fetching resources:", err);
    }
  };

  const getSymbol = (type) => {
    return allResources.find(r => r.type === type)?.symbol || "❓";
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

    const affordable = checkAndDeductIngredients({ type: offer.itemBought, quantity: offer.qtyBought }, currentPlayer.inventory);
    if (!affordable) {
      updateStatus(`❌ Not enough ${offer.itemBought}`);
      return;
    }

    const updatedInventory = [...currentPlayer.inventory]
      .map((item) =>
        item.type === offer.itemBought
          ? { ...item, quantity: item.quantity - offer.qtyBought }
          : item
      )
      .filter((item) => item.quantity > 0);

    const moneyIndex = updatedInventory.findIndex(i => i.type === "Money");
    if (moneyIndex >= 0) {
      updatedInventory[moneyIndex].quantity += offer.qtyGiven;
    } else {
      updatedInventory.push({ type: "Money", quantity: offer.qtyGiven });
    }

    try {
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
      });

      await axios.post(`${API_BASE}/api/update-train-offer/${currentPlayer.settlementId}`, {
        updateOffer: {
          ...offer,
          filled: true,
        },
      });

      setCurrentPlayer(prev => ({ ...prev, inventory: updatedInventory }));
      updateStatus(`✅ Delivered ${offer.qtyBought} ${offer.itemBought}, received ${offer.qtyGiven} Money`);
      FloatingTextManager.addFloatingText(`+${offer.qtyGiven} 💰`, window.innerWidth / 10, window.innerHeight / 4);

      setTrainOffers(prev => prev.map(o => o === offer ? { ...o, filled: true } : o));
    } catch (error) {
      console.error("❌ Error fulfilling offer:", error);
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
          const affordable = currentPlayer.inventory.some(
            (item) => item.type === offer.itemBought && item.quantity >= offer.qtyBought
          );
          return (
            <ResourceButton
              key={index}
              className="train-offer-card"
              onClick={() =>
                isCompleted ? null :
                isYours ? handleFulfill(offer) :
                !offer.claimedBy ? handleClaim(offer) : null
              }
              disabled={isCompleted || (!isYours && offer.claimedBy) || (isYours && !affordable)}
            >
              <div className="offer-details">
                <span>{getSymbol(offer.itemBought)} {offer.itemBought} x{offer.qtyBought}</span><br />
                <span>{getSymbol(offer.itemGiven)} {offer.qtyGiven}</span><br />
                {isCompleted ? (
                  <span className="checkmark">✅ Completed</span>
                ) : isYours && affordable ? (
                  <span className="fulfilled-label">Click to fulfill</span>
                ) : isYours ? (
                  <span className="fulfilled-label">Your Order</span>
                ) : offer.claimedBy ? (
                  <span className="claimed-label">Claimed</span>
                ) : (
                  <span className="claim-label">Claim Order</span>
                )}
              </div>
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