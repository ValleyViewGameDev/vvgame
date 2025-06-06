import globalTuning from './globalTuning.json';
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
    
  const activeSettlement = settlements.find(s => s._id === selectedSettlement);
  const activeFrontier = frontiers.find(f => f._id === selectedFrontier) || {};
  const timers = {
    seasons: activeFrontier.seasons || {},
    taxes: activeFrontier.taxes || {},
    elections: activeFrontier.elections || {},
    train: activeFrontier.train || {},
    bank: activeFrontier.bank || {},
  };
  const [countdowns, setCountdowns] = useState({
    seasons: '',
    taxes: '',
    elections: '',
    train: '',
    bank: '',
  });

  const [selectedDashboard, setSelectedDashboard] = useState(null);

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
      <h3>Selected: {selectedDashboard ? selectedDashboard.toUpperCase() : 'None'}</h3>
      {selectedDashboard && (
        globalTuning[selectedDashboard] ? (
          <div>
            <h4>{selectedDashboard.charAt(0).toUpperCase() + selectedDashboard.slice(1)} Phases</h4>
            <ul style={{ paddingLeft: '1em' }}>
              {Object.entries(globalTuning[selectedDashboard].phases || {}).map(([phase, duration]) => (
                <li key={phase}>
                  {phase}: {duration} min
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>No tuning data found for this event.</p>
        )
      )}
      {/* Future buttons and controls go here */}
    </div>

    <div className="events-columns">
      {/* Column 1: Frontier-wide event dashboards */}
      <div className="events-main-container">
        {['seasons', 'taxes', 'elections', 'train', 'bank'].map((key) => (
          <div key={key} className="event-row">
            {/* Frontier-wide dashboard (left) */}
            <div
              className={`event-dashboard ${selectedDashboard === key ? 'selected' : ''}`}
              onClick={() => setSelectedDashboard(key)}
              style={{ cursor: 'pointer' }}
            >
              <h3>{key.charAt(0).toUpperCase() + key.slice(1)}</h3>
              {key === 'seasons' ? (
                <>
                  <p>Season: {timers.seasons.seasonType || 'Unknown'}</p>
                  <p>Phase: {timers[key]?.phase || 'Unknown'}</p>
                  <p>Ends in: {countdowns[key]}</p>
                </>
              ) : (
                <>
                  <p>Phase: {timers[key]?.phase || 'Unknown'}</p>
                  <p>Ends in: {countdowns[key]}</p>
                </>
              )}
            </div>

            {/* Settlement-specific dashboard (right) */}
            <div className="event-dashboard">
              <h3>{key.charAt(0).toUpperCase() + key.slice(1)} (Settlement)</h3>
              {selectedSettlement ? (
                key === 'taxes' ? (
                  <>
                    <p>Tax Rate: {activeSettlement.taxrate ?? 'Unknown'}%</p>
                    <button className="small-button">View Tax Log</button>
                  </>
                ) : key === 'seasons' ? (
                  <p>Population: {activeSettlement?.population ?? 'Unknown'}</p>
                ) : key === 'elections' ? (
                  <>
                    <p>
                      Mayor: {
                        (activeSettlement?.roles?.find(r => r.roleName.toLowerCase() === 'mayor')?.playerId || 'No current Mayor.')
                      }
                    </p>
                    <p>Votes Cast: {activeSettlement?.votes?.length || 0}</p>
                  </>
                ) : key === 'train' ? (
                  activeSettlement?.trainrewards?.length > 0 ? (
                    <ul>
                      {activeSettlement.trainrewards.map((reward, idx) => (
                        <li key={idx}>{reward.qty} × {reward.item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No train rewards.</p>
                  )
                ) : key === 'bank' ? (
                  <p>[Coming soon]</p>
                ) : (
                  <p>[Coming soon]</p>
                )
              ) : (
                <p>[Coming soon]</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>);
};


export default Events;