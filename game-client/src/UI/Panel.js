import React, { useEffect } from 'react';
import { usePanelContext } from './PanelContext'; // Import the context
import './Panel.css';
import { useStrings } from './StringsContext';

const Panel = ({ onClose, children, descriptionKey, panelName, titleKey }) => {
  const strings = useStrings();
  const { activePanel, openPanel, closePanel } = usePanelContext();

  useEffect(() => {
    if (activePanel === panelName) {
      openPanel(panelName); // Set this panel as active
    }
  }, [activePanel, panelName, openPanel]);

  if (activePanel !== panelName) {
    return null; // Ensure only the active panel is displayed
  }

  return (
    <div className="panel-container">
      {/* Fixed Header with Title and Close Button */}
      <div className="panel-header">
        <h2 className="panel-title">{strings[titleKey] || "Panel"}</h2>
        <button
          className="panel-close-btn"
          onClick={() => {
            closePanel();
            onClose();
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="24"
            height="24"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Scrollable Content Area */}
      <div className="panel-content">{children}</div>

      {/* Panel Description */}
      {descriptionKey && (
        <div className="panel-description">
          <p>{strings[descriptionKey]}</p>
        </div>
      )}
    </div>
  );
};

export default Panel;