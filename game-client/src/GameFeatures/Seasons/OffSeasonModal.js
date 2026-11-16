// src/GameFeatures/Seasons/OffSeasonModal.js
import React, { useState, useEffect } from 'react';
import Modal from '../../UI/Modals/Modal';
import { useStrings } from '../../UI/StringsContext';
import { formatCountdown } from '../../UI/Timers';

function OffSeasonModal({ onClose }) {
  const strings = useStrings();
  const [countdown, setCountdown] = useState("...");
  const [seasonData, setSeasonData] = useState({ type: "Unknown", phase: "Unknown", endTime: null });
  const [secondsLeft, setSecondsLeft] = useState(null);

  // Load timers from localStorage
  useEffect(() => {
    const storedTimers = JSON.parse(localStorage.getItem("timers"));
    const data = storedTimers?.seasons || { type: "Unknown", phase: "Unknown", endTime: null };
    setSeasonData(data);
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


  // the season after a change can be the same type again (Fall #39 follows Fall #38), so the title
  // names only the coming one (docs/season-reset.md)
  const title = `🗓️ ${seasonData.type}`;
  const message = strings["5035"];   // "We are between seasons!"
  const message2 = strings["5036"]; // "Temporarily unavailable while we reset the season."

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={title}
      message={message}
      message2={message2}
      size="medium"
    >
      <h2 className="countdown-timer"><strong>{(strings["5037"] || '').replace('{season}', seasonData.type)}</strong> {countdown}</h2>

      <ul style={{ paddingLeft: "1.5rem", marginBottom: "1rem" }}>
        <p>{strings["5038"]}</p>
        <p>{strings["5039"]}</p>
        <p>{strings["5042"]}</p>
      </ul>
    </Modal>
  );
}

export default OffSeasonModal;