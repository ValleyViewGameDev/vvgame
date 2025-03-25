import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import Modal from '../UI/Modal';
import './Store.css';
import { StatusBarContext } from '../UI/StatusBar';

function Store({ onClose, currentPlayer, setCurrentPlayer, resources, openMailbox }) {
  const [offers, setOffers] = useState([]);
  const { updateStatus } = useContext(StatusBarContext);

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/store-offers');
      setOffers(response.data || []);
    } catch (error) {
      console.error("❌ Failed to load store offers:", error);
    }
  };

  const handlePurchase = async (offerId) => {
    try {
      const response = await axios.post('http://localhost:3001/api/purchase-store-offer', {
        playerId: currentPlayer.playerId,
        offerId
      });

      if (response.data?.success) {
        onClose();  // Close Store
        setTimeout(() => {
          openMailbox?.();  // Open Mailbox if the function exists
        }, 100);
      } else {
        updateStatus("❌ Purchase failed.");
      }
    } catch (err) {
      console.error("❌ Error purchasing store offer:", err);
      updateStatus("❌ Error processing your purchase.");
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
    <Modal onClose={onClose} title="🛒 Store">
        <h4>Purchases will be delivered to the Inbox.</h4>
      <div className="store-offers">
        {offers
          .filter((offer) => !isOfferExpired(offer))
          .map((offer) => (


            <div key={offer.id} className="store-offer-card">
            <div className="store-offer-left">
                <h3>{offer.title}</h3>
                <p>{offer.body}</p>
                <p className="store-reward-line">
                🎁 {offer.rewards.map(r => {
                    const symbol = resources.find(res => res.type === r.item)?.symbol || '';
                    return `${symbol} ${r.qty} ${r.item}`;
                }).join(", ")}
                </p>
            </div>

            <div className="store-offer-right">
                <div className="store-price">USD ${offer.price.toFixed(2)}</div>
                <button onClick={() => handlePurchase(offer.id)}>Buy</button>
            </div>
            </div>


          ))}
      </div>
    </Modal>
  );
}

export default Store;