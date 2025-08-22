import React, { useState, useEffect, useMemo } from 'react';
import './FrontierView.css';
import Modal from './components/Modal.jsx';
import { useFileContext } from './FileContext';
import axios from 'axios';

const GRID_DIMENSION = 64;
const API_BASE = 'http://localhost:3001'; // You can make this configurable later

const FrontierView = ({ selectedFrontier, settlements, activePanel }) => {
  const { setFileName, setDirectory, selectedCell, setSelectedCell } = useFileContext();

console.log("📦 FrontierView rendered");
console.log("🧭 selectedFrontier:", selectedFrontier);
console.log("📜 settlements.length:", settlements?.length);

  const [modalMessage, setModalMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [layoutCache, setLayoutCache] = useState(new Set());


  useEffect(() => {

    console.log("📁 Checking for layout files...");
    console.log("🏘️ settlements in effect:", settlements);
if (settlements.length > 0) {
  console.log("🔍 First settlement object:", settlements[0]);
}
    const fs = window.require('fs');
    const path = window.require('path');
    const app = window.require('@electron/remote').app;
    const isDev = !app.isPackaged;
    const projectRoot = isDev
      ? path.join(__dirname, '..', '..', '..')
      : path.join(app.getAppPath(), '..', '..', '..', '..', '..', '..', '..');
    const basePath = path.join(projectRoot, 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord');

    const available = new Set();

    settlements.forEach(settlement => {
      const grids = Array.isArray(settlement.grids) ? settlement.grids.flat() : [];
      grids.forEach(grid => {
        if (['valley0', 'valley1', 'valley2', 'valley3'].includes(grid.gridType)) {
          const fullPath = path.join(basePath, `${grid.gridCoord}.json`);
          if (fs.existsSync(fullPath)) {
            available.add(grid.gridCoord);
          }
        }
      });
    });

    setLayoutCache(available);
    console.log("📁 Updated layoutCache with:", Array.from(available));
  }, [settlements, selectedCell]);

  useEffect(() => {
    const refreshHandler = () => {
      // Force re-run of layout cache update by resetting selectedCell to itself
      setSelectedCell(prev => prev ? {...prev} : null);
    };
    window.addEventListener('refresh-layout-cache', refreshHandler);
    return () => {
      window.removeEventListener('refresh-layout-cache', refreshHandler);
    };
  }, [setSelectedCell]);

  const gridMap = useMemo(() => {
    const map = new Map();
    console.log("🧩 Building gridMap:");
    settlements.forEach(s => {
      //console.log(`📥 Raw grids for settlement ${s.name}:`, JSON.stringify(s.grids));
      const sid = s.frontierId?.toString();
      const match = sid === selectedFrontier?.toString();
      //console.log(`🧩 Settlement ${s.name} | frontierId: ${sid} | matches selected: ${match}`);
      if (match) {
        const grids = Array.isArray(s.grids) && s.grids.every(row => Array.isArray(row))
          ? s.grids.flatMap(row => row)
          : [];
        grids.forEach(grid => {
          map.set(Number(grid.gridCoord), grid);
        });
      }
    });
    console.log("🧾 Final gridMap contents:", Array.from(map.entries()));
    console.log('📋 Sample gridMap keys:', Array.from(map.keys()).slice(0, 5));
    return map;
  }, [settlements, selectedFrontier]);

  const renderValleyIcon = () => '✅';

  const allGrids = settlements
    .filter(s => s.frontierId?.toString() === selectedFrontier?.toString())
    .flatMap(s => Array.isArray(s.grids) && s.grids.every(row => Array.isArray(row))
      ? s.grids.flatMap(row => row)
      : []);

  console.log(`📊 total grids for frontier ${selectedFrontier}:`, allGrids.length);
  console.log(`🧩 gridMap size:`, gridMap.size);



const handleGridClick = async (gridCoord) => {
    const foundGrid = gridMap.get(Number(gridCoord));
    const type = foundGrid?.gridType;
    setSelectedCell({ coord: gridCoord, type });
  };

const handleCreateGrid = () => {
  console.log("handleCreateGrid called");
  if (!selectedCell?.coord || !selectedCell?.type) return;
  setFileName(String(selectedCell.coord));
  setDirectory("valleyFixedCoord/");
  window.dispatchEvent(new CustomEvent('switch-to-editor'));
  window.dispatchEvent(new CustomEvent('editor-clear-grid'));
  window.dispatchEvent(new CustomEvent('editor-create-grid', {
    detail: {
      gridCoord: selectedCell.coord,
      gridType: selectedCell.type
    }
  }));
};

const handleLoadGrid = () => {
    console.log("handleLoadGrid called");
    if (!selectedCell?.coord || !selectedCell?.type) return;
    setFileName(String(selectedCell.coord));
    setDirectory("valleyFixedCoord/");
    window.dispatchEvent(new CustomEvent('switch-to-editor'));
    window.dispatchEvent(new CustomEvent('editor-load-grid', { 
      detail: { 
        gridCoord: selectedCell.coord, 
        gridType: selectedCell.type,
        directory: "valleyFixedCoord/"  // Pass directory explicitly
      } 
    }));
};

const handleCreateGridLive = async () => {
    console.log("handleCreateGridLive called");
    if (!selectedCell?.coord || !selectedCell?.type) return;
    
    // Don't allow for homestead or town types
    if (['homestead', 'town'].includes(selectedCell.type)) {
      alert('Cannot create live grids for homestead or town types.');
      return;
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to create this grid in the live game?\n\n` +
      `Grid Coordinate: ${selectedCell.coord}\n` +
      `Grid Type: ${selectedCell.type}\n\n` +
      `This will create a real grid in the game database.`
    );
    
    if (!confirmed) return;
    
    try {
      console.log("🔍 Fetching all settlements to determine grid details for gridCoord:", selectedCell.coord);
      const settlementsResponse = await axios.get(`${API_BASE}/api/settlements`);
      const settlements = settlementsResponse.data;

      if (!settlements || settlements.length === 0) {
        throw new Error("No settlements returned from the server");
      }

      let foundGrid = null;
      let foundSettlementId = null;
      let foundFrontierId = null;

      for (const settlement of settlements) {
        if (!settlement.grids) continue;

        for (const row of settlement.grids) {
          for (const grid of row) {
            if (String(grid.gridCoord) === String(selectedCell.coord)) {
              foundGrid = grid;
              foundSettlementId = settlement._id;
              foundFrontierId = settlement.frontierId;
              break;
            }
          }
          if (foundGrid) break;
        }
        if (foundGrid) break;
      }

      if (!foundGrid) {
        console.warn(`❗ GridCoord ${selectedCell.coord} not found in any settlement.`);
        alert("GridCoord not found in any settlement data.");
        return;
      }

      const payload = {
        gridCoord: selectedCell.coord,
        gridType: foundGrid.gridType,
        settlementId: foundSettlementId,
        frontierId: foundFrontierId,
      };

      console.log("📤 Sending grid creation request with:", payload);

      const response = await axios.post(`${API_BASE}/api/create-grid`, payload);

      console.log(`✅ Grid created: ${selectedCell.coord}`, response.data);
      setModalMessage(`Grid ${selectedCell.coord} created successfully in the live game!`);
      setShowModal(true);
      
      // Refresh the frontier data to update the view
      setTimeout(() => {
        handleRefreshData();
      }, 1500);
    } catch (error) {
      console.error(`❌ Failed to create grid ${selectedCell.coord}:`, error);
      alert(`Failed to create grid ${selectedCell.coord}. See console for details.`);
    }
};

const handleResetGridLive = async () => {
    console.log("handleResetGridLive called");
    if (!selectedCell?.coord || !selectedCell?.type) return;
    
    // First, check if this grid has been created (has a gridId)
    const foundGrid = gridMap.get(Number(selectedCell.coord));
    if (!foundGrid?.gridId) {
      alert('This grid has not been created in the live game yet.');
      return;
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to reset this grid in the live game?\n\n` +
      `Grid Coordinate: ${selectedCell.coord}\n` +
      `Grid Type: ${selectedCell.type}\n` +
      `Grid ID: ${foundGrid.gridId}\n\n` +
      `This will reset all resources and tiles in the game database.`
    );
    
    if (!confirmed) return;
    
    try {
      console.log('handleResetGrid: gridId:', foundGrid.gridId);
      
      // First get the settlement and frontier IDs
      let foundSettlementId = null;
      let foundFrontierId = null;
      
      // Find the settlement that contains this grid
      for (const settlement of settlements) {
        const sid = settlement.frontierId?.toString();
        if (sid === selectedFrontier?.toString()) {
          const grids = Array.isArray(settlement.grids) && settlement.grids.every(row => Array.isArray(row))
            ? settlement.grids.flatMap(row => row)
            : [];
          
          for (const grid of grids) {
            if (grid.gridCoord === Number(selectedCell.coord)) {
              foundSettlementId = settlement._id;
              foundFrontierId = settlement.frontierId;
              break;
            }
          }
        }
        if (foundSettlementId) break;
      }
      
      if (!foundSettlementId || !foundFrontierId) {
        console.error('Could not find settlement or frontier for this grid');
        alert('Could not find settlement or frontier for this grid');
        return;
      }
      
      // Send request to reset the grid
      const resetResponse = await axios.post(`${API_BASE}/api/reset-grid`, {
        gridCoord: selectedCell.coord,
        gridId: foundGrid.gridId,
        gridType: foundGrid.gridType,
        settlementId: foundSettlementId,
        frontierId: foundFrontierId,
      });
      
      console.log(`Grid ${foundGrid.gridId} of type ${foundGrid.gridType} reset successfully:`, resetResponse.data);
      setModalMessage(`Grid ${selectedCell.coord} reset successfully in the live game!`);
      setShowModal(true);
      
      // Refresh the frontier data to update the view
      setTimeout(() => {
        handleRefreshData();
      }, 1500);
    } catch (error) {
      console.error(`Error resetting grid "${foundGrid.gridId}":`, error);
      alert(`Failed to reset grid "${selectedCell.coord}". Check the console for details.`);
    }
  };

  const handleRefreshData = () => {
    console.log("🔄 Refreshing frontier data...");
    // Dispatch a custom event to trigger data reload in the parent component
    window.dispatchEvent(new CustomEvent('refresh-frontier-data'));
    setModalMessage('Refreshing settlements data...');
    setShowModal(true);
    
    // Auto-close modal after 2 seconds
    setTimeout(() => {
      setShowModal(false);
    }, 2000);
  };

  return (
    <div className="frontier-container">
      <div className="frontier-base-panel">
        <h2>🗺️ Frontier View</h2>

        <button className="refresh-data-button" onClick={handleRefreshData}>
          🔄 Refresh Data
        </button>

        <div className="selected-cell-info">
          {selectedCell && (
            <>
              <p>
                <strong>Selected Cell:</strong> {selectedCell.coord}<br />
                <strong>GridType:</strong> {selectedCell.type ?? 'Unknown'}
              </p>
              {(
                layoutCache.has(Number(selectedCell.coord)) ||
                ['homestead', 'town'].includes(selectedCell.type)
              ) ? (
                <>
                  <button className="load-grid-button" onClick={handleLoadGrid}>Load Layout</button>
                  {/* Show Create Grid button for valleyFixedCoord templates */}
                  {layoutCache.has(Number(selectedCell.coord)) && 
                   !['homestead', 'town'].includes(selectedCell.type) && 
                   !gridMap.get(Number(selectedCell.coord))?.gridId && (
                    <button className="create-grid-button" onClick={handleCreateGridLive}>Create Grid (Live Game)</button>
                  )}
                </>
              ) : (
                <>
                  <button className="create-grid-button" onClick={handleCreateGrid}>Create New Layout</button>
                  {!['homestead', 'town'].includes(selectedCell.type) && (
                    <button className="create-grid-button" onClick={handleCreateGridLive}>Create Grid (Live Game)</button>
                  )}
                </>
              )}
              {/* Show Reset Grid button if grid has been created (has gridId) */}
              {gridMap.get(Number(selectedCell.coord))?.gridId && (
                <button className="create-grid-button" onClick={handleResetGridLive}>Reset Grid (Live Game)</button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="frontier-grid-container">
        <div className="frontier-grid">
          {Array.from({ length: GRID_DIMENSION }).map((_, row) => (
            <div className="frontier-row" key={row}>
              {Array.from({ length: GRID_DIMENSION }).map((_, col) => {
                const megaRow = Math.floor(row / 8);
                const megaCol = Math.floor(col / 8);
                const minorRow = row % 8;
                const minorCol = col % 8;

                // The grid coordinates follow a pattern where position in the 64x64 grid
                // determines the gridCoord value
                // Pattern: 101SSGG where SS is settlement position (00-77) and GG is grid position (00-77)
                const settlementRow = Math.floor(row / 8);
                const settlementCol = Math.floor(col / 8);
                const gridRowWithinSettlement = row % 8;
                const gridColWithinSettlement = col % 8;
                
                // Convert positions to the gridCoord format
                const settlementPart = settlementRow * 10 + settlementCol;
                const gridPart = gridRowWithinSettlement * 10 + gridColWithinSettlement;
                const calculatedGridCoord = 1010000 + (settlementPart * 100) + gridPart;
                
                // Look up this grid in the gridMap
                const foundGrid = gridMap.get(calculatedGridCoord);
                const gridCoord = foundGrid?.gridCoord;
                const type = foundGrid?.gridType;

                let cellClass = 'frontier-cell';
                let cellContent = '';

                // Check if this grid has a gridId (meaning it's been created in the database)
                if (foundGrid?.gridId) {
                  cellClass += ' has-grid-id'; // Light yellow background
                }

                if (type === 'homestead') {
                  cellClass += ' type-homestead';
                } else if (type === 'town') {
                  cellClass += ' type-homestead'; // same beige base
                  cellContent = '🚂';
                } else if (['valley0', 'valley1', 'valley2', 'valley3'].includes(type)) {
                  if (layoutCache.has(gridCoord)) {
                    cellContent = renderValleyIcon(); // ✅
                  }
                }

                if (selectedCell?.coord === gridCoord) {
                  cellClass += ' selected';
                }

                return (
                  <div
                    key={col}
                    className={cellClass}
                    onClick={() => handleGridClick(gridCoord)}
                  >
                    {cellContent}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      {showModal && (
        <Modal
          message={modalMessage}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};

export default FrontierView;
