import API_BASE from '../../config.js';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import LevelLock from '../../UI/Panels/LevelLock';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { spendIngredients, gainIngredients, canAfford } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import { formatCountdown } from '../../UI/Timers.js';
import { useStrings } from '../../UI/StringsContext';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import '../../UI/Buttons/SharedButtons.css';

function BankPanel({
    onClose,
    inventory,
    setInventory,
    backpack,
    setBackpack,
    currentPlayer,
    setCurrentPlayer,
    updateStatus,
    masterResources,
    masterXPLevels,
    globalTuning,
    setResources,
    currentStationPosition,
    gridId,
    TILE_SIZE,
    isDeveloper })
{
    const strings = useStrings();

    // Get Bank level requirement from masterResources
    const bankResource = masterResources?.find(r => r.type === 'Bank');
    const bankRequiredLevel = bankResource?.level || 1;

    const [isContentLoading, setIsContentLoading] = useState(false);
    const [bankOffers, setBankOffers] = useState([]);
    const [bankTimer, setBankTimer] = useState("");
    const [bankPhase, setBankPhase] = useState("");
    const [coolingDownButtons, setCoolingDownButtons] = useState(new Set());
    const COOLDOWN_DURATION = 1500; // 3x longer for bank transactions

    // Fetch data - separated from timer logic
    const fetchBankOffers = async () => {
       setIsContentLoading(true);
       try {
            const response = await axios.get(`${API_BASE}/api/get-frontier/${currentPlayer.frontierId}`);
            setBankOffers(response.data.bank?.offers || []);
            setBankPhase(response.data.bank?.phase || "");
        } catch (error) {
            console.error('❌ Error fetching bank offers:', error);
        } finally {
            setIsContentLoading(false);
        }
    };

    // Timer + Phase Change Detection
    useEffect(() => {
        const updateCountdown = () => {
            const now = Date.now();
            const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
            const bankTimerData = storedTimers.bank || {};
            
            // Check for phase change
            if (bankTimerData.phase !== bankPhase) {
                console.log("🏦 Bank phase changed, fetching new data...");
                fetchBankOffers();
            }
            
            setBankTimer(formatCountdown(bankTimerData.endTime, now));
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        return () => clearInterval(interval);
    }, [bankPhase, currentPlayer?.frontierId]);

    // Initial load
    useEffect(() => {
        if (currentPlayer?.frontierId) {
            fetchBankOffers();
        }
    }, [currentPlayer?.frontierId]);

    // ✅ Handle trade transaction
    const handleTrade = async (offer) => {
        if (!offer || !currentPlayer) return;

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

        // Gain the given item (usually Money)
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

        if (!gainSuccess) return;

        await trackQuestProgress(currentPlayer,'Sell',offer.itemBought,offer.qtyBought,setCurrentPlayer);

        updateStatus(`✅ Exchanged ${offer.qtyBought} ${offer.itemBought} for ${offer.qtyGiven} ${offer.itemGiven}.`);
    };

    // Wrap handleTrade with cooldown to prevent spam clicking
    const handleTradeWithCooldown = async (offer, buttonIndex) => {
        if (coolingDownButtons.has(buttonIndex)) return;
        
        console.log(`Starting cooldown for button ${buttonIndex}, duration: ${COOLDOWN_DURATION}ms (${COOLDOWN_DURATION / 1000}s)`);
        
        // Add this button to cooling down set
        setCoolingDownButtons(prev => new Set(prev).add(buttonIndex));
        
        setTimeout(() => {
            console.log(`Ending cooldown for button ${buttonIndex}`);
            // Remove this button from cooling down set
            setCoolingDownButtons(prev => {
                const newSet = new Set(prev);
                newSet.delete(buttonIndex);
                return newSet;
            });
        }, COOLDOWN_DURATION);

        await handleTrade(offer);
    };

    // ✅ Lookup function for symbols from `masterResources`
    const getSymbol = (resourceType) => {
        const resource = masterResources.find(res => res.type === resourceType);
        return resource?.symbol || "❓"; // Default to question mark if no symbol found
    };

    const handleSellStation = async (transactionId, transactionKey) => {
        await handleProtectedSelling({
            currentPlayer,
            setInventory,
            setBackpack,
            setCurrentPlayer,
            setResources,
            stationType: 'Bank',
            currentStationPosition,
            gridId,
            TILE_SIZE,
            updateStatus,
            onClose,
            devOnly: true,
        });
    };

    return (
      <Panel onClose={onClose} descriptionKey="1017" titleKey="1117" panelName="BankPanel">
        <LevelLock
          currentPlayer={currentPlayer}
          masterXPLevels={masterXPLevels}
          requiredLevel={bankRequiredLevel}
          featureName="Bank"
        >
          {/* Check if player is in their home settlement */}
          {(() => {
            const isInHomeSettlement = String(currentPlayer.location.s) === String(currentPlayer.settlementId);
            console.log('🏦 Bank access check:', {
              currentSettlement: currentPlayer.location.s,
              homeSettlement: currentPlayer.settlementId,
              isInHomeSettlement
            });
            return !isInHomeSettlement;
          })() ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <h2>{strings[2050] || "This is not your home settlement. You cannot access banking services in any settlement but your own."}</h2>
            </div>
          ) : isContentLoading ? (
            <p>{strings[98]}</p>
          ) : (
            <>
              {/* Active phase showing current offers */}
              {bankPhase === "active" ? (
                <>
                  <h3>{strings["1402"]}</h3> {/* "These offers good for" */}
                  <h2 className="countdown-timer">{bankTimer}</h2>
                  {bankOffers.length > 0 ? (
                    bankOffers.map((offer, index) => {
                      // Calculate player's total quantity from inventory and backpack
                      const inventoryQty = inventory?.find(item => item.type === offer.itemBought)?.quantity || 0;
                      const backpackQty = backpack?.find(item => item.type === offer.itemBought)?.quantity || 0;
                      const playerQty = inventoryQty + backpackQty;

                      return (
                        <ResourceButton
                          key={index}
                          className={coolingDownButtons.has(index) ? 'cooldown' : ''}
                          style={coolingDownButtons.has(index) ? { '--cooldown-duration': `${COOLDOWN_DURATION / 1000}s` } : {}}
                          onClick={() => handleTradeWithCooldown(offer, index)}
                          disabled={coolingDownButtons.has(index) || !canAfford({
                            ingredient1: offer.itemBought,
                            ingredient1qty: offer.qtyBought
                          }, inventory, backpack, 1)}
                          hideInfo={true}
                        >
                          <div className="resource-details">
                            <span><strong>{strings["1403"]}</strong></span> {/* "Will buy" */}
                            {getSymbol(offer.itemBought)} {offer.itemBought} x{offer.qtyBought} / {playerQty}
                            <br />
                            {strings["1404"]} {getSymbol(offer.itemGiven)} {offer.qtyGiven} {/* "for" */}
                          </div>
                        </ResourceButton>
                      );
                    })
                  ) : (
                    <p>{strings["1405"]}</p>
                  )}
                </>
              ) : (
                <>
                  <h3>{strings["1406"]}</h3> {/* "New offers" */}
                  <h3>{bankTimer}</h3>
                  <p>{strings["1407"]}</p> {/* "Generating new orders. Thank you for your patience." */}
                </>
              )}
            </>
          )}

          {isDeveloper && (
            <div className="station-panel-footer">
              <div className="shared-buttons">
                <TransactionButton
                  className="btn-basic btn-danger"
                  onAction={handleSellStation}
                  transactionKey={`sell-refund-Bank-${currentStationPosition?.x}-${currentStationPosition?.y}-${gridId}`}
                >
                  {strings[425] || "Sell for Refund"}
                </TransactionButton>
              </div>
            </div>
          )}
        </LevelLock>
      </Panel>
    );
}

export default BankPanel;