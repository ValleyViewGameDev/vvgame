import React, { useState, useEffect, useMemo } from 'react';
import './FrontierView.css';
import Modal from './components/Modal.jsx';
import { useFileContext } from './FileContext';

const GRID_DIMENSION = 64;

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
    window.dispatchEvent(new CustomEvent('editor-load-grid', { detail: { gridCoord: selectedCell.coord, gridType: selectedCell.type } }));
};

  return (
    <div className="frontier-container">
      <div className="frontier-base-panel">
        <h2>🗺️ Frontier View</h2>

        <div className="selected-cell-info">
          {selectedCell && (
            <>
              <p>
                <strong>Selected Cell:</strong> {selectedCell.coord}<br />
                <strong>Type:</strong> {selectedCell.type ?? 'Unknown'}
              </p>
              {(
                layoutCache.has(Number(selectedCell.coord)) ||
                ['homestead', 'town'].includes(selectedCell.type)
              ) ? (
                <button className="load-grid-button" onClick={handleLoadGrid}>Load Grid</button>
              ) : (
                <button className="create-grid-button" onClick={handleCreateGrid}>Create Grid</button>
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

                const minorIndex = minorRow * 8 + minorCol;
                const megaIndex = megaRow * 8 + megaCol;
                const trueIndex = megaIndex * 64 + minorIndex;

                const foundGrid = allGrids[trueIndex];
                const gridCoord = foundGrid?.gridCoord;
                const type = foundGrid?.gridType;

                let cellClass = 'frontier-cell';
                let cellContent = '';

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
    </div>
  );
};

export default FrontierView;
