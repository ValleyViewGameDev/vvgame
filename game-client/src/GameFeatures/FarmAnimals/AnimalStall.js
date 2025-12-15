import API_BASE from '../../config';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import './AnimalStall.css';

const AnimalStall = ({
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
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const [stallDetails, setStallDetails] = useState(null);
  const [outputDetails, setOutputDetails] = useState(null);
  const strings = useStrings();

  console.log('Inside Animal Stall:', { stationType, currentStationPosition });

  useEffect(() => {
    const stallResource = masterResources.find((res) => res.type === stationType);
    setStallDetails(stallResource);
  }, [stationType, masterResources]);

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
    <Panel onClose={onClose} descriptionKey="1011" titleKey="1111" panelName="AnimalStall" >
      <div className="animalstall-panel-container">
        <div className="animalstall-panel-content">
          <h2>
              {stallDetails?.symbol || '🛖'} {stationType}
          </h2>
        </div>

        {(currentPlayer.location.gtype === 'homestead' || isDeveloper) && (
          <div className="animalstall-panel-footer">
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

export default React.memo(AnimalStall);
