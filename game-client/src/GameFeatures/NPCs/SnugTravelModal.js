import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import Modal from '../../UI/Modals/Modal';
import ResourceModalSmall from '../../UI/Modals/ResourceModalSmall';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { getPlayerQuantity } from '../../Utils/InventoryManagement';
import stringsEN from '../../UI/Strings/stringsEN.json';
import './SnugTravelModal.css';

/**
 * Travel with Snug (owner, 2026-10-12): the places Snug can take a player who has greeted him,
 * one row each (Region or Town, cost, Travel). The server lists them and picks the arrival tile
 * (game-server/routes/snugTravelRoutes.js): visited Regions that have a Snug, plus the home Town,
 * never the place the player is in, cost by distance (globalTuning.json snugTravel).
 *
 * A Region's own crops and farm animals (resources.json growregion on a farm plot or a grazing
 * animal, docs/tuning.md 4m) show as an icon beside its name (the crop, or the animal itself);
 * tapping one opens ResourceModalSmall titled with the Region: "Blueberry can only be grown in
 * Belmont." (string 17024) / "Goat can only be raised in Bohemia." (17026).
 *
 * Your Homestead and the home Town head the list and are free (owner, 2026-11-05: free on the Map
 * panel too); they travel through `onSignpost` ('Signpost Home' / 'Signpost Town Home', the Map
 * panel's own Transit.handleTransitSignpost), so they arrive exactly as from the Map.
 *
 * On Travel the server takes the Money and returns the grid and tile; `onTravel(gridCoord, x, y,
 * player)` (App: changePlayerLocation) then moves the player there, carrying the updated holdings.
 */
export default function SnugTravelModal({ currentPlayer, inventory, backpack, setInventory, setBackpack, setCurrentPlayer, masterResources, updateStatus, onTravel, onSignpost, onClose }) {
  const loc = useStrings();
  // the partly translated languages lack these keys: fall back to the English text
  const strings = new Proxy(loc, { get: (o, k) => o[k] ?? stringsEN[k] });
  const [destinations, setDestinations] = useState(null);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [cropInfo, setCropInfo] = useState(null);   // { region, crop }: the regional-crop modal
  const money = getPlayerQuantity('Money', inventory, backpack);
  const moneySymbol = (masterResources || []).find((r) => r.type === 'Money')?.symbol || '💰';

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/api/snug-travel/${currentPlayer.playerId}`)
      .then(({ data }) => { if (!cancelled) setDestinations(data?.destinations || []); })
      .catch((err) => { if (!cancelled) { console.error('[SnugTravel] destinations failed:', err); setError(strings[10200]); } });
    return () => { cancelled = true; };
  }, [currentPlayer.playerId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const travel = async (dest) => {
    if (busyKey) return;
    // Home and Town: the Map panel's free signpost travel, same arrival
    if ((dest.kind === 'home' || dest.kind === 'town') && onSignpost) {
      onClose();
      await onSignpost(dest.kind === 'home' ? 'Signpost Home' : 'Signpost Town Home');
      return;
    }
    if (money < dest.cost) { updateStatus?.(strings[10199]); return; }
    setBusyKey(dest.key);   // the row reacts at once; the trip waits for the server's arrival tile
    try {
      const transactionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const { data } = await axios.post(`${API_BASE}/api/snug-travel`, { playerId: currentPlayer.playerId, key: dest.key, transactionId });
      if (!data?.success) throw new Error(data?.error || 'travel failed');
      setInventory(data.inventory);
      setBackpack(data.backpack);
      const player = { ...currentPlayer, inventory: data.inventory, backpack: data.backpack };
      setCurrentPlayer(player);
      onClose();
      await onTravel(data.gridCoord, data.x, data.y, player);
    } catch (err) {
      const code = err?.response?.data?.error;
      console.error('[SnugTravel] travel failed:', code || err);
      updateStatus?.(code === 'not-enough-money' ? strings[10199] : strings[10200]);
      setBusyKey(null);
    }
  };

  const nameOf = (d) => (d.kind === 'home' ? strings[107] : d.kind === 'town' ? strings[10196] : getLocalizedString(d.region, loc));
  // what only this Region grows or raises: each locked farm plot's crop, each locked animal itself
  const cropsOf = (region) => (masterResources || [])
    .filter((r) => r.growregion === region && ((r.category === 'farmplot' && r.output) || r.action === 'graze'))
    .map((r) => (r.action === 'graze' ? r : (masterResources || []).find((o) => o.type === r.output)))
    .filter(Boolean);

  return (
    <Modal onClose={onClose} title={strings[10191]} className="modal-narrow snug-travel-modal">
      <p className="snug-travel-note">{strings[10197]}</p>
      {error && <p className="snug-travel-note">{error}</p>}
      {!error && destinations === null && <p className="snug-travel-note">…</p>}
      {destinations && destinations.length === 0 && <p className="snug-travel-note">{strings[10198]}</p>}
      {destinations && destinations.length > 0 && (
        <div className="snug-travel-table res-rows">
          <table>
            <thead className="res-rows-head">
              <tr>
                <th>{strings[10193]}</th>
                <th>{strings[10194]}</th>
                <th aria-label={strings[10195]} />
              </tr>
            </thead>
            <tbody className="res-rows-body">
              {destinations.map((d) => (
                <tr key={d.key}>
                  <td className="res-name">
                    {nameOf(d)}
                    {d.kind === 'region' && cropsOf(d.region).map((crop) => (
                      <button
                        key={crop.type}
                        type="button"
                        className="snug-travel-crop"
                        aria-label={getLocalizedString(crop.type, loc)}
                        onClick={() => setCropInfo({ region: d.region, crop: crop.type })}
                      >
                        {crop.filename ? <img src={`/assets/resources/${crop.filename}`} alt="" /> : crop.symbol}
                      </button>
                    ))}
                  </td>
                  <td className={`res-meta ${money < d.cost ? 'snug-travel-short' : ''}`} data-label={strings[10194]}>{d.cost > 0 ? `${moneySymbol} ${d.cost.toLocaleString()}` : strings[17028]}</td>
                  <td className="res-action">
                    <div className="shared-buttons">
                      <button
                        type="button"
                        className={`btn-basic btn-success btn-modal-small ${busyKey === d.key ? 'snug-travel-busy' : ''}`}
                        disabled={!!busyKey || money < d.cost}
                        onClick={() => travel(d)}
                      >
                        {strings[10195]}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cropInfo && (
        <ResourceModalSmall
          resourceType={cropInfo.crop}
          masterResources={masterResources}
          title={getLocalizedString(cropInfo.region, loc)}
          line={String((masterResources || []).find((r) => r.type === cropInfo.crop)?.action === 'graze' ? strings[17026] : strings[17024])
            .replace('{crop}', getLocalizedString(cropInfo.crop, loc)).replace('{animal}', getLocalizedString(cropInfo.crop, loc))
            .replace('{region}', getLocalizedString(cropInfo.region, loc))}
          onClose={() => setCropInfo(null)}
        />
      )}
    </Modal>
  );
}
