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
// the phase countdowns tick from the stored timers every second. One "article" per feature
// (Courthouse, Train, Bank, Carnival). Goods are listed one per line in the standard
// need / have treatment ("🌾 Wheat 40 / 12", green when the player has enough, red when not;
// inventory and backpack counted together), and countdowns are coloured text.

const playerHas = (type, inventory, backpack) =>
    (Array.isArray(inventory) ? inventory : []).filter(i => i.type === type).reduce((n, i) => n + (i.quantity || 0), 0)
    + (Array.isArray(backpack) ? backpack : []).filter(i => i.type === type).reduce((n, i) => n + (i.quantity || 0), 0);

/**
 * One good per line: symbol, name, need / have. `who` (a username) sits at the right of the
 * line; `done` (a filled Carnival order) greys the counts, since nothing is needed any more.
 */
function GoodsList({ goods, masterResources, strings, inventory, backpack }) {
    if (!goods?.length) return null;
    return (
        <ul className="tn-goods">
            {goods.map((g, i) => {
                const symbol = (masterResources || []).find(r => r.type === g.type)?.symbol || '';
                const have = playerHas(g.type, inventory, backpack);
                const cls = g.done ? 'tn-done' : (have >= (g.qty || 0) ? 'tn-enough' : 'tn-short');
                return (
                    <li key={`${g.type}-${i}`} className="tn-good">
                        <span className={cls}>{symbol} {getLocalizedString(g.type, strings)} {(g.qty || 0).toLocaleString()} / {have.toLocaleString()}</span>
                        {g.who && <span className="tn-who">{g.who}</span>}
                    </li>
                );
            })}
        </ul>
    );
}

const Timer = ({ value }) => (value ? <span className="tn-timer">{value}</span> : null);

function TownNewsPanel({ onClose, currentPlayer, masterResources, inventory, backpack }) {
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
    const [carnivalOffers, setCarnivalOffers] = useState([]);
    const [usernames, setUsernames] = useState({}); // playerId -> username, for Carnival orders
    
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
    const carnivalGoods = (carnivalOffers || []).map(o => ({
        type: o.itemBought, qty: o.qtyBought, done: !!o.filled,
        who: o.claimedBy ? (usernames[String(o.claimedBy)] || '…') : null,
    }));
    const carnivalCounts = {
        filled: carnivalOffers.filter(o => o.filled).length,
        claimed: carnivalOffers.filter(o => o.claimedBy && !o.filled).length,
        open: carnivalOffers.filter(o => !o.claimedBy).length,
    };

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

            // Carnival orders (shared by the settlement) and who claimed or filled them
            const carnival = settlement.carnival?.currentoffers || [];
            setCarnivalOffers(carnival);
            const ids = [...new Set(carnival.map(o => o.claimedBy).filter(Boolean).map(String))];
            const missing = ids.filter(id => !usernames[id]);
            if (missing.length) {
                const found = await Promise.all(missing.map(id =>
                    axios.get(`${API_BASE}/api/player/${id}`).then(r => [id, r.data?.username || '?']).catch(() => [id, '?'])));
                setUsernames(prev => ({ ...prev, ...Object.fromEntries(found) }));
            }

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
                    <div className="tn-article-head">{getLocalizedString('Courthouse', strings)}</div>
                    {electionPhase === "Campaigning" && <p>{strings["1505"]}</p>}
                    {electionPhase === "Voting" && <p>{strings["1506"]} {strings["10121"]} <Timer value={electionTimer} /></p>}
                    {electionPhase === "Counting" && <p>{strings["1518"]} <Timer value={electionTimer} /></p>}
                </section>
            )}

            {showTrain && (
                <section className="tn-article">
                    <div className="tn-article-head">{getLocalizedString('Train', strings)}</div>
                    {trainPhase === "arriving" && (
                        <>
                            <p>{strings["1507"]}</p>
                            <GoodsList goods={currentGoods} masterResources={masterResources} strings={strings} inventory={inventory} backpack={backpack} />
                        </>
                    )}
                    {trainPhase === "loading" && (
                        <>
                            <p>{strings["1509"]}</p>
                            <GoodsList goods={currentGoods} masterResources={masterResources} strings={strings} inventory={inventory} backpack={backpack} />
                            <p>{strings["1517"]} <Timer value={trainTimer} /></p>
                        </>
                    )}
                    {trainPhase === "departing" && (
                        <>
                            <p>{strings["1513"]} <Timer value={trainTimer} /></p>
                            <p>{strings["1514"]}</p>
                            <GoodsList goods={nextGoods} masterResources={masterResources} strings={strings} inventory={inventory} backpack={backpack} />
                        </>
                    )}
                </section>
            )}

            {showBank && (
                <section className="tn-article">
                    <div className="tn-article-head">{getLocalizedString('Bank', strings)}</div>
                    {bankPhase === "active" && (
                        <>
                            <p>{strings["1516"]}</p>
                            <GoodsList goods={bankGoods} masterResources={masterResources} strings={strings} inventory={inventory} backpack={backpack} />
                            <p>{strings[10124]} <Timer value={bankTimer} /></p>
                        </>
                    )}
                    {bankPhase === "refreshing" && <p>{strings["1511"]}</p>}
                </section>
            )}

            {carnivalOffers.length > 0 && (
                <section className="tn-article">
                    <div className="tn-article-head">{getLocalizedString('Carnival', strings)}</div>
                    <p className="tn-counts">
                        {strings[2002] || 'Completed'} {carnivalCounts.filled} · {strings[2007] || 'Claimed'} {carnivalCounts.claimed} · {strings[10156] || 'Available'} {carnivalCounts.open}
                    </p>
                    <GoodsList goods={carnivalGoods} masterResources={masterResources} strings={strings} inventory={inventory} backpack={backpack} />
                </section>
            )}
          </div>
        </Panel>
    );
}

export default TownNewsPanel;