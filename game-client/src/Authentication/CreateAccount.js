import API_BASE from '../config';
import React, { useState } from 'react';
import axios from 'axios';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import { useStrings } from '../UI/StringsContext';
import LANGUAGE_OPTIONS from '../UI/Languages.json';

const CreateAccount = ({ setCurrentPlayer, setIsLoggedIn, closeModal }) => {
  const strings = useStrings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('');
  const [error, setError] = useState('');

  const handleCreateAccount = async (e) => {
    e.preventDefault();

    try {
      const accountStatus = 'Free';
      const role = 'Citizen';
      const frontierName = 'Valley View 1';

// 1) Fetch the Frontier by Name

      const frontierResponse = await axios.get(`${API_BASE}/api/frontiers-by-name`, { params: { name: frontierName }, });

      if (!frontierResponse.data || frontierResponse.data.length === 0) { throw new Error('Frontier not found'); }
      const frontier = frontierResponse.data[0];
      console.log('Frontier fetched:', frontier);
      if (!frontier.settlements || frontier.settlements.length === 0) { throw new Error('No settlements available in this Frontier.'); }

      let assignedSettlementId = null;
      let assignedGridId = null;      // The real MongoDB _id for the Grid doc
      let assignedGridCoord = null;   // The numeric coordinate in the settlement sub-grid
      let gridType = null;

      if (!Array.isArray(frontier.settlements)) {
        throw new Error(`Invalid settlements data: ${JSON.stringify(frontier.settlements, null, 2)}`);
      }

      // console.log("🛠️ Frontier Data:", JSON.stringify(frontier, null, 2));
      // console.log("🏘️ Settlements:", JSON.stringify(frontier.settlements, null, 2));

// 2) Locate an available sub-grid in a settlement

      for (const settlementRow of frontier.settlements) {
        for (const settlement of settlementRow) {
          // settlement.available might indicate if the *settlement* is available
          // but let's also fetch the settlement doc to see if sub-grids are available
          if (settlement.available !== true) continue;

          // Get the settlement doc
          const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${settlement.settlementId}`);
          const settlementData = settlementResponse.data;

          // Check sub-grids for an available one
          const availableGrid = settlementData.grids.flat().find((grid) => grid.available === true);
          if (availableGrid) {
            // found an available sub-grid
            console.log('availableGrid:', availableGrid);
            console.log('Found available gridCoord:', availableGrid.gridCoord);

            assignedSettlementId = settlement.settlementId;
            assignedGridCoord = availableGrid.gridCoord;
            gridType = availableGrid.gridType;

// 3) Create the new Grid doc on the server

            const gridPayload = {
              gridCoord: assignedGridCoord, // no more placeholderName
              gridType,
              settlementId: assignedSettlementId,
              frontierId: frontier._id,
            };
            console.log('gridPayload = ', gridPayload);
            const gridCreationResponse = await axios.post(`${API_BASE}/api/create-grid`, gridPayload);
            if (!gridCreationResponse.data.success) { throw new Error('Failed to create grid'); }
            assignedGridId = gridCreationResponse.data.gridId;
            console.log('Grid document created successfully:', assignedGridId);

            break; // exit from the "for ... of settlementRow"
          }
        }
        if (assignedGridId) break; // stop searching if we have a grid
      }

      if (!assignedGridId) {
        throw new Error('No available sub-grids in the Frontier.');
      }

// 4) Register the Player

      // We'll pass location data including the new gridId, settlementId, frontierId, and gridCoord
      const registerPayload = {
        username,
        password,
        icon: '😀',  // or any default icon
        accountStatus,
        role,
        language,
        location: {
          x: 2,
          y: 2,
          g: assignedGridId,           // the actual MongoDB _id for the Grid doc
          s: assignedSettlementId,     // the settlement's _id
          f: frontier._id,             // the frontier's _id
          gtype: gridType,             // optional
          gridCoord: assignedGridCoord // store numeric code for adjacency logic
        },
      };
      console.log('Registering player with payload:', registerPayload);
      const response = await axios.post(`${API_BASE}/api/register`, registerPayload);
      if (!response.data.success) {
        throw new Error('Player registration failed');
      }
      console.log('Player successfully registered:', response.data.player);

// 5) Finalize account setup

      const player = response.data.player;
      setCurrentPlayer(player);
      localStorage.removeItem('player');
      localStorage.setItem('player', JSON.stringify(player));

// 6) Increment the settlement population

      try {
        await axios.post(`${API_BASE}/api/increment-settlement-population`, {settlementId: assignedSettlementId,});
        console.log("✅ Settlement population incremented successfully.");
       } catch (error) {
         console.error("❌ Error incrementing settlement population:", error);
      }
    
      // 7) If it's a homestead, claim it now that we have a player._id
      if (gridType === 'homestead') {
        try {
          console.log(`Claiming homestead for gridId: ${assignedGridId}, playerId: ${player._id}`);
          await axios.post(`${API_BASE}/api/claim-homestead/${assignedGridId}`, {
            playerId: player._id,
          });
          console.log('Homestead claimed successfully!');
        } catch (claimError) {
          console.error('Failed to claim homestead:', claimError);
          // Decide if this is critical enough to throw or ignore
        }
      }
      
// 8) Add the new PC to the playersInGrid

    console.log(`Adding new player ${player.username} to playersInGrid for gridId ${assignedGridId}`);

    const now = Date.now();

    // ✅ Create a minimal fresh PC object
    const newPC = {
      playerId: player._id,
      type: 'pc',
      username: player.username,
      position: { x: 2, y: 2 },  // Starting at (2,2)
      icon: player.icon || '😀',
      hp: player.baseHp || 25,
      maxhp: player.baseMaxhp || 25,
      attackbonus: player.baseAttackbonus || 1,
      armorclass: player.baseArmorclass || 1,
      damage: player.baseDamage || 1,
      attackrange: player.baseAttackrange || 1,
      speed: player.baseSpeed || 1,
      iscamping: false,
      lastUpdated: now,
    };

    // ✅ Then build the correct payload
    const payload = {
      gridId: assignedGridId,
      playerId: player._id,
      pc: newPC,
      lastUpdated: now,
    };

    console.log('📤 Constructed Payload for creating player:', payload);
    console.log('📤 Saving single PC to grid...');

    await axios.post(`${API_BASE}/api/save-single-pc`, payload);

// 9) Send welcome message via mailbox

    try {
        await axios.post(`${API_BASE}/api/send-mailbox-message`, {
          playerId: player._id,
          messageId: 1,
        });
        console.log("📬 Welcome message added to mailbox.");
      } catch (mailError) {
        console.error("❌ Failed to send welcome message:", mailError);
      }

// 10) Close modal if provided, then reload

      if (closeModal) closeModal();
      window.location.reload();

    } catch (err) {
      console.error('Error during account creation:', err);
      setError(err.response?.data?.error || 'Account creation failed. Please try again.');
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
      <div className="panel-buttons">
        <button className="btn-success" type="submit">{strings[4002]}</button>
      </div>
    </form>

    <div className="panel-buttons">
      <button className="btn-neutral"
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