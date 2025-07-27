import API_BASE from '../../config';
import axios from 'axios';
import { gainIngredients } from '../../Utils/InventoryManagement';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import { updateGridResource } from '../../Utils/GridManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { createCollectEffect } from '../../VFX/VFX';
import '../../UI/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { useUILock } from '../../UI/UILockContext';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/TransactionButton';

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
  const [stallDetails, setStallDetails] = useState(null);
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const strings = useStrings();
  const { setUILocked } = useUILock();
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
  const COOLDOWN_DURATION = 2000;

  console.log('Inside Deco Panel:', { stationType, currentStationPosition });

  useEffect(() => {
    const stallResource = masterResources.find((res) =>
      res.type === stationType &&
      (isHomestead || res.passable !== false)
    );
    setStallDetails(stallResource);
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
      onClose
    });
  };
  

  return (
    <Panel onClose={onClose} descriptionKey="1028" titleKey="1128" panelName="DecoPanel" >
      <div className="standard-panel">
        <h2>
            {stallDetails?.symbol || '🛖'} {stationType}
        </h2>


        {(currentPlayer.location.gtype === 'homestead' || isDeveloper) && (
          <>
            <hr />
              <div className="standard-buttons">
                <TransactionButton 
                  className="btn-success" 
                  onAction={handleSellStation}
                  transactionKey={`sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
                >
                  {strings[425]}
                </TransactionButton>
              </div>
          </>
        )}
      </div>
    </Panel>
  );
  
};

export default React.memo(DecoPanel);
