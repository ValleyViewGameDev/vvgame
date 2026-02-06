import API_BASE from '../../config.js';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { updateKentOffersAfterTrade, generateNewKentOffers } from './KentOfferLogic';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
import '../../UI/Buttons/ResourceButton.css';
import './Kent.css';
import { formatCountdown } from '../../UI/Timers.js';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import FloatingTextManager from '../../UI/FloatingText';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import soundManager from '../../Sound/SoundManager';

// Base tile size for FloatingText positioning (FloatingText.js derives scaled size from pixi-container)
const TILE_SIZE = 30;

function KentPanel({
    onClose,
    inventory,
    setInventory,
    backpack,
    setBackpack,
    currentPlayer,
    setCurrentPlayer,
    updateStatus,
    masterResources,
    globalTuning,
    currentSeason,
    masterXPLevels,
    isDeveloper })
{
    const strings = useStrings();
    const [isContentLoading, setIsContentLoading] = useState(false);
    const [kentOffers, setKentOffers] = useState([]);
    const [kentTimer, setKentTimer] = useState("");
    const [kentPhase, setKentPhase] = useState("");
    const [isTrading, setIsTrading] = useState(false);
    // Per-card cooldowns: { [offerIndex]: endTime (ms) } — persisted in localStorage
    const cooldownStorageKey = `kentCardCooldowns_${currentPlayer?.playerId}`;
    const [cardCooldowns, setCardCooldowns] = useState(() => {
        try {
            const stored = localStorage.getItem(`kentCardCooldowns_${currentPlayer?.playerId}`);
            if (!stored) return {};
            const parsed = JSON.parse(stored);
            // Filter out expired cooldowns on load
            const now = Date.now();
            const active = {};
            for (const [key, endTime] of Object.entries(parsed)) {
                if (endTime > now) active[key] = endTime;
            }
            return active;
        } catch { return {}; }
    });
    // Force re-render for countdown display
    const [, setTick] = useState(0);
    // Tooltip for multi-item offer symbols
    const [itemTooltip, setItemTooltip] = useState({ show: false, itemName: '', top: 0, left: 0 });

    // Persist cooldowns to localStorage whenever they change
    useEffect(() => {
        if (!currentPlayer?.playerId) return;
        try {
            localStorage.setItem(cooldownStorageKey, JSON.stringify(cardCooldowns));
        } catch { /* ignore storage errors */ }
    }, [cardCooldowns, cooldownStorageKey]);

    // Generate fallback Kent offer and save to DB
    const generateFallbackKentOffer = async () => {
        try {
            // Find Wheat's maxprice from masterResources
            const wheatResource = masterResources.find(res => res.type === 'Wheat');
            const wheatMaxPrice = wheatResource?.maxprice || 100; // fallback to 100 if not found

            const fallbackKentOffers = {
                endTime: 0, // Available immediately
                offers: [{
                    item: 'Wheat',
                    quantity: 4,
                    rewards: [{
                        item: 'Money',
                        quantity: wheatMaxPrice * 4
                    }]
                }]
            };

            // Save to player's kentOffers in DB
            const response = await axios.post(`${API_BASE}/api/update-profile`, {
                playerId: currentPlayer.playerId,
                updates: { kentOffers: fallbackKentOffers }
            });

            if (response.data.success) {
                console.log('✅ Generated fallback Kent offers:', fallbackKentOffers);
                // Update parent currentPlayer state so canvas can see the new offers
                setCurrentPlayer(prev => ({
                    ...prev,
                    kentOffers: fallbackKentOffers
                }));
                return fallbackKentOffers;
            }
        } catch (error) {
            console.error('❌ Error generating fallback Kent offer:', error);
        }
        return { endTime: 0, offers: [] };
    };

    // Fetch Kent offers from player data
    const fetchKentOffers = async () => {
        setIsContentLoading(true);
        try {
            // Get Kent offers from currentPlayer data
            const kentData = currentPlayer?.kentOffers;

            // If no kentOffers exist or offers array is empty, generate fallback
            if (!kentData || !kentData.offers || kentData.offers.length === 0) {
                console.log('🔄 No Kent offers found, generating fallback...');
                const fallbackKentOffers = await generateFallbackKentOffer();
                setKentOffers(fallbackKentOffers.offers || []);
            } else {
                setKentOffers(kentData.offers || []);
            }

            setKentPhase('active'); // Kent is always active
        } catch (error) {
            console.error('❌ Error fetching Kent offers:', error);
        } finally {
            setIsContentLoading(false);
        }
    };

    // Kent timer logic + per-card cooldown ticks
    useEffect(() => {
        const updateTimers = () => {
            const now = Date.now();
            const kentData = currentPlayer?.kentOffers;
            const endTime = kentData?.endTime || 0;

            if (endTime > now) {
                // Timer is active - panel locked
                setKentTimer(formatCountdown(endTime, now));
                setKentPhase('locked');
            } else {
                // Timer expired - offers available
                setKentTimer(strings[45]);
                setKentPhase('active');
            }

            // Tick for per-card countdown display
            setTick(t => t + 1);
        };

        updateTimers();
        const interval = setInterval(updateTimers, 1000);
        return () => clearInterval(interval);
    }, [currentPlayer?.kentOffers?.endTime]);

    // Initial load
    useEffect(() => {
        if (currentPlayer?.playerId) {
            fetchKentOffers();
        }
    }, [currentPlayer?.playerId]);

    // Check if a specific card is on cooldown
    const isCardOnCooldown = (index) => {
        const endTime = cardCooldowns[index];
        if (!endTime) return false;
        return endTime > Date.now();
    };

    // Get remaining seconds for a card cooldown
    const getCardCooldownRemaining = (index) => {
        const endTime = cardCooldowns[index];
        if (!endTime) return 0;
        const remaining = endTime - Date.now();
        return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    };

    // Handle trade transaction with protection against spam clicking
    const handleTrade = async (offer) => {
        if (!offer || !currentPlayer || isTrading) return;

        // Check Kent timer before allowing any trade
        if (isKentOnCooldown()) {
            console.log('🚫 Kent trade blocked: Timer still active');
            updateStatus('❌ Kent is not available yet. Please wait for the timer to expire.');
            return;
        }

        // Set trading flag to prevent spam clicks
        setIsTrading(true);

        try {
            // Handle both multi-item and single-item offers
            if (offer.itemsBought && offer.itemsBought.length > 0) {
                // Multi-item offer: spend each item
                for (const itemToBuy of offer.itemsBought) {
                    const success = await spendIngredients({
                        playerId: currentPlayer.playerId,
                        recipe: {
                            ingredient1: itemToBuy.item,
                            ingredient1qty: itemToBuy.quantity,
                        },
                        inventory,
                        backpack,
                        setInventory,
                        setBackpack,
                        setCurrentPlayer,
                        updateStatus,
                    });

                    if (!success) {
                        setIsTrading(false);
                        return;
                    }
                }
            } else {
                // Single-item offer (legacy)
                const success = await spendIngredients({
                    playerId: currentPlayer.playerId,
                    recipe: {
                        ingredient1: offer.itemBought,
                        ingredient1qty: offer.qtyBought,
                    },
                    inventory,
                    backpack,
                    setInventory,
                    setBackpack,
                    setCurrentPlayer,
                    updateStatus,
                });

                if (!success) {
                    setIsTrading(false);
                    return;
                }
            }

            // Gain all rewards
            let allRewardsSuccess = true;
            // Find original offer - handle both multi-item and single-item
            const originalOffer = kentOffers.find(kentOffer => {
                if (offer.itemsBought && kentOffer.items) {
                    // Multi-item comparison
                    if (offer.itemsBought.length !== kentOffer.items.length) return false;
                    return offer.itemsBought.every((bought, idx) =>
                        kentOffer.items[idx]?.item === bought.item && kentOffer.items[idx]?.quantity === bought.quantity
                    );
                } else {
                    // Legacy single-item comparison
                    return kentOffer.item === offer.itemBought && kentOffer.quantity === offer.qtyBought;
                }
            });

            if (originalOffer && originalOffer.rewards) {
              for (const reward of originalOffer.rewards) {
                const gainSuccess = await gainIngredients({
                  playerId: currentPlayer.playerId,
                  currentPlayer,
                  resource: reward.item,
                  quantity: reward.quantity,
                  inventory,
                  backpack,
                  setInventory,
                  setBackpack,
                  setCurrentPlayer,
                  updateStatus,
                  masterResources,
                  globalTuning,
                });

                if (!gainSuccess) {
                  allRewardsSuccess = false;
                  break;
                }
              }
            } else {
              // Fallback to old single reward system
              const gainSuccess = await gainIngredients({
                playerId: currentPlayer.playerId,
                currentPlayer,
                resource: offer.itemGiven,
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
              allRewardsSuccess = gainSuccess;
            }

            if (!allRewardsSuccess) return;

            // Award XP for the trade
            const xpToAward = calculateKentXP(originalOffer);
            try {
              const xpResponse = await axios.post(`${API_BASE}/api/addXP`, {
                playerId: currentPlayer.playerId,
                xpAmount: xpToAward
              });

              if (xpResponse.data.success) {
                // Update current player's XP locally
                setCurrentPlayer(prev => ({
                  ...prev,
                  xp: xpResponse.data.newXP
                }));
              }
            } catch (error) {
              console.error('❌ Error awarding XP for Kent trade:', error);
              // Don't fail the trade if XP award fails, just log it
            }

            // Show floating text over Kent NPC for the sale
            // Find Money reward amount from the original offer
            const moneyReward = originalOffer?.rewards?.find(r => r.item === 'Money');
            const moneyAmount = moneyReward?.quantity || offer.qtyGiven || 0;
            showSaleFloatingText(moneyAmount, xpToAward);

            // Play sound effect for successful sale
            soundManager.playSFX('collect_money');

            // Create status message for multiple rewards
            const rewardText = originalOffer && originalOffer.rewards
              ? originalOffer.rewards.map(reward => `${reward.quantity} ${reward.item}`).join(', ')
              : `${offer.qtyGiven} ${offer.itemGiven}`;

            // Create sold items text for multi-item offers
            const soldText = offer.itemsBought && offer.itemsBought.length > 1
              ? offer.itemsBought.map(item => `${item.quantity} ${item.item}`).join(' + ')
              : `${offer.qtyBought} ${offer.itemBought}`;

            await refreshOffersAndSetTimer(offer, `✅ Exchanged ${soldText} for ${rewardText} and +${xpToAward} XP.`);

            // Track quest progress for each item sold
            if (offer.itemsBought && offer.itemsBought.length > 0) {
                for (const item of offer.itemsBought) {
                    await trackQuestProgress(currentPlayer, 'Sell', item.item, item.quantity, setCurrentPlayer);
                }
            } else {
                await trackQuestProgress(currentPlayer, 'Sell', offer.itemBought, offer.qtyBought, setCurrentPlayer);
            }

            // Try to advance FTUE if this is the player's first sale to Kent
            await tryAdvanceFTUEByTrigger('SoldToKent', currentPlayer.playerId, currentPlayer, setCurrentPlayer);

        } catch (error) {
            console.error('❌ Error in Kent trade:', error);
            updateStatus('❌ Trade failed. Please try again.');
        } finally {
            // Always clear the trading flag
            setIsTrading(false);
        }
    };

    // Handle dismissing an individual offer — generates replacement immediately with per-card cooldown
    // Dismiss works even when Kent is "away" (overall timer active) — only blocked by per-card cooldown
    const handleDismiss = async (offer, offerIndex) => {
        if (!offer || !currentPlayer || isTrading) return;

        // Block if this card is already on cooldown
        if (isCardOnCooldown(offerIndex)) return;

        // Set trading flag to prevent spam clicks
        setIsTrading(true);

        try {
            // Generate new offer immediately (remove old, add replacement)
            const updatedKentOffers = updateKentOffersAfterTrade(
                currentPlayer,
                offer,
                masterResources,
                globalTuning,
                currentSeason,
                masterXPLevels
            );

            // Keep the existing overall timer (no reset for dismiss)
            updatedKentOffers.endTime = currentPlayer?.kentOffers?.endTime || 0;

            // Save to DB
            const updateResponse = await axios.post(`${API_BASE}/api/update-profile`, {
                playerId: currentPlayer.playerId,
                updates: { kentOffers: updatedKentOffers }
            });

            if (updateResponse.data.success) {
                setCurrentPlayer(prev => ({
                    ...prev,
                    kentOffers: updatedKentOffers
                }));
                setKentOffers(updatedKentOffers.offers || []);

                // Start per-card cooldown on the slot where the new offer was inserted
                const cardCooldownSeconds = globalTuning?.kentCardCooldownSeconds || 30;
                const cooldownEndTime = Date.now() + (cardCooldownSeconds * 1000);
                setCardCooldowns(prev => ({
                    ...prev,
                    [offerIndex]: cooldownEndTime
                }));
            }

        } catch (error) {
            console.error('❌ Error dismissing Kent offer:', error);
        } finally {
            setIsTrading(false);
        }
    };

    // Handle dismissing all offers at once — all cards get per-card cooldowns
    // Handle dismissing all offers — works even when Kent is "away", only blocked by per-card cooldowns
    const handleDismissAll = async () => {
        if (!currentPlayer || isTrading || kentOffers.length === 0) return;

        // Check if any cards are on cooldown
        const anyOnCooldown = kentOffers.some((_, index) => isCardOnCooldown(index));
        if (anyOnCooldown) return;

        setIsTrading(true);

        try {
            // Remember how many offers we had before discarding
            const previousOfferCount = kentOffers.length;

            // Generate completely new offers, replacing the same number we had before
            const playerWithEmptyOffers = { ...currentPlayer, kentOffers: { offers: [] } };
            const newOffers = generateNewKentOffers(
                playerWithEmptyOffers,
                masterResources,
                globalTuning,
                currentSeason,
                masterXPLevels,
                previousOfferCount
            );

            const updatedKentOffers = {
                endTime: currentPlayer?.kentOffers?.endTime || 0, // Keep existing overall timer
                offers: newOffers
            };

            // Save to DB
            const updateResponse = await axios.post(`${API_BASE}/api/update-profile`, {
                playerId: currentPlayer.playerId,
                updates: { kentOffers: updatedKentOffers }
            });

            if (updateResponse.data.success) {
                setCurrentPlayer(prev => ({
                    ...prev,
                    kentOffers: updatedKentOffers
                }));
                setKentOffers(updatedKentOffers.offers || []);

                // Start per-card cooldown on ALL cards
                const cardCooldownSeconds = globalTuning?.kentCardCooldownSeconds || 30;
                const cooldownEndTime = Date.now() + (cardCooldownSeconds * 1000);
                const newCooldowns = {};
                for (let i = 0; i < newOffers.length; i++) {
                    newCooldowns[i] = cooldownEndTime;
                }
                setCardCooldowns(newCooldowns);
            }

        } catch (error) {
            console.error('❌ Error dismissing all Kent offers:', error);
        } finally {
            setIsTrading(false);
        }
    };

    // Debug: Refresh offers without resetting timer (dev only)
    const handleDebugRefresh = async () => {
        if (!currentPlayer || isTrading) return;

        setIsTrading(true);

        try {
            // Keep the existing timer - don't reset it
            const existingEndTime = currentPlayer?.kentOffers?.endTime || Date.now();

            // Remember how many offers we had before
            const previousOfferCount = kentOffers.length || 6;

            // Generate completely new offers
            const playerWithEmptyOffers = { ...currentPlayer, kentOffers: { offers: [] } };
            const newOffers = generateNewKentOffers(
                playerWithEmptyOffers,
                masterResources,
                globalTuning,
                currentSeason,
                masterXPLevels,
                previousOfferCount
            );

            const updatedKentOffers = {
                endTime: existingEndTime, // Keep existing timer
                offers: newOffers
            };

            // Update player's kentOffers
            const updateResponse = await axios.post(`${API_BASE}/api/update-profile`, {
                playerId: currentPlayer.playerId,
                updates: { kentOffers: updatedKentOffers }
            });

            if (updateResponse.data.success) {
                setCurrentPlayer(prev => ({
                    ...prev,
                    kentOffers: updatedKentOffers
                }));
                setKentOffers(updatedKentOffers.offers || []);
                // Clear all card cooldowns on debug refresh
                setCardCooldowns({});
            }

            updateStatus(`🔧 Debug: Refreshed ${newOffers.length} offers (timer unchanged).`);
        } catch (error) {
            console.error('❌ Error in debug refresh:', error);
            updateStatus('❌ Debug refresh failed.');
        } finally {
            setIsTrading(false);
        }
    };

    // Shared function to refresh offers and set timer (used by trade only)
    const refreshOffersAndSetTimer = async (offer, statusMessage) => {
        // Reset Kent timer and update offers
        const kentRefreshSeconds = globalTuning?.kentRefreshTimerSeconds || 5;
        const newEndTime = Date.now() + (kentRefreshSeconds * 1000);

        // Update Kent offers: remove completed offer and add new ones
        const updatedKentOffers = updateKentOffersAfterTrade(
            currentPlayer,
            offer,
            masterResources,
            globalTuning,
            currentSeason,
            masterXPLevels
        );

        // Set the new timer
        updatedKentOffers.endTime = newEndTime;

        // Update player's kentOffers with new timer
        const updateResponse = await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { kentOffers: updatedKentOffers }
        });

        if (updateResponse.data.success) {
            // Update local player state
            setCurrentPlayer(prev => ({
                ...prev,
                kentOffers: updatedKentOffers
            }));

            // Update local kentOffers display
            setKentOffers(updatedKentOffers.offers || []);
        }

        updateStatus(statusMessage);
    };


    // Helper function to check if Kent is currently on cooldown
    const isKentOnCooldown = () => {
        const now = Date.now();
        const kentData = currentPlayer?.kentOffers;
        const endTime = kentData?.endTime || 0;
        return endTime > now;
    };

    // Lookup function for symbols from `masterResources`
    const getSymbol = (resourceType) => {
        const resource = masterResources.find(res => res.type === resourceType);
        return resource?.symbol || "❓"; // Default to question mark if no symbol found
    };

    // Calculate XP for Kent offer based on resource.xp value
    const calculateKentXP = (offer) => {
        // Handle both multi-item and single-item offers
        if (offer.items && offer.items.length > 0) {
            // Sum XP from all items in multi-item offer
            let totalXP = 0;
            for (const item of offer.items) {
                const resource = masterResources.find(res => res.type === item.item);
                totalXP += (resource?.xp || 1);
            }
            return totalXP * 2; // 2x Kent multiplier
        } else {
            // Single-item offer (legacy)
            const resource = masterResources.find(res => res.type === offer.item);
            const baseXP = resource?.xp || 1; // Default to 1 XP if no xp value defined
            return baseXP * 2; // 2x Kent multiplier
        }
    };

    // Helper to get Kent NPC position for floating text
    const getKentPosition = () => {
        const gridId = currentPlayer?.location?.g;
        if (!gridId) return null;

        const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
        if (!npcsInGrid) return null;

        // Find Kent NPC in the grid
        const kentNPC = Object.values(npcsInGrid).find(npc => npc && npc.type === 'Kent');
        return kentNPC?.position || null;
    };

    // Show floating text over Kent NPC for sale rewards
    // Uses same positioning as farm animal collection (NPCUtils.js) - directly at NPC position
    const showSaleFloatingText = (moneyAmount, xpAmount) => {
        const kentPos = getKentPosition();
        if (!kentPos) return;

        // Show money first at NPC position (emoji only, no text needed)
        FloatingTextManager.addFloatingText(`+${moneyAmount.toLocaleString()} 💰`, kentPos.x, kentPos.y, TILE_SIZE);

        // Show XP with delay, same position so it follows the same path
        setTimeout(() => {
            FloatingTextManager.addFloatingText(`+${xpAmount} 🔷 XP`, kentPos.x, kentPos.y, TILE_SIZE);
        }, 800);
    };

    // Check if any card has an active cooldown (for Dismiss All button)
    const anyCardOnCooldown = kentOffers.some((_, index) => isCardOnCooldown(index));

    return (
      <>
      <Panel onClose={onClose}  titleKey="1138" panelName="KentPanel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {/* Show timer at top with fixed height */}
            <div className="kent-header-area">
              {kentPhase === 'locked' ? (
                <h2>{strings[46]} <span className="countdown-timer">{kentTimer}</span></h2>
              ) : (
                <h2 className="countdown-timer">{kentTimer}</h2>
              )}
            </div>

            {/* Always show offers, but disable during cooldown */}
            <>
              {kentOffers.length > 0 ? (
                <>
                  {kentOffers.map((offer, index) => {
                      const cardOnCooldown = isCardOnCooldown(index);
                      const cardCooldownSeconds = getCardCooldownRemaining(index);

                      // Check if Kent panel is locked (use both phase state and real-time check)
                      const isKentLocked = kentPhase === 'locked' || isKentOnCooldown();
                      // Card is inactive if Kent is locked OR this card is on cooldown
                      const isCardInactive = isKentLocked || cardOnCooldown;

                      // Determine if this is a multi-item offer
                      const isMultiItem = offer.items && offer.items.length > 1;
                      const offerItems = offer.items || [{ item: offer.item, quantity: offer.quantity }];

                      // Calculate player quantities for each item
                      const itemsWithQty = offerItems.map(offerItem => {
                          const inventoryQty = inventory?.find(item => item.type === offerItem.item)?.quantity || 0;
                          const backpackQty = backpack?.find(item => item.type === offerItem.item)?.quantity || 0;
                          const playerQty = inventoryQty + backpackQty;
                          return { ...offerItem, playerQty, hasEnough: playerQty >= offerItem.quantity };
                      });

                      // Check if player can afford all items
                      const canAffordAll = itemsWithQty.every(item => item.hasEnough);

                      // Convert Kent offer format to bank offer format for compatibility
                      const convertedOffer = isMultiItem
                          ? {
                              itemsBought: offerItems,
                              itemGiven: offer.rewards[0]?.item || 'Money',
                              qtyGiven: offer.rewards[0]?.quantity || 0
                            }
                          : {
                              itemBought: offer.item,
                              qtyBought: offer.quantity,
                              itemGiven: offer.rewards[0]?.item || 'Money',
                              qtyGiven: offer.rewards[0]?.quantity || 0
                            };

                      return (
                        <div key={index} className="kent-offer-wrapper">
                          <ResourceButton
                            className={`kent-offer-button ${isCardInactive ? 'disabled' : ''} ${isMultiItem ? 'multi-item' : ''}`}
                            onClick={() => !isCardInactive && !isTrading && handleTrade(convertedOffer)}
                            disabled={isCardInactive || isTrading || !canAffordAll}
                            hideInfo={true}
                            noClickSfx={true}
                          >
                            <div className="resource-details">
                              <div className={`kent-offer-content ${isMultiItem ? 'multi-item' : ''}`}>
                                {cardOnCooldown ? (
                                  <div className="kent-card-cooldown-timer">{cardCooldownSeconds}s</div>
                                ) : isMultiItem ? (
                                  <>
                                    <div className="kent-multi-item-row">
                                      {itemsWithQty.map((item, itemIdx) => (
                                        <div
                                          key={itemIdx}
                                          className="kent-multi-item-cell"
                                          onMouseEnter={(e) => setItemTooltip({
                                            show: true,
                                            itemName: getLocalizedString(item.item, strings),
                                            top: e.clientY + window.scrollY + 10,
                                            left: e.clientX + window.scrollX + 15
                                          })}
                                          onMouseMove={(e) => setItemTooltip(prev => ({
                                            ...prev,
                                            top: e.clientY + window.scrollY + 10,
                                            left: e.clientX + window.scrollX + 15
                                          }))}
                                          onMouseLeave={() => setItemTooltip({ show: false, itemName: '', top: 0, left: 0 })}
                                        >
                                          <div className="kent-offer-symbol">
                                            {getSymbol(item.item)}
                                          </div>
                                          <div className={`kent-multi-item-qty ${item.hasEnough ? 'sufficient' : 'insufficient'}`}>
                                            x{item.quantity} / {item.playerQty}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="kent-offer-reward">
                                      {strings[42]} {offer.rewards.map((reward, rewardIndex) =>
                                        `${getSymbol(reward.item)} ${reward.quantity.toLocaleString()}${rewardIndex < offer.rewards.length - 1 ? ', ' : ''}`
                                      ).join('')}, 🔷 {calculateKentXP(offer)}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div
                                      className="kent-single-item-cell"
                                      onMouseEnter={(e) => setItemTooltip({
                                        show: true,
                                        itemName: getLocalizedString(itemsWithQty[0].item, strings),
                                        top: e.clientY + window.scrollY + 10,
                                        left: e.clientX + window.scrollX + 15
                                      })}
                                      onMouseMove={(e) => setItemTooltip(prev => ({
                                        ...prev,
                                        top: e.clientY + window.scrollY + 10,
                                        left: e.clientX + window.scrollX + 15
                                      }))}
                                      onMouseLeave={() => setItemTooltip({ show: false, itemName: '', top: 0, left: 0 })}
                                    >
                                      <div className="kent-offer-symbol">
                                        {getSymbol(itemsWithQty[0].item)}
                                      </div>
                                      <div className={`kent-single-item-qty ${itemsWithQty[0].hasEnough ? 'sufficient' : 'insufficient'}`}>
                                        x{itemsWithQty[0].quantity} / {itemsWithQty[0].playerQty}
                                      </div>
                                    </div>
                                    <div className="kent-offer-reward">
                                      {strings[42]} {offer.rewards.map((reward, rewardIndex) =>
                                        `${getSymbol(reward.item)} ${reward.quantity.toLocaleString()}${rewardIndex < offer.rewards.length - 1 ? ', ' : ''}`
                                      ).join('')}, 🔷 {calculateKentXP(offer)}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </ResourceButton>
                          <div
                            className={`kent-dismiss-button ${cardOnCooldown ? 'disabled' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!cardOnCooldown) {
                                handleDismiss(convertedOffer, index);
                              }
                            }}
                          >
                            ×
                          </div>
                        </div>
                      );
                  })}
                  {/* Dismiss all link */}
                  <div
                    className={`kent-dismiss-all-link ${(isTrading || anyCardOnCooldown) ? 'disabled' : ''}`}
                    onClick={() => {
                      if (!(isTrading || anyCardOnCooldown)) {
                        handleDismissAll();
                      }
                    }}
                  >
                    {strings[190] || "Dismiss all"}
                  </div>
                  {/* Debug refresh button - dev only */}
                  {isDeveloper && (
                    <div
                      className={`kent-dismiss-all-link ${isTrading ? 'disabled' : ''}`}
                      onClick={() => {
                        if (!isTrading) {
                          handleDebugRefresh();
                        }
                      }}
                      style={{ color: '#ff9800', marginTop: '4px' }}
                    >
                      🔧 Debug Refresh (no timer)
                    </div>
                  )}
                </>
              ) : (
                <p>No offers available from Kent.</p>
              )}
            </>
          </>
        )}
      </Panel>

      {/* Tooltip portal for multi-item offer symbols */}
      {itemTooltip.show && ReactDOM.createPortal(
        <div
          className="info-toaster"
          style={{
            top: itemTooltip.top,
            left: itemTooltip.left,
            position: 'absolute',
          }}
        >
          {itemTooltip.itemName}
        </div>,
        document.body
      )}
      </>
    );
}

export default KentPanel;
