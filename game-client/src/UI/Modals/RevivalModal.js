import React, { useState, useEffect } from 'react';
import './Modal.css';
import '../Buttons/SharedButtons.css';
import { handlePurchase } from '../../Store/Store';
import axios from 'axios';
import API_BASE from '../../config';

function RevivalModal({
  isOpen = true,
  onAcceptDeath,
  onRevive,
  reviveCost = 50,
  strings = {},
  currentPlayer,
  inventory,
  updateStatus
}) {
  const [offers, setOffers] = useState({});

  // Get player's gem count (safely handle if inventory is not an array)
  const playerGems = Array.isArray(inventory)
    ? (inventory.find(item => item.type === 'Gem')?.quantity || 0)
    : 0;
  const hasEnoughGems = playerGems >= reviveCost;

  // Fetch store offers for gem purchase buttons
  useEffect(() => {
    if (!isOpen || hasEnoughGems) return;

    const fetchOffers = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/store-offers`);
        const offerData = response.data || [];
        const offerMap = {};
        offerData.forEach(offer => {
          offerMap[offer.id] = offer;
        });
        setOffers(offerMap);
      } catch (error) {
        console.error("❌ Failed to load store offers:", error);
      }
    };
    fetchOffers();
  }, [isOpen, hasEnoughGems]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className={`modal-container ${hasEnoughGems ? 'modal-small' : 'modal-medium'}`}>
        <h2 className="modal-title">{strings["5004"] || "💀 You have fallen!"}</h2>

        <div className="modal-content">
          <p className="modal-message">{strings["5070"] || "Your journey doesn't have to end here..."}</p>
          <p className="modal-message">{strings["5071"] || "Choose your fate:"}</p>

          <div className="shared-buttons">
            <button
              className={`btn-basic ${hasEnoughGems ? 'btn-gold' : 'btn-neutral'} btn-modal`}
              onClick={hasEnoughGems ? onRevive : null}
              disabled={!hasEnoughGems}
              style={{ marginRight: '10px', opacity: hasEnoughGems ? 1 : 0.7 }}
            >
              {strings["5072"] || "Revive for"}<br />
              <span style={{ color: hasEnoughGems ? '#2ecc71' : '#e74c3c' }}>
                💎 {reviveCost} / {playerGems}
              </span>
            </button>

            <button
              className="btn-basic btn-danger btn-modal"
              onClick={onAcceptDeath}
            >
              {strings["5073"] || "Accept Your Death"}
            </button>
          </div>

          {/* Show gem purchase options when player doesn't have enough gems */}
          {!hasEnoughGems && (
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--color-border)', paddingTop: '15px' }}>
              <p style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '10px' }}>
                {strings[5074] || "Need more gems?"}
              </p>
              <div className="shared-buttons" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: '6px' }}>
                <button
                  className="btn-basic btn-gold"
                  onClick={() => handlePurchase(6, currentPlayer, updateStatus)}
                >
                  💎 100 for {offers[6] ? `$${offers[6].price.toFixed(2)}` : '...'}
                </button>
                <button
                  className="btn-basic btn-gold"
                  onClick={() => handlePurchase(7, currentPlayer, updateStatus)}
                >
                  💎 250 for {offers[7] ? `$${offers[7].price.toFixed(2)}` : '...'}
                </button>
                <button
                  className="btn-basic btn-gold"
                  onClick={() => handlePurchase(8, currentPlayer, updateStatus)}
                >
                  💎 500 for {offers[8] ? `$${offers[8].price.toFixed(2)}` : '...'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RevivalModal;
