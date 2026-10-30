import API_BASE from '../config';
import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import Modal from '../UI/Modals/Modal';
import './Store.css';
import '../UI/Buttons/SharedButtons.css';
import { StatusBarContext } from '../UI/StatusBar/StatusBar';
import { loadStripe } from '@stripe/stripe-js';
import { updateBadge } from '../Utils/appUtils';
import { useStrings } from '../UI/StringsContext';
import { formatNumber } from '../UI/Timers';

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

// Store rows on desktop (store.json ids): starter packs, gem packs, item packs (Adventurer's,
// Politician's, Farmer's), money packs. Every card is a third of the modal wide; mobile.css
// stacks them one per row.
const GEM_PACK_IDS = [6, 7, 8];
const STORE_ROWS = [[3, 4], GEM_PACK_IDS, [20, 30, 40], [9, 50, 70]];

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
        offerId,
        sessionId: params.get("session_id") // the server verifies this Stripe session
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
      className="store-modal"
    >
        <h3>{strings[1702]}</h3>
        <h4>{strings[1703]}</h4>
        <h4>{strings[1704]}</h4>

      <div className="store-offers">
        {(() => {
          const activeOffers = offers.filter((offer) => !isOfferExpired(offer));
          const renderCard = (offer) => {
            const variant = GEM_PACK_IDS.includes(offer.id) ? ' store-offer-card-gem' : String(offer.id) === '1' ? ' store-offer-card-gold' : '';
            return (
              <div key={offer.id} className={`store-offer-card-third${variant}`}>
                <div className="store-offer-left">
                  <h3>{offer.title}</h3>
                  <p>{offer.body}</p>
                  <p className="store-reward-line">
                    {offer.rewards.map(r => {
                      const symbol = resources.find(res => res.type === r.item)?.symbol || '';
                      return `${symbol} ${formatNumber(r.qty)} ${r.item}`;
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
          };
          // The named rows first (each starts its own row, missing offers just leave a gap at
          // the end), then every other offer three to a row in store.json order
          const grouped = new Set(STORE_ROWS.flat());
          const rows = STORE_ROWS
            .map((ids) => ids.map((id) => activeOffers.find((o) => o.id === id)).filter(Boolean))
            .filter((row) => row.length);
          const rest = activeOffers.filter((o) => !grouped.has(o.id));
          for (let i = 0; i < rest.length; i += 3) rows.push(rest.slice(i, i + 3));
          return rows.map((row) => (
            <div key={row.map((o) => o.id).join('-')} className="store-offer-row">
              {row.map(renderCard)}
            </div>
          ));
        })()}
      </div>
    </Modal>
  );
}

export default Store;