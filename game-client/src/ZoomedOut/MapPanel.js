import React from 'react';
import Panel from '../UI/Panels/Panel';
import FrontierMiniMap from './FrontierMiniMap';
import { useStrings } from '../UI/StringsContext';
import { uiString } from '../Utils/inputMode';

// The Map panel (formerly the base panel / Home sheet): opened and closed by the floating 🗺️
// button under the zoom pill. Map, range note and keyboard controls (desktop only). Town News
// has its own floating button under the season button; Email Us and Discord live at the top of
// How to Play (and the bottom of Settings). docs/ui-conventions.md §3.
function MapPanel({ onClose, isOnOwnHomestead, ...miniMapProps }) {
  const strings = useStrings();

  return (
    <Panel onClose={onClose} panelName="MapPanel" title={strings[2] || 'Map'}>
      <div className="map-panel">
        <FrontierMiniMap strings={strings} {...miniMapProps} />

        {/* Range note stays right under the map on every layout */}
        <h3 style={{ textAlign: 'center' }}>{isOnOwnHomestead ? strings[10140] : strings[10141]}</h3>

        {/* Controls: desktop only (phones have no keyboard; Help lives in the header) */}
        <div className="map-panel-controls">
          <h2 style={{ textAlign: 'center' }}>{strings[10109]}</h2>
          <h3 style={{ textAlign: 'center' }}>{uiString(strings, 10135)}</h3>
          <h3 style={{ textAlign: 'center' }}>{strings[10136]}</h3>
          <h3 style={{ textAlign: 'center' }}>{strings[10137]}</h3>
          <br />
        </div>

        <br />
      </div>
    </Panel>
  );
}

export default MapPanel;
