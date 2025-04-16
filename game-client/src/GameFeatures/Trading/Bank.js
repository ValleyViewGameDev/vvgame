import API_BASE from '../../config.js';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import ResourceButton from '../../UI/ResourceButton';
import { refreshPlayerAfterInventoryUpdate, checkAndDeductIngredients } from '../../Utils/InventoryManagement';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import FloatingTextManager from '../../UI/FloatingText';
import { formatCountdown } from '../../UI/Timers.js';

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

    return (
        <Panel onClose={onClose} descriptionKey="1017" titleKey="1117" panelName="BankPanel">
            {bankPhase === "active" ? (
                <>
                    <h3>These offers good for</h3>
                    <h2>{bankTimer}</h2>
                    {bankOffers.length > 0 ? (
                        bankOffers.map((offer, index) => (
                            <ResourceButton
                                key={index}
                                className="resource-button"
                                onClick={() => handleTrade(offer)}
                                disabled={!currentPlayer.inventory.some((item) => item.type === offer.itemBought && item.quantity >= offer.qtyBought)}
                                hideInfo={true}
                            >
                                <div className="resource-details">
                                    <span><strong>Will buy</strong> </span>
                                    {getSymbol(offer.itemBought)} {offer.itemBought} x{offer.qtyBought}
                                    <br />
                                    for {getSymbol(offer.itemGiven)} {offer.qtyGiven}
                                </div>
                            </ResourceButton>
                        ))
                    ) : (
                        <p>No offers available at the moment.</p>
                    )}
                </>
            ) : (
                <>
                    <h3>New offers in</h3>
                    <h2>{bankTimer}</h2>
                    <p>Generating new orders. Thank you for your patience.</p>
                </>
            )}
        </Panel>
    );
}

export default BankPanel;