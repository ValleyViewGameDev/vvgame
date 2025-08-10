import API_BASE from '../config';
import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import Modal from '../UI/Modal';
import './Store.css';
import '../UI/SharedButtons.css';
import { StatusBarContext } from '../UI/StatusBar';
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
        {offers
          .filter((offer) => !isOfferExpired(offer))
          .map((offer) => (


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
                <div className="standard-buttons">
                  <button className="btn-purchase" onClick={() => handlePurchase(offer.id, currentPlayer, updateStatus)}>Buy</button>
                </div>
            </div>
            </div>


          ))}
      </div>
    </Modal>
  );
}

export default Store;