import React from 'react';
import Panel from '../UI/Panels/Panel';
import FrontierMiniMap from './FrontierMiniMap';
import FeedbackLinks from '../UI/Panels/FeedbackLinks';
import { useStrings } from '../UI/StringsContext';
import { useModalContext } from '../UI/ModalContext';
import { uiString } from '../Utils/inputMode';

// The Map panel (formerly the base panel / Home sheet): opened and closed by the floating 🗺️
// button under the zoom pill. Map, range note, keyboard controls (desktop only), Town News and
// the feedback links. docs/ui-conventions.md §3.
function MapPanel({ onClose, isOnOwnHomestead, ...miniMapProps }) {
  const strings = useStrings();
  const { openModal } = useModalContext();

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

        <div className="shared-buttons">
          <button className="btn-basic" onClick={() => openModal('TownNews')}>{strings[10125]}</button>
        </div>

        <br />
        <FeedbackLinks />
        <br />
      </div>
    </Panel>
  );
}

export default MapPanel;
