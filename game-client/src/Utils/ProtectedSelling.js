import API_BASE from '../config';
import axios from 'axios';
import { createCollectEffect } from '../VFX/VFX';
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import { updateGridResource } from './GridManagement';
import { checkDeveloperStatus } from './appUtils';

// Generate unique transaction ID
function generateTransactionId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Protected selling function for all panels
// devOnly: if true, verifies developer status before proceeding
export async function handleProtectedSelling({
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
  devOnly = false
}) {
  // If devOnly is true, verify developer status before proceeding
  if (devOnly) {
    const isStillDeveloper = await checkDeveloperStatus(currentPlayer?.username);
    if (!isStillDeveloper) {
      updateStatus('❌ Developer access required.');
      return { success: false, error: 'Developer access required' };
    }
  }
  console.log(`🔒 [PROTECTED SELLING] Starting protected sale for ${stationType} at (${currentStationPosition.x}, ${currentStationPosition.y})`);
  
  // Debug: Check what resources exist at this position
  const allResources = GlobalGridStateTilesAndResources.getResources();
  const resourcesAtPosition = allResources.filter(res => {
    // Check exact position
    if (res.x === currentStationPosition.x && res.y === currentStationPosition.y) {
      return true;
    }
    // Check if this position is covered by a multi-tile resource
    const tileSpan = res.size || 1;
    if (tileSpan > 1) {
      return currentStationPosition.x >= res.x && currentStationPosition.x < res.x + tileSpan &&
             currentStationPosition.y <= res.y && currentStationPosition.y > res.y - tileSpan;
    }
    return false;
  });
  
  console.log(`🔍 Resources at/covering position (${currentStationPosition.x}, ${currentStationPosition.y}):`, resourcesAtPosition);
  
  // Generate  transaction ID and key
  const transactionId = generateTransactionId();
  const transactionKey = `sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`;
  
  try {
    const response = await axios.post(`${API_BASE}/api/sell-for-refund`, {
      playerId: currentPlayer.playerId,
      gridId,
      stationX: currentStationPosition.x,
      stationY: currentStationPosition.y,
      stationType,
      transactionId,
      transactionKey
    });

    if (response.data.success) {
      const { refundIngredients, totalMoneyRefund, inventory, removedStation } = response.data;
      
      // Update inventory from server response
      if (inventory) {
        setInventory(inventory);
        setCurrentPlayer(prev => ({ ...prev, inventory }));
      }

      // Find the resource to check if it has shadows
      const soldResource = GlobalGridStateTilesAndResources.getResources().find(
        (res) => res.x === currentStationPosition.x && res.y === currentStationPosition.y
      );
      
      // Remove ONLY the main resource from DB (shadows only exist in local state)
      await updateGridResource(gridId, {
        x: currentStationPosition.x,
        y: currentStationPosition.y,
        type: null
      }, true);
      
      console.log(`✅ Removed main resource from database`);
      
      // Update local state to reflect removal of station and shadows
      const filteredResources = GlobalGridStateTilesAndResources.getResources().filter(
        (res) => {
          // Remove the sold station
          if (res.x === currentStationPosition.x && res.y === currentStationPosition.y) return false;
          
          // Remove any shadows belonging to this station
          if (soldResource && soldResource.size && soldResource.size > 1 && res.type === 'shadow') {
            // Generate the anchorKey the same way we do when creating shadows
            const anchorKey = soldResource.anchorKey || `${soldResource.type}-${soldResource.x}-${soldResource.y}`;
            if (res.parentAnchorKey === anchorKey) {
              return false;
            }
          }
          return true;
        }
      );
      GlobalGridStateTilesAndResources.setResources(filteredResources);
      setResources(filteredResources);

      // Visual feedback
      createCollectEffect(currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
      
      console.log(`✅ Station ${stationType} sold successfully for ${totalMoneyRefund} Money.`);
      updateStatus(`Sold ${stationType} for ${totalMoneyRefund} Money.`);
      
      // Close the panel
      onClose();
      
      return { success: true, totalMoneyRefund };
    }
  } catch (error) {
    console.error('Error in protected station selling:', error);
    
    if (error.response?.status === 429) {
      updateStatus(471);
    } else if (error.response?.status === 400) {
      console.error('❌ 400 Error details:', error.response?.data);
      updateStatus(`❌ Cannot sell: ${error.response?.data?.error || 'Invalid request'}`);
    } else {
      updateStatus('❌ Failed to sell station');
    }
    
    return { success: false, error: error.response?.data?.error || 'Unknown error' };
  }
}