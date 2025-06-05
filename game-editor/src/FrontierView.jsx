import React, { useState, useEffect, useMemo } from 'react';
import './FrontierView.css';
import Modal from './Modal';

const GRID_DIMENSION = 64;
const FRONTIER_ID = 'yourFrontierIdHere'; // Replace or fetch dynamically

const FrontierView = ({ selectedFrontier, settlements }) => {

console.log("📦 FrontierView rendered");
console.log("🧭 selectedFrontier:", selectedFrontier);
console.log("📜 settlements.length:", settlements?.length);

  const [modalMessage, setModalMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [layoutCache, setLayoutCache] = useState(new Set());
  const [selectedCell, setSelectedCell] = useState(null);


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
  }, [settlements]);

  const gridMap = useMemo(() => {
    const map = new Map();
    console.log("🧩 Building gridMap:");
    settlements.forEach(s => {
      console.log(`📥 Raw grids for settlement ${s.name}:`, JSON.stringify(s.grids));
      const sid = s.frontierId?.toString();
      const match = sid === selectedFrontier?.toString();
      console.log(`🧩 Settlement ${s.name} | frontierId: ${sid} | matches selected: ${match}`);
      if (match) {
        const grids = Array.isArray(s.grids) && s.grids.every(row => Array.isArray(row))
          ? s.grids.flatMap(row => row)
          : [];
        grids.forEach(grid => {
          console.log(`  ➕ Adding gridCoord ${grid.gridCoord} with type ${grid.gridType}`);
          map.set(grid.gridCoord, grid);
        });
      }
    });
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

  useEffect(() => {
    console.log('📦 Logging allGrids content:');
    allGrids.forEach((grid, index) => {
      console.log(`🔹 Grid ${index}:`, grid);
    });
  }, [allGrids]);


const handleGridClick = async (gridCoord, gridType) => {
    console.log('🖱️ Grid clicked:', gridCoord, gridType);
    if (!gridType?.startsWith('valley')) return;
    setSelectedCell({ coord: gridCoord, type: gridType });
    console.log(`🟢 setSelectedCell to:`, { coord: gridCoord, type: gridType });

    console.log(`📌 Selected cell updated to: ${gridCoord}`);

    const layoutPath = `../../../game-server/layouts/gridLayouts/valleyFixedCoord/${gridCoord}.json`;

    try {
      const fs = window.require('fs');
      const path = window.require('path');
      const app = window.require('@electron/remote').app;
      const isDev = !app.isPackaged;
      const projectRoot = isDev
        ? path.join(__dirname, '..', '..', '..')
        : path.join(app.getAppPath(), '..', '..', '..', '..', '..', '..', '..');

      const fullPath = path.join(projectRoot, 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord', `${gridCoord}.json`);

      if (fs.existsSync(fullPath)) {
        window.dispatchEvent(new CustomEvent('editor-load-grid', { detail: { gridCoord, gridType: 'valleyFixedCoord' } }));
      } else {
        setModalMessage("No available layout saved. Create a new one for this grid?");
        setShowModal(true);
      }
    } catch (error) {
      console.error("File check failed:", error);
    }
  };


  return (
    <div className="frontier-container">
      <div className="frontier-base-panel">
        <h2>🗺️ Frontier View</h2>

        <div className="selected-cell-info">
          {selectedCell && (
            <p>
              <strong>Selected Cell:</strong> {selectedCell.coord}<br />
              <strong>Type:</strong> {selectedCell.type ?? 'Unknown'}
            </p>
          )}
        </div>
      </div>

      <div className="frontier-grid-container">
        <div className="frontier-grid">
          {Array.from({ length: GRID_DIMENSION }).map((_, x) => (
            <div className="frontier-row" key={x}>
              {Array.from({ length: GRID_DIMENSION }).map((_, y) => {
                const gridCoord = parseInt(`10${x.toString().padStart(2, '0')}${y.toString().padStart(2, '0')}`);
//              console.log(`🔍 Looking up gridCoord: ${gridCoord}`);
                const foundGrid = gridMap.get(gridCoord);

                const type = foundGrid?.gridType;
                if (!foundGrid) {
//                  console.warn(`⚠️ No grid found for coord ${gridCoord}`);
                }
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

        //console.log(`🔲 Rendering cell ${gridCoord} | type: ${type} | content: "${cellContent}" | selected: ${selectedCell?.coord === gridCoord}`);

                return (
                  <div
                    key={y}
                    className={cellClass}
                    onClick={() => handleGridClick(gridCoord, type)}
                  >
                    {cellContent}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {showModal && <Modal onClose={() => setShowModal(false)}><p>{modalMessage}</p></Modal>}
      </div>
    </div>
  );
};

export default FrontierView;