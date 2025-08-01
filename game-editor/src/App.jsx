import React, { useState, useEffect } from 'react';
import API_BASE from './config';
import axios from 'axios';
import GridEditor from './GridEditor';
import Events from './Events';
import FrontierView from './FrontierView';
import Players from './Players';
import './App.css';

const App = () => {
  const [activePanel, setActivePanel] = useState('grid');
  const [selectedFrontier, setSelectedFrontier] = useState(null);
  const [selectedSettlement, setSelectedSettlement] = useState(null);
  const [frontiers, setFrontiers] = useState([]);
  const [settlements, setSettlements] = useState([]);

  useEffect(() => {
    const handleSwitchToEditor = () => {
      console.log('🔁 Switching to Grid Editor');
      setActivePanel('grid');
    };
    
    const handleRefreshFrontierData = () => {
      console.log('🔄 Handling refresh-frontier-data event');
      refreshFrontiers();
    };
    
    window.addEventListener('switch-to-editor', handleSwitchToEditor);
    window.addEventListener('refresh-frontier-data', handleRefreshFrontierData);
    
    return () => {
      window.removeEventListener('switch-to-editor', handleSwitchToEditor);
      window.removeEventListener('refresh-frontier-data', handleRefreshFrontierData);
    };
  }, []);


  const refreshFrontiers = async () => {
    try {
      const frontierRes = await axios.get(`${API_BASE}/api/frontiers`);
      const frontierData = frontierRes.data;
      console.log("🔁 Refreshed Frontiers:", frontierData);
      setFrontiers(frontierData);
      if (frontierData.length > 0) {
        setSelectedFrontier(frontierData[0]._id);
      }
    } catch (error) {
      console.error("❌ Failed to refresh frontiers:", error);
    }

    try {
      const settlementRes = await axios.get(`${API_BASE}/api/settlements`);
      const settlementData = settlementRes.data;
      console.log("🔁 Refreshed Settlements:", settlementData);
      setSettlements(settlementData);
      if (settlementData.length > 0) {
        setSelectedSettlement(settlementData[0]._id);
      }
    } catch (error) {
      console.error("❌ Failed to refresh settlements:", error);
    }
  };

  useEffect(() => {
    refreshFrontiers();
  }, []);


useEffect(() => {

  const filtered = settlements.filter(
    s => String(s.frontierId?._id || s.frontierId) === String(selectedFrontier)
  );
  if (filtered.length > 0) {
    setSelectedSettlement(filtered[0]._id);
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
              .filter(s => String(s.frontierId) === String(selectedFrontier))
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
        <button title="Players" onClick={() => setActivePanel('players')}>😀</button>
      </div>

      {/* ✅ Base Panels Container with conditional visibility */}
      <div className="base-panels-container">
        <div className={activePanel === 'grid' ? 'panel-visible' : 'panel-hidden'}>
          <GridEditor 
            activePanel={activePanel} 
            />
        </div>
        <div className={activePanel === 'events' ? 'panel-visible' : 'panel-hidden'}>
          <Events 
            selectedFrontier={selectedFrontier} 
            selectedSettlement={selectedSettlement} 
            frontiers={frontiers}
            settlements={settlements} 
            activePanel={activePanel}
            refreshFrontiers={refreshFrontiers}
          />
        </div>
        <div className={activePanel === 'frontier' ? 'panel-visible' : 'panel-hidden'}>
          <FrontierView 
            selectedFrontier={selectedFrontier} 
            settlements={settlements} 
            activePanel={activePanel}
            />
        </div>
        <div className={activePanel === 'players' ? 'panel-visible' : 'panel-hidden'}>
          <Players 
            selectedFrontier={selectedFrontier} 
            selectedSettlement={selectedSettlement} 
            frontiers={frontiers}
            settlements={settlements} 
            activePanel={activePanel}
            />
        </div>
      </div>
    </div>
  </>
  );
};

export default App;