import API_BASE from '../config';
import React, { useState, useEffect, useContext, memo } from 'react';
import axios from 'axios';
import '../UI/Panel.css'; // Use the standardized styles
import Panel from '../UI/Panel';
import { updatePlayerSettings } from '../settings';  
import gridStateManager from '../GridState/GridStateNPCs';
import gridStatePCManager from '../GridState/GridStatePCs';
import { StatusBarContext } from '../UI/StatusBar';

const ProfilePanel = memo(({ onClose, currentPlayer, setCurrentPlayer, handleLogout }) => {

  const [formData, setFormData] = useState({
    username: '',
    icon: '',
    password: '',
    accountStatus: 'Free',
    role: 'Peasant',
  });

  const { updateStatus } = useContext(StatusBarContext);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Local settings to track changes independently
  const [localSettings, setLocalSettings] = useState({
    isStateMachineEnabled: false,
    isTeleportEnabled: false,
    toggleVFX: true,
  });

  // Initialize form fields and local settings
  useEffect(() => {

    if (currentPlayer) {
      const { settings } = currentPlayer;
      setLocalSettings({
        isStateMachineEnabled: settings?.isStateMachineEnabled ?? false,
        isTeleportEnabled: settings?.isTeleportEnabled ?? false,
        toggleVFX: settings?.toggleVFX ?? true,
      });
  
      setFormData({
        username: currentPlayer.username || '',
        icon: currentPlayer.icon || '',
        password: '',
        accountStatus: currentPlayer.accountStatus || 'Free',
        role: currentPlayer.role || 'Peasant',
      });
  
      setErrorMessage('');

      console.log('Profile: curentPlayer = ',currentPlayer);

    }
  }, [currentPlayer]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleToggleChange = (key) => {
    setLocalSettings((prev) => {
      const updatedSettings = {
        ...prev,
        [key]: !prev[key],
      };

      // ✅ Call the centralized function to update local and server settings
      updatePlayerSettings(updatedSettings, currentPlayer, setCurrentPlayer);
      return updatedSettings;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage('');
  
    try {
      // Validate username and icon inputs
      if (!formData.username.trim()) {
        throw new Error('Username cannot be empty.');
      }
  
      // Prepare updates payload
      const updates = {
        username: formData.username.trim(),
        icon: formData.icon.trim(),
        ...(formData.password && { password: formData.password }),
        accountStatus: formData.accountStatus,
        role: formData.role,
        settings: { ...localSettings }, // Save settings as an object
      };
  
      console.log('Saving updates:', updates);
  
      // Call API to update the player profile
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates,
      });
  
      if (response.data.success) {
        console.log('Profile and settings successfully updated:', response.data.player);

        // ✅ Update the React state
        const updatedPlayer = {
          ...currentPlayer,
          settings: { ...localSettings },
          username: formData.username.trim(),
          icon: formData.icon.trim(),
          accountStatus: formData.accountStatus,
          role: formData.role,
        };

        setCurrentPlayer(updatedPlayer);
        localStorage.setItem('player', JSON.stringify(updatedPlayer));
        console.log('Updated localStorage after save:', updatedPlayer.settings);

        // ✅ Update the Settlement with the player's new role
        if (formData.role) {
          console.log(`🏛️ Assigning player to role "${formData.role}" in the settlement...`);
          
          await axios.post(`${API_BASE}/api/update-settlement-role`, {
            settlementId: currentPlayer.location.s, // ✅ Settlement ID
            playerId: currentPlayer._id,           // ✅ Player's ID
            roleName: formData.role                // ✅ Role they are assigned to
          });
        }

        // ✅ Directly update `gridState`
        const gridId = currentPlayer?.location?.g;
        if (gridId) {
            const gridState = gridStateManager.getGridState(gridId);
            if (gridState?.pcs[currentPlayer.playerId]) {
                gridState.pcs[currentPlayer.playerId].username = formData.username.trim();

                gridStatePCManager.updatePC(gridId, currentPlayer.playerId, gridState.pcs[currentPlayer.playerId]);

                console.log(`✅ Updated username in gridState: ${currentPlayer.playerId} → ${formData.username.trim()}`);
            }
        } else {
            console.warn("⚠️ No valid gridId found, skipping gridState update.");
        }

        // Notify success and close panel
        onClose();
      } else {
        const errorMessage = response.data.error || 'Failed to update profile.';
        console.error(errorMessage);
        setErrorMessage(errorMessage);
      }
    } catch (error) {
      console.error('Error during save operation:', error);
      // ✅ Check if the error message contains "TAKEN"
      if (error.response?.data?.error === "TAKEN") {
        console.log("❌ Username is already taken.");
        updateStatus(50); 
      }
      setErrorMessage(error.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
};


  return (
    <Panel onClose={onClose} descriptionKey="1019" titleKey="1119" panelName="ProfilePanel">
      <div className="panel-content">
        {/* User Details Form */}
        <div className="form-group">
          <label>Username:</label>
          <input
            name="username"
            type="text"
            value={formData.username}
            onChange={handleInputChange}
            placeholder="Enter your username"
          />
        </div>
        <div className="form-group">
          <label>Password:</label>
          <input
            name="password"
            type="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Enter new password (optional)"
          />
        </div>
        <div className="form-group">
          <label>Account Status:</label>
          <select name="accountStatus" value={formData.accountStatus} onChange={handleInputChange}>
            <option value="Free">Free</option>
            <option value="Bronze">Bronze</option>
            <option value="Silver">Silver</option>
            <option value="Gold">Gold</option>
          </select>
        </div>
        <div className="form-group">
          <label>Role:</label>
          <select name="role" value={formData.role} onChange={handleInputChange}>
            <option value="Peasant">Peasant</option>
            <option value="Citizen">Citizen</option>
            <option value="Sheriff">Sheriff</option>
            <option value="Mayor">Mayor</option>
            <option value="Governor">Governor</option>
            <option value="President">President</option>
          </select>
        </div>

        {/* Save and Logout Buttons */}
        <div className="panel-buttons">
          <button className="btn-success" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button className="btn-danger" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {/* Player Stats */}
        <h3>Stats from Current Player</h3>

          <p>Range: {currentPlayer?.range}</p>
          <p>HP: {currentPlayer?.hp}</p>
          <p>MaxHP: {currentPlayer?.maxhp}</p>
          <p>Armor Class: {currentPlayer?.armorclass}</p>
          <p>Attack Range: {currentPlayer?.attackrange}</p>
          <p>Attack Bonus: {currentPlayer?.attackbonus}</p>
          <p>Attack Damage: {currentPlayer?.damage}</p>
          <p>Attack Speed: {currentPlayer?.speed}</p>
          <p>Is Camping: {currentPlayer?.iscamping ? "Yes" : "No"}</p> 

        {/* Settings Toggles */}
        <h3>Settings</h3>
        <div className="debug-toggles">
          <button
            className={`btn-toggle ${localSettings.isTeleportEnabled ? 'btn-enabled' : 'btn-disabled'}`}
            onClick={() => handleToggleChange('isTeleportEnabled')}
          >
            Teleport: {localSettings.isTeleportEnabled ? 'is ON' : 'is OFF'}
          </button>
          <button
            className={`btn-toggle ${localSettings.isStateMachineEnabled ? 'btn-enabled' : 'btn-disabled'}`}
            onClick={() => handleToggleChange('isStateMachineEnabled')}
          >
            State: {localSettings.isStateMachineEnabled ? 'is ON' : 'is OFF'}
          </button>
          <button
            className={`btn-toggle ${localSettings.toggleVFX ? 'btn-enabled' : 'btn-disabled'}`}
            onClick={() => handleToggleChange('toggleVFX')}
          >
            VFX: {localSettings.toggleVFX ? 'is ON' : 'is OFF'}
          </button>
        </div>


        {/* Debug Info */}
        <div className="debug-info">
          <label>Debug:</label>
          <p><strong>Player ID:</strong> {currentPlayer?.playerId || 'N/A'}</p>
          <p><strong>Frontier ID:</strong> {currentPlayer?.frontierId || 'N/A'}</p>
          <p><strong>Settlement ID:</strong> {currentPlayer?.settlementId || 'N/A'}</p>
          <p><strong>Homestead ID:</strong> {currentPlayer?.gridId || 'N/A'}</p>
          <p><strong>Current Grid ID:</strong> {currentPlayer?.location?.g || 'N/A'}</p>
        </div>
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>
    </Panel>
  );
});

export default ProfilePanel;