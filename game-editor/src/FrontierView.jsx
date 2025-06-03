// game-editor/src/FrontierView.jsx
import React, { useState } from 'react';
import './FrontierView.css';
import Modal from './Modal';

const GRID_DIMENSION = 64;
const FRONTIER_ID = 'yourFrontierIdHere'; // Replace or fetch dynamically

const FrontierView = ({ selectedFrontier, settlements }) => {
  const [modalMessage, setModalMessage] = useState('');
  const [showModal, setShowModal] = useState(false);

  const handleGridClick = async (gridCoord, gridType) => {
    if (!gridType?.startsWith('valley')) return;

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
    <div className="frontier-base-panel">
      <h2>🗺️ Frontier View</h2>
      <div className="frontier-grid">
        {Array.from({ length: GRID_DIMENSION }).map((_, x) => (
          <div className="frontier-row" key={x}>
            {Array.from({ length: GRID_DIMENSION }).map((_, y) => {
              const gridCoord = parseInt(`10${x.toString().padStart(2, '0')}${y.toString().padStart(2, '0')}`);
              const foundGrid = settlements.flatMap(s => s.grids).flat().find(g => g.gridCoord === gridCoord);
              const type = foundGrid?.gridType;

              return (
                <div
                  key={y}
                  className={`frontier-cell ${type ? `type-${type}` : ''}`}
                  onClick={() => handleGridClick(gridCoord, type)}
                >
                  {type ? type[0].toUpperCase() : ''}
                </div>
              );
            })}
          </div>
        ))}
        {showModal && <Modal onClose={() => setShowModal(false)}><p>{modalMessage}</p></Modal>}
      </div>
    </div>
  );
};

export default FrontierView;