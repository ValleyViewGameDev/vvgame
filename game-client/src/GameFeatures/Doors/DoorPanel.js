import React from 'react';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import '../Deco/DecoPanel.css';
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';

/**
 * "Doors": opened by a tap on any resource with action 'door' (App.js), instead of the
 * Decorations panel. Shows the door with its own symbol and the key it needs (`requires`).
 * Selling stays as on the Decorations panel: on the homestead, or anywhere for a developer.
 */
const DoorPanel = ({
  onClose,
  currentPlayer,
  setInventory,
  setBackpack,
  setCurrentPlayer,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
  TILE_SIZE,
  updateStatus,
  masterResources,
  isDeveloper,
}) => {
  const strings = useStrings();
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const door = masterResources.find((res) => res.type === stationType);
  const keyName = door?.requires ? getLocalizedString(door.requires, strings) : null;

  const handleSellStation = async () => {
    await handleProtectedSelling({
      currentPlayer,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      setResources,
      stationType,
      currentStationPosition,
      gridId,
      TILE_SIZE,
      updateStatus,
      onClose,
      devOnly: !isHomestead,
    });
  };


  // Sell section, pinned under the panel (UI/Panels/SellSection.js): Sell (the refund) and Move
  const sellFooter = sellSection({
    canSell: isHomestead,
    isDeveloper,
    resourceType: stationType,
    masterResources,
    onSell: handleSellStation,
    transactionKey: `sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`,
    onMove: () => requestMove({ type: stationType, x: currentStationPosition.x, y: currentStationPosition.y }),
  });

  return (
    <Panel footer={sellFooter} onClose={onClose} titleKey="2054" panelName="DoorPanel">
      <div className="deco-panel-container">
        <div className="deco-panel-content">
          <h2>{door?.symbol || '🚪'} {getLocalizedString(stationType, strings)}</h2>
          {keyName && <p>{(strings[2055] || 'This door requires a {key}.').replace('{key}', keyName)}</p>}
        </div>


      </div>
    </Panel>
  );
};

export default React.memo(DoorPanel);
