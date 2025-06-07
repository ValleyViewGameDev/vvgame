import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Events.css';
import API_BASE from './config';
import Modal from './components/Modal.jsx';


const fs = window.require('fs');
const path = window.require('path');
const app = window.require('@electron/remote').app;
const isDev = !app.isPackaged;
const projectRoot = isDev
  ? path.join(__dirname, '..', '..')
  : path.join(app.getAppPath(), '..', '..', '..', '..', '..', '..', '..');


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
    
  const [globalTuning, setGlobalTuning] = useState(null);
  const [phaseEdits, setPhaseEdits] = useState({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');

  const updatePhaseDuration = async (eventKey, phaseName, newDuration) => {
    console.log(`Updating ${eventKey}.${phaseName} to ${newDuration} min`);
    try {
      const tuningPath = path.join(projectRoot, 'game-server', 'tuning', 'globalTuning.json');
      const raw = fs.readFileSync(tuningPath, 'utf-8');
      const config = JSON.parse(raw);

      if (!config[eventKey] || !config[eventKey].phases || !(phaseName in config[eventKey].phases)) {
        console.warn(`❌ Cannot find phase "${phaseName}" under "${eventKey}"`);
        return;
      }

      config[eventKey].phases[phaseName] = Number(newDuration);
      fs.writeFileSync(tuningPath, JSON.stringify(config, null, 2), 'utf-8');

      const updated = { ...globalTuning };
      updated[eventKey].phases[phaseName] = Number(newDuration);
      setGlobalTuning(updated);
      setPhaseEdits((prev) => ({ ...prev, [phaseName]: undefined }));

      setConfirmationMessage(`✅ Updated ${eventKey}.${phaseName} to ${newDuration} min`);
      setShowConfirmation(true);

      console.log(`✅ Updated ${eventKey}.${phaseName} to ${newDuration} min`);
    } catch (error) {
      console.error('❌ Failed to update phase duration:', error);
    }
  };

  useEffect(() => {
    const fetchTuning = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/tuning`);
        setGlobalTuning(response.data);
      } catch (error) {
        console.error('Failed to fetch global tuning data:', error);
      }
    };
    fetchTuning();
  }, []);

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

  const handleEndCurrentPhase = async (eventKey) => {
    console.log(`🛑 Request to end current phase for ${eventKey}`);
    if (!selectedFrontier || !eventKey) return;

    try {
      const response = await axios.post(`${API_BASE}/api/force-end-phase`, {
        frontierId: selectedFrontier,
        eventKey: eventKey,
      });

      console.log(`✅ Ended current phase for ${eventKey}:`, response.data.message);
      setConfirmationMessage(`✅ ${eventKey} phase will end shortly.`);
      setShowConfirmation(true);
    } catch (error) {
      console.error(`❌ Failed to end current phase for ${eventKey}:`, error);
      setConfirmationMessage(`❌ Failed to end phase: ${error.message}`);
      setShowConfirmation(true);
    }
  };


  
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
      {selectedDashboard && globalTuning && globalTuning[selectedDashboard] ? (
          <div>
            <h4>{selectedDashboard.charAt(0).toUpperCase() + selectedDashboard.slice(1)} Phases</h4>
            <button 
              className="end-phase-button" 
              onClick={() => handleEndCurrentPhase(selectedDashboard)}
              style={{ marginBottom: '10px' }}
            >
              End Current Phase
            </button>
            <h3>Phases & Durations:</h3>
            {Object.entries(globalTuning[selectedDashboard].phases || {}).map(([phase, duration]) => (
              <div key={phase} style={{ marginBottom: '10px' }}>
                <label>
                  {phase}:
                  <br/>
                  <input
                    type="number"
                    min="0"
                    value={phaseEdits[phase] ?? duration}
                    onChange={(e) =>
                      setPhaseEdits((prev) => ({ ...prev, [phase]: e.target.value }))
                    }
                    style={{ marginLeft: '10px', width: '60px' }}
                  />
                  <div style={{ fontSize: '12px', marginTop: '4px', marginLeft: '10px' }}>
                    {(() => {
                      const totalSeconds = (phaseEdits[phase] ?? duration) * 60;
                      const d = Math.floor(totalSeconds / (3600 * 24));
                      const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
                      const m = Math.floor((totalSeconds % 3600) / 60);
                      const s = totalSeconds % 60;
                      return `  ${d}d ${h}h ${m}m ${s}s`;
                    })()}
                  </div>
                  <button
                    className="small-button"
                    disabled={
                      phaseEdits[phase] === undefined ||
                      phaseEdits[phase] === '' ||
                      Number(phaseEdits[phase]) === duration
                    }
                    onClick={() => updatePhaseDuration(selectedDashboard, phase, phaseEdits[phase])}
                    style={{ marginLeft: '10px' }}
                  >
                    Save Changes
                  </button>
                </label>
              </div>
            ))}
          </div>
      ) : selectedDashboard ? (
          <p>No tuning data found for this event.</p>
      ) : null}
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
                  <p>Current Phase: {timers[key]?.phase || 'Unknown'}</p>
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
    {showConfirmation && (
      <Modal 
        isOpen={showConfirmation} 
        onClose={() => setShowConfirmation(false)} 
        title="Changes Saved"
      >
        <p>{confirmationMessage}</p>
        <button onClick={() => setShowConfirmation(false)} className="small-button">OK</button>
      </Modal>
    )}
  </div>);
};


export default Events;