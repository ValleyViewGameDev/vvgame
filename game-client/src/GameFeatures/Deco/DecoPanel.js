import API_BASE from '../../config';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import './DecoPanel.css';

const DecoPanel = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
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
  const [resourceDetails, setResourceDetails] = useState(null);
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const strings = useStrings();

  console.log('Inside Deco Panel:', { stationType, currentStationPosition });

  useEffect(() => {
    const availableResource = masterResources.find((res) =>
      res.type === stationType &&
      (isHomestead || res.passable !== false)
    );
    setResourceDetails(availableResource);
  }, [stationType, masterResources, isHomestead]);

  useEffect(() => {
    const syncInventory = async () => {
      try {
        const storedInventory = JSON.parse(localStorage.getItem('inventory')) || [];
        setInventory(storedInventory);
  
        const serverResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        const serverInventory = serverResponse.data.inventory || [];
        if (JSON.stringify(storedInventory) !== JSON.stringify(serverInventory)) {
          setInventory(serverInventory);
          localStorage.setItem('inventory', JSON.stringify(serverInventory));
        }
      } catch (error) {
        console.error('Error syncing inventory:', error);
      }
    };
    syncInventory();
  }, [currentPlayer]);

  const handleSellStation = async (transactionId, transactionKey) => {
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
      devOnly: !isHomestead, // Only verify developer status when NOT on homestead
    });
  };
  

  return (
    <Panel onClose={onClose} titleKey="1128" panelName="DecoPanel" >
      <div className="deco-panel-container">
        <div className="deco-panel-content">
          <h2>
              {resourceDetails?.symbol || '🛖'} {getLocalizedString(stationType, strings)}
          </h2>
        </div>

        {(currentPlayer.location.gtype === 'homestead' || isDeveloper) && (
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

export default React.memo(DecoPanel);
