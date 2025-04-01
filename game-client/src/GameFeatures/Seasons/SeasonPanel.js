import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import { formatCountdown } from '../../UI/Timers';
function SeasonPanel({ onClose, currentPlayer }) {
  const [countdown, setCountdown] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [richestCitizens, setRichestCitizens] = useState([]);
  const [seasonCycle, setSeasonCycle] = useState([]);


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


  // ✅ Fetch wealthiest citizens based on net worth
  useEffect(() => {
    const fetchRichestCitizens = async () => {
      if (!currentPlayer || !currentPlayer.settlementId) {
        console.warn("⚠️ currentPlayer or settlementId is not available yet.");
        return;
      }
      try {
        console.log("💰 Fetching wealthiest citizens for settlement:", currentPlayer.settlementId);
        
        // ✅ Fetch all players in this settlement
        const response = await axios.get(`${API_BASE}/api/get-players-by-settlement/${currentPlayer.settlementId}`);
        const players = response.data;

        // ✅ Sort players by Net Worth
        const sortedPlayers = players
          .map(player => ({
            username: player.username,
            netWorth: player.netWorth || 0 // ✅ Use netWorth instead of Money
          }))
          .sort((a, b) => b.netWorth - a.netWorth) // ✅ Sort in descending order
          .slice(0, 10); // ✅ Take the top 10

        setRichestCitizens(sortedPlayers);
      } catch (error) {
        console.error("❌ Error fetching richest citizens:", error);
      }
    };

    fetchRichestCitizens();
  }, [currentPlayer]); // ✅ Runs when `currentPlayer` updates


    // ✅ Get current season data from local storage
  const seasonData = getSeasonData();
  const nextSeasonType = getNextSeason(seasonData?.type);


  return (
    <Panel onClose={onClose} descriptionKey="1015" titleKey="1115" panelName="SeasonPanel">
      {seasonData?.phase === "onSeason" ? (
        <>
          <h2>{seasonData?.type || "Loading..."}</h2>
          <p>Season ends in: {countdown}</p>
        </>
      ) : (
        <>
          <h2>We are in between seasons.</h2>
        </>
      )}

      <br></br>
      <br></br>

      {/* ✅ Richest Wealthiest Section */}
      <h3>💰 This Settlement's Wealthiest Citizens</h3>
      <p>Calculated net worth is a sum of inventory, buildings, skills, and money.</p>
      <p>Net worth is re-calculated only at tax time, and on season completion.</p>
      {richestCitizens.length > 0 ? (
        <div>
          {richestCitizens.map((citizen, index) => (
            <p key={index}>
              {index + 1}. <strong>{citizen.username}</strong> : {citizen.netWorth}
            </p>
          ))}
        </div>
      ) : (
        <p>No data available for wealthiest citizens.</p>
      )}


    </Panel>
  );
}

export default SeasonPanel;