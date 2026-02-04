import API_BASE from '../../config.js';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { spendIngredients, gainIngredients, canAfford } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { updateKentOffersAfterTrade, generateNewKentOffers } from './KentOfferLogic';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import './Kent.css'; // Kent-specific styles
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

            await refreshOffersAndSetTimer(offer, `✅ Exchanged ${offer.qtyBought} ${offer.itemBought} for ${rewardText} and +${xpToAward} XP.`);
            await trackQuestProgress(currentPlayer,'Sell',offer.itemBought,offer.qtyBought,setCurrentPlayer);

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

    // ✅ Handle dismissing all offers at once
    const handleDismissAll = async () => {
        if (!currentPlayer || isTrading || kentOffers.length === 0) return;

        // Check Kent timer before allowing dismiss
        if (isKentOnCooldown()) {
            console.log('🚫 Kent dismiss all blocked: Timer still active');
            updateStatus('❌ Kent is not available yet. Please wait for the timer to expire.');
            return;
        }

        setIsTrading(true);

        try {
            // Reset Kent timer
            const kentRefreshSeconds = globalTuning?.kentRefreshTimerSeconds || 5;
            const newEndTime = Date.now() + (kentRefreshSeconds * 1000);

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
                previousOfferCount // Pass target count to replace all discarded offers
            );

            const updatedKentOffers = {
                endTime: newEndTime,
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
            }

            updateStatus(`❌ Dismissed all offers.`);
        } catch (error) {
            console.error('❌ Error dismissing all Kent offers:', error);
            updateStatus('❌ Failed to dismiss offers. Please try again.');
        } finally {
            setIsTrading(false);
        }
    };

    // 🔧 Debug: Refresh offers without resetting timer (dev only)
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
            }

            updateStatus(`🔧 Debug: Refreshed ${newOffers.length} offers (timer unchanged).`);
        } catch (error) {
            console.error('❌ Error in debug refresh:', error);
            updateStatus('❌ Debug refresh failed.');
        } finally {
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
        const baseXP = resource?.xp || 1; // Default to 1 XP if no xp value defined
        return baseXP * 2; // 2x Kent multiplier
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

    return (
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
                            noClickSfx={true}
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
                  })}
                  {/* Dismiss all link */}
                  <div
                    className={`kent-dismiss-all-link ${(kentPhase === 'locked' || isKentOnCooldown() || isTrading) ? 'disabled' : ''}`}
                    onClick={() => {
                      if (!(kentPhase === 'locked' || isKentOnCooldown() || isTrading)) {
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
    );
}

export default KentPanel;