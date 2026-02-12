import React, { useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import './ChangeIconModal.css';
import '../Buttons/SharedButtons.css';
import { updatePlayerIcon } from '../../Authentication/ChangeIcon';
import ICON_OPTIONS from '../../Authentication/PlayerIcons.json';
import { useStrings } from '../StringsContext';
import { spendIngredients, canAfford } from '../../Utils/InventoryManagement';

const PREMIUM_AVATAR_GEM_COST = 200;

// Normalize emoji by removing variation selectors (U+FE0F) for consistent matching
const normalizeEmoji = (emoji) => {
  if (!emoji) return emoji;
  return emoji.replace(/\uFE0F/g, '');
};

// Build a static lookup map from emoji value to SVG filename (created once at module load)
const iconToSvgMap = new Map();
['free', 'paid', 'platinum'].forEach(tier => {
  (ICON_OPTIONS[tier] || []).forEach(icon => {
    if (icon.filename) {
      iconToSvgMap.set(normalizeEmoji(icon.value), icon.filename);
    }
  });
});

export default function ChangeIconModal({ currentPlayer, setCurrentPlayer, updateStatus, currentIcon, playerId, onClose, onSave, setModalContent, setModalIsOpen, inventory, setInventory, backpack, setBackpack }) {
  const [selectedIcon, setSelectedIcon] = useState(currentIcon);
  const [isProcessing, setIsProcessing] = useState(false);
  const strings = useStrings();

  const handleSave = async () => {
    try {
      // Save the emoji label instead of the ID
      await updatePlayerIcon(currentPlayer, setCurrentPlayer, playerId, selectedIcon);
      onSave(selectedIcon);
    } catch (err) {
      alert("Failed to update icon.");
    }
  };

  // Handle unlocking premium avatars with gems
  const handleUnlockPremiumAvatars = async () => {
    if (isProcessing) return;

    // Check if player can afford the gem cost
    const gemRecipe = { ingredient1: 'Gem', ingredient1qty: PREMIUM_AVATAR_GEM_COST };
    const playerInventory = inventory || currentPlayer.inventory || [];
    const playerBackpack = backpack || currentPlayer.backpack || [];

    if (!canAfford(gemRecipe, playerInventory, playerBackpack, 1)) {
      updateStatus(`Need ${PREMIUM_AVATAR_GEM_COST} gems to unlock premium avatars`);
      return;
    }

    setIsProcessing(true);

    try {
      // Spend gems
      const spentResult = await spendIngredients({
        playerId: currentPlayer.playerId || currentPlayer._id,
        recipe: gemRecipe,
        inventory: playerInventory,
        backpack: playerBackpack,
        setInventory: setInventory || (() => {}),
        setBackpack: setBackpack || (() => {}),
        setCurrentPlayer,
        updateStatus,
      });

      if (!spentResult) {
        updateStatus('Failed to spend gems');
        setIsProcessing(false);
        return;
      }

      // Update avatarsUnlocked field to true
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer._id,
        updates: { avatarsUnlocked: true }
      });

      if (response.data.success) {
        // Update local player state
        setCurrentPlayer(prev => ({ ...prev, avatarsUnlocked: true }));
        updateStatus('Premium avatars unlocked!');
      } else {
        updateStatus('Failed to unlock premium avatars');
      }
    } catch (error) {
      console.error('Error unlocking premium avatars:', error);
      updateStatus('Failed to unlock premium avatars');
    } finally {
      setIsProcessing(false);
    }
  };

  // Determine if premium avatars are unlocked
  // Either via avatarsUnlocked field OR grandfathered Gold status
  const hasPremiumAvatars = currentPlayer.avatarsUnlocked === true || currentPlayer.accountStatus === 'Gold';

  // Split icons into free and paid
  const freeIcons = ICON_OPTIONS.free || [];
  const paidIcons = ICON_OPTIONS.paid || [];

  return (
    <div className="modal-overlay">
      <div className="modal-container modal-medium">
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <div className="modal-title">Choose Your Avatar</div>

        <br />

        <div className="icon-grid">
          {freeIcons.map(icon => {
            const svgFilename = iconToSvgMap.get(normalizeEmoji(icon.value));
            return (
              <button
                key={icon.value}
                className={`icon-button ${selectedIcon === icon.value ? 'selected' : ''}`}
                onClick={() => setSelectedIcon(icon.value)}
                disabled={false}
              >
                {svgFilename ? (
                  <img
                    src={`/assets/playerIcons/${svgFilename}`}
                    alt={icon.label}
                    style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                  />
                ) : (
                  icon.value
                )}
              </button>
            );
          })}
        </div>

        <h3>Premium Avatars</h3>

        {!hasPremiumAvatars && (
          <div className="shared-buttons">
            <button
              className="btn-basic btn-modal"
              style={{ width: '240px' }}
              onClick={handleUnlockPremiumAvatars}
              disabled={isProcessing}
            >
              {isProcessing ? 'Unlocking...' : `Unlock for 💎 ${PREMIUM_AVATAR_GEM_COST}`}
            </button>
          </div>
        )}

        <div className="icon-grid">
          {paidIcons.map(icon => {
            const locked = !hasPremiumAvatars;
            const svgFilename = iconToSvgMap.get(normalizeEmoji(icon.value));
            return (
              <button
                key={icon.value}
                className={`icon-button ${selectedIcon === icon.value ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                disabled={locked}
                onClick={() => {
                  if (!locked) setSelectedIcon(icon.value);
                }}
              >
                {svgFilename ? (
                  <img
                    src={`/assets/playerIcons/${svgFilename}`}
                    alt={icon.label}
                    style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                  />
                ) : (
                  icon.value
                )}
              </button>
            );
          })}
        </div>


        <div className="shared-buttons">
          <button className="btn-basic btn-modal" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}