import React, { useEffect, useState } from 'react';
import './Events.css';


// Local formatCountdown helper
const formatCountdown = (endTime, now) => {
  if (!endTime || endTime <= now) return "0d 0h 0m 0s";
  const timeDiff = new Date(endTime).getTime() - now;
  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

const Events = ({ selectedFrontier, selectedSettlement, frontiers, settlements, activePanel }) => {
  // Extract timers from selectedFrontier
  const timers = {
    seasons: frontiers.selectedFrontier?.seasons || {},
    taxes: frontiers.selectedFrontier?.taxes || {},
    elections: frontiers.selectedFrontier?.elections || {},
    train: frontiers.selectedFrontier?.train || {},
    bank: frontiers.selectedFrontier?.bank || {},
  };

  const [countdowns, setCountdowns] = useState({
    seasons: '',
    taxes: '',
    elections: '',
    train: '',
    bank: '',
  });

  useEffect(() => {
    const updateCountdowns = () => {
      const now = Date.now();
      setCountdowns({
        seasons: formatCountdown(timers.seasons.endTime, now),
        taxes: formatCountdown(timers.taxes.endTime, now),
        elections: formatCountdown(timers.elections.endTime, now),
        train: formatCountdown(timers.train.endTime, now),
        bank: formatCountdown(timers.bank.endTime, now),
      });
    };
    updateCountdowns();
    const interval = setInterval(updateCountdowns, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFrontier]);

  return (
    <div className="events-layout">
      <div className="events-base-panel">
        <h2>📆 Events</h2>
        {/* Future buttons and controls go here */}
      </div>

      <div className="events-main-container">
        {['seasons', 'taxes', 'elections', 'train', 'bank'].map((key) => (
          <div key={key} className="event-dashboard">
            <h3 className="event-title">{key.charAt(0).toUpperCase() + key.slice(1)}</h3>
            <p className="event-phase">Phase: {timers[key]?.phase || 'Unknown'}</p>
            <p className="event-timer">Ends in: {countdowns[key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Events;