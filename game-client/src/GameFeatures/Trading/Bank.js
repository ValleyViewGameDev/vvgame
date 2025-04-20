import API_BASE from '../../config.js';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import ResourceButton from '../../UI/ResourceButton';
import { refreshPlayerAfterInventoryUpdate, checkAndDeductIngredients } from '../../Utils/InventoryManagement';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import { formatCountdown } from '../../UI/Timers.js';
import strings from '../../UI/strings.json';

function BankPanel({ onClose, currentPlayer, setCurrentPlayer, updateStatus }) {
    const [bankOffers, setBankOffers] = useState([]);
    const [bankTimer, setBankTimer] = useState("");
    const [allResources, setAllResources] = useState([]);
    const [bankPhase, setBankPhase] = useState("");

    // Fetch data - separated from timer logic
    const fetchBankOffers = async () => {
        try {
            const response = await axios.get(`${API_BASE}/api/get-frontier/${currentPlayer.frontierId}`);
            setBankOffers(response.data.bank?.offers || []);
            setBankPhase(response.data.bank?.phase || "");
        } catch (error) {
            console.error('❌ Error fetching bank offers:', error);
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
        const fetchResources = async () => {
            try {
                const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
                setAllResources(resourcesResponse.data || []);
            } catch (error) {
                console.error("❌ Error fetching master resources:", error);
            }
        };

        if (currentPlayer?.frontierId) {
            fetchBankOffers();
            fetchResources();
        }
    }, [currentPlayer]);

    // ✅ Handle trade transaction
    const handleTrade = async (offer) => {
        if (!offer || !currentPlayer) return;

        // ✅ Check if player has enough items
        const success = checkAndDeductIngredients({ type: offer.itemBought, quantity: offer.qtyBought }, currentPlayer.inventory);
        if (!success) {
            updateStatus(`❌ Not enough ${offer.itemBought}`);
            return;
        }

        // ✅ Update inventory: Remove "bought" item, Add "given" item
        const updatedInventory = [...currentPlayer.inventory]
            .map((item) =>
                item.type === offer.itemBought 
                    ? { ...item, quantity: item.quantity - offer.qtyBought } 
                    : item
            )
            .filter((item) => item.quantity > 0); // ✅ Remove items with 0 quantity

        // ✅ Add "given" item (Money) to inventory **without duplicates**
        const givenItemIndex = updatedInventory.findIndex(item => item.type === offer.itemGiven);
        if (givenItemIndex >= 0) {
            updatedInventory[givenItemIndex].quantity += offer.qtyGiven;
        } else {
            updatedInventory.push({ type: offer.itemGiven, quantity: offer.qtyGiven });
        }

        // ✅ Save updated inventory to DB
        await axios.post(`${API_BASE}/api/update-inventory`, {
            playerId: currentPlayer.playerId,
            inventory: updatedInventory,
        });

        setCurrentPlayer((prev) => ({ ...prev, inventory: updatedInventory }));
        updateStatus(`✅ Exchanged ${offer.qtyBought} ${offer.itemBought} for ${offer.qtyGiven} ${offer.itemGiven}`);
    };

    // ✅ Lookup function for symbols from `allResources`
    const getSymbol = (resourceType) => {
        const resource = allResources.find(res => res.type === resourceType);
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
            <div className="debug-section" style={{ marginTop: '20px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
                <button 
                    className="debug-button" 
                    onClick={handleRefreshOffers}
                    style={{ 
                        padding: '5px 10px',
                        backgroundColor: '#444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    🔄 Debug: Refresh Bank Offers
                </button>
            </div>
        </Panel>
    );
}

export default BankPanel;