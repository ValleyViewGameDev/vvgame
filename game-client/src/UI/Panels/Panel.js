import React, { useEffect } from 'react';
import { usePanelContext } from './PanelContext'; // Import the context
import './Panel.css';
import CloseButton from '../Buttons/CloseButton';
import { useStrings } from '../StringsContext';

// Panels that fly in from the RIGHT edge on desktop (docs/ui-conventions.md). Phones keep every
// panel on the left: mobile.css overrides the class.
const RIGHT_PANELS = new Set(['HowToPanel', 'SeasonPanel', 'LeaderboardPanel', 'TownNewsPanel']);

const Panel = ({ onClose, children, descriptionKey, panelName, titleKey, title }) => {
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
    <div className={`panel-container${RIGHT_PANELS.has(panelName) ? ' panel-container--right' : ''}`} data-panel-name={panelName}>
      {/* Fixed Header with Title and Close Button */}
      <div className="panel-header">
        <h2 className="panel-title">{title || strings[titleKey] || "Panel"}</h2>
        <CloseButton onClick={() => { closePanel(); onClose(); }} />
      </div>

      {/* Scrollable Content Area */}
      <div className="panel-content">{children}</div>

      {/* Panel Description */}
      {descriptionKey && (
        <div className="panel-description">
          <p className="text-hint">{strings[descriptionKey]}</p>
        </div>
      )}
      
      {/* Buffer space for Ko-fi widget */}
      <div className="panel-buffer-space"></div>
    </div>
  );
};

export default Panel;