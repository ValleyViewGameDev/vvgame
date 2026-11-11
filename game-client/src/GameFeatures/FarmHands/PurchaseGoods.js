import React, { useState } from 'react';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { resourceIconHtml } from '../../UI/Icons/ResourceIcon';
import { ensureRoomFor, getPlayerQuantity } from '../../Utils/InventoryManagement';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import { useStrings } from '../../UI/StringsContext';
import { isACrop } from '../../Utils/ResourceHelpers';
import { getDerivedLevel } from '../../Utils/playerManagement';

/**
 * "Purchase Goods": the safety-net crop shop, one crop for maxprice x 10 Money while the player
 * holds 9 or fewer (game-server /action/farmhand-buy-crop). It lived on Audrey's panel until the
 * owner moved it under the hiring cards of the Farm House panel (2026-11-11).
 *
 * Offered: crops (a farm plot's output) at or below the player's level, in season, never a
 * regional crop (grown in its region, docs/tuning.md 4m) or a devonly one; a developer sees all.
 */
export default function PurchaseGoods({
  inventory, setInventory, backpack, setBackpack, currentPlayer, setCurrentPlayer,
  masterResources, masterXPLevels = [], currentSeason, isDeveloper = false, globalTuning, updateStatus,
}) {
  const strings = useStrings();
  const [errorMessage, setErrorMessage] = useState('');
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const safeBackpack = Array.isArray(backpack) ? backpack : [];
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);

  const offers = (masterResources || []).filter((res) => {
    if (!isACrop(res.type, masterResources)) return false;
    if (res.requires === 'devonly' && !isDeveloper) return false;
    if (masterResources.some((p) => p.category === 'farmplot' && p.output === res.type && p.growregion)) return false;
    if (!isDeveloper && res.season && currentSeason && res.season !== currentSeason) return false;
    if (!isDeveloper && res.level && res.level > playerLevel) return false;
    return getPlayerQuantity(res.type, safeInventory, safeBackpack) <= 9;
  });

  const handleBuy = async (resource) => {
    setErrorMessage('');
    const cost = (resource.maxprice || 100) * 10;
    // Room first, money second: a full Warehouse or Backpack says so and nothing is spent
    if (!ensureRoomFor({ resource: resource.type, quantity: 1, currentPlayer, inventory: safeInventory, backpack: safeBackpack, masterResources, globalTuning, updateStatus })) return;
    const answer = await postAction('/api/action/farmhand-buy-crop', { playerId: currentPlayer.playerId, cropType: resource.type });
    applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
    if (!answer.ok) {
      setErrorMessage(answer.reason === 'short-Money' ? 'Not enough Gold.' : 'Not enough space to carry that item.');
      return;
    }
    updateStatus?.(`Bought 1 ${resource.type} for ${cost} Gold.`);
  };

  const playerMoney = getPlayerQuantity('Money', safeInventory, safeBackpack);
  return (
    <>
      <h3>{strings[17518]}</h3>
      <p>{strings[426]}</p>
      {offers.length > 0 ? offers.map((resource) => {
        const cost = (resource.maxprice || 100) * 10;
        return (
          <ResourceButton
            key={resource.type}
            symbol={resource.symbol}
            resource={resource}
            name={resource.type}
            className="resource-button"
            details={`${strings[347]} ${resourceIconHtml('Money', masterResources)} ${cost}`}
            disabled={playerMoney < cost}
            onClick={() => handleBuy(resource)}
          />
        );
      }) : <p>{strings[423]}</p>}
      {errorMessage && <p className="error-message">{errorMessage}</p>}
    </>
  );
}
