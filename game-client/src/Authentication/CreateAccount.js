import API_BASE from '../config';
import React, { useState } from 'react';
import axios from 'axios';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import { useStrings } from '../UI/StringsContext';
import LANGUAGE_OPTIONS from '../UI/Languages.json';
import '../UI/SharedButtons.css';

const CreateAccount = ({ setCurrentPlayer, zoomLevel, setZoomLevel, setIsLoggedIn, closeModal }) => {
  const strings = useStrings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('en');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

const handleCreateAccount = async (e) => {
  e.preventDefault();
  if (isSubmitting) return;
  setIsSubmitting(true);

  try {
    const frontierName = 'Valley View 1';

    // 1. Fetch the Frontier by Name
    const frontierResponse = await axios.get(`${API_BASE}/api/frontiers-by-name`, { params: { name: frontierName } });
    if (!frontierResponse.data || frontierResponse.data.length === 0) throw new Error('Frontier not found');
    const frontier = frontierResponse.data[0];

    // 2. Locate an available sub-grid in a settlement
    let assignedSettlementId = null;
    let assignedGridCoord = null;
    let gridType = null;

    for (const settlementRow of frontier.settlements || []) {
      for (const settlement of settlementRow) {
        if (settlement.available !== true) continue;

        const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${settlement.settlementId}`);
        const settlementData = settlementResponse.data;

        const availableGrid = settlementData.grids.flat().find((grid) => grid.available === true);
        if (availableGrid) {
          assignedSettlementId = settlement.settlementId;
          assignedGridCoord = availableGrid.gridCoord;
          gridType = availableGrid.gridType;
          break;
        }
      }
      if (assignedGridCoord) break;
    }

    if (!assignedSettlementId || !assignedGridCoord) {
      throw new Error('No available sub-grids in the Frontier.');
    }

    // 3. Register player using unified endpoint (server will create the grid)
    const registerPayload = {
      username,
      password,
      language,
      location: {
        x: 30,
        y: 33,
        gridCoord: assignedGridCoord,
        settlementId: assignedSettlementId,
        frontierId: frontier._id,
        gtype: gridType,
      },
    };

    console.log('Calling /api/register-new-player with payload:', registerPayload);
    const response = await axios.post(`${API_BASE}/api/register-new-player`, registerPayload);
    if (!response.data.success || !response.data.player) {
      throw new Error('Player registration failed');
    }

    const player = response.data.player;
    const location = player.location;
    const assignedGridId = location?.g;

    console.log('✅ Player registered:', player);

    // 4. Finalize account setup
    setCurrentPlayer(player);
    localStorage.removeItem('player');
    localStorage.setItem('player', JSON.stringify(player));

    // 5. Save PC to grid
    const now = Date.now();
    const newPC = {
      playerId: player._id,
      type: 'pc',
      username: player.username,
      position: { x: 30, y: 33 },
      icon: player.icon || '😀',
      hp: player.baseHp || 25,
      maxhp: player.baseMaxhp || 25,
      attackbonus: player.baseAttackbonus || 1,
      armorclass: player.baseArmorclass || 1,
      damage: player.baseDamage || 1,
      attackrange: player.baseAttackrange || 1,
      speed: player.baseSpeed || 1,
      iscamping: false,
      isinboat: false,
      lastUpdated: now,
    };

    const payload = {
      gridId: assignedGridId,
      playerId: player._id,
      pc: newPC,
      lastUpdated: now,
    };

    await axios.post(`${API_BASE}/api/save-single-pc`, payload);

    // 6. Send welcome message
    try {
      await axios.post(`${API_BASE}/api/send-mailbox-message`, {
        playerId: player._id,
        messageId: 1,
      });
    } catch (mailError) {
      console.error("❌ Failed to send welcome message:", mailError);
    }

    // 7. Close modal and reload
    if (closeModal) closeModal();
    localStorage.setItem("initialZoomLevel", "close");
    window.location.reload();

  } catch (err) {
    console.error('Error during account creation:', err);
    setError(err.response?.data?.error || 'Account creation failed. Please try again.');
    setIsSubmitting(false);
  }
};

return (
  <div id="create-account-form">
    <h2>{strings[4002]}</h2>
    <form onSubmit={handleCreateAccount}>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      >
        <option value="">{strings[4067]}</option>
        {LANGUAGE_OPTIONS.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <div className="shared-buttons">
        <button className="btn-basic btn-success" type="submit" disabled={isSubmitting}>
          {strings[4002]}
        </button>
      </div>
    </form>

    <div className="shared-buttons">
      <button className="btn-basic btn-neutral"
        type="button"
        onClick={() => setIsLoggedIn(false)}
      >
        {strings[4066]}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>

      <p> <strong>{strings[4004]}</strong></p>
    </div>
    
  );
};

export default CreateAccount;