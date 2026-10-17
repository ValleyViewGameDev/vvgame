import API_BASE from '../../config.js';
import { canHover } from '../../Utils/inputMode';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import ResourceModalSmall from '../../UI/Modals/ResourceModalSmall';
import { spendIngredients, gainIngredients, getPlayerQuantity } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { updateKentOffersAfterTrade, generateNewKentOffers, calculateKentOfferXP } from './KentOfferLogic';
import { getDerivedLevel } from '../../Utils/playerManagement';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
import '../../UI/Buttons/ResourceButton.css';
import './Kent.css';
import SaleBurst from '../../UI/SaleBurst';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import FloatingTextManager from '../../UI/FloatingText';
import soundManager from '../../Sound/SoundManager';

// Held counts of 1,000 and up in compact form (1.2k, 15k): card quantities stay short
const compactCount = (n) => {
    if (n < 1000) return String(n);
    if (n < 10000) return `${(Math.floor(n / 100) / 10).toString()}k`;
    return `${Math.floor(n / 1000)}k`;
};
// "asked / held" on a card: thin spaces, and the only break point is after the slash, so when two
// big counts share a phone card each wraps to "asked /" over "held" instead of running together
const CardQty = ({ asked, held }) => (
    <><span className="kent-qty-part">{asked}{'\u202F/'}</span>{'\u2009'}<span className="kent-qty-part">{compactCount(held)}</span></>
);


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
    const [infoResource, setInfoResource] = useState(null); // ResourceModalSmall: tap an item on a card you cannot trade
    const [infoNeeds, setInfoNeeds] = useState(null);       // its need / have counts (multi-item offers)
    const [isTrading, setIsTrading] = useState(false);
    // Card animations by slot (not persisted): { [index]: { type: 'burst' | 'slidein' | 'flipout' | 'flipin', id } }
    //   burst   - the sold card pops into sparkles (on the tap, before the server answers)
    //   slidein - the slot's countdown card slides in from the left
    //   flipout - the countdown has run out: the countdown face turns away...
    //   flipin  - ...and the new offer turns in
    const [cardFx, setCardFx] = useState({});
    const fxTimers = useRef([]);
    useEffect(() => () => fxTimers.current.forEach(clearTimeout), []);
    const later = (ms, fn) => { fxTimers.current.push(setTimeout(fn, ms)); };
    const setFx = (index, type, extra = {}) => setCardFx((prev) => {
        const next = { ...prev };
        if (type) next[index] = { type, id: Date.now() + Math.random(), ...extra }; else delete next[index];
        return next;
    });
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

        } catch (error) {
            console.error('❌ Error fetching Kent offers:', error);
        } finally {
            setIsContentLoading(false);
        }
    };

    // Per-card cooldown ticks: redraw the countdowns, and flip a card over when its countdown ends
    // (Kent never leaves: each slot cools down on its own after a sale or a dismiss)
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            setTick(t => t + 1);
            Object.entries(cardCooldowns).forEach(([index, endTime]) => {
                if (endTime > now || cardFx[index]?.type === 'flipout') return;
                setFx(index, 'flipout');                     // the countdown face turns away...
                later(220, () => {
                    setCardCooldowns((prev) => { const next = { ...prev }; delete next[index]; return next; });
                    setFx(index, 'flipin');                  // ...and the offer turns in
                    later(320, () => setFx(index, null));
                });
            });
        }, 250);
        return () => clearInterval(interval);
    }, [cardCooldowns, cardFx]);   // eslint-disable-line react-hooks/exhaustive-deps

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

    const startCardCooldown = (index) => {
        const seconds = globalTuning?.kentCardCooldownSeconds || 30;
        setCardCooldowns(prev => ({ ...prev, [index]: Date.now() + seconds * 1000 }));
    };
    const clearCardCooldown = (index) => setCardCooldowns(prev => { const next = { ...prev }; delete next[index]; return next; });

    // A sale: the card bursts into sparkles ON THE TAP and its slot starts its cooldown at once
    // (house rule: never gate the visual on the round trip); the trade runs in parallel and the
    // card comes back only if it fails.
    const sellCard = (offer, index, originalOffer) => {
        if (!offer || !currentPlayer || isTrading || isCardOnCooldown(index)) return;
        setFx(index, 'burst', { offer: originalOffer });   // the sold card keeps its face while it bursts
        startCardCooldown(index);
        soundManager.playSFX('collect_money');
        try { navigator.vibrate?.(35); } catch (_) { /* no haptics here */ }
        const moneyReward = originalOffer?.rewards?.find(r => r.item === 'Money');
        showSaleFloatingText(moneyReward?.quantity || offer.qtyGiven || 0, calculateKentXP(originalOffer), index);
        later(300, () => { setFx(index, 'slidein'); later(460, () => setFx(index, null)); });
        handleTrade(offer, index).then((ok) => {
            if (ok) return;
            clearCardCooldown(index);                        // revert: the offer is still there
            setFx(index, null);
        });
    };

    // Handle trade transaction with protection against spam clicking. Resolves true on success.
    const handleTrade = async (offer, offerIndex) => {
        if (!offer || !currentPlayer || isTrading) return false;

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
                        return false;
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
                    return false;
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

            if (!allRewardsSuccess) return false;

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

            // (the floating text, sound and burst already played on the tap: sellCard)

            // Create status message for multiple rewards
            const rewardText = originalOffer && originalOffer.rewards
              ? originalOffer.rewards.map(reward => `${reward.quantity} ${reward.item}`).join(', ')
              : `${offer.qtyGiven} ${offer.itemGiven}`;

            // Create sold items text for multi-item offers
            const soldText = offer.itemsBought && offer.itemsBought.length > 1
              ? offer.itemsBought.map(item => `${item.quantity} ${item.item}`).join(' + ')
              : `${offer.qtyBought} ${offer.itemBought}`;

            await replaceSoldOffer(offer, offerIndex, `✅ Exchanged ${soldText} for ${rewardText} and +${xpToAward} XP.`);

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
            return true;

        } catch (error) {
            console.error('❌ Error in Kent trade:', error);
            updateStatus('❌ Trade failed. Please try again.');
            return false;
        } finally {
            // Always clear the trading flag
            setIsTrading(false);
        }
    };

    // Handle dismissing an individual offer: a replacement is made at once, behind the slot's cooldown
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
                masterXPLevels,
                offerIndex
            );

            updatedKentOffers.endTime = 0;   // Kent never leaves; only the slot cools down

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

                // Start per-card cooldown on the slot where the new offer was inserted; its countdown card slides in
                startCardCooldown(offerIndex);
                setFx(offerIndex, 'slidein');
                later(460, () => setFx(offerIndex, null));
                startGrowthSlots(currentPlayer?.kentOffers?.offers?.length || 0, (updatedKentOffers.offers || []).length);
            }

        } catch (error) {
            console.error('❌ Error dismissing Kent offer:', error);
        } finally {
            setIsTrading(false);
        }
    };

    // Handle dismissing all offers at once: every slot gets its cooldown
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
                endTime: 0,
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
                    setFx(i, 'slidein');
                }
                setCardCooldowns(newCooldowns);
                later(460, () => setCardFx({}));
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
                endTime: 0,
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

            updateStatus(`🔧 Debug: Refreshed ${newOffers.length} offers.`);
        } catch (error) {
            console.error('❌ Error in debug refresh:', error);
            updateStatus('❌ Debug refresh failed.');
        } finally {
            setIsTrading(false);
        }
    };

    // After a sale: the sold offer is replaced in its slot (the slot's cooldown already runs, from the tap)
    const replaceSoldOffer = async (offer, offerIndex, statusMessage) => {
        const updatedKentOffers = updateKentOffersAfterTrade(
            currentPlayer,
            offer,
            masterResources,
            globalTuning,
            currentSeason,
            masterXPLevels,
            offerIndex
        );
        updatedKentOffers.endTime = 0;   // no "Kent is away": he never leaves

        const updateResponse = await axios.post(`${API_BASE}/api/update-profile`, {
            playerId: currentPlayer.playerId,
            updates: { kentOffers: updatedKentOffers }
        });

        if (updateResponse.data.success) {
            const before = currentPlayer?.kentOffers?.offers?.length || 0;
            setCurrentPlayer(prev => ({
                ...prev,
                kentOffers: updatedKentOffers
            }));
            setKentOffers(updatedKentOffers.offers || []);
            startGrowthSlots(before, (updatedKentOffers.offers || []).length);
        }

        updateStatus(statusMessage);
    };

    // A trade can add a slot (Kent's list grows to its cap): a new slot arrives like any other,
    // as a countdown card sliding in, and flips to its offer when the countdown ends
    const startGrowthSlots = (before, after) => {
        for (let i = before; i < after; i++) {
            startCardCooldown(i);
            setFx(i, 'slidein');
            later(460, () => setFx(i, null));
        }
    };

    // Lookup function for symbols from `masterResources`
    const getSymbol = (resourceType) => {
        const resource = masterResources.find(res => res.type === resourceType);
        return resource?.symbol || "❓"; // Default to question mark if no symbol found
    };

    // XP for a Kent offer: the same function pays the trade and labels the card
    const calculateKentXP = (offer) =>
        calculateKentOfferXP(offer, masterResources, getDerivedLevel(currentPlayer, masterXPLevels), globalTuning);

    // The sale's rewards rise from the middle of the card that was sold and fly into the header:
    // Money into the money counter, XP into the Level bar (FloatingText flyTo, UI/FlyToTarget.js)
    const showSaleFloatingText = (moneyAmount, xpAmount, slotIndex) => {
        const card = document.querySelector(`[data-kent-slot="${slotIndex}"]`);
        if (!card) return;
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        FloatingTextManager.addFloatingTextAt(`+${moneyAmount.toLocaleString()} 💰`, cx, cy - 8, { flyTo: 'money' });
        setTimeout(() => {
            FloatingTextManager.addFloatingTextAt(`+${xpAmount} 🔷 XP`, cx, cy + 14, { flyTo: 'xp' });
        }, 260);
    };

    // Check if any card has an active cooldown (for Dismiss All button)
    const anyCardOnCooldown = kentOffers.some((_, index) => isCardOnCooldown(index));

    return (
      <>
      <Panel onClose={onClose} titleKey="45" panelName="KentPanel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {kentOffers.length > 0 ? (
              <>
                <div className="kent-offers-grid">
                  {kentOffers.map((slotOffer, index) => {
                      const fx = cardFx[index];
                      // a bursting card shows the offer that was sold, even if its replacement is already here
                      const offer = fx?.type === 'burst' && fx.offer ? fx.offer : slotOffer;
                      // the countdown face shows while the slot cools down, and through the first half of
                      // its flip; the sold card keeps its own face while it bursts
                      const showCountdown = fx?.type !== 'burst' && (isCardOnCooldown(index) || fx?.type === 'flipout');
                      const cardOnCooldown = isCardOnCooldown(index) || !!fx;
                      const cardCooldownSeconds = getCardCooldownRemaining(index);
                      const isCardInactive = cardOnCooldown;

                      // Determine if this is a multi-item offer
                      const isMultiItem = offer.items && offer.items.length > 1;
                      const offerItems = offer.items || [{ item: offer.item, quantity: offer.quantity }];

                      // Calculate player quantities for each item
                      const itemsWithQty = offerItems.map(offerItem => {
                          const playerQty = getPlayerQuantity(offerItem.item, inventory, backpack); // backpack + warehouse
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

                      const itemHover = (item) => ({
                        onMouseEnter: (e) => canHover() && setItemTooltip({
                          show: true,
                          itemName: getLocalizedString(item.item, strings),
                          top: e.clientY + window.scrollY + 10,
                          left: e.clientX + window.scrollX + 15
                        }),
                        onMouseMove: (e) => setItemTooltip(prev => ({
                          ...prev,
                          top: e.clientY + window.scrollY + 10,
                          left: e.clientX + window.scrollX + 15
                        })),
                        onMouseLeave: () => setItemTooltip({ show: false, itemName: '', top: 0, left: 0 }),
                      });

                      // Rewards in two fixed rows: Money alone on the first, then any other reward
                      // (the valley bonus) and the XP on the second
                      const moneyRewards = offer.rewards.filter(reward => reward.item === 'Money');
                      const otherRewards = offer.rewards.filter(reward => reward.item !== 'Money');
                      const rewardChip = (reward, key) => (
                        <span key={key} className="kent-reward-chip">{getSymbol(reward.item)} {reward.quantity.toLocaleString()}</span>
                      );
                      const rewards = (
                        <div className="kent-offer-reward">
                          <div className="kent-reward-row">{moneyRewards.map(rewardChip)}</div>
                          <div className="kent-reward-row">
                            {otherRewards.map(rewardChip)}
                            <span className="kent-reward-chip">🔷 {calculateKentXP(offer)}</span>
                          </div>
                        </div>
                      );

                      return (
                        <div
                          key={index}
                          data-kent-slot={index}
                          className={`kent-offer-wrapper ${fx ? `kent-fx-${fx.type}` : ''}`}
                          onClick={() => {
                            // A card the player cannot afford stays a live button (gray, kent-short) so its items
                            // keep their desktop hovertips; its tap bubbles here and ResourceModalSmall opens for
                            // the item (or, on a multi-item offer, every item side by side, with need / have).
                            // A card on its own cooldown, which shows a timer instead of its goods, ignores the tap.
                            if (canAffordAll || cardOnCooldown || isTrading) return;
                            if (itemsWithQty.length > 1) {
                              setInfoResource(itemsWithQty.map((item) => item.item));
                              setInfoNeeds(itemsWithQty.map((item) => ({ type: item.item, need: item.quantity, have: item.playerQty })));
                              return;
                            }
                            const missing = itemsWithQty.find((item) => !item.hasEnough);
                            if (missing) { setInfoResource(missing.item); setInfoNeeds(null); }
                          }}
                        >
                          {/* keys: the card layer and the burst are siblings, so their keys must differ (a shared
                              fx.id made React keep the sold card's layer under the new one: a double-height slot) */}
                          <div key={`card-${fx?.id || 'still'}`} className="kent-card-anim">
                            <ResourceButton
                              className={`kent-offer-button ${showCountdown ? 'kent-cooling' : canAffordAll ? 'kent-ready' : 'kent-short'} ${isMultiItem ? 'multi-item' : ''}`}
                              onClick={() => canAffordAll && !isCardInactive && !isTrading && sellCard(convertedOffer, index, offer)}
                              disabled={isCardInactive || isTrading}
                              hideInfo={true}
                              noClickSfx={true}
                            >
                              <div className="resource-details">
                                <div className={`kent-offer-content ${isMultiItem ? 'multi-item' : ''}`}>
                                  {showCountdown ? (
                                    <div className="kent-card-cooldown-timer">{cardCooldownSeconds}s</div>
                                  ) : isMultiItem ? (
                                    <>
                                      <div className="kent-multi-item-row">
                                        {itemsWithQty.map((item, itemIdx) => (
                                          <div key={itemIdx} className="kent-multi-item-cell" {...itemHover(item)}>
                                            <div className="kent-offer-symbol">{getSymbol(item.item)}</div>
                                            <div className={`kent-multi-item-qty ${item.hasEnough ? 'sufficient' : 'insufficient'}`}>
                                              <CardQty asked={item.quantity} held={item.playerQty} />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      {rewards}
                                    </>
                                  ) : (
                                    <>
                                      <div className="kent-single-item-cell" {...itemHover(itemsWithQty[0])}>
                                        <div className="kent-offer-symbol">{getSymbol(itemsWithQty[0].item)}</div>
                                        <div className={`kent-single-item-qty ${itemsWithQty[0].hasEnough ? 'sufficient' : 'insufficient'}`}>
                                          <CardQty asked={itemsWithQty[0].quantity} held={itemsWithQty[0].playerQty} />
                                        </div>
                                      </div>
                                      {rewards}
                                    </>
                                  )}
                                </div>
                              </div>
                            </ResourceButton>
                          </div>
                          {fx?.type === 'burst' && <SaleBurst key={`burst-${fx.id}`} />}
                          {!showCountdown && !fx && (
                            <div
                              className="kent-dismiss-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!cardOnCooldown) handleDismiss(convertedOffer, index);
                              }}
                            >
                              ×
                            </div>
                          )}
                        </div>
                      );
                  })}
                </div>
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
                    style={{ color: 'var(--color-text-warning)', marginTop: '4px' }}
                  >
                    🔧 Debug Refresh
                  </div>
                )}
              </>
            ) : (
              <p>No offers available from Kent.</p>
            )}
          </>
        )}
      </Panel>
      {infoResource && <ResourceModalSmall resourceType={infoResource} needs={infoNeeds} masterResources={masterResources} onClose={() => { setInfoResource(null); setInfoNeeds(null); }} />}


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
