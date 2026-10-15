import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import Modal from '../../UI/Modals/Modal';
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
 * On Travel the server takes the Money and returns the grid and tile; `onTravel(gridCoord, x, y,
 * player)` (App: changePlayerLocation) then moves the player there, carrying the updated holdings.
 */
export default function SnugTravelModal({ currentPlayer, inventory, backpack, setInventory, setBackpack, setCurrentPlayer, masterResources, updateStatus, onTravel, onClose }) {
  const loc = useStrings();
  // the partly translated languages lack these keys: fall back to the English text
  const strings = new Proxy(loc, { get: (o, k) => o[k] ?? stringsEN[k] });
  const [destinations, setDestinations] = useState(null);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
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

  const nameOf = (d) => (d.kind === 'town' ? strings[10196] : getLocalizedString(d.region, loc));

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
                  <td className="res-name">{nameOf(d)}</td>
                  <td className={`res-meta ${money < d.cost ? 'snug-travel-short' : ''}`} data-label={strings[10194]}>{moneySymbol} {d.cost.toLocaleString()}</td>
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
    </Modal>
  );
}
