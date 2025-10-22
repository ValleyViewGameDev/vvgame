import API_BASE from '../config';
import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import Modal from '../UI/Modal';
import './Store.css';
import '../UI/SharedButtons.css';
import { StatusBarContext } from '../UI/StatusBar/StatusBar';
import { loadStripe } from '@stripe/stripe-js';
import { updateBadge } from '../Utils/appUtils';
import { useStrings } from '../UI/StringsContext';

export const handlePurchase = async (offerId, currentPlayer, updateStatus) => {
  try {
    const response = await axios.post(`${API_BASE}/api/create-checkout-session`, {
      playerId: currentPlayer.playerId,
      offerId
    });

    if (response.data?.id) {
      const stripe = await loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);
      await stripe.redirectToCheckout({ sessionId: response.data.id });
    } else {
      updateStatus("❌ Failed to initiate checkout.");
    }
  } catch (err) {
    console.error("❌ Error initiating checkout:", err);
    updateStatus("❌ Error initiating checkout.");
  }
};

function Store({ onClose, currentPlayer, setCurrentPlayer, resources, openMailbox, setModalContent, setIsModalOpen }) {
  const strings = useStrings();
  const [offers, setOffers] = useState([]);
  const { updateStatus } = useContext(StatusBarContext);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseSuccess = params.get("purchase");
    console.log("🔍 URL query params:", {
      purchaseSuccess,
      playerId: params.get("playerId"),
      offerId: params.get("offerId")
    });
    const playerId = params.get("playerId");
    const offerId = params.get("offerId");

    if (purchaseSuccess === "success" && playerId && offerId) {

      // ✅ Finalize fulfillment by notifying backend
      axios.post(`${API_BASE}/api/purchase-store-offer`, {
        playerId,
        offerId
      }).then(() => {
        console.log("📬 Called /api/purchase-store-offer successfully for:", { playerId, offerId });
        console.log("✅ Store reward successfully delivered.");
        updateStatus("🎉 Purchase successful! Check your Inbox.");
        updateBadge(currentPlayer, () => {}, "store", false); // Clear store badge

        axios.get(`${API_BASE}/api/player/${playerId}`).then((playerResponse) => {
          setCurrentPlayer(playerResponse.data);
        }).catch((err) => {
          console.error("❌ Failed to refresh player data:", err);
        });
        
      }).catch((err) => {
        console.error("🛑 Error calling /api/purchase-store-offer with:", { playerId, offerId });
        console.error("❌ Failed to deliver store reward:", err);
        updateStatus("⚠️ Purchase may not have been delivered. Please contact support.");
      });

      // ✅ Optionally hit backend to finalize fulfillment if needed

      // ✅ Clean up query params from the URL
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, document.title, url.toString());
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/store-offers`);
      setOffers(response.data || []);
    } catch (error) {
      console.error("❌ Failed to load store offers:", error);
    }
  };

  const isOfferExpired = (offer) => {
    if (!offer.shelflifeDays || !currentPlayer?.created) return false;

    const created = new Date(currentPlayer.created);
    const now = new Date();
    const daysSince = Math.floor((now - created) / (1000 * 60 * 60 * 24));

    return daysSince > offer.shelflifeDays;
  };

  return (
    <Modal
      onClose={(args) => {
        if (args?.openMailbox && typeof openMailbox === 'function') {
          openMailbox();
        }
        onClose();
      }}
      title={strings[1701]}
    >
        <h3>{strings[1702]}</h3>
        <h4>{strings[1703]}</h4>
        <h4>{strings[1704]}</h4>

      <div className="store-offers">
        {(() => {
          const activeOffers = offers.filter((offer) => !isOfferExpired(offer));
          const processedIds = new Set();
          
          return activeOffers.map((offer) => {
            // Skip if already processed
            if (processedIds.has(offer.id)) return null;
            
            // Process offers 3 & 4 together
            if (offer.id === 3 || offer.id === 4) {
              const offer3 = activeOffers.find(o => o.id === 3);
              const offer4 = activeOffers.find(o => o.id === 4);
              
              if (offer3) processedIds.add(3);
              if (offer4) processedIds.add(4);
              
              return (
                <div key="group-3-4" className="store-offer-row">
                  {offer3 && (
                    <div className="store-offer-card store-offer-card-half">
                      <div className="store-offer-left">
                        <h3>{offer3.title}</h3>
                        <p>{offer3.body}</p>
                        <p className="store-reward-line">
                          {offer3.rewards.map(r => {
                            const symbol = resources.find(res => res.type === r.item)?.symbol || '';
                            return `${symbol} ${r.qty} ${r.item}`;
                          }).join(", ")}
                        </p>
                      </div>
                      <div className="store-offer-right">
                        <div className="store-price">USD ${offer3.price.toFixed(2)}</div>
                        <div className="shared-buttons">
                          <button className="btn-basic btn-gold" onClick={() => handlePurchase(offer3.id, currentPlayer, updateStatus)}>Buy</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {offer4 && (
                    <div className="store-offer-card store-offer-card-half">
                      <div className="store-offer-left">
                        <h3>{offer4.title}</h3>
                        <p>{offer4.body}</p>
                        <p className="store-reward-line">
                          {offer4.rewards.map(r => {
                            const symbol = resources.find(res => res.type === r.item)?.symbol || '';
                            return `${symbol} ${r.qty} ${r.item}`;
                          }).join(", ")}
                        </p>
                      </div>
                      <div className="store-offer-right">
                        <div className="store-price">USD ${offer4.price.toFixed(2)}</div>
                        <div className="shared-buttons">
                          <button className="btn-basic btn-gold" onClick={() => handlePurchase(offer4.id, currentPlayer, updateStatus)}>Buy</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            
            // Process offers 6, 7 & 8 together
            if (offer.id === 6 || offer.id === 7 || offer.id === 8) {
              const offer6 = activeOffers.find(o => o.id === 6);
              const offer7 = activeOffers.find(o => o.id === 7);
              const offer8 = activeOffers.find(o => o.id === 8);
              
              if (offer6) processedIds.add(6);
              if (offer7) processedIds.add(7);
              if (offer8) processedIds.add(8);
              
              return (
                <div key="group-6-7-8" className="store-offer-row">
                  {offer6 && (
                    <div className="store-offer-card store-offer-card-third store-offer-card-gem">
                      <div className="store-offer-left">
                        <h3>{offer6.title}</h3>
                        <p>{offer6.body}</p>
                        <p className="store-reward-line">
                          {offer6.rewards.map(r => {
                            const symbol = resources.find(res => res.type === r.item)?.symbol || '';
                            return `${symbol} ${r.qty} ${r.item}`;
                          }).join(", ")}
                        </p>
                      </div>
                      <div className="store-offer-right">
                        <div className="store-price">USD ${offer6.price.toFixed(2)}</div>
                        <div className="shared-buttons">
                          <button className="btn-basic btn-gold" onClick={() => handlePurchase(offer6.id, currentPlayer, updateStatus)}>Buy</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {offer7 && (
                    <div className="store-offer-card store-offer-card-third store-offer-card-gem">
                      <div className="store-offer-left">
                        <h3>{offer7.title}</h3>
                        <p>{offer7.body}</p>
                        <p className="store-reward-line">
                          {offer7.rewards.map(r => {
                            const symbol = resources.find(res => res.type === r.item)?.symbol || '';
                            return `${symbol} ${r.qty} ${r.item}`;
                          }).join(", ")}
                        </p>
                      </div>
                      <div className="store-offer-right">
                        <div className="store-price">USD ${offer7.price.toFixed(2)}</div>
                        <div className="shared-buttons">
                          <button className="btn-basic btn-gold" onClick={() => handlePurchase(offer7.id, currentPlayer, updateStatus)}>Buy</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {offer8 && (
                    <div className="store-offer-card store-offer-card-third store-offer-card-gem">
                      <div className="store-offer-left">
                        <h3>{offer8.title}</h3>
                        <p>{offer8.body}</p>
                        <p className="store-reward-line">
                          {offer8.rewards.map(r => {
                            const symbol = resources.find(res => res.type === r.item)?.symbol || '';
                            return `${symbol} ${r.qty} ${r.item}`;
                          }).join(", ")}
                        </p>
                      </div>
                      <div className="store-offer-right">
                        <div className="store-price">USD ${offer8.price.toFixed(2)}</div>
                        <div className="shared-buttons">
                          <button className="btn-basic btn-gold" onClick={() => handlePurchase(offer8.id, currentPlayer, updateStatus)}>Buy</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            
            // Mark as processed and render normally
            processedIds.add(offer.id);
            
            return (
              <div key={offer.id} className={`store-offer-card${String(offer.id) === "1" ? ' store-offer-card-gold' : ''}`}>
                <div className="store-offer-left">
                  <h3>{offer.title}</h3>
                  <p>{offer.body}</p>
                  <p className="store-reward-line">
                    {offer.rewards.map(r => {
                      const symbol = resources.find(res => res.type === r.item)?.symbol || '';
                      return `${symbol} ${r.qty} ${r.item}`;
                    }).join(", ")}
                  </p>
                </div>
                <div className="store-offer-right">
                  <div className="store-price">USD ${offer.price.toFixed(2)}</div>
                  <div className="shared-buttons">
                    <button className="btn-basic btn-gold" onClick={() => handlePurchase(offer.id, currentPlayer, updateStatus)}>Buy</button>
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </Modal>
  );
}

export default Store;