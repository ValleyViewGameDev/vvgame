import API_BASE from '../config';
import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import Modal from './Modal';
import './TownNews.css';
import { StatusBarContext } from './StatusBar';
import strings from './strings.json';
import { formatCountdown } from './Timers';
import { getMayorUsername } from '../GameFeatures/Government/GovUtils';

function TownNews({ onClose, currentPlayer, setCurrentPlayer }) {
    // Settlement data
    const [settlementName, setSettlementName] = useState("");
    const [mayor, setMayor] = useState("");
    const [taxRate, setTaxRate] = useState(0);

    // Timer states
    const [electionPhase, setElectionPhase] = useState("");
    const [trainPhase, setTrainPhase] = useState("");
    const [bankPhase, setBankPhase] = useState("");
    
    // Offer states
    const [currentTrainOffers, setCurrentTrainOffers] = useState([]);
    const [nextTrainOffers, setNextTrainOffers] = useState([]);
    const [bankOffers, setBankOffers] = useState([]);
    
    // Countdown timers
    const [trainTimer, setTrainTimer] = useState("");
    const [electionTimer, setElectionTimer] = useState("");
    const [bankTimer, setBankTimer] = useState("");

    // Simplify to just show unique items
    const formatOffers = (offers) => {
        if (!offers?.length) return "no items";
        const uniqueItems = [...new Set(offers.map(offer => offer.itemBought))];
        return uniqueItems.join(", ");
    };

    const fetchTownData = async () => {
        try { 
            // Fetch settlement data
            const settlementResponse = await axios.get(
                `${API_BASE}/api/get-settlement/${currentPlayer.settlementId}`);
            const settlement = settlementResponse.data;
            
            console.log("Settlement data fetched:", settlement);
            setSettlementName(settlement.displayName);
            setTaxRate(settlement.taxrate);

            const mayorName = await getMayorUsername(currentPlayer.settlementId);
            console.log("👑 Mayor:", mayorName);
            setMayor(mayorName);

            // Get current train offers
            setCurrentTrainOffers(settlement.currentoffers);
            setNextTrainOffers(settlement.nextoffers);

            // Get Bank offers from frontier
            const frontierResponse = await axios.get(`${API_BASE}/api/get-frontier/${currentPlayer.frontierId}`);
            setBankOffers(frontierResponse.data.bank?.offers || []);

            // Get phases and timers from localStorage
            const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
            setBankPhase(storedTimers.bank?.phase || "");
            setTrainPhase(storedTimers.train?.phase || "");
            setElectionPhase(storedTimers.elections?.phase || "");

            // Update timers
            const now = Date.now();
            setTrainTimer(formatCountdown(storedTimers.train?.endTime, now));
            setElectionTimer(formatCountdown(storedTimers.elections?.endTime, now));
            setBankTimer(formatCountdown(storedTimers.bank?.endTime, now));

        } catch (error) {
            console.error('Error fetching town data:', error);
        }
    };
 
    // Initial fetch and timer updates
    useEffect(() => {
        fetchTownData();
        const interval = setInterval(fetchTownData, 1000);
        return () => clearInterval(interval);
    }, [currentPlayer]);

    return (
        <Modal 
            onClose={onClose} 
            className="modal-TownNews"
            size="standard"
        >
            <h3>{strings["1501"]} "{settlementName || "..."}"</h3>
            
            {mayor ? (
                /* The current mayor is */
                <p>{strings["1502"]} {mayor}{strings["1503"]} {taxRate}%.</p>  
            ) : (
                /* No mayor */
                <> <p>{strings["1512"]} {strings["1515"]} {taxRate}%.</p>  </>
            )}
            
            <h4>{strings["1504"]}</h4>

            {/* Election Updates */}
            {electionPhase === "Campaigning" && (
                <p>{strings["1505"]}</p>
            )}
            {electionPhase === "Voting" && (
                <p>{strings["1506"]}</p>
            )}
            {electionPhase === "Counting" && (
                <p>{strings["1518"]} {electionTimer}.</p>
            )}

            {/* Modified Train Updates */}
            {trainPhase === "arriving" && (
                <p>{strings["1507"]} {formatOffers(currentTrainOffers)}.</p>
            )}
            {trainPhase === "departing" && (
                <p>{strings["1513"]} {trainTimer}. {strings["1514"]} {formatOffers(nextTrainOffers)}.</p>
            )}
            {trainPhase === "loading" && (
                <>
                    <p>{strings["1509"]} {formatOffers(currentTrainOffers)}. {strings["1517"]} {trainTimer}.</p>
                </>
            )}

            {/* Bank Updates */}
            {bankPhase === "active" && (
                <p>{strings["1516"]} {formatOffers(bankOffers)}.</p>
            )}
            {bankPhase === "refreshing" && (
                <p>{strings["1511"]}</p>
            )}
        </Modal>
    );
}

export default TownNews;