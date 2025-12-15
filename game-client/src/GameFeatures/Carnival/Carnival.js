import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import './Carnival.css';
import FloatingTextManager from '../../UI/FloatingText';
import { formatCountdown } from '../../UI/Timers';
import { useStrings } from '../../UI/StringsContext';

function CarnivalPanel({ 
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
  globalTuning
  }) 
{
  const strings = useStrings();
  const [carnivalOffers, setCarnivalOffers] = useState([]);
  const [carnivalPhase, setCarnivalPhase] = useState("here");
  const [carnivalTimer, setCarnivalTimer] = useState("⏳");
  const [nextOffers, setNextOffers] = useState([]);
  const [carnivalRewards, setCarnivalRewards] = useState([]);
  const [latestInventory, setLatestInventory] = useState([]);
  const [playerUsernames, setPlayerUsernames] = useState({}); // Map of playerId -> username
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [currentCarnivalNumber, setCurrentCarnivalNumber] = useState(null);

  // 1. Initial load for the player
  useEffect(() => {
    const fetchInventory = async () => {
      if (!currentPlayer?.playerId) return;
      setIsContentLoading(true);
      try {
        const response = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setLatestInventory(response.data.inventory || []);
      } catch (error) {
        console.error("❌ Error fetching latest inventory:", error);
      } finally {
        setIsContentLoading(false);
      }
    };
    fetchInventory();

    if (currentPlayer?.settlementId) {
      fetchCarnivalOffers();
    }
  }, [currentPlayer?.playerId, currentPlayer?.settlementId]);


  // 2. Fetch fresh carnival offers on *every* phase change
  useEffect(() => {
    if (currentPlayer?.settlementId) {
      fetchCarnivalOffers(); // ✅ fixes stale data after phase transitions
    }
  }, [carnivalPhase]);


  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();

      const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
      const carnivalTimerData = storedTimers.carnival || {};

      const phase = carnivalTimerData.phase;
      setCarnivalPhase(phase || "unknown");

      const endTime = carnivalTimerData.endTime;
      if (!endTime || isNaN(endTime)) {
        setCarnivalTimer("N/A");
        return;
      } else {
        setCarnivalTimer(formatCountdown(endTime, now));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchCarnivalOffers = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/get-settlement/${currentPlayer.settlementId}`);
      const offers = response.data?.carnival?.currentoffers || [];
      setCarnivalOffers(offers);
      setNextOffers(response.data?.carnival?.nextoffers || []);
      // Get current carnival info from carnivallog
      const carnivallog = response.data?.carnival?.carnivallog || [];
      const currentCarnival = carnivallog.find(log => log.status === "Current Carnival");
      if (currentCarnival) {
        // Use rewards from the current carnival log entry
        setCarnivalRewards(currentCarnival.rewards || []);
        if (currentCarnival.carnivalnumber) {
          setCurrentCarnivalNumber(currentCarnival.carnivalnumber);
        }
      } else {
        // No current carnival, clear rewards
        setCarnivalRewards([]);
      }
      
      // Fetch usernames for claimed/completed offers
      await fetchUsernames(offers);
    } catch (error) {
      console.error("❌ Error fetching carnival offers:", error);
    }
  };

  const fetchUsernames = async (offers) => {
    try {
      // Find all unique player IDs that have claimed or completed offers
      const playerIds = [...new Set(
        offers
          .filter(offer => offer.claimedBy)
          .map(offer => offer.claimedBy)
      )];

      if (playerIds.length === 0) return;

      // Fetch usernames for these player IDs
      const usernamePromises = playerIds.map(async (playerId) => {
        try {
          const response = await axios.get(`${API_BASE}/api/player/${playerId}`);
          return { playerId, username: response.data.username };
        } catch (error) {
          console.error(`❌ Error fetching username for player ${playerId}:`, error);
          return { playerId, username: 'Unknown' };
        }
      });

      const usernameResults = await Promise.all(usernamePromises);
      
      // Convert to map and update state
      const usernameMap = usernameResults.reduce((acc, { playerId, username }) => {
        acc[playerId] = username;
        return acc;
      }, {});

      setPlayerUsernames(prev => ({ ...prev, ...usernameMap }));
    } catch (error) {
      console.error("❌ Error fetching usernames:", error);
    }
  };

  const [showLogicModal, setShowLogicModal] = useState(false);
  const [logicModalData, setLogicModalData] = useState({ logic: '', carnivalNumber: null });

  const handleShowLogic = (logicText, carnivalNumber) => {
    setLogicModalData({ logic: logicText, carnivalNumber });
    setShowLogicModal(true);
  };

  const handleShowCarnivalLog = async () => {
    if (!setModalContent || !setIsModalOpen) {
      console.warn("Modal context functions not available.");
      return;
    }

    if (!currentPlayer?.settlementId) {
      console.warn("⚠️ Cannot show carnival log: settlementId missing.");
      return;
    }

    try {
      const response = await axios.get(`${API_BASE}/api/settlement/${currentPlayer.settlementId}/carnivallog`);
      const carnivallog = response.data.carnivallog || [];

      const carnivalLogTable = (
        <table className="carnival-log-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 12px" }}>Carnival #</th>
              <th style={{ padding: "6px 12px" }}>Date</th>
              <th style={{ padding: "6px 12px" }}>Status</th>
              <th style={{ padding: "6px 12px" }}>Offers Filled</th>
              <th style={{ padding: "6px 12px" }}>Total Winners</th>
              <th style={{ padding: "6px 12px" }}>Reward Summary</th>
              <th style={{ padding: "6px 12px" }}>Logic</th>
            </tr>
          </thead>
          <tbody>
            {[...carnivallog].reverse().map((entry, i) => (
              <tr key={i}>
                <td style={{ padding: "6px 12px" }}>{entry.carnivalnumber || '-'}</td>
                <td style={{ padding: "6px 12px" }}>{new Date(entry.date).toLocaleDateString()}</td>
                <td style={{ padding: "6px 12px" }}>{entry.status || ''}</td>
                <td style={{ padding: "6px 12px" }}>
                  {entry.status === 'Next Carnival' || entry.status === 'Current Carnival' ? 'n/a' : entry.alloffersfilled ? '✅' : '❌'}
                </td>
                <td style={{ padding: "6px 12px" }}>
                  {entry.status === 'Next Carnival' || entry.status === 'Current Carnival' ? 'n/a' : entry.totalwinners}
                </td>
                <td style={{ padding: "6px 12px" }}>
                  {(() => {
                    // Combine rewards of the same type for display
                    const combinedRewards = {};
                    (entry.rewards || []).forEach((reward) => {
                      if (combinedRewards[reward.item]) {
                        combinedRewards[reward.item] += reward.qty;
                      } else {
                        combinedRewards[reward.item] = reward.qty;
                      }
                    });
                    return Object.entries(combinedRewards).map(([item, totalQty]) => `${totalQty} ${item}`).join(', ');
                  })()}
                </td>
                <td style={{ padding: "6px 12px" }}>
                  {entry.logic ? (
                    <button 
                      onClick={() => handleShowLogic(entry.logic, entry.carnivalnumber)}
                      className="carnival-logic-button"
                    >
                      Logic
                    </button>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );

      setModalContent({
        title: "Carnival Log",
        size: "large",
        message: carnivallog.length === 0 ? "No recent carnival activity." : undefined,
        custom: carnivalLogTable,
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error("❌ Failed to fetch carnival log:", error);
      setModalContent({
        title: "Error",
        message: "Failed to load carnival log.",
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
    const alreadyClaimed = carnivalOffers.some(
      (o) => o.claimedBy === currentPlayer.playerId && !o.filled
    );
    if (alreadyClaimed) {
      updateStatus(2014); // ⚠️ Already claimed an offer
      return;
    }

    try {
      // Find the exact index of the offer to ensure uniqueness
      const offerIndex = carnivalOffers.findIndex(
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
        ...carnivalOffers[offerIndex],
        claimedBy: currentPlayer.playerId,
      };

      const response = await axios.post(`${API_BASE}/api/update-carnival-offer/${currentPlayer.settlementId}`, {
        updateOffer: updatedOffer,
      });

      if (response.status === 200) {
        setCarnivalOffers(prev => {
          const newOffers = [...prev];
          newOffers[offerIndex] = updatedOffer;
          return newOffers;
        });
        
        // Add current player's username to the map immediately
        setPlayerUsernames(prev => ({
          ...prev,
          [currentPlayer.playerId]: currentPlayer.username
        }));
      }
    } catch (err) {
      console.error("❌ Error claiming carnival offer:", err);
      
      // Handle case where offer was already claimed
      if (err.response?.status === 409) {
        updateStatus(2017); // This order has already been claimed.
        // Refresh offers to get latest state
        fetchCarnivalOffers();
      } else {
        updateStatus(505); // Generic error
      }
    }
  };

  const handleFulfill = async (offer) => {
    if (!offer || offer.claimedBy !== currentPlayer.playerId) return;

    // Spend the ingredients (the item being delivered)
    const success = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe: { 
        type: offer.itemBought, 
        ingredient1: offer.itemBought, 
        ingredient1qty: offer.qtyBought 
      },
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });
    if (!success) return;

    try {
      // First update the carnival offer
      await axios.post(`${API_BASE}/api/update-carnival-offer/${currentPlayer.settlementId}`, {
        updateOffer: {
          ...offer,
          filled: true,
        },
      });

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
      globalTuning,
    });

      // Update local state in correct order
      setCarnivalOffers(prev => {
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
      fetchCarnivalOffers(); // Refresh offers on error to ensure sync
    }
  };

  const renderNextShipment = () => {
    if (!["here", "departing"].includes(carnivalPhase)) return null;
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
        <h4>{strings[2018]}</h4>
        <div className="next-shipment-container">
          {uniqueOffers.map((offer, index) => (
            <div key={index} className="next-shipment-item">
              {getSymbol(offer.itemBought)} {offer.itemBought}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRewardSection = () => {
    if (!carnivalRewards.length || carnivalPhase !== "here") return null;
  
    // ✅ Combine rewards of the same type
    const combinedRewards = {};
    carnivalRewards.forEach((reward) => {
      if (combinedRewards[reward.item]) {
        combinedRewards[reward.item] += reward.qty;
      } else {
        combinedRewards[reward.item] = reward.qty;
      }
    });
  
    return (
      <div className="reward-section">
        <h4>{strings[2004]}</h4>
        <div className="carnival-rewards-container">
          {Object.entries(combinedRewards).map(([item, totalQty], index) => (
            <div key={index} className="carnival-reward-item">
              {getSymbol(item)} {totalQty} {item}
            </div>
          ))}
        </div>
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
          const rewardDisplay = `${getSymbol(offer.itemGiven)} ${offer.qtyGiven.toLocaleString()}`;
          const details = `<div>${costDisplay}</div><br>${strings[42]}: ${rewardDisplay}`;

          let buttonText = '';
          if (isCompleted) {
            const username = playerUsernames[offer.claimedBy] || 'Unknown';
            buttonText = username;
          } else if (isYours && affordable) {
            buttonText = strings[2005];
          } else if (isYours) {
            buttonText = strings[2006];
          } else if (offer.claimedBy) {
            const username = playerUsernames[offer.claimedBy] || 'Unknown';
            buttonText = `${strings[2007]} (${username})`;
          } else {
            buttonText = strings[2008];
          }

          return (
            <ResourceButton
              key={index}
              name={isCompleted || offer.claimedBy ? (playerUsernames[offer.claimedBy] || 'Unknown') : ''}
              className={`carnival-offer-card ${
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
              <strong>{!isCompleted && !offer.claimedBy ? buttonText : 
               !isCompleted && offer.claimedBy ? strings[2007] : ''}</strong>
            </ResourceButton>
          );
        })}
      </div>
    );
  };

  const claimedByYou = carnivalOffers.filter(o => o.claimedBy === currentPlayer.playerId && !o.filled);
  const available = carnivalOffers.filter(o => !o.claimedBy);
  const claimedByOthers = carnivalOffers.filter(o => o.claimedBy && o.claimedBy !== currentPlayer.playerId && !o.filled);
  const completed = carnivalOffers.filter(o => o.filled);

  const allOrdersFilled = carnivalPhase === 'departing' || carnivalPhase === 'arriving'
  ? carnivalOffers.length > 0 && carnivalOffers.every(o => o.filled)
  : false;


  return (
    <>
    <Panel onClose={onClose} descriptionKey="1037" titleKey="1137" panelName="CarnivalPanel">
      {/* Check if player is in their home settlement */}
      {(() => {
        const isInHomeSettlement = String(currentPlayer.location.s) === String(currentPlayer.settlementId);
        console.log('🎡 Carnival access check:', {
          currentSettlement: currentPlayer.location.s,
          homeSettlement: currentPlayer.settlementId,
          isInHomeSettlement
        });
        return !isInHomeSettlement;
      })() ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <h2>{strings[1352] || "This is not your home settlement."}</h2>
        </div>
      ) : isContentLoading ? (
        <p>{strings[98]}</p>
      ) : (
        <>
          <h3>{strings[1352]} {carnivalPhase} {currentCarnivalNumber ? `(#${currentCarnivalNumber})` : ''}</h3>
          <h2>⏳ {carnivalTimer}</h2>

          {carnivalPhase === "here" && (
            <>
              {renderRewardSection()}
              {renderOfferSection(strings[2009], claimedByYou)}
              {renderOfferSection(strings[2010], available)}
              {renderOfferSection(strings[2011], claimedByOthers)}
              {renderOfferSection(strings[2012], completed)}
            </>
          )}

          {allOrdersFilled && (
            <div className="carnival-rewards-banner">
              {strings[2016]}
            </div>
          )}

          {(carnivalPhase === "here" || carnivalPhase === "departing") && renderNextShipment()}

        <div className="shared-buttons" style={{ margin: '2px 0' }}>
            <button className="btn-basic btn-neutral" onClick={() => handleShowCarnivalLog()}>
                {strings[1351]}
            </button>
        </div>
        </>
      )}
    </Panel>
    
    {showLogicModal && (
      <div className="carnival-logic-modal-overlay">
        <div className="carnival-logic-modal">
          <button 
            onClick={() => setShowLogicModal(false)}
            className="carnival-logic-modal-close"
          >
            ×
          </button>
          <h3>
            Carnival #{logicModalData.carnivalNumber || '?'} Logic
          </h3>
          <pre>
            {logicModalData.logic || 'No logic information available'}
          </pre>
        </div>
      </div>
    )}
    </>
  );
}

export default CarnivalPanel;