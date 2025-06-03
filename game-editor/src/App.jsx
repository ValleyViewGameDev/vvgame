import React, { useState, useEffect } from 'react';
import API_BASE from './config';
import axios from 'axios';
import GridEditor from './GridEditor';
import Events from './Events';
import FrontierView from './FrontierView';
import './App.css';

const App = () => {
  const [activePanel, setActivePanel] = useState('grid');
  const [selectedFrontier, setSelectedFrontier] = useState(null);
  const [selectedSettlement, setSelectedSettlement] = useState(null);
  const [frontiers, setFrontiers] = useState([]);
  const [settlements, setSettlements] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const frontierRes = await axios.get(`${API_BASE}/api/frontiers`);
        const frontierData = frontierRes.data;
        console.log("Frontiers:", frontierData);
        setFrontiers(frontierData);
        if (frontierData.length > 0) {
          setSelectedFrontier(frontierData[0]._id);
        }
      } catch (error) {
        console.error("Failed to fetch frontiers:", error);
      }

      try {
        const settlementRes = await axios.get(`${API_BASE}/api/settlements`);
        const settlementData = settlementRes.data;
        console.log("Settlements:", settlementData);
        setSettlements(settlementData);
        if (settlementData.length > 0) {
          setSelectedSettlement(settlementData[0]._id);
        }
      } catch (error) {
        console.error("Failed to fetch settlements:", error);
      }
    };

    fetchData();
  }, []);

  console.log("Selected Frontier:", selectedFrontier);
  console.log("Selected Settlement:", selectedSettlement);
  useEffect(() => {
    // When selectedFrontier changes, update selectedSettlement to first settlement in that frontier
    const filteredSettlements = settlements.filter(s => s.frontierId === selectedFrontier);
    if (filteredSettlements.length > 0) {
      setSelectedSettlement(filteredSettlements[0]._id);
    } else {
      setSelectedSettlement(null);
    }
  }, [selectedFrontier, settlements]);

  return (
  <>
    <div className="editor-header">
      <div className="header-controls">
        <label>
          Frontier:
          <select value={selectedFrontier || ''} onChange={e => setSelectedFrontier(e.target.value)}>
            {frontiers.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
          </select>
        </label>
        <label>
          Settlement:
          <select value={selectedSettlement || ''} onChange={e => setSelectedSettlement(e.target.value)}>
            {settlements
              .filter(s => s.frontierId === selectedFrontier)
              .map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="editor-container">
      {/* ✅ Left Nav Strip */}
      <div className="nav-column">
        <button title="Events" onClick={() => setActivePanel('events')}>📆</button>
        <button title="Grid Editor" onClick={() => setActivePanel('grid')}>✍️</button>
        <button title="Frontier View" onClick={() => setActivePanel('frontier')}>🔎</button>
      </div>

      {/* ✅ Base Panels Container with conditional visibility */}
      <div className="base-panels-container">
        <div className={activePanel === 'grid' ? 'panel-visible' : 'panel-hidden'}>
          <GridEditor />
        </div>
        <div className={activePanel === 'events' ? 'panel-visible' : 'panel-hidden'}>
          <Events selectedSettlement={selectedSettlement} />
        </div>
        <div className={activePanel === 'frontier' ? 'panel-visible' : 'panel-hidden'}>
          <FrontierView selectedFrontier={selectedFrontier} settlements={settlements} />
        </div>
      </div>
    </div>
  </>
  );
};

export default App;