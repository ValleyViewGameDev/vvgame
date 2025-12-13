import API_BASE from '../config';
import React, { useState } from 'react';
import axios from 'axios';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import { useStrings } from '../UI/StringsContext';
import LANGUAGE_OPTIONS from '../UI/Languages.json';
import { enabledLanguages } from '../UI/LanguagePickerModal';
import '../UI/SharedButtons.css';
import { trackAccountCreation } from '../Utils/conversionTracking';

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

    // 2. Locate an available homestead and town grid in a settlement
    let assignedSettlementId = null;
    let homesteadGridCoord = null;
    let townGridId = null;

    for (const settlementRow of frontier.settlements || []) {
      for (const settlement of settlementRow) {
        if (settlement.available !== true) continue;

        const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${settlement.settlementId}`);
        const settlementData = settlementResponse.data;

        const flatGrids = settlementData.grids.flat();
        const availableHomestead = flatGrids.find((grid) => grid.available === true && grid.gridType === 'homestead');
        const townGrid = flatGrids.find((grid) => grid.gridType === 'town');

        if (availableHomestead && townGrid) {
          assignedSettlementId = settlement.settlementId;
          homesteadGridCoord = availableHomestead.gridCoord;
          townGridId = townGrid.gridId;
          break;
        }
      }
      if (homesteadGridCoord) break;
    }

    if (!assignedSettlementId || !homesteadGridCoord || !townGridId) {
      throw new Error('No available sub-grids in the Frontier.');
    }

    // 3. Find the Signpost Home position in the town grid
    let startX = 30;
    let startY = 33;
    try {
      const townGridResponse = await axios.get(`${API_BASE}/api/load-grid/${townGridId}`);
      const townGridData = townGridResponse.data;

      if (townGridData.resources && Array.isArray(townGridData.resources)) {
        const signpostHome = townGridData.resources.find(res => res.type === "Signpost Home");
        if (signpostHome) {
          startX = signpostHome.x;
          startY = signpostHome.y + 1; // One tile down from the signpost
          console.log(`✅ Found Signpost Home at (${signpostHome.x}, ${signpostHome.y}), placing new player at (${startX}, ${startY})`);
        } else {
          console.warn('⚠️ Signpost Home not found in town grid, using default position');
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not load town grid for spawn position, using default:', err.message);
    }

    // 4. Register player using unified endpoint (server will create the homestead grid)
    const registerPayload = {
      username,
      password,
      language,
      location: {
        x: startX,
        y: startY,
        gridCoord: homesteadGridCoord,
        settlementId: assignedSettlementId,
        frontierId: frontier._id,
        gtype: 'homestead',
      },
      // Tell server the player should start in town
      startInTown: true,
      townGridId: townGridId,
    };

    console.log('Calling /api/register-new-player with payload:', registerPayload);
    const response = await axios.post(`${API_BASE}/api/register-new-player`, registerPayload);
    if (!response.data.success || !response.data.player) {
      throw new Error('Player registration failed');
    }

    const player = response.data.player;

    // Update player location to be in town (server may have already done this)
    player.location = {
      ...player.location,
      g: townGridId,
      x: startX,
      y: startY,
      gtype: 'town',
    };

    console.log('✅ Player registered:', player);

    // Track the successful account creation for ad platforms
    trackAccountCreation(player.username, player._id || player.playerId);

    // 4. Finalize account setup
    setCurrentPlayer(player);
    localStorage.removeItem('player');
    localStorage.setItem('player', JSON.stringify(player));

    // 5. Save PC to town grid (where player starts)
    const now = Date.now();
    const newPC = {
      playerId: player._id,
      type: 'pc',
      username: player.username,
      position: { x: startX, y: startY },
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
      gridId: townGridId,
      playerId: player._id,
      pc: newPC,
      lastUpdated: now,
    };

    await axios.post(`${API_BASE}/api/save-single-pc`, payload);

    // 6. Update player location on server to be in town
    await axios.post(`${API_BASE}/api/update-player-location`, {
      playerId: player._id,
      location: player.location,
    });

    // 7. Send welcome message
    try {
      await axios.post(`${API_BASE}/api/send-mailbox-message`, {
        playerId: player._id,
        messageId: 1,
      });
    } catch (mailError) {
      console.error("❌ Failed to send welcome message:", mailError);
    }

    // 8. Close modal and reload
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
        {LANGUAGE_OPTIONS
          .filter(({ code }) => enabledLanguages.includes(code))
          .map(({ code, label }) => (
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