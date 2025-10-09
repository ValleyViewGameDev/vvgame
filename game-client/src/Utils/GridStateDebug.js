// A small component to add to App.js Base Panel for visual debugging
import React from 'react';
import './GridStateDebug.css';

const GridStateDebugPanel = ({ gridId, gridCoord, gridType, settlementId, NPCsInGrid, playersInGrid }) => {
  const formatJSON = (obj) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return '[Unserializable]';
    }
  };

  const currentNPCs = NPCsInGrid?.[gridId] || 'Not loaded';
  const currentPCs = playersInGrid?.[gridId] || 'Not loaded';

  return (
    <div className="grid-debug-panel">
      <h4 style={{ color: 'white' }}>Debug:</h4>
      <br></br>
      <h5>gridId:</h5>
      <pre>{formatJSON(gridId)}</pre>
      <h5>gridCoord: {formatJSON(gridCoord)}</h5>
      <h5>gridType: {formatJSON(gridType)}</h5>
      <h5>settlementId: {formatJSON(settlementId)}</h5>
      <br></br>
      <h5>🐮 NPCsInGrid?[gridId]</h5>
      <pre>{formatJSON(currentNPCs)}</pre>
      <h5>👥 PlayersInGrid?[gridId]</h5>
      <pre>{formatJSON(currentPCs)}</pre>
    </div>
  );
};

export default GridStateDebugPanel;
