import API_BASE from '../config';
import React, { useState, useEffect, useContext, useRef } from 'react';
import ChangeIconModal from '../UI/ChangeIconModal';
import axios from 'axios';
import '../UI/Panel.css'; // Use the standardized styles
import '../UI/SharedButtons.css'; // Use the standardized buttons
import Panel from '../UI/Panel';
import { updatePlayerSettings } from '../settings';  
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import { StatusBarContext } from '../UI/StatusBar';
import { usePanelContext } from '../UI/PanelContext';

const ProfilePanel = ({ onClose, currentPlayer, setCurrentPlayer, handleLogout, isRelocating, setIsRelocating, zoomLevel, setZoomLevel }) => {
  const { openPanel } = usePanelContext();

  const [isDeveloper, setIsDeveloper] = useState(false);
  const hasCheckedDeveloperStatus = useRef(false);
  const [showChangeIconModal, setShowChangeIconModal] = useState(false);

  useEffect(() => {
    const checkDevStatus = async () => {
      try {
        if (!hasCheckedDeveloperStatus.current && currentPlayer?.username) {
          const res = await axios.get(`${API_BASE}/api/check-developer-status/${currentPlayer.username}`);
          if (res.data?.isDeveloper) {
            setIsDeveloper(true);
          }
          hasCheckedDeveloperStatus.current = true;
          console.log('🔍 Developer check complete. isDeveloper:', res.data?.isDeveloper);
        }
      } catch (err) {
        console.warn('⚠️ Failed to check developer status:', err);
      }
    };

    checkDevStatus();
  }, [currentPlayer]);

  const [formData, setFormData] = useState({
    username: '',
    icon: '',
    password: '',
    accountStatus: 'Free',
    role: 'Citizen',
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
        rangeOn: settings?.rangeOn ?? true,
      });
  
      setFormData({
        username: currentPlayer.username || '',
        icon: currentPlayer.icon || '',
        password: '',
        accountStatus: currentPlayer.accountStatus || 'Free',
        role: currentPlayer.role || 'Citizen',
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

  const handleLanguage = async () => {}

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

        // ✅ Directly update playersInGrid via playersInGridManager
        const gridId = currentPlayer?.location?.g;
        if (gridId) {
            const playerData = playersInGridManager.getPlayersInGrid(gridId)?.[currentPlayer.playerId];
            if (playerData) {
                const updatedPlayerData = {
                    ...playerData,
                    username: formData.username.trim(),
                };

                playersInGridManager.updatePC(gridId, currentPlayer.playerId, updatedPlayerData);

                console.log(`✅ Updated username in playersInGrid: ${currentPlayer.playerId} → ${formData.username.trim()}`);
            }
        } else {
            console.warn("⚠️ No valid gridId found, skipping NPCsInGrid update.");
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


  const handleRelocation = async () => {
    if (isRelocating) {
      setIsRelocating(false);
      setZoomLevel('close');
      updateStatus(0);
    } else {
      setIsRelocating(true);
      setZoomLevel('frontier');
    }
  };

  const handleGoldPanelSwitch = () => {
    openPanel('GoldBenefitsPanel');
  };

  return (
    <Panel
      onClose={() => {
        setIsRelocating(false);
        if (zoomLevel === 'settlement' || zoomLevel === 'frontier') {
          setZoomLevel('close');
          updateStatus(0);
        }
        onClose();
      }}
      descriptionKey="1019"
      titleKey="1119"
      panelName="ProfilePanel"
    >
      <div className="panel-content">

        <h2>Hi, {currentPlayer.username} {currentPlayer.icon}</h2>

        <div className="panel-buttons">
          <button className="btn-success" onClick={() => setShowChangeIconModal(true)}>Change Avatar</button>
        </div>

        <br />

        {/* User Details Form */}
        <div className="form-group">
          <label>Change Username:</label>
          <input
            name="username"
            type="text"
            value={formData.username}
            onChange={handleInputChange}
            placeholder="Enter your username"
          />
        </div>
        <div className="form-group">
          <label>Change Password:</label>
          <input
            name="password"
            type="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Enter new password (optional)"
          />
        </div>

        <div className="panel-buttons">
          <button className="btn-success" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <br />
        <br />

        <h3>Account Management</h3>

        <div className="form-group">
          <label>Account Status:</label>
          <select name="accountStatus" value={formData.accountStatus} onChange={handleInputChange}>
            <option value="Free">Free</option>
            <option value="Bronze">Bronze</option>
            <option value="Silver">Silver</option>
            <option value="Gold">Gold</option>
          </select>
        </div>

        <div className="panel-buttons">
          <button className="btn-gold" onClick={handleGoldPanelSwitch}> Gold Account Benefits </button>
        </div>
        <div className="panel-buttons">
          <button className="btn-danger" onClick={handleLogout}>
            Logout
          </button>
        </div>
        <div className="panel-buttons">
          <button
            className="btn-danger"
            onClick={async () => {
              const confirmed = window.confirm("Are you sure you want to delete your account? This action cannot be undone.");
              if (!confirmed) return;

              try {
                const response = await axios.post(`${API_BASE}/api/delete-player`, {
                  playerId: currentPlayer.playerId,
                });

                if (response.data.success) {
                  alert("Account deleted successfully.");
                  localStorage.removeItem('player');
                  window.location.reload();
                } else {
                  alert("Failed to delete account.");
                }
              } catch (err) {
                console.error("Error deleting account:", err);
                alert("An error occurred while trying to delete your account.");
              }
            }}
          >
            Delete Account
          </button>
        </div>
        <p>Player ID: {currentPlayer?.playerId || 'N/A'}</p>

        <br/>


        {/* Relocation Controls */}

        <h3>Homestead Relocation</h3>
        <p>Relocations Remaining: <strong>{currentPlayer.relocations}</strong></p>
        <div className="panel-buttons">
          <button className="btn-success" onClick={handleRelocation} disabled={!currentPlayer.relocations}>
            {isRelocating ? 'Cancel Relocation' : 'Relocate Homestead'}
          </button>
        <p>Visit the Store to purchase more Relocations.</p>
        </div>


        {/* Settings Toggles */}

        <h3>Settings</h3>
        <div className="panel-buttons">
          <button className="btn-success" onClick={handleLanguage}>Language</button>
        </div>

        <div className="debug-toggles">
          <button
            className={`btn-toggle ${localSettings.rangeOn ? 'btn-enabled' : 'btn-disabled'}`}
            onClick={() => handleToggleChange('rangeOn')}
          >
            Range Indicator: {localSettings.rangeOn ? 'is ON' : 'is OFF'}
          </button>

          {isDeveloper && (
            <button
              className={`btn-toggle ${localSettings.isTeleportEnabled ? 'btn-enabled' : 'btn-disabled'}`}
              onClick={() => handleToggleChange('isTeleportEnabled')}
            >
              Teleport: {localSettings.isTeleportEnabled ? 'is ON' : 'is OFF'}
            </button>
          )}

          <button
            className={`btn-toggle ${localSettings.toggleVFX ? 'btn-enabled' : 'btn-disabled'}`}
            onClick={() => handleToggleChange('toggleVFX')}
          >
            VFX: {localSettings.toggleVFX ? 'is ON' : 'is OFF'}
          </button>
        </div>

        {showChangeIconModal && (
          <ChangeIconModal
            currentPlayer={currentPlayer}
            setCurrentPlayer={setCurrentPlayer}
            updateStatus={updateStatus}
            currentIcon={formData.icon}
            playerId={currentPlayer.playerId}
            onClose={() => setShowChangeIconModal(false)}
            onSave={(newIcon) => {
              setFormData(prev => ({ ...prev, icon: newIcon }));
              setShowChangeIconModal(false);
            }}
          />
        )}
      </div>
    </Panel>
    
  );
};

export default ProfilePanel;