import React from 'react';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import '../Deco/DecoPanel.css';

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

  return (
    <Panel onClose={onClose} titleKey="2054" panelName="DoorPanel">
      <div className="deco-panel-container">
        <div className="deco-panel-content">
          <h2>{door?.symbol || '🚪'} {getLocalizedString(stationType, strings)}</h2>
          {keyName && <p>{(strings[2055] || 'This door requires a {key}.').replace('{key}', keyName)}</p>}
        </div>

        {(isHomestead || isDeveloper) && (
          <div className="deco-panel-footer">
            <hr />
            <div className="shared-buttons">
              <TransactionButton
                className="btn-basic btn-success"
                onAction={handleSellStation}
                transactionKey={`sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
              >
                {strings[425]}
              </TransactionButton>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default React.memo(DoorPanel);
