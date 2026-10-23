import API_BASE from '../../config';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import { updateGridResource } from '../../Utils/GridManagement';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';

const CropPanel = ({
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
  currentResource,
  TILE_SIZE,
  updateStatus,
  masterResources,
  globalTuning,
}) => {
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
  const COOLDOWN_DURATION = 2000;
  const [cropDetails, setCropDetails] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const strings = useStrings();

  console.log('--------Inside Crop Panel:', { stationType, currentStationPosition, currentResource });

  useEffect(() => {
    const cropResource = masterResources.find((res) => res.type === stationType);
    setCropDetails(cropResource);
  }, [stationType, masterResources]);

  // Update current time every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Function to generate countdown text like the tooltip
  const getCropStatusText = () => {
    if (!currentResource || !currentResource.growEnd) return "Unknown status";
    
    const remainingTime = Math.max(0, currentResource.growEnd - currentTime);
    
    if (remainingTime <= 0) {
      return "Ready for harvest!";
    }
    
    const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    
    return `${parts.join(' ')} remaining`;
  };

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

  const removeCrop = async () => {
    if (isActionCoolingDown) return;
    setIsActionCoolingDown(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
    }, COOLDOWN_DURATION);

    try {
      // Remove the crop resource from the grid (no refund)
      await updateGridResource(
        gridId,
        { type: null, x: currentStationPosition.x, y: currentStationPosition.y },
        setResources,
        true
      );

      setResources(prevResources =>
        prevResources.filter(res => !(res.x === currentStationPosition.x && res.y === currentStationPosition.y))
      );

      console.log(`Removed ${stationType} successfully (no refund).`);
      updateStatus(439);
      onClose();
    } catch (error) {
      console.error('Error removing the crop:', error);
    }
  };
  

  // Sell section (UI/Panels/SellSection.js): a plot gives nothing back, so "Sell (💰0)" removes it;
  // Move picks it up, growth timer and all, on the player's own homestead
  const sellFooter = sellSection({
    canSell: true,
    canMove: currentPlayer?.location?.gtype === 'homestead',
    resourceType: stationType,
    masterResources,
    refund: [],
    onSell: removeCrop,
    transactionKey: `remove-crop-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`,
    disabled: isActionCoolingDown,
    onMove: () => requestMove({ type: stationType, x: currentStationPosition.x, y: currentStationPosition.y }),
  });

  return (
    <Panel footer={sellFooter} onClose={onClose} descriptionKey="1030" titleKey="1130" panelName="CropPanel" >
      <div className="standard-panel">
        <h2>
            {cropDetails?.symbol || '🌱'} {stationType}
        </h2>

        {/* Show crop growth status */}
        <p>
          {getCropStatusText()}
        </p>

      </div>
    </Panel>
  );
  
};

export default React.memo(CropPanel);
