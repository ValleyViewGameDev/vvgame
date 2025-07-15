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
  setModalContent,
  setIsModalOpen
  }) 
{
  const strings = useStrings();
  const [trainOffers, setTrainOffers] = useState([]);
  const [trainPhase, setTrainPhase] = useState("loading");
  const [trainTimer, setTrainTimer] = useState("⏳");
  const [nextOffers, setNextOffers] = useState([]);
  const [trainRewards, setTrainRewards] = useState([]);
  const [latestInventory, setLatestInventory] = useState([]);

  // 1. Initial load for the player
  useEffect(() => {
    const fetchInventory = async () => {
      if (!currentPlayer?.playerId) return;
      try {
        const response = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setLatestInventory(response.data.inventory || []);
      } catch (error) {
        console.error("❌ Error fetching latest inventory:", error);
      }
    };
    fetchInventory();

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

  const handleShowTrainLog = async () => {
    if (!setModalContent || !setIsModalOpen) {
      console.warn("Modal context functions not available.");
      return;
    }

    if (!currentPlayer?.settlementId) {
      console.warn("⚠️ Cannot show train log: settlementId missing.");
      return;
    }

    try {
      const response = await axios.get(`${API_BASE}/api/settlement/${currentPlayer.settlementId}/trainlog`);
      const trainlog = response.data.trainlog || [];

      const trainLogTable = (
        <table className="train-log-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 12px" }}>Date</th>
              <th style={{ padding: "6px 12px" }}>Offers Filled</th>
              <th style={{ padding: "6px 12px" }}>Total Winners</th>
              <th style={{ padding: "6px 12px" }}>Reward Summary</th>
              <th style={{ padding: "6px 12px" }}>Logic</th>
            </tr>
          </thead>
          <tbody>
            {[...trainlog].reverse().map((entry, i) => (
              <tr key={i}>
                <td style={{ padding: "6px 12px" }}>{new Date(entry.date).toLocaleDateString()}</td>
                <td style={{ padding: "6px 12px" }}>{entry.alloffersfilled ? '✅' : '❌'}</td>
                <td style={{ padding: "6px 12px" }}>{entry.totalwinners}</td>
                <td style={{ padding: "6px 12px" }}>{(entry.rewards || []).map(r => `${r.qty} ${r.item}`).join(', ')}</td>
                <td style={{ padding: "6px 12px" }}>{entry.logic || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

      setModalContent({
        title: "Train Log",
        size: "large",
        message: trainlog.length === 0 ? "No recent train activity." : undefined,
        custom: trainLogTable,
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error("❌ Failed to fetch train log:", error);
      setModalContent({
        title: "Error",
        message: "Failed to load train log.",
        size: "small",
      });
      setIsModalOpen(true);
    }
  };

  const getSymbol = (type) => {
    return masterResources.find(r => r.type === type)?.symbol || "❓";
  };

  const handleClaim = async (offer) => {
    if (!offer || offer.claimedBy) return;

    // ⛔️ Check if player already has a claimed offer
    const alreadyClaimed = trainOffers.some(
      (o) => o.claimedBy === currentPlayer.playerId && !o.filled
    );
    if (alreadyClaimed) {
      updateStatus(2014); // ⚠️ Already claimed an offer
      return;
    }

    try {
      // Find the exact index of the offer to ensure uniqueness
      const offerIndex = trainOffers.findIndex(
        (o) => o.itemBought === offer.itemBought &&
              o.qtyBought === offer.qtyBought &&
              !o.claimedBy &&
              !o.filled
      );
      if (offerIndex === -1) {
        console.warn("⚠️ No matching unclaimed offer found to claim.");
        return;
      }

      const updatedOffer = {
        ...trainOffers[offerIndex],
        claimedBy: currentPlayer.playerId,
      };

      await axios.post(`${API_BASE}/api/update-train-offer/${currentPlayer.settlementId}`, {
        updateOffer: updatedOffer,
      });

      setTrainOffers(prev => {
        const newOffers = [...prev];
        newOffers[offerIndex] = updatedOffer;
        return newOffers;
      });
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
      setTrainOffers(prev => {
        const index = prev.findIndex(o =>
          o.itemBought === offer.itemBought &&
          o.qtyBought === offer.qtyBought &&
          o.claimedBy === currentPlayer.playerId &&
          !o.filled
        );
        if (index === -1) return prev;
        const newOffers = [...prev];
        newOffers[index] = { ...newOffers[index], filled: true };
        return newOffers;
      });

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
        <h4>{strings[2003]}</h4>
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
        <h4>{strings[2004]}</h4>
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
          const affordable = latestInventory?.some(
            (item) => item.type === offer.itemBought && item.quantity >= offer.qtyBought
          ) || false;

          const playerQty = latestInventory?.find(inv => inv.type === offer.itemBought)?.quantity || 0;
          const costColor = playerQty >= offer.qtyBought ? 'green' : 'red';
          const costDisplay = `<span style="color: ${costColor};">${getSymbol(offer.itemBought)} ${offer.itemBought} ${offer.qtyBought} / ${playerQty}</span>`;
          const rewardDisplay = `+${getSymbol(offer.itemGiven)} ${offer.itemGiven} ${offer.qtyGiven.toLocaleString()}`;
          const details = `Offer:<div>${costDisplay}</div><br>Reward:<div>${rewardDisplay}</div>`;

          let buttonText = '';
          if (isCompleted) {
            buttonText = strings[2012];
          } else if (isYours && affordable) {
            buttonText = strings[2005];
          } else if (isYours) {
            buttonText = strings[2006];
          } else if (offer.claimedBy) {
            buttonText = strings[2007];
          } else {
            buttonText = strings[2008];
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
      <h3>{strings[2020]} {trainPhase}</h3>
      <h2>⏳ {trainTimer}</h2>

      <button className="standard-button" onClick={() => handleShowTrainLog()}>
        {strings[2015]}
      </button>

      {trainPhase === "loading" && (
        <>
          {renderRewardSection()}
          {renderOfferSection(strings[2009], claimedByYou)}
          {renderOfferSection(strings[2010], available)}
          {renderOfferSection(strings[2011], claimedByOthers)}
          {renderOfferSection(strings[2012], completed)}
        </>
      )}

      {allOrdersFilled && (
        <div className="train-rewards-banner">
          {strings[2016]}
        </div>
      )}

      {(trainPhase === "loading" || trainPhase === "departing") && renderNextShipment()}      
    </Panel>
  );
}

export default TrainPanel;