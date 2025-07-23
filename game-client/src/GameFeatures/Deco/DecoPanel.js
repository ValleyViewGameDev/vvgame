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

  const handleSellStation = async () => {
    if (isActionCoolingDown) return;
    setIsActionCoolingDown(true);
    setUILocked(true);
    setTimeout(() => {
      setIsActionCoolingDown(false);
      setUILocked(false);
    }, COOLDOWN_DURATION);

    const ingredients = [];
    for (let i = 1; i <= 3; i++) {
      const ingredientType = stallDetails[`ingredient${i}`];
      const ingredientQty = stallDetails[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        ingredients.push({ type: ingredientType, quantity: ingredientQty });
      }
    }
    if (!ingredients.length) { console.error('No ingredients found for refund.'); return; }

    try {
      for (const { type, quantity } of ingredients) {
        const success = await gainIngredients({
          playerId: currentPlayer.playerId,
          currentPlayer,
          resource: type,
          quantity,
          inventory,
          backpack,
          setInventory,
          setBackpack,
          setCurrentPlayer,
          updateStatus,
          masterResources,
        });
        if (!success) return;
      }

      await updateGridResource(
        gridId,
        { type: null, x: currentStationPosition.x, y: currentStationPosition.y },
        setResources,
        true
      );

      setResources(prevResources =>
        prevResources.filter(res => !(res.x === currentStationPosition.x && res.y === currentStationPosition.y))
      );
      console.log("🧹 AnimalStall resource removed from client state.");
      createCollectEffect(currentStationPosition.x, currentStationPosition.y, TILE_SIZE);

      const totalRefund = ingredients
        .filter((item) => item.type === "Money")
        .reduce((sum, item) => sum + item.quantity, 0);

      console.log(`Sold ${stationType} successfully for ${totalRefund} Money.`);
      updateStatus(`Sold ${stationType} for ${totalRefund} Money.`);
      onClose();
    } catch (error) {
      console.error('Error selling the stall:', error);
    }
  };
  

  return (
    <Panel onClose={onClose} descriptionKey="1028" titleKey="1128" panelName="DecoPanel" >
      <div className="standard-panel">
        <h2>
            {stallDetails?.symbol || '🛖'} {stationType}
        </h2>


        {currentPlayer.location.gtype === 'homestead' && (
          <>
            <hr />
              <div className="standard-buttons">
                <button className="btn-success" onClick={handleSellStation} disabled={isActionCoolingDown}>
                  {strings[425]}
                </button>
              </div>
          </>
        )}
      </div>
    </Panel>
  );
  
};

export default React.memo(DecoPanel);
