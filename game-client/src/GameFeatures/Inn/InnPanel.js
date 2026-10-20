import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import Panel from '../../UI/Panels/Panel';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import '../../UI/Buttons/ResourceButton.css';
import { useStrings } from '../../UI/StringsContext';
import { formatCountdown } from '../../UI/Timers';
import { canAfford } from '../../Utils/InventoryManagement';
import playersInGridManager, { derivedMaxhp } from '../../GridState/PlayersInGrid';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import FloatingTextManager from '../../UI/FloatingText';
import soundManager from '../../Sound/SoundManager';

/**
 * The Inn (a station built in the Valley, one per grid): a Rest costs Money and restores full
 * health at once; then this Inn rests for a cooldown (globalTuning.innRest, POST /api/inn/rest),
 * kept on the Inn resource as `craftEnd`. Optimistic (house rule): the tap fills the hp and starts
 * the cooldown on the spot; the server call runs alongside and a refusal puts both back.
 */
export default function InnPanel({
  onClose, currentPlayer, setCurrentPlayer, inventory, setInventory, backpack, setBackpack,
  setResources, stationPosition, gridId, masterResources, globalTuning, updateStatus, TILE_SIZE,
}) {
  const strings = useStrings();
  const { costMoney = 2500 } = globalTuning?.innRest || {};
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const playerKey = String(currentPlayer?._id);
  const pc = playersInGridManager.getPlayersInGrid(gridId)?.[playerKey];
  const maxhp = derivedMaxhp(currentPlayer, masterResources);
  const hp = pc?.hp ?? currentPlayer?.hp ?? maxhp;
  const inn = (GlobalGridStateTilesAndResources.getResources() || []).find(r => r.x === stationPosition?.x && r.y === stationPosition?.y);
  const restEnd = inn?.craftEnd || 0;
  const resting = restEnd > now;
  const restRecipe = { type: 'Rest', ingredient1: 'Money', ingredient1qty: costMoney };
  const affordable = canAfford(restRecipe, inventory, backpack, 1);
  const fullHealth = hp >= maxhp;

  const setInnRestEnd = (craftEnd) => {
    const next = (GlobalGridStateTilesAndResources.getResources() || []).map(r =>
      (r.x === stationPosition.x && r.y === stationPosition.y) ? { ...r, craftEnd } : r);
    GlobalGridStateTilesAndResources.setResources(next);
    setResources?.(next);
  };

  const handleRest = async () => {
    if (busy || resting || fullHealth || !affordable) return;
    setBusy(true);
    // on the tap: full health, the Inn starts resting, a green +hp rises from the player
    const prevHp = hp, prevEnd = restEnd;
    const cooldownMs = (globalTuning?.innRest?.cooldownMinutes || 1440) * 60 * 1000;
    playersInGridManager.updatePC(gridId, playerKey, { hp: maxhp });
    setInnRestEnd(Date.now() + cooldownMs);
    soundManager.playSFX('skill_earned');
    if (pc?.position) FloatingTextManager.addFloatingText(`+${maxhp - prevHp} ❤️`, pc.position.x, pc.position.y, TILE_SIZE);
    updateStatus?.(strings[2109] || 'Rested! Full health restored.');
    try {
      const { data } = await axios.post(`${API_BASE}/api/inn/rest`, { playerId: currentPlayer.playerId, gridId, x: stationPosition.x, y: stationPosition.y });
      setInnRestEnd(data.craftEnd);
      setInventory?.(data.inventory);
      setBackpack?.(data.backpack);
      setCurrentPlayer?.(prev => ({ ...prev, inventory: data.inventory, backpack: data.backpack, hp: data.hp, maxhp: data.maxhp }));
      playersInGridManager.updatePC(gridId, playerKey, { hp: data.hp });
      playersInGridManager.flushAfterTransaction();
    } catch (err) {
      // a real refusal: hp and the Inn go back to what they were
      playersInGridManager.updatePC(gridId, playerKey, { hp: prevHp });
      setInnRestEnd(err.response?.data?.craftEnd || prevEnd || null);
      updateStatus?.(err.response?.data?.error || 'Rest failed.');
    } finally {
      setBusy(false);
    }
  };

  const details = resting
    // spans are block-level in the card's details: the message, then the countdown on its own line
    ? `<span style="color: var(--color-text-negative);">${strings[2107] || 'The Inn is being prepared.'}</span><span>${formatCountdown(restEnd, now)}</span>`
    : `${strings[2106] || 'Restores full health'}<br>` +
      (fullHealth ? `<span style="color: var(--color-text-negative);">${strings[2108] || 'You are already at full health.'}</span>` : '') +
      `<span style="color: ${affordable ? 'var(--color-text-positive)' : 'var(--color-text-negative)'}; display: block;">💰 ${costMoney.toLocaleString()}</span>`;

  return (
    <Panel onClose={onClose} titleKey="2088" descriptionKey="2089" panelName="InnPanel">
      <div className="standard-panel">
        <p>❤️ {strings[10157] || 'Health'}: {Math.round(hp)} / {maxhp}</p>
        <ResourceButton
          symbol="🛏️"
          name={strings[2091] || 'Rest'}
          details={details}
          disabled={busy || resting || fullHealth || !affordable}
          onClick={handleRest}
        />
      </div>
    </Panel>
  );
}
