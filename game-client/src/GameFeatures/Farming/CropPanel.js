import API_BASE from '../../config';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import ResourceIcon from '../../UI/Icons/ResourceIcon';
import Panel from '../../UI/Panels/Panel';
import { updateGridResource } from '../../Utils/GridManagement';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';
import '../../UI/Buttons/ResourceButton.css'; // the .gem-button chip
import { calculateGemSpeedupCost } from '../../Economy/EconomyUtils';
import { getPlayerQuantity } from '../../Utils/InventoryManagement';
import { confirmGemSpend } from '../../UI/Modals/GemSpendConfirm';
import { usePanelContext } from '../../UI/Panels/PanelContext';
import { formatCountdown, formatNumber } from '../../UI/Timers';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import FloatingTextManager from '../../UI/FloatingText';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import FarmState from '../../FarmState';
import { createRipenEffect } from '../../VFX/VFX';
import { boardArtScale } from '../../Render/PixiRenderer/boardArt';
import { getLocalizedString } from '../../Utils/stringLookup';

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
  const { openPanel } = usePanelContext();

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

  // The plot's growEnd: the board's copy (it moves when a speed-up lands), else the panel's snapshot
  const liveGrowEnd = () => {
    const onBoard = (GlobalGridStateTilesAndResources.getResources() || [])
      .find((r) => r.x === currentStationPosition.x && r.y === currentStationPosition.y);
    return onBoard?.growEnd ?? currentResource?.growEnd;
  };
  const growLeftMs = Math.max(0, (liveGrowEnd() || 0) - currentTime);

  // Ripen it now for gems: ONE request (/action/grow-speedup), priced by the server from its own
  // clock (ceil(minutes left ^ 0.45), the chip's figure). Optimistic: the plot crossfades into its
  // crop and the panel closes on the tap; a refusal puts the growing plot back.
  const growGemCost = growLeftMs > 0 ? calculateGemSpeedupCost(growLeftMs) : 0;
  const handleGrowSpeedup = async () => {
    const { x, y } = currentStationPosition;
    const plotDef = cropDetails;
    const cropDef = masterResources.find((r) => r.type === plotDef?.output);
    if (!plotDef || !cropDef || !(growGemCost > 0)) return;
    if (getPlayerQuantity('Gem', inventory, backpack) < growGemCost) { openPanel('HowToGemsPanel'); return; }
    if (!(await confirmGemSpend({ gems: growGemCost }))) return;
    const before = (GlobalGridStateTilesAndResources.getResources() || []).find((r) => r.x === x && r.y === y)
      || { ...plotDef, ...currentResource, x, y };
    const seed = FarmState.takeSeedAt(x, y);
    if (plotDef.filename && cropDef.filename) createRipenEffect(x, y, plotDef.filename, cropDef.filename, boardArtScale(plotDef), boardArtScale(cropDef));
    const swap = (next) => setResources((prev) => [...prev.filter((r) => !(r.x === x && r.y === y)), next]);
    swap({ ...cropDef, x, y });
    FloatingTextManager.addFloatingText(`-${growGemCost} {res:Gem}`, x, y, TILE_SIZE);
    onClose();
    const answer = await postAction('/api/action/grow-speedup', { playerId: currentPlayer.playerId, gridId, x, y });
    applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
    if (!answer.ok) {
      swap(before);
      if (seed) FarmState.addSeed(seed);
      updateStatus(answer.reason === 'short-Gem' ? `Need ${growGemCost} gems` : '❌ Failed to speed up');
    }
  };

  // (The inventory arrives as props and every action's answer updates it: no resync GET here.)

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
            <ResourceIcon resource={cropDetails} symbol={cropDetails?.symbol || '🌱'} /> {getLocalizedString(stationType, strings)}
        </h2>

        {/* Growing: the countdown on its own row, the gem speed-up right-justified on it
            (the Animals panel's row, Panel.css .panel-timer-row) */}
        {growLeftMs <= 0 && <p>{strings[457] || 'Ready to collect!'}</p>}
        {growLeftMs > 0 && (
          <div className="panel-timer-row">
            <span>{strings[324] || 'Remaining:'} {formatCountdown(liveGrowEnd(), currentTime)}</span>
            <button type="button" className="gem-button" onClick={handleGrowSpeedup}>
              <img className="gem-button-icon" src="/assets/resources/item-gem.svg" alt="" draggable="false" />
              <span className="gem-button-cost">{formatNumber(growGemCost)}</span>
            </button>
          </div>
        )}

      </div>
    </Panel>
  );
  
};

export default React.memo(CropPanel);
