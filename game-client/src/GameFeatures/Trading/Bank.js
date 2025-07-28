import API_BASE from '../../config.js';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import ResourceButton from '../../UI/ResourceButton';
import { refreshPlayerAfterInventoryUpdate, spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import { formatCountdown } from '../../UI/Timers.js';
import { useStrings } from '../../UI/StringsContext';

function BankPanel({ 
    onClose, 
    inventory,
    setInventory,
    backpack,
    setBackpack,
    currentPlayer, 
    setCurrentPlayer, 
    updateStatus,
    masterResources, }) 
{
    const strings = useStrings();
    const [isContentLoading, setIsContentLoading] = useState(false);
    const [bankOffers, setBankOffers] = useState([]);
    const [bankTimer, setBankTimer] = useState("");
    const [bankPhase, setBankPhase] = useState("");

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
    }, [currentPlayer]);

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
        });

        if (!gainSuccess) return;

        await trackQuestProgress(currentPlayer,'Sell',offer.itemBought,offer.qtyBought,setCurrentPlayer);

        updateStatus(`✅ Exchanged ${offer.qtyBought} ${offer.itemBought} for ${offer.qtyGiven} ${offer.itemGiven}.`);
    };

    // ✅ Lookup function for symbols from `masterResources`
    const getSymbol = (resourceType) => {
        const resource = masterResources.find(res => res.type === resourceType);
        return resource?.symbol || "❓"; // Default to question mark if no symbol found
    };

    const handleRefreshOffers = async () => {
        try {
            const response = await axios.post(
                `${API_BASE}/api/debug/refresh-bank-offers/${currentPlayer.location.f}`
            );
            if (response.data.success) {
                fetchBankOffers();
            }
        } catch (error) {
            console.error('Failed to refresh bank offers:', error);
        }
    };

    return (
      <Panel onClose={onClose} descriptionKey="1017" titleKey="1117" panelName="BankPanel">
        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {/* Active phase showing current offers */}
            {bankPhase === "active" ? (
              <>
                <h3>{strings["1402"]}</h3> {/* "These offers good for" */}
                <h2>{bankTimer}</h2>
                {bankOffers.length > 0 ? (
                  bankOffers.map((offer, index) => (
                    <ResourceButton
                      key={index}
                      className="resource-button"
                      onClick={() => handleTrade(offer)}
                      disabled={!currentPlayer.inventory.some((item) => 
                        item.type === offer.itemBought && 
                        item.quantity >= offer.qtyBought
                      )}
                      hideInfo={true}
                    >
                      <div className="resource-details">
                        <span><strong>{strings["1403"]}</strong></span> {/* "Will buy" */}
                        {getSymbol(offer.itemBought)} {offer.itemBought} x{offer.qtyBought}
                        <br />
                        {strings["1404"]} {getSymbol(offer.itemGiven)} {offer.qtyGiven} {/* "for" */}
                      </div>
                    </ResourceButton>
                  ))
                ) : (
                  <p>{strings["1405"]}</p>  
                )}
              </>
            ) : (
              <>
                <h3>{strings["1406"]}</h3> {/* "New offers in" */}
                <h2>{bankTimer}</h2>
                <p>{strings["1407"]}</p> {/* "Generating new orders. Thank you for your patience." */}
              </>
            )}
          </>
        )}
      </Panel>
    );
}

export default BankPanel;