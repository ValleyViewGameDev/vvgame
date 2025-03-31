import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';

function SeasonPanel({ onClose, currentPlayer }) {
  const [countdown, setCountdown] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [richestCitizens, setRichestCitizens] = useState([]);

  // ✅ Fetch season data from local storage
  const getSeasonData = () => {
    const storedTimers = JSON.parse(localStorage.getItem("timers"));
    return storedTimers?.seasons || { type: "Unknown", phase: "Unknown", endTime: null };
  };

  // ✅ Compute real-time countdown from local timer state
  useEffect(() => {
    const updateCountdown = () => {
      const seasonData = getSeasonData();
      if (!seasonData?.endTime) {
        setCountdown("N/A");
        return;
      }
      const now = new Date();
      const endTime = new Date(seasonData.endTime);
      const timeDiff = endTime - now;

      if (timeDiff <= 0) {
        console.warn("⚠️ Season ended! Waiting for phase change...");
        setCountdown("0d 0h 0m 0s");
        return;
      }

      const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

      setCountdown(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // ✅ Fetch wealthiest citizens
  useEffect(() => {
    const fetchRichestCitizens = async () => {
      if (!currentPlayer || !currentPlayer.settlementId) {
        console.warn("⚠️ currentPlayer or settlementId is not available yet.");
        return;
      }
      try {
        const response = await axios.get(`${API_BASE}/api/get-players-by-settlement/${currentPlayer.settlementId}`);
        const players = response.data;

        const sortedPlayers = players
          .map(player => ({
            username: player.username,
            netWorth: player.netWorth || 0
          }))
          .sort((a, b) => b.netWorth - a.netWorth)
          .slice(0, 10);

        setRichestCitizens(sortedPlayers);
      } catch (error) {
        console.error("❌ Error fetching richest citizens:", error);
      }
    };

    fetchRichestCitizens();
  }, [currentPlayer]);

  // ✅ Read current season info
  const seasonData = getSeasonData();

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
          <p>{seasonData?.type || "Loading..."} begins in: {countdown}</p>
        </>
      )}

      <br />
      <br />

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