import API_BASE from '../../config.js';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import ResourceButton from '../../UI/ResourceButton';
import { refreshPlayerAfterInventoryUpdate, checkAndDeductIngredients } from '../../Utils/InventoryManagement';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import FloatingTextManager from '../../UI/FloatingText';

function BankPanel({ onClose, currentPlayer, setCurrentPlayer, updateStatus }) {
    const [bankOffers, setBankOffers] = useState([]);
    const [bankTimer, setBankTimer] = useState("");  
    const [allResources, setAllResources] = useState([]); // ✅ Fetch resources dynamically

    // ✅ Fetch bank offers from server
    useEffect(() => {
        const fetchBankOffers = async () => {
            if (!currentPlayer?.frontierId) return;

            try {
                const response = await axios.get(`${API_BASE}/api/get-frontier/${currentPlayer.frontierId}`);
                
                // ✅ Update Offers
                setBankOffers(response.data.bank?.offers || []);
                
                // ✅ Sync with bank timer
                const nextBankTime = response.data.bank?.endTime ? new Date(response.data.bank.endTime).getTime() : null;
                const updateTimer = () => {
                    const now = Date.now();
                    setBankTimer(formatCountdown(nextBankTime, now));
                };

                updateTimer();
                const interval = setInterval(updateTimer, 1000);
                return () => clearInterval(interval);

            } catch (error) {
                console.error('❌ Error fetching bank offers:', error);
            }
        };

        const fetchResources = async () => {
            try {
                const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
                setAllResources(resourcesResponse.data || []);
            } catch (error) {
                console.error("❌ Error fetching master resources:", error);
            }
        };

        fetchBankOffers();
        fetchResources(); // ✅ Fetch master resources dynamically

    }, [currentPlayer]);

    // ✅ Format countdown
    const formatCountdown = (endTime, now) => {
        if (!endTime || now >= endTime) return "Updating...";
        const seconds = Math.floor((endTime - now) / 1000);
        const minutes = Math.floor(seconds / 60) % 60;
        const hours = Math.floor(seconds / 3600) % 24;
        const days = Math.floor(seconds / 86400);
        return `${days}d ${hours}h ${minutes}m ${seconds % 60}s`;
    };

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
            <h3>Offers Update in</h3>
            <h2>{bankTimer}</h2>

            {/* ✅ Render Offers */}
            {bankOffers.length > 0 ? (
                bankOffers.map((offer, index) => (
                    <ResourceButton
                        key={index}
                        className="resource-button"
                        onClick={() => handleTrade(offer)}
                        disabled={!currentPlayer.inventory.some((item) => item.type === offer.itemBought && item.quantity >= offer.qtyBought)}
                        hideInfo={true} // ✅ Prevents the "i" button from appearing
                    >
                        <div className="resource-details">
                            <span><strong>Will buy</strong> </span>
                            {getSymbol(offer.itemBought)} {offer.itemBought} x{offer.qtyBought}
                            <br></br> 
                            for {getSymbol(offer.itemGiven)} {offer.qtyGiven}
                        </div>
                    </ResourceButton>
                ))
            ) : (
                <p>Waiting...</p>
            )}
        </Panel>
    );
}

export default BankPanel;