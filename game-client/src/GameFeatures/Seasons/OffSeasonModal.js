// src/GameFeatures/Seasons/OffSeasonModal.js
import React, { useState, useEffect } from 'react';
import Modal from '../../UI/Modal';
import strings from '../../UI/strings.json';
import { formatCountdown } from '../../UI/Timers';
import axios from 'axios';
import API_BASE from '../../config';

function OffSeasonModal({ onClose, currentPlayer }) {
  const [countdown, setCountdown] = useState("...");
  const [seasons, setSeasons] = useState([]);
  const [seasonData, setSeasonData] = useState({ type: "Unknown", phase: "Unknown", endTime: null });
  const [richestCitizens, setRichestCitizens] = useState([]);

  // Load timers from localStorage
  useEffect(() => {
    const storedTimers = JSON.parse(localStorage.getItem("timers"));
    const data = storedTimers?.seasons || { type: "Unknown", phase: "Unknown", endTime: null };
    setSeasonData(data);
  }, []);

  // Fetch tuning data (seasons.json)
  useEffect(() => {
    const fetchSeasons = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/tuning/seasons`);
        setSeasons(response.data);
      } catch (err) {
        console.error("❌ Failed to load season tuning:", err);
      }
    };

    fetchSeasons();
  }, []);

  // Update live countdown
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const end = new Date(seasonData.endTime);
      setCountdown(formatCountdown(end, now));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [seasonData]);


  useEffect(() => {
    const fetchRichestCitizens = async () => {
      try {
        if (!currentPlayer?.settlementId) return;
  
        const response = await axios.get(`${API_BASE}/api/get-players-by-settlement/${currentPlayer.settlementId}`);
        const players = response.data;
  
        const sortedPlayers = players
          .map(player => ({ username: player.username, netWorth: player.netWorth || 0 }))
          .sort((a, b) => b.netWorth - a.netWorth)
          .slice(0, 5); // Show top 5 in modal
  
        setRichestCitizens(sortedPlayers);
      } catch (error) {
        console.error("❌ Error fetching richest citizens:", error);
      }
    };
  
    fetchRichestCitizens();
  }, [currentPlayer]);




  const currentIndex = seasons.findIndex(s => s.seasonType === seasonData.type);
  const previousIndex = (currentIndex - 1 + seasons.length) % seasons.length;
  
  const previousSeason = currentIndex >= 0
    ? seasons[previousIndex]
    : { seasonType: "Unknown" };
    
  const title = `🗓️ ${previousSeason.seasonType} → ${seasonData.type}`;
  const message = strings["5035"];   // "We are between seasons!"
  const message2 = strings["5036"]; // "Valley View is temporarily unavailable while we reset the season."

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={title}
      message={message}
      message2={message2}
      size="standard"
    >

        <h3>📊 Results from {previousSeason.seasonType}</h3>
        <p>Top 5 wealthiest citizens before the reset:</p>
        {richestCitizens.length > 0 ? (
        richestCitizens.map((c, i) => (
            <p key={i}>{i + 1}. <strong>{c.username}</strong> – Net Worth: {c.netWorth}</p>
        ))
        ) : (
        <p>No data available.</p>
        )}
        <br />


      <ul style={{ paddingLeft: "1.5rem", marginBottom: "1rem" }}>
        <li>📦 Wiping homestead ownership</li>
        <li>🧑‍🌾 Reassigning players</li>
        <li>🛠️ Resetting grids</li>
        <li>💸 Applying money nerfs</li>
        <li>📬 Sending reward mail</li>
      </ul>

      <p>🧪 This is a <strong>debug preview</strong>. No data has been changed yet.</p>

      <br />
      <p>🌱 <strong>New season:</strong> {seasonData.type}</p>
      <p>🕒 <strong>Begins in:</strong> {countdown}</p>
    </Modal>
  );
}

export default OffSeasonModal;