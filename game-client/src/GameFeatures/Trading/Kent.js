import { canHover } from '../../Utils/inputMode';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import Panel from '../../UI/Panels/Panel';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import ResourceIcon from '../../UI/Icons/ResourceIcon';
import ResourceModalSmall from '../../UI/Modals/ResourceModalSmall';
import { getPlayerQuantity } from '../../Utils/InventoryManagement';
import { postAction, applyPlayerDelta } from '../../Utils/playerDelta';
import { calculateKentOfferXP } from './KentOfferLogic';
import { getDerivedLevel } from '../../Utils/playerManagement';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
import '../../UI/Buttons/ResourceButton.css';
import './Kent.css';
import SaleBurst from '../../UI/SaleBurst';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import FloatingTextManager from '../../UI/FloatingText';
import soundManager from '../../Sound/SoundManager';
import XpStar, { XP_STAR_TOKEN } from '../../UI/Icons/XpStar';

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

    // The board is the server's (routes/kentRoutes.js): show what the player record holds at once,
    // then sync (an empty board gets its fallback card there)
    // The server's cooldowns (routes/kentRoutes.js kentCooldowns) win over the local copy: a card
    // still cooling down there cannot be sold or dismissed here either
    const adoptCooldowns = (fromServer) => {
        if (!fromServer || typeof fromServer !== 'object') return;
        const now = Date.now();
        setCardCooldowns((prev) => {
            const next = {};
            for (const [k, v] of Object.entries({ ...prev, ...fromServer })) {
                const end = Math.max(Number(prev[k]) || 0, Number(fromServer[k]) || 0);
                if (end > now) next[k] = end;
            }
            return next;
        });
    };

    const applyBoard = (board) => {
        if (!board || !Array.isArray(board.offers)) return;
        setKentOffers(board.offers);
        setCurrentPlayer(prev => (prev ? { ...prev, kentOffers: board } : prev));
    };

    const fetchKentOffers = async () => {
        const stored = currentPlayer?.kentOffers?.offers || [];
        setKentOffers(stored);
        if (stored.length === 0) setIsContentLoading(true);
        const answer = await postAction('/api/action/kent-sync', { playerId: currentPlayer.playerId });
        if (answer.data?.kentOffers) applyBoard(answer.data.kentOffers);
            if (answer.data?.kentCooldowns) adoptCooldowns(answer.data.kentCooldowns);
        if (!answer.ok) console.error('❌ Kent sync failed:', answer.reason);
        setIsContentLoading(false);
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
        handleTrade(offer, index, originalOffer).then((ok) => {
            if (ok) return;
            clearCardCooldown(index);                        // revert: the offer is still there
            setFx(index, null);
        });
    };

    // The tap's counts: the goods leave (backpack first) and the Money arrives at once; the
    // server's answer (applyPlayerDelta) replaces both, and a refusal's delta puts them back
    const predictSale = (goods, moneyAmount) => {
        const take = (list, type, qty) => {
            let rest = qty;
            const next = (Array.isArray(list) ? list : []).map(i => ({ ...i }));
            for (let i = next.length - 1; i >= 0 && rest > 0; i--) {
                if (next[i]?.type !== type || !(next[i].quantity > 0)) continue;
                const n = Math.min(next[i].quantity, rest);
                next[i].quantity -= n;
                rest -= n;
            }
            return { list: next.filter(i => !(i?.type === type && i.quantity <= 0)), rest };
        };
        let pack = backpack;
        let wh = inventory;
        for (const { item, quantity } of goods) {
            const fromPack = take(pack, item, quantity);
            pack = fromPack.list;
            if (fromPack.rest > 0) wh = take(wh, item, fromPack.rest).list;
        }
        if (moneyAmount > 0) {
            const i = wh.findIndex(it => it?.type === 'Money');
            wh = i >= 0 ? wh.map((it, j) => (j === i ? { ...it, quantity: (it.quantity || 0) + moneyAmount } : it)) : [...wh, { type: 'Money', quantity: moneyAmount }];
        }
        setBackpack(pack);
        setInventory(wh);
        setCurrentPlayer(prev => (prev ? { ...prev, inventory: wh, backpack: pack } : prev));
    };

    // The sale itself: one server request (POST /api/action/kent-sell) spends the goods, pays the
    // rewards and the XP, advances the Sell / Serve Kent quests and replaces the card. Resolves
    // true on success.
    const handleTrade = async (offer, offerIndex, originalOffer) => {
        if (!offer || !currentPlayer || isTrading) return false;
        setIsTrading(true);
        try {
            const goods = (originalOffer?.items?.length ? originalOffer.items : [{ item: originalOffer?.item, quantity: originalOffer?.quantity }])
                .map(({ item, quantity }) => ({ item, quantity }));
            const before = kentOffers.length;
            const money = originalOffer?.rewards?.find(r => r.item === 'Money')?.quantity || 0;
            predictSale(goods, money);

            const answer = await postAction('/api/action/kent-sell', {
                playerId: currentPlayer.playerId,
                offerIndex,
                expect: goods,
            });
            applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
            if (answer.data?.kentOffers) applyBoard(answer.data.kentOffers);
            if (answer.data?.kentCooldowns) adoptCooldowns(answer.data.kentCooldowns);

            if (!answer.ok) {
                if (answer.status === 0) return true;   // no answer (network): keep the optimistic sale
                if (answer.reason === 'no-backpack') updateStatus(19);
                else if (answer.reason === 'backpack-full') updateStatus(21);
                else if (answer.reason === 'warehouse-full') updateStatus(20);
                else updateStatus('❌ Trade failed. Please try again.');
                return false;
            }

            const { sold = goods, rewards = [], xpGained = 0 } = answer.data;
            startGrowthSlots(before, (answer.data.kentOffers?.offers || []).length);
            const rewardText = rewards.map(reward => `${reward.quantity} ${getLocalizedString(reward.item, strings)}`).join(', ');
            const soldText = sold.map(item => `${item.quantity} ${item.item}`).join(' + ');
            updateStatus(`✅ Exchanged ${soldText} for ${rewardText} and +${xpGained} XP.`);

            // Try to advance FTUE if this is the player's first sale to Kent
            await tryAdvanceFTUEByTrigger('SoldToKent', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
            return true;
        } catch (error) {
            console.error('❌ Error in Kent trade:', error);
            updateStatus('❌ Trade failed. Please try again.');
            return false;
        } finally {
            setIsTrading(false);
        }
    };

    // Dismissing one card: its slot cools down ON THE TAP (its countdown card slides in) while the
    // server makes the replacement (POST /api/action/kent-dismiss); the slot reopens if that fails
    const handleDismiss = async (offer, offerIndex) => {
        if (!offer || !currentPlayer || isTrading) return;
        if (isCardOnCooldown(offerIndex)) return;
        setIsTrading(true);
        startCardCooldown(offerIndex);
        setFx(offerIndex, 'slidein');
        later(460, () => setFx(offerIndex, null));
        try {
            const before = kentOffers.length;
            const answer = await postAction('/api/action/kent-dismiss', { playerId: currentPlayer.playerId, offerIndex });
            if (answer.data?.kentOffers) applyBoard(answer.data.kentOffers);
            if (answer.data?.kentCooldowns) adoptCooldowns(answer.data.kentCooldowns);
            if (answer.ok) {
                startGrowthSlots(before, (answer.data.kentOffers?.offers || []).length);
            } else if (answer.status !== 0) {
                clearCardCooldown(offerIndex);
            }
        } finally {
            setIsTrading(false);
        }
    };

    // Dismissing every card: a whole new board from the server, every slot behind its cooldown
    const handleDismissAll = async () => {
        if (!currentPlayer || isTrading || kentOffers.length === 0) return;
        if (kentOffers.some((_, index) => isCardOnCooldown(index))) return;
        setIsTrading(true);
        const cooldownEndTime = Date.now() + (globalTuning?.kentCardCooldownSeconds || 30) * 1000;
        const coolAll = (count) => {
            const next = {};
            for (let i = 0; i < count; i++) { next[i] = cooldownEndTime; setFx(i, 'slidein'); }
            setCardCooldowns(next);
            later(460, () => setCardFx({}));
        };
        coolAll(kentOffers.length);
        try {
            const answer = await postAction('/api/action/kent-dismiss', { playerId: currentPlayer.playerId, all: true });
            if (answer.data?.kentOffers) applyBoard(answer.data.kentOffers);
            if (answer.data?.kentCooldowns) adoptCooldowns(answer.data.kentCooldowns);
            if (answer.ok) coolAll((answer.data.kentOffers?.offers || []).length);
            else if (answer.status !== 0) setCardCooldowns({});
        } finally {
            setIsTrading(false);
        }
    };

    // Debug: a new board without the cooldowns (dev only)
    const handleDebugRefresh = async () => {
        if (!currentPlayer || isTrading) return;
        setIsTrading(true);
        try {
            const answer = await postAction('/api/action/kent-dismiss', { playerId: currentPlayer.playerId, all: true, debug: true });
            if (answer.data?.kentOffers) applyBoard(answer.data.kentOffers);
            if (answer.ok) {
                setCardCooldowns({});
                updateStatus(`Debug: Refreshed ${(answer.data.kentOffers?.offers || []).length} offers.`);
            } else {
                updateStatus('❌ Debug refresh failed.');
            }
        } finally {
            setIsTrading(false);
        }
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
        FloatingTextManager.addFloatingTextAt(`+${moneyAmount.toLocaleString()} {res:Money}`, cx, cy - 8, { flyTo: 'money' });
        setTimeout(() => {
            FloatingTextManager.addFloatingTextAt(`+${xpAmount} ${XP_STAR_TOKEN} XP`, cx, cy + 14, { flyTo: 'xp' });
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
                        <span key={key} className="kent-reward-chip"><ResourceIcon type={reward.item} masterResources={masterResources} /> {reward.quantity.toLocaleString()}</span>
                      );
                      const rewards = (
                        <div className="kent-offer-reward">
                          <div className="kent-reward-row">{moneyRewards.map(rewardChip)}</div>
                          <div className="kent-reward-row">
                            {otherRewards.map(rewardChip)}
                            <span className="kent-reward-chip"><XpStar /> {calculateKentXP(offer)}</span>
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
                                            <div className="kent-offer-symbol"><ResourceIcon type={item.item} masterResources={masterResources} /></div>
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
                                        <div className="kent-offer-symbol"><ResourceIcon type={itemsWithQty[0].item} masterResources={masterResources} /></div>
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
