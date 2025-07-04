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
  const [secondsLeft, setSecondsLeft] = useState(null);

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

    // Calculate raw seconds remaining (for refresh trigger)
    useEffect(() => {
      const interval = setInterval(() => {
        const now = Date.now();
        const end = new Date(seasonData.endTime).getTime();
        const diff = Math.floor((end - now) / 1000);
        setSecondsLeft(diff);
      }, 1000);
      return () => clearInterval(interval);
    }, [seasonData]);

  // 🔁 Force refresh when 20 seconds remain
  useEffect(() => {
    if (secondsLeft === 20) {
      console.warn("🔁 Forcing refresh — countdown reached 10s");
      window.location.reload();
    }
  }, [secondsLeft]);


  useEffect(() => {
    const fetchSeasonWinners = async () => {
      try {
        if (!currentPlayer?.frontierId) return;

        const response = await axios.get(`${API_BASE}/api/get-frontier/${currentPlayer.frontierId}`);
        const seasonLog = response.data?.seasonlog || [];
        const currentSeasonNumber = response.data?.seasons?.seasonNumber;

        const lastSeason = seasonLog.find(entry => entry.seasonnumber === currentSeasonNumber);
        const winners = lastSeason?.seasonwinners || [];

        setRichestCitizens(winners.map((w, i) => ({
          username: w.username,
          netWorth: w.networth
        })));
      } catch (error) {
        console.error("❌ Error fetching season winners:", error);
      }
    };

    fetchSeasonWinners();
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
      <h2><strong>{seasonData.type} begins in:</strong> {countdown}</h2>

        <h3>💰 Results from {previousSeason.seasonType}</h3>
        {richestCitizens.length > 0 ? (
        richestCitizens.map((c, i) => (
            <p key={i}>{i + 1}. <strong>{c.username}</strong> – Net Worth: {c.netWorth}</p>
        ))
        ) : (
        <p>No data available.</p>
        )}
        <br />


      <ul style={{ paddingLeft: "1.5rem", marginBottom: "1rem" }}>
        <p>🧑‍🌾 Sending players home</p>
        <p>🛠️ Resetting towns and valleys</p>
        <p>💰 Nerfing money accounts</p>
        <p>📬 Sending out rewards</p>
      </ul>


      <br />
    </Modal>
  );
}

export default OffSeasonModal;