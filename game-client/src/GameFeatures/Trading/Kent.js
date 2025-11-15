import API_BASE from '../../config.js';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import ResourceButton from '../../UI/ResourceButton';
import { refreshPlayerAfterInventoryUpdate, spendIngredients, gainIngredients, canAfford } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { updateKentOffersAfterTrade } from './KentOfferLogic';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import './Kent.css'; // Kent-specific styles
import { formatCountdown } from '../../UI/Timers.js';
import { useStrings } from '../../UI/StringsContext';
import { incrementFTUEStep } from '../FTUE/FTUE';
import { getLocalizedString } from '../../Utils/stringLookup';

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
    currentSeason, }) 
{
    const strings = useStrings();
    const [isContentLoading, setIsContentLoading] = useState(false);
    const [kentOffers, setKentOffers] = useState([]);
    const [kentTimer, setKentTimer] = useState("");
    const [kentPhase, setKentPhase] = useState("");
    const [isTrading, setIsTrading] = useState(false); 

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

    // Kent timer logic
    useEffect(() => {
        const updateKentTimer = () => {
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
        };

        updateKentTimer();
        const interval = setInterval(updateKentTimer, 1000);
        return () => clearInterval(interval);
    }, [currentPlayer?.kentOffers?.endTime]);

    // Initial load
    useEffect(() => {
        if (currentPlayer?.playerId) {
            fetchKentOffers();
        }
    }, [currentPlayer?.playerId]);

    // ✅ Handle trade transaction with protection against spam clicking
    const handleTrade = async (offer) => {
        if (!offer || !currentPlayer || isTrading) return;
        
        // ✅ EXPLOIT FIX: Check Kent timer before allowing any trade
        if (isKentOnCooldown()) {
            console.log('🚫 Kent trade blocked: Timer still active');
            updateStatus('❌ Kent is not available yet. Please wait for the timer to expire.');
            return;
        }
        
        // Set trading flag to prevent spam clicks
        setIsTrading(true);
        
        try {

            // Spend ingredients
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

            if (!success) return;

            // Gain all rewards
            let allRewardsSuccess = true;
            const originalOffer = kentOffers.find(kentOffer => 
              kentOffer.item === offer.itemBought && kentOffer.quantity === offer.qtyBought
            );
            
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

            // Create status message for multiple rewards
            const rewardText = originalOffer && originalOffer.rewards 
              ? originalOffer.rewards.map(reward => `${reward.quantity} ${reward.item}`).join(', ')
              : `${offer.qtyGiven} ${offer.itemGiven}`;

            await refreshOffersAndSetTimer(offer, `✅ Exchanged ${offer.qtyBought} ${offer.itemBought} for ${rewardText} and +${xpToAward} XP.`);
            await trackQuestProgress(currentPlayer,'Sell',offer.itemBought,offer.qtyBought,setCurrentPlayer);
            // Check if we should increment FTUE step after selling
            if (currentPlayer.ftuestep === 3) {
                console.log('🎓 Player at FTUE step 3 sold wheat, incrementing FTUE step');
                await incrementFTUEStep(currentPlayer.playerId, currentPlayer, setCurrentPlayer);
            }
            
        } catch (error) {
            console.error('❌ Error in Kent trade:', error);
            updateStatus('❌ Trade failed. Please try again.');
        } finally {
            // Always clear the trading flag
            setIsTrading(false);
        }
    };

    // ✅ Handle dismissing an offer without trading
    const handleDismiss = async (offer) => {
        if (!offer || !currentPlayer || isTrading) return;
        
        // ✅ EXPLOIT FIX: Check Kent timer before allowing any dismiss
        if (isKentOnCooldown()) {
            console.log('🚫 Kent dismiss blocked: Timer still active');
            updateStatus('❌ Kent is not available yet. Please wait for the timer to expire.');
            return;
        }
        
        // Set trading flag to prevent spam clicks
        setIsTrading(true);
        
        try {
            await refreshOffersAndSetTimer(offer, `❌ Dismissed offer for ${offer.itemBought}.`);
        } catch (error) {
            console.error('❌ Error dismissing Kent offer:', error);
            updateStatus('❌ Failed to dismiss offer. Please try again.');
        } finally {
            // Always clear the trading flag
            setIsTrading(false);
        }
    };

    // ✅ Shared function to refresh offers and set timer
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
            currentSeason
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


    // ✅ Helper function to check if Kent is currently on cooldown
    const isKentOnCooldown = () => {
        const now = Date.now();
        const kentData = currentPlayer?.kentOffers;
        const endTime = kentData?.endTime || 0;
        return endTime > now;
    };

    // ✅ Lookup function for symbols from `masterResources`
    const getSymbol = (resourceType) => {
        const resource = masterResources.find(res => res.type === resourceType);
        return resource?.symbol || "❓"; // Default to question mark if no symbol found
    };

    // Calculate XP for Kent offer based on resource.xp value
    const calculateKentXP = (offer) => {
        // Find the resource being sold and get its XP value
        const resource = masterResources.find(res => res.type === offer.item);
        return resource?.xp || 1; // Default to 1 XP if no xp value defined
    };

    return (
      <Panel onClose={onClose}  titleKey="1138" panelName="KentPanel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {/* Show timer at top with fixed height */}
            <div className="kent-header-area">
              {kentPhase === 'locked' ? (
                <>
                  <h2>{strings[46]}</h2>
                  <h2>{kentTimer}</h2>
                </>
              ) : (
                <h2>{kentTimer}</h2>
              )}
            </div>
            
            {/* Always show offers, but disable during cooldown */}
            <>
              {kentOffers.length > 0 ? (
                kentOffers.map((offer, index) => {
                    // Calculate player's total quantity from inventory and backpack
                    const inventoryQty = inventory?.find(item => item.type === offer.item)?.quantity || 0;
                    const backpackQty = backpack?.find(item => item.type === offer.item)?.quantity || 0;
                    const playerQty = inventoryQty + backpackQty;
                    
                    // Convert Kent offer format to bank offer format for compatibility
                    const convertedOffer = {
                        itemBought: offer.item,
                        qtyBought: offer.quantity,
                        itemGiven: offer.rewards[0]?.item || 'Money',
                        qtyGiven: offer.rewards[0]?.quantity || 0
                    };
                    
                    // Check if Kent panel is locked (use both phase state and real-time check)
                    const isLocked = kentPhase === 'locked' || isKentOnCooldown();
                    
                    return (
                      <div key={index} className="kent-offer-wrapper">
                        <ResourceButton
                          className={`kent-offer-button ${isLocked ? 'disabled' : ''}`}
                          onClick={() => !isLocked && !isTrading && handleTrade(convertedOffer)}
                          disabled={isLocked || isTrading || !canAfford({
                            ingredient1: convertedOffer.itemBought,
                            ingredient1qty: convertedOffer.qtyBought
                          }, inventory, backpack, 1)}
                          hideInfo={true}
                        >
                          <div className="resource-details">
                            <div className="kent-offer-content">
                              <div className="kent-offer-symbol">
                                {getSymbol(convertedOffer.itemBought)}
                              </div>
                              <div className="kent-offer-details">
                                <div className="kent-offer-requirement">
                                  <span className={`kent-offer-item ${playerQty < convertedOffer.qtyBought ? 'insufficient' : 'sufficient'}`}>
                                    {getLocalizedString(convertedOffer.itemBought, strings)} x{convertedOffer.qtyBought} / {playerQty}
                                  </span>
                                </div>
                                <div className="kent-offer-reward">
                                  {strings[42]} {offer.rewards.map((reward, rewardIndex) => 
                                    `${getSymbol(reward.item)} ${reward.quantity.toLocaleString()}${rewardIndex < offer.rewards.length - 1 ? ', ' : ''}`
                                  ).join('')}, 🔷 {calculateKentXP(offer)} 
                                </div>
                              </div>
                            </div>
                          </div>
                        </ResourceButton>
                        <div 
                          className={`kent-dismiss-button ${isLocked || isTrading ? 'disabled' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isLocked && !isTrading) {
                              handleDismiss(convertedOffer);
                            }
                          }}
                        >
                          ×
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p>No offers available from Kent.</p>
              )}
            </>
          </>
        )}
      </Panel>
    );
}

export default KentPanel;