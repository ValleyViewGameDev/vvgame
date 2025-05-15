// A small component to add to App.js Base Panel for visual debugging
import React from 'react';

const GridStateDebugPanel = ({ gridId, NPCsInGrid, playersInGrid }) => {
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
    <div style={{ backgroundColor: '#111', color: 'lime', padding: '1rem', fontSize: '12px', maxHeight: '900px', overflowY: 'auto', border: '1px solid lime' }}>
      <h4 style={{ color: 'white' }}> Grid Debug Info</h4>
      <h5>🧠 [gridId]:</h5>
      <pre>{formatJSON(gridId)}</pre>

      <h5>🐮 NPCs:  NPCsInGrid?.[gridId]</h5>
      <pre>{formatJSON(currentNPCs)}</pre>

      <h5>👥 PCs:  playersInGrid?[gridId]</h5>
      <pre>{formatJSON(currentPCs)}</pre>
    </div>
  );
};

export default GridStateDebugPanel;
