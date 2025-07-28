import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import { formatCountdown } from '../../UI/Timers';
import '../../UI/Modal.css';
import { calculateSettlementPopulation } from '../../Utils/PopulationUtils';

function SeasonPanel({ onClose, currentPlayer, setModalContent, setIsModalOpen }) {
  const [countdown, setCountdown] = useState("");
  const [topCitizens, setTopCitizens] = useState([]);
  const [topSettlementName, setTopSettlementName] = useState("");
  const [seasonCycle, setSeasonCycle] = useState([]);
  const [highestWealth, setHighestWealth] = useState(0);
  const [settlementMap, setSettlementMap] = useState({});


  // ✅ Fetch season data from local storage
  const getSeasonData = () => {
    const storedTimers = JSON.parse(localStorage.getItem("timers"));
    return storedTimers?.seasons || { type: "Unknown", phase: "Unknown", endTime: null };
  };

  const getNextSeason = (currentSeason) => {
    if (!seasonCycle.length || !currentSeason) return "Unknown";
    const currentIndex = seasonCycle.findIndex(s => s.seasonType === currentSeason);
    const nextIndex = (currentIndex + 1) % seasonCycle.length;
    return seasonCycle[nextIndex]?.seasonType || "Unknown";
  };
  
  useEffect(() => {
    const fetchSeasonCycle = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/tuning/seasons`);
        setSeasonCycle(response.data);
      } catch (error) {
        console.error("❌ Failed to fetch season cycle", error);
      }
    };
  
    fetchSeasonCycle();
  }, []);

  // ✅ Compute real-time countdown from local timer state
  useEffect(() => {
    const updateCountdown = () => {
      const seasonData = getSeasonData();
      const now = new Date();
      const end = new Date(seasonData?.endTime);
      setCountdown(formatCountdown(end, now));
    };
  
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);


  // ✅ Fetch top 3 wealthiest citizens across the frontier and leading settlement
  useEffect(() => {
    const fetchTopCitizensAndSettlement = async () => {
      if (!currentPlayer || !currentPlayer.frontierId) {
        console.warn("⚠️ currentPlayer or frontierId is not available yet.");
        return;
      }
      try {
        console.log("💰 Fetching top citizens and leading settlement for frontier:", currentPlayer.frontierId);
        
        // Fetch all players in this frontier
        const response = await axios.get(`${API_BASE}/api/get-players-by-frontier/${currentPlayer.frontierId}`);
        const players = response.data;

        const settlementRes = await axios.get(`${API_BASE}/api/settlements`);
        const settlements = settlementRes.data;
        const settlementMap = settlements.reduce((acc, s) => {
          acc[s._id] = s.displayName || s.name || "Unknown Settlement";
          return acc;
        }, {});
        setSettlementMap(settlementMap);

        // Group players by settlementId and sum their net worths
        const settlementWealthMap = {};
        players.forEach(player => {
          const settlementId = player.settlementId || "unknown";
          const netWorth = player.netWorth || 0;
          if (!settlementWealthMap[settlementId]) {
            settlementWealthMap[settlementId] = { totalNetWorth: 0, settlementName: settlementMap[settlementId] || "Unknown Settlement" };
          }
          settlementWealthMap[settlementId].totalNetWorth += netWorth;
        });

        // Find the settlement with highest total net worth
        let leadingSettlementId = null;
        let highestWealth = -1;
        for (const [settlementId, data] of Object.entries(settlementWealthMap)) {
          if (data.totalNetWorth > highestWealth) {
            highestWealth = data.totalNetWorth;
            leadingSettlementId = settlementId;
          }
        }
        const leadingSettlementName = leadingSettlementId && settlementWealthMap[leadingSettlementId] ? settlementWealthMap[leadingSettlementId].settlementName : "No data available";
        // Add logic to retrieve population using derived calculation:
        let leadingSettlementPopulation = "Unknown";
        if (leadingSettlementId && settlements) {
          const matching = settlements.find(s => s._id === leadingSettlementId);
          if (matching) {
            leadingSettlementPopulation = calculateSettlementPopulation(matching);
          }
        }
        // store population into settlementMap with a compound key to retrieve later
        if (leadingSettlementName) {
          settlementMap[leadingSettlementName + "_pop"] = leadingSettlementPopulation;
        }
        setHighestWealth(highestWealth);

        // Sort all players by net worth and take top 3
        const topPlayers = players
          .map(player => ({
            username: player.username,
            netWorth: player.netWorth || 0
          }))
          .sort((a, b) => b.netWorth - a.netWorth)
          .slice(0, 3);

        setTopCitizens(topPlayers);
        setTopSettlementName(leadingSettlementName);
      } catch (error) {
        console.error("❌ Error fetching top citizens and settlement:", error);
      }
    };

    fetchTopCitizensAndSettlement(); 
  }, [currentPlayer]); // Runs when `currentPlayer` updates


    // ✅ Get current season data from local storage
  const seasonData = getSeasonData();
  const nextSeasonType = getNextSeason(seasonData?.type);


  // New: Function to fetch and open season log
  const handleShowSeasonLog = async () => {
    if (!currentPlayer?.frontierId) { 
      console.warn("⚠️ Cannot show season log: frontierId missing.");
      return;
    }

    console.log("📜 Fetching season log for frontier:", currentPlayer.frontierId);

    try {
      const response = await axios.get(`${API_BASE}/api/frontier/${currentPlayer.frontierId}/seasonlog`);
      const seasonlog = response.data.seasonlog || [];

      const seasonLogTable = (
        <table className="season-log-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 12px" }}>Season</th>
              <th style={{ padding: "6px 12px" }}>Date</th>
              <th style={{ padding: "6px 12px" }}>Top Settlement</th>
              <th style={{ padding: "6px 12px" }}>Top Players by Net Worth</th>
              <th style={{ padding: "6px 12px" }}>Grids Reset</th>
              <th style={{ padding: "6px 12px" }}>Players Relocated</th>
            </tr>
          </thead>
          <tbody>
            {[...seasonlog].reverse().map((entry, i) => (
              <tr key={i}>
                <td style={{ padding: "6px 12px" }}>#{entry.seasonnumber} {entry.seasontype}</td>
                <td style={{ padding: "6px 12px" }}>{new Date(entry.date).toLocaleDateString()}</td>
                <td style={{ padding: "6px 12px" }}>{entry.winningsettlement}</td>
                <td style={{ padding: "6px 12px", whiteSpace: "pre-line" }}>
                  {entry.seasonwinners.map(w => `${w.username}: ${w.networth.toLocaleString()}`).join('\n')}
                </td>
                <td style={{ padding: "6px 12px" }}>{entry.gridsreset}</td>
                <td style={{ padding: "6px 12px" }}>{entry.playersrelocated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

      setModalContent({
        title: "Season Log",
        size: "large",
        message: seasonlog.length === 0 ? "No season history found." : undefined,
        custom: seasonLogTable,
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error("❌ Failed to fetch season log:", error);
      setModalContent({
        title: "Error",
        message: "Failed to load season log.",
        size: "small",
      });
      setIsModalOpen(true);
    }
  };


  return (
    <Panel onClose={onClose} descriptionKey="1015" titleKey="1115" panelName="SeasonPanel">
      {seasonData?.phase === "onSeason" ? (
        <>
          <h2>It's {seasonData?.type || "Loading..."}</h2>
          <p>Season ends in: {countdown}</p>
        </>
      ) : (
        <>
          <h2>We are in between seasons.</h2>
        </>
      )}

      <br></br>

      <p>At the end of the season, bonus rewards will be sent to the top players in the Frontier, as well as to all players in the top Settlement.</p>
      <h3>🏆 Top Citizens in the Frontier</h3>
      <p>(Net Worth is recalculated once per day)</p>
      {topCitizens.length > 0 ? (
        <div>
          {topCitizens.map((citizen, index) => (
            <p key={index}>
              {index + 1}. <strong>{citizen.username}</strong> : {citizen.netWorth.toLocaleString()}
            </p>
          ))}
        </div>
      ) : (
        <p>No data available for top citizens.</p>
      )}

      <h3>🏙️ Leading Settlement</h3>
      {topSettlementName ? (
        <>
          <p><strong>{topSettlementName}</strong></p>
          <p>Total Wealth: {highestWealth.toLocaleString()}</p>
          <p>Population: {settlementMap[topSettlementName + "_pop"]?.toLocaleString() || "Unknown"}</p>
        </>
      ) : (
        <p>No data available</p>
      )}

      <div className="panel-buttons">
        <button className="btn-success"
          onClick={handleShowSeasonLog} 
          style={{ marginTop: "20px", padding: "10px", fontWeight: "bold" }}
        >
          View Season Log
        </button>
      </div>
    </Panel>
  );
}

export default SeasonPanel;