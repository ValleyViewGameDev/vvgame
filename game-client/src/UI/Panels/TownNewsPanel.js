import API_BASE from '../../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Panel from './Panel';
import './TownNewsPanel.css';
import { useStrings } from '../StringsContext';
import { formatCountdown } from '../Timers';
import { getMayorUsername } from '../../GameFeatures/Government/GovUtils';
import { getLocalizedString } from '../../Utils/stringLookup';

// Town News: a right panel opened by the floating 📰 button under the season button
// (docs/ui-conventions.md §3). Settlement and bank data are fetched on open and every 30 s;
// the phase countdowns tick from the stored timers every second. Three "articles"
// (Courthouse, Train, Bank), goods shown as icon chips like the other trading UIs, and every
// countdown in its own coloured pill (UI-2, 2026-10-09).

/** One good as an icon chip: the resource's SVG when it has one, else its emoji, then name and qty. */
function GoodChip({ type, qty, masterResources, strings }) {
    const def = (masterResources || []).find(r => r.type === type);
    return (
        <span className="tn-good">
            {def?.filename
                ? <img className="tn-good-icon" src={`/assets/resources/${def.filename}`} alt="" />
                : <span className="tn-good-icon">{def?.symbol || '📦'}</span>}
            <span className="tn-good-name">{getLocalizedString(type, strings)}</span>
            {qty > 0 && <span className="tn-good-qty">×{qty.toLocaleString()}</span>}
        </span>
    );
}

function GoodsList({ goods, masterResources, strings }) {
    if (!goods?.length) return null;
    return (
        <div className="tn-goods">
            {goods.map((g, i) => <GoodChip key={`${g.type}-${i}`} {...g} masterResources={masterResources} strings={strings} />)}
        </div>
    );
}

const Timer = ({ value }) => (value ? <span className="tn-timer">⏳ {value}</span> : null);

function TownNewsPanel({ onClose, currentPlayer, masterResources }) {
    const strings = useStrings();
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

    // Goods for the chips. The Train is per player since the single-player refactor
    // (Player.train.*TrainOffers: item, quantity); the settlement's old shared offers
    // (itemBought, qtyBought) are only a fallback until the player's Train has been generated.
    const trainGoods = (playerOffers, settlementOffers) => {
        if (playerOffers?.length) return playerOffers.map(o => ({ type: o.item, qty: o.quantity }));
        return (settlementOffers || []).map(o => ({ type: o.itemBought, qty: o.qtyBought }));
    };
    const currentGoods = trainGoods(currentPlayer?.train?.currentTrainOffers, currentTrainOffers);
    const nextGoods = trainGoods(currentPlayer?.train?.nextTrainOffers, nextTrainOffers);
    const bankGoods = (bankOffers || []).map(o => ({ type: o.itemBought, qty: o.qtyBought }));

    const updateTimers = () => {
        const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
        setBankPhase(storedTimers.bank?.phase || "");
        setTrainPhase(storedTimers.train?.phase || "");
        setElectionPhase(storedTimers.elections?.phase || "");
        const now = Date.now();
        setTrainTimer(formatCountdown(storedTimers.train?.endTime, now));
        setElectionTimer(formatCountdown(storedTimers.elections?.endTime, now));
        setBankTimer(formatCountdown(storedTimers.bank?.endTime, now));
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

        } catch (error) {
            console.error('Error fetching town data:', error);
        }
    };
 
    // Initial fetch and timer updates
    useEffect(() => {
        fetchTownData();
        updateTimers();
        const dataInterval = setInterval(fetchTownData, 30000);
        const timerInterval = setInterval(updateTimers, 1000);
        return () => { clearInterval(dataInterval); clearInterval(timerInterval); };
    }, [currentPlayer?.settlementId, currentPlayer?.frontierId]); // eslint-disable-line react-hooks/exhaustive-deps

    const showElection = ['Campaigning', 'Voting', 'Counting'].includes(electionPhase);
    const showTrain = ['arriving', 'departing', 'loading'].includes(trainPhase);
    const showBank = ['active', 'refreshing'].includes(bankPhase);

    return (
        <Panel onClose={onClose} panelName="TownNewsPanel" title={strings[5040]}>
          <div className="town-news-panel">
            <h3>{strings["1501"]} "{settlementName || "..."}"</h3>

            {mayor ? (
                /* The current mayor is */
                <p className="tn-standfirst">{strings["1502"]} {mayor}{strings["1503"]} {taxRate}%.</p>
            ) : (
                /* No mayor */
                <p className="tn-standfirst">{strings["1512"]} {strings["1515"]} {taxRate}%.</p>
            )}

            <h4>{strings["1504"]}</h4>

            {showElection && (
                <section className="tn-article">
                    <div className="tn-article-head">🗳️ {getLocalizedString('Courthouse', strings)}</div>
                    {electionPhase === "Campaigning" && <p>{strings["1505"]}</p>}
                    {electionPhase === "Voting" && <p>{strings["1506"]} {strings["10121"]} <Timer value={electionTimer} /></p>}
                    {electionPhase === "Counting" && <p>{strings["1518"]} <Timer value={electionTimer} /></p>}
                </section>
            )}

            {showTrain && (
                <section className="tn-article">
                    <div className="tn-article-head">🚂 {getLocalizedString('Train', strings)}</div>
                    {trainPhase === "arriving" && (
                        <>
                            <p>{strings["1507"]}</p>
                            <GoodsList goods={currentGoods} masterResources={masterResources} strings={strings} />
                        </>
                    )}
                    {trainPhase === "loading" && (
                        <>
                            <p>{strings["1509"]}</p>
                            <GoodsList goods={currentGoods} masterResources={masterResources} strings={strings} />
                            <p>{strings["1517"]} <Timer value={trainTimer} /></p>
                        </>
                    )}
                    {trainPhase === "departing" && (
                        <>
                            <p>{strings["1513"]} <Timer value={trainTimer} /></p>
                            <p>{strings["1514"]}</p>
                            <GoodsList goods={nextGoods} masterResources={masterResources} strings={strings} />
                        </>
                    )}
                </section>
            )}

            {showBank && (
                <section className="tn-article">
                    <div className="tn-article-head">🏦 {getLocalizedString('Bank', strings)}</div>
                    {bankPhase === "active" && (
                        <>
                            <p>{strings["1516"]}</p>
                            <GoodsList goods={bankGoods} masterResources={masterResources} strings={strings} />
                            <p>{strings[10124]} <Timer value={bankTimer} /></p>
                        </>
                    )}
                    {bankPhase === "refreshing" && <p>{strings["1511"]}</p>}
                </section>
            )}
          </div>
        </Panel>
    );
}

export default TownNewsPanel;