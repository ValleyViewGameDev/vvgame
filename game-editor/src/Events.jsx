import React, { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import './Events.css';
import API_BASE from './config';
import Modal from './components/Modal.jsx';
import ShowLogs from './components/ShowLogs.jsx';


const fs = window.require('fs');
const path = window.require('path');
const app = window.require('@electron/remote').app;
const isDev = !app.isPackaged;
const projectRoot = isDev
  ? path.join(__dirname, '..', '..')
  : path.join(app.getAppPath(), '..', '..', '..', '..', '..', '..', '..');


const Events = ({ selectedFrontier, selectedSettlement, frontiers, settlements, activePanel, refreshFrontiers }) => {
  const hasTriggeredRefreshRef = useRef(false);
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
        console.log("✅ Loaded globalTuning keys:", Object.keys(response.data));
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
    carnival: activeFrontier.carnival || {},
    bank: activeFrontier.bank || {},
    messages: activeFrontier.messages || {},
    networth: activeFrontier.networth || {},
    dungeon: activeFrontier.dungeon || {},
  };
  const [countdowns, setCountdowns] = useState({
    seasons: '',
    taxes: '',
    elections: '',
    train: '',
    carnival: '',
    bank: '',
    messages: '',
    networth: '',
    dungeon: '',
  });

  const [selectedDashboard, setSelectedDashboard] = useState(null);

  const handleEndCurrentPhase = async (eventKey) => {
    console.log(`🛑 Request to end current phase for ${eventKey}`);
    if (!selectedFrontier || !eventKey) return;

    try {
      console.log("🛫 Sending force-end request:", {
        selectedFrontier,
        eventKey
      });

      const response = await axios.post(`${API_BASE}/api/force-end-phase`, {
        frontierId: selectedFrontier,
        event: eventKey,
      });

      console.log(`✅ Ended current phase for ${eventKey}:`, response.data.message);
      setConfirmationMessage(`✅ ${eventKey} phase will end shortly.`);
      setShowConfirmation(true);

      if (typeof refreshFrontiers === 'function') {
        await refreshFrontiers();
      }
      hasTriggeredRefreshRef.current = false;
    } catch (error) {
      console.error(`❌ Failed to end current phase for ${eventKey}:`, error);
      setConfirmationMessage(`❌ Failed to end phase: ${error.message}`);
      setShowConfirmation(true);
    }
  };


const updateCountdowns = () => {
  const now = Date.now();
  const newCountdowns = {};
  let needsRefresh = false;
  ['seasons', 'taxes', 'elections', 'train', 'carnival', 'bank', 'messages', 'networth','dungeon'].forEach((key) => {
    const end = timers[key]?.endTime ? new Date(timers[key].endTime).getTime() : 0;
    const diff = end - now;
    if (diff <= 0) {
      needsRefresh = true;
    }
    const d = Math.floor(Math.max(diff, 0) / (1000 * 60 * 60 * 24));
    const h = Math.floor((Math.max(diff, 0) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((Math.max(diff, 0) % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((Math.max(diff, 0) % (1000 * 60)) / 1000);
    newCountdowns[key] = `${d}d ${h}h ${m}m ${s}s`;
  });
  setCountdowns(newCountdowns);
  if (needsRefresh && typeof refreshFrontiers === 'function' && !hasTriggeredRefreshRef.current) {
    hasTriggeredRefreshRef.current = true;
    console.log("🔁 Timer expired — triggering refreshFrontiers()");
    refreshFrontiers();
  }
};

useEffect(() => {
  const interval = setInterval(() => {
    updateCountdowns();
  }, 1000);

  updateCountdowns();

  return () => clearInterval(interval);
}, [selectedFrontier, refreshFrontiers]);

useEffect(() => {
  if (activePanel === 'events') {
    updateCountdowns();
  }
}, [activePanel]);


  return (
  <div className="events-layout">

{/* BASE PANEL UI */}

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


{/* Column 1: Frontier-wide event dashboards */}

    <div className="events-columns">
      <div className="events-main-container">
        {['seasons', 'taxes', 'elections', 'train', 'carnival', 'bank', 'messages', 'networth', 'dungeon'].map((key) => (
          <div key={key} className="event-row">
            <div
              className={`event-dashboard event-dashboard-frontier ${selectedDashboard === key ? 'selected' : ''}`}
              onClick={() => setSelectedDashboard(key)}
              style={{ cursor: 'pointer' }}
            >
              <h3>{key.charAt(0).toUpperCase() + key.slice(1)}</h3>
              {key === 'seasons' ? (
                <>
                  <p>Season: {timers.seasons.seasonType || 'Unknown'}</p>
                  <p>Current Phase: <strong>{timers[key]?.phase || 'Unknown'}</strong></p>
                  <p>Ends in: {countdowns[key]}</p>
                </>
              ) : (
                <>
                  <p>Current Phase: <strong>{timers[key]?.phase || 'Unknown'}</strong></p>
                  <p>Ends in: {countdowns[key]}</p>
                </>
              )}
            </div>

{/* Settlement-specific dashboard (right) */}

            <div className="event-dashboard event-dashboard-settlement">
              <h3>{key.charAt(0).toUpperCase() + key.slice(1)} (this Settlement)</h3>
              {selectedSettlement ? (
                key === 'taxes' ? (
                  <>
                    <p>Tax Rate: {activeSettlement.taxrate ?? 'Unknown'}%</p>
                    <button className="small-button" onClick={() => window.showLogHandlers?.handleShowTaxLog()}>View Tax Log</button>
                  </>
                ) : key === 'messages' ? (
                  <>
                    <p>Last Message Sent: {new Date(timers.messages?.lastSent || 0).toLocaleString()}</p>
                  </>
                ) : key === 'networth' ? (
                  <>
                    <p>Last Networth Calculated: {new Date(timers.networth?.lastSent || 0).toLocaleString()}</p>
                  </>
                ) : key === 'dungeon' ? (
                  <>
                    <p>Last Dungeon: {new Date(timers.dungeon?.lastSent || 0).toLocaleString()}</p>
                  </>
                ) : key === 'seasons' ? (
                  <>
                    <p>Population: {activeSettlement?.population ?? 'Unknown'}</p>
                    <button className="small-button" onClick={() => window.showLogHandlers?.handleShowSeasonLog()}>View Season Log</button>
                  </>
                ) : key === 'elections' ? (
                  <>
                    <p>
                      Mayor: {
                        (activeSettlement?.roles?.find(r => r.roleName.toLowerCase() === 'mayor')?.playerId || 'No current Mayor.')
                      }
                    </p>
                    <p>Votes Cast: {activeSettlement?.votes?.length || 0}</p>
                    <p>Campaign Promises: {activeSettlement?.campaignPromises?.length || 0}</p>
                    <button className="small-button" onClick={() => window.showLogHandlers?.handleShowElectionLog()}>View Election Log</button>
                  </>
                ) : key === 'train' ? (
                  <>
                    {Array.isArray(activeSettlement?.trainrewards) && activeSettlement.trainrewards.length > 0 ? (
                      <p>
                        {activeSettlement.trainrewards.map((reward, idx) =>
                          `${reward.qty}× ${reward.item}`
                        ).join(',  ')}
                      </p>
                    ) : (
                      <p>No train rewards.</p>
                    )}
                    <button className="small-button" onClick={() => window.showLogHandlers?.handleShowTrainLog()}>View Train Log</button>
                  </>
                ) : key === 'carnival' ? (
                  <>
                    {Array.isArray(activeSettlement?.carnival?.currentoffers) && activeSettlement.carnival.currentoffers.length > 0 ? (
                      <p>
                        {activeSettlement.carnival.currentoffers.map((offer, idx) =>
                          `${offer.qtyBought}× ${offer.itemBought} → ${offer.qtyGiven}× ${offer.itemGiven}`
                        ).join(',  ')}
                      </p>
                    ) : (
                      <p>No current carnival offers.</p>
                    )}
                    <button className="small-button" onClick={() => window.showLogHandlers?.handleShowCarnivalLog()}>View Carnival Log</button>
                  </>
                ) : key === 'bank' ? (
                  <>
                    {Array.isArray(activeSettlement?.currentoffers) && activeSettlement.currentoffers.length > 0 ? (
                      <p>
                        {activeSettlement.currentoffers.map((offer, idx) =>
                          `${offer.qtyBought}× ${offer.itemBought} → ${offer.qtyGiven}× ${offer.itemGiven}`
                        ).join(',  ')}
                      </p>
                    ) : (
                      <p>No current bank offers.</p>
                    )}
                    <button className="small-button" onClick={() => window.showLogHandlers?.handleShowBankLog()}>View Bank Log</button>
                  </>
                ) : (
                  <>
                    <p>[Coming soon]</p>
                    <button className="small-button" onClick={() => window.showLogHandlers?.handleShowSeasonLog()}>View Log</button>
                  </>
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
    <ShowLogs selectedSettlement={selectedSettlement} selectedFrontier={selectedFrontier} />
  </div>);
};


export default Events;