import React, { useState, useEffect, useMemo, useRef } from 'react';
import './FrontierView.css';
import Modal from './components/Modal.jsx';
import { useFileContext } from './FileContext';
import axios from 'axios';
import '../../game-client/src/UI/Styles/theme.css';
import '../../game-client/src/UI/Buttons/SharedButtons.css';

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

  // Region editing state
  const [regionOptions, setRegionOptions] = useState([]); // Available regions from resources
  const [selectedRegion, setSelectedRegion] = useState(''); // Currently selected region in dropdown
  const [originalRegion, setOriginalRegion] = useState(''); // Original region for comparison
  const [isRegionDirty, setIsRegionDirty] = useState(false); // Has region been changed?

  // Multi-select state
  const [selectedCells, setSelectedCells] = useState([]); // Array of selected gridCoords
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const containerRef = useRef(null);

  // Filter toggles
  const [showSavedLayouts, setShowSavedLayouts] = useState(true);
  const [showDatabaseGrids, setShowDatabaseGrids] = useState(true);
  const [showRegions, setShowRegions] = useState(true);

  // Fetch region options from masterResources
  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/resources`);
        const regions = response.data.filter(r => r.category === 'region');
        setRegionOptions(regions);
        console.log('🗺️ Loaded region options:', regions.map(r => r.type));
      } catch (error) {
        console.error('Failed to fetch region options:', error);
      }
    };
    fetchRegions();
  }, []);

  // Handle region dropdown change
  const handleRegionChange = (e) => {
    const newRegion = e.target.value;
    setSelectedRegion(newRegion);
    setIsRegionDirty(newRegion !== originalRegion);
  };

  // Save region for single grid
  const handleSaveRegion = async () => {
    if (!selectedCell?.coord) return;

    const foundGrid = gridMap.get(Number(selectedCell.coord));
    if (!foundGrid?.gridId) {
      alert('This grid has not been created in the live game yet. Create it first.');
      return;
    }

    try {
      const response = await axios.post(`${API_BASE}/api/update-grid-region`, {
        gridId: foundGrid.gridId,
        region: selectedRegion || null
      });

      if (response.data.success) {
        setOriginalRegion(selectedRegion);
        setIsRegionDirty(false);
        setModalMessage(`Region updated to "${selectedRegion || 'none'}" for grid ${selectedCell.coord}`);
        setShowModal(true);
        handleRefreshData();
      }
    } catch (error) {
      console.error('Failed to save region:', error);
      alert('Failed to save region. Check console for details.');
    }
  };

  // Get selected grids that have NO layout (eligible for batch create)
  const getGridsWithoutLayout = () => {
    return selectedCells.filter(coord => {
      const hasLayout = layoutCache.has(Number(coord));
      const gridType = gridMap.get(Number(coord))?.gridType;
      // Exclude homestead/town types
      if (['homestead', 'town'].includes(gridType)) return false;
      return !hasLayout;
    });
  };

  // Get selected grids that HAVE a database entry (eligible for batch reset)
  const getGridsWithDatabaseEntry = () => {
    return selectedCells.filter(coord => {
      const grid = gridMap.get(Number(coord));
      return grid?.gridId; // Has been created in database
    });
  };

  // Save region for multiple grids (bulk update)
  const handleBulkSaveRegion = async () => {
    if (selectedCells.length === 0) return;

    // Get gridIds for all selected cells that have been created
    const gridIds = selectedCells
      .map(coord => gridMap.get(Number(coord)))
      .filter(grid => grid?.gridId)
      .map(grid => grid.gridId);

    if (gridIds.length === 0) {
      alert('None of the selected grids have been created in the live game yet.');
      return;
    }

    const confirmed = window.confirm(
      `Update region to "${selectedRegion || 'none'}" for ${gridIds.length} grids?`
    );
    if (!confirmed) return;

    try {
      const response = await axios.post(`${API_BASE}/api/bulk-update-grid-regions`, {
        gridIds,
        region: selectedRegion || null
      });

      if (response.data.success) {
        setIsRegionDirty(false);
        setModalMessage(`Region updated for ${response.data.modifiedCount} grids`);
        setShowModal(true);
        handleRefreshData();
      }
    } catch (error) {
      console.error('Failed to bulk save regions:', error);
      alert('Failed to save regions. Check console for details.');
    }
  };

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

  // Update region when selected cell changes (single selection)
  useEffect(() => {
    if (selectedCell?.coord && selectedCells.length <= 1) {
      const foundGrid = gridMap.get(Number(selectedCell.coord));
      const currentRegion = foundGrid?.region || '';
      setSelectedRegion(currentRegion);
      setOriginalRegion(currentRegion);
      setIsRegionDirty(false);
    }
  }, [selectedCell, gridMap, selectedCells.length]);

  const renderValleyIcon = () => '✅';

  const allGrids = settlements
    .filter(s => s.frontierId?.toString() === selectedFrontier?.toString())
    .flatMap(s => Array.isArray(s.grids) && s.grids.every(row => Array.isArray(row))
      ? s.grids.flatMap(row => row)
      : []);

  console.log(`📊 total grids for frontier ${selectedFrontier}:`, allGrids.length);
  console.log(`🧩 gridMap size:`, gridMap.size);



const handleGridClick = (gridCoord, event) => {
    const foundGrid = gridMap.get(Number(gridCoord));
    const type = foundGrid?.gridType;

    if (event?.shiftKey) {
      // Shift+click: toggle this cell in the multi-selection
      setSelectedCells(prev => {
        if (prev.includes(gridCoord)) {
          return prev.filter(c => c !== gridCoord);
        } else {
          return [...prev, gridCoord];
        }
      });
      // Also update the main selected cell for display purposes
      setSelectedCell({ coord: gridCoord, type });
    } else {
      // Normal click: single selection, clear multi-selection
      setSelectedCell({ coord: gridCoord, type });
      setSelectedCells([gridCoord]);
    }
  };

  // Mouse handlers for drag selection
  const handleMouseDown = (gridCoord, event) => {
    if (!event.shiftKey) {
      setIsDragging(true);
      setDragStart(gridCoord);
      setSelectedCells([gridCoord]);
    }
  };

  const handleMouseEnter = (gridCoord) => {
    if (isDragging && dragStart) {
      // Calculate rectangular selection between dragStart and current cell
      const startCoord = Number(dragStart);
      const endCoord = Number(gridCoord);

      // Extract row/col from gridCoord (format: 101SSGG)
      const getRowCol = (coord) => {
        const adjusted = coord - 1010000;
        const settlementPart = Math.floor(adjusted / 100);
        const gridPart = adjusted % 100;
        const row = Math.floor(settlementPart / 10) * 8 + Math.floor(gridPart / 10);
        const col = (settlementPart % 10) * 8 + (gridPart % 10);
        return { row, col };
      };

      const start = getRowCol(startCoord);
      const end = getRowCol(endCoord);

      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);

      // Build selection of all cells in the rectangle
      const newSelection = [];
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const settlementRow = Math.floor(row / 8);
          const settlementCol = Math.floor(col / 8);
          const gridRowWithinSettlement = row % 8;
          const gridColWithinSettlement = col % 8;
          const settlementPart = settlementRow * 10 + settlementCol;
          const gridPart = gridRowWithinSettlement * 10 + gridColWithinSettlement;
          const coord = 1010000 + (settlementPart * 100) + gridPart;
          if (gridMap.has(coord)) {
            newSelection.push(coord);
          }
        }
      }
      setSelectedCells(newSelection);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
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

  // Batch create grids in live game
  const handleBulkCreateGridsLive = async () => {
    const eligibleGrids = getGridsWithoutLayout();
    if (eligibleGrids.length === 0) return;

    const confirmed = window.confirm(
      `Create ${eligibleGrids.length} grids in the live game?\n\n` +
      `This will create real grids in the game database.`
    );
    if (!confirmed) return;

    setModalMessage(`Creating grids: 0/${eligibleGrids.length}`);
    setShowModal(true);

    let successCount = 0;
    let failCount = 0;

    try {
      // Fetch settlements once for all grids
      const settlementsResponse = await axios.get(`${API_BASE}/api/settlements`);
      const allSettlements = settlementsResponse.data;

      for (let i = 0; i < eligibleGrids.length; i++) {
        const gridCoord = eligibleGrids[i];
        setModalMessage(`Creating grids: ${i + 1}/${eligibleGrids.length}`);

        try {
          // Find grid details from settlements
          let foundGrid = null;
          let foundSettlementId = null;
          let foundFrontierId = null;

          for (const settlement of allSettlements) {
            if (!settlement.grids) continue;
            for (const row of settlement.grids) {
              for (const grid of row) {
                if (String(grid.gridCoord) === String(gridCoord)) {
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
            console.warn(`GridCoord ${gridCoord} not found in settlements`);
            failCount++;
            continue;
          }

          await axios.post(`${API_BASE}/api/create-grid`, {
            gridCoord,
            gridType: foundGrid.gridType,
            settlementId: foundSettlementId,
            frontierId: foundFrontierId,
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to create grid ${gridCoord}:`, error);
          failCount++;
        }
      }

      setModalMessage(`Created ${successCount} grids.${failCount > 0 ? ` Failed: ${failCount}` : ''}`);
      setTimeout(() => handleRefreshData(), 1500);
    } catch (error) {
      console.error('Failed to fetch settlements for bulk create:', error);
      setModalMessage('Failed to fetch settlements data.');
    }
  };

  // Batch reset grids in live game
  const handleBulkResetGridsLive = async () => {
    const eligibleGrids = getGridsWithDatabaseEntry();
    if (eligibleGrids.length === 0) return;

    const confirmed = window.confirm(
      `Reset ${eligibleGrids.length} grids in the live game?\n\n` +
      `This will reset all resources and tiles for these grids.`
    );
    if (!confirmed) return;

    setModalMessage(`Resetting grids: 0/${eligibleGrids.length}`);
    setShowModal(true);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < eligibleGrids.length; i++) {
      const gridCoord = eligibleGrids[i];
      const foundGrid = gridMap.get(Number(gridCoord));
      setModalMessage(`Resetting grids: ${i + 1}/${eligibleGrids.length}`);

      try {
        // Find settlement/frontier IDs
        let foundSettlementId = null;
        let foundFrontierId = null;

        for (const settlement of settlements) {
          const sid = settlement.frontierId?.toString();
          if (sid === selectedFrontier?.toString()) {
            const grids = Array.isArray(settlement.grids) && settlement.grids.every(row => Array.isArray(row))
              ? settlement.grids.flatMap(row => row)
              : [];
            for (const grid of grids) {
              if (grid.gridCoord === Number(gridCoord)) {
                foundSettlementId = settlement._id;
                foundFrontierId = settlement.frontierId;
                break;
              }
            }
          }
          if (foundSettlementId) break;
        }

        if (!foundSettlementId || !foundFrontierId) {
          console.error(`Could not find settlement for grid ${gridCoord}`);
          failCount++;
          continue;
        }

        await axios.post(`${API_BASE}/api/reset-grid`, {
          gridCoord,
          gridId: foundGrid.gridId,
          gridType: foundGrid.gridType,
          settlementId: foundSettlementId,
          frontierId: foundFrontierId,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to reset grid ${gridCoord}:`, error);
        failCount++;
      }
    }

    setModalMessage(`Reset ${successCount} grids.${failCount > 0 ? ` Failed: ${failCount}` : ''}`);
    setTimeout(() => handleRefreshData(), 1500);
  };

  return (
    <div className="frontier-container">
      <div className="frontier-base-panel">
        <h2>🗺️ Frontier View</h2>

        <div className="shared-buttons">
          <button className="btn-basic btn-mini" onClick={handleRefreshData}>
            🔄 Refresh Data
          </button>
        </div>

        <div className="selected-cell-info">
          {/* Multi-select UI */}
          {selectedCells.length > 1 && (
            <div className="multi-select-info" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '4px', color: '#000' }}>
              <p><strong>{selectedCells.length} cells selected</strong></p>
              <p style={{ fontSize: '12px', color: '#666' }}>
                (Shift+click to toggle, drag to select range)
              </p>

              {/* Bulk region editing */}
              <div style={{ marginTop: '10px' }}>
                <strong>Set Region for all:</strong>
                <div style={{ marginTop: '5px' }}>
                  <select
                    value={selectedRegion}
                    onChange={handleRegionChange}
                    style={{ padding: '4px 8px', marginRight: '8px' }}
                  >
                    <option value="">(none)</option>
                    {regionOptions.map(r => (
                      <option key={r.type} value={r.type}>{r.symbol || ''} {r.type}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkSaveRegion}
                    style={{ padding: '4px 12px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}
                  >
                    Save Region ({selectedCells.length} grids)
                  </button>
                </div>
              </div>

              {/* Batch Create Grids button - only if ALL selected grids have NO layout */}
              {getGridsWithoutLayout().length === selectedCells.length &&
               getGridsWithoutLayout().length > 0 && (
                <button
                  onClick={handleBulkCreateGridsLive}
                  style={{ marginTop: '10px', padding: '4px 12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer', display: 'block', width: '100%' }}
                >
                  Create Grids in Live Game ({selectedCells.length} grids)
                </button>
              )}

              {/* Batch Reset Grids button - only if ALL selected grids have database entries */}
              {getGridsWithDatabaseEntry().length === selectedCells.length &&
               getGridsWithDatabaseEntry().length > 0 && (
                <button
                  onClick={handleBulkResetGridsLive}
                  style={{ marginTop: '10px', padding: '4px 12px', backgroundColor: '#ff9800', color: 'white', border: 'none', cursor: 'pointer', display: 'block', width: '100%' }}
                >
                  Reset Grids Live Game ({selectedCells.length} grids)
                </button>
              )}

              <button
                onClick={() => { setSelectedCells([]); }}
                style={{ marginTop: '10px', padding: '4px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}
              >
                Clear Selection
              </button>
            </div>
          )}

          {/* Single cell UI */}
          {selectedCell && selectedCells.length <= 1 && (
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

              {/* Region editing section */}
              {selectedCells.length <= 1 && (
                <div className="region-section" style={{ marginTop: '15px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
                  <strong>Region:</strong>{' '}
                  <span style={{ color: gridMap.get(Number(selectedCell.coord))?.region ? '#0c1d2bff' : '#0c1d2bff' }}>
                    {gridMap.get(Number(selectedCell.coord))?.region || '(none)'}
                  </span>

                  {gridMap.get(Number(selectedCell.coord))?.gridId && (
                    <div style={{ marginTop: '8px' }}>
                      <select
                        value={selectedRegion}
                        onChange={handleRegionChange}
                        style={{ padding: '4px 8px', marginRight: '8px' }}
                      >
                        <option value="">(none)</option>
                        {regionOptions.map(r => (
                          <option key={r.type} value={r.type}>{r.symbol || ''} {r.type}</option>
                        ))}
                      </select>
                      {isRegionDirty && (
                        <button
                          className="save-region-button"
                          onClick={handleSaveRegion}
                          style={{ padding: '4px 12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}
                        >
                          Save Region
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Filter checkboxes */}
        <div className="filter-section" style={{ marginTop: '20px', borderTop: '1px solid #555', paddingTop: '15px' }}>
          <strong style={{ display: 'block', marginBottom: '10px' }}>Grid Filters:</strong>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showSavedLayouts}
              onChange={(e) => setShowSavedLayouts(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Show saved layouts
          </label>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showDatabaseGrids}
              onChange={(e) => setShowDatabaseGrids(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Show database grids
          </label>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showRegions}
              onChange={(e) => setShowRegions(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Show regions
          </label>
        </div>
      </div>

      <div className="frontier-grid-container" ref={containerRef} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
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
                const hasRegion = foundGrid?.region;

                // Check if this grid has a gridId (meaning it's been created in the database)
                if (showDatabaseGrids && foundGrid?.gridId) {
                  cellClass += ' has-grid-id'; // Light yellow background
                }

                if (type === 'homestead') {
                  cellClass += ' type-homestead';
                } else if (type === 'town') {
                  cellClass += ' type-homestead'; // same beige base
                  cellContent = '🚂';
                } else if (['valley0', 'valley1', 'valley2', 'valley3'].includes(type)) {
                  if (showSavedLayouts && layoutCache.has(gridCoord)) {
                    cellContent = renderValleyIcon(); // ✅
                  }
                }

                // Check for selection (single or multi)
                if (selectedCells.includes(gridCoord)) {
                  cellClass += ' selected';
                } else if (selectedCell?.coord === gridCoord && selectedCells.length === 0) {
                  cellClass += ' selected';
                }

                return (
                  <div
                    key={col}
                    className={cellClass}
                    onClick={(e) => handleGridClick(gridCoord, e)}
                    onMouseDown={(e) => handleMouseDown(gridCoord, e)}
                    onMouseEnter={() => handleMouseEnter(gridCoord)}
                    style={{ position: 'relative' }}
                  >
                    {cellContent}
                    {/* Region overlay */}
                    {showRegions && hasRegion && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(255, 0, 0, 0.3)',
                        pointerEvents: 'none'
                      }} />
                    )}
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
