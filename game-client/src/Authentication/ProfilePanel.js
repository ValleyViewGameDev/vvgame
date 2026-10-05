import API_BASE from '../config';
import React, { useState, useEffect, useContext } from 'react';
import ChangeIconModal from '../UI/Modals/ChangeIconModal';
// import GoldPassBenefitsModal from '../UI/Modals/GoldPassBenefitsModal'; // COMMENTED OUT
import axios from 'axios';
import '../UI/Panels/Panel.css'; // Use the standardized styles
import '../UI/Buttons/SharedButtons.css'; // Use the standardized buttons
import Panel from '../UI/Panels/Panel';
import { updatePlayerSettings } from '../settings';  
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import { StatusBarContext } from '../UI/StatusBar/StatusBar';
import LANGUAGE_OPTIONS from '../UI/Languages.json';
import { useModalContext } from '../UI/ModalContext';
import { useStrings } from '../UI/StringsContext';
import soundManager from '../Sound/SoundManager';
import ambientVFXManager from '../VFX/AmbientVFXManager';
import { showNotification } from '../UI/Notifications/Notifications';
import FeedbackLinks from '../UI/Panels/FeedbackLinks';
import { authErrorText } from './authErrors';
import EmailModal from '../UI/Modals/EmailModal';

const ProfilePanel = ({ onClose, currentPlayer, setCurrentPlayer, handleLogout, isRelocating, setIsRelocating, zoomLevel, setZoomLevel, handlePCClick, isDeveloper }) => {
  const strings = useStrings();

  const [showChangeIconModal, setShowChangeIconModal] = useState(false);
  // const [showGoldBenefitsModal, setShowGoldBenefitsModal] = useState(false); // COMMENTED OUT

  const [formData, setFormData] = useState({
    username: '',
    icon: '',
    accountStatus: 'Free',
    role: 'Citizen',
  });
  // Secure your profile: a passwordless profile sets its first password with no current-password
  // check; one with a password must give the current one (/player/change-password).
  const [pwForm, setPwForm] = useState({ current: '', next: '' });
  const [pwMessage, setPwMessage] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const hasPassword = !!currentPlayer?.hasPassword;
  // Email + consent (docs/onboarding-plan.md §4.5): the address is saved through EmailModal
  // (/player/email); the toggle is explicit consent (/player/marketing-consent). The displayed
  // state mirrors utils/crmAudience.js: explicit value, else opted in unless billing-only.
  const [showEmailModal, setShowEmailModal] = useState(false);
  const marketingOn = currentPlayer?.marketing_consent === true || (currentPlayer?.marketing_consent == null && currentPlayer?.email_source !== 'stripe');
  const toggleMarketing = async () => {
    const optedIn = !marketingOn;
    const updated = { ...currentPlayer, marketing_consent: optedIn };
    setCurrentPlayer(updated); // optimistic (docs/ui-conventions.md)
    try { await axios.post(`${API_BASE}/api/player/marketing-consent`, { playerId: currentPlayer.playerId, optedIn }); }
    catch (_) { setCurrentPlayer(currentPlayer); }
  };

  const handleSavePassword = async () => {
    setPwMessage('');
    if (pwForm.next.length < 4) { setPwMessage(strings[4086]); return; }
    setPwSaving(true);
    try {
      await axios.post(`${API_BASE}/api/player/change-password`, {
        playerId: currentPlayer.playerId,
        currentPassword: hasPassword ? pwForm.current : undefined,
        newPassword: pwForm.next,
      });
      const updatedPlayer = { ...currentPlayer, hasPassword: true };
      setCurrentPlayer(updatedPlayer);
      localStorage.setItem('player', JSON.stringify(updatedPlayer));
      setPwForm({ current: '', next: '' });
      setPwMessage(strings[4080]);
    } catch (err) {
      setPwMessage(authErrorText(err, strings, 'Could not save the password.'));
    } finally {
      setPwSaving(false);
    }
  };

  const { updateStatus } = useContext(StatusBarContext);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Local settings to track changes independently
  const [localSettings, setLocalSettings] = useState({
    isStateMachineEnabled: false,
    isTeleportEnabled: false,
    toggleVFX: true,
    seasonOverride: 'None',
    musicOn: true,
    soundEffectsOn: true,
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
        seasonOverride: settings?.seasonOverride ?? 'None',
        musicOn: settings?.musicOn ?? true,
        soundEffectsOn: settings?.soundEffectsOn ?? true,
      });
  
      setFormData({
        username: currentPlayer.username || '',
        icon: currentPlayer.icon || '',
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

      // Handle audio toggles immediately
      if (key === 'musicOn') {
        if (updatedSettings.musicOn) {
          soundManager.unmute();
        } else {
          soundManager.mute();
        }
      }

      if (key === 'soundEffectsOn') {
        soundManager.setSoundEffectsEnabled(updatedSettings.soundEffectsOn);
      }

      // Handle ambient VFX toggle
      if (key === 'toggleVFX') {
        ambientVFXManager.setEnabled(updatedSettings.toggleVFX);
      }

      return updatedSettings;
    });
  };

  const { setActiveModal } = useModalContext();

  const handleLanguage = () => {
    setActiveModal('LanguagePicker');
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
        accountStatus: formData.accountStatus,
        role: formData.role,
        // Use dot notation to update specific settings fields without replacing the entire object
        "settings.isStateMachineEnabled": localSettings.isStateMachineEnabled,
        "settings.isTeleportEnabled": localSettings.isTeleportEnabled,
        "settings.toggleVFX": localSettings.toggleVFX,
        "settings.seasonOverride": localSettings.seasonOverride,
        "settings.rangeOn": localSettings.rangeOn,
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
          settings: { ...currentPlayer.settings, ...localSettings },
          username: formData.username.trim(),
          icon: formData.icon.trim(),
          accountStatus: formData.accountStatus,
          role: formData.role,
        };

        setCurrentPlayer(updatedPlayer);
        localStorage.setItem('player', JSON.stringify(updatedPlayer));
        console.log('Updated localStorage after save:', updatedPlayer.settings);

        // ✅ Update the Settlement with the player's new role (only if it's not Citizen)
        if (formData.role && formData.role !== 'Citizen') {
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
      // Check if player is at their own homestead before allowing relocation
      const currentLocationGridId = currentPlayer?.location?.g;
      const homesteadGridId = currentPlayer?.gridId;
      const isAtOwnHomestead = String(currentLocationGridId) === String(homesteadGridId);
      if (!isAtOwnHomestead) {
        updateStatus(strings[10143] || 'You must be at your homestead to relocate.');
        return;
      }

      setIsRelocating(true);
      // If not already at settlement or frontier zoom, first go to settlement zoom
      // to ensure settlement data is fetched (needed for current settlement rendering)
      if (zoomLevel !== 'settlement' && zoomLevel !== 'frontier') {
        setZoomLevel('settlement');
        // Wait for settlement data to load before transitioning to frontier
        setTimeout(() => {
          setZoomLevel('frontier');
          showNotification('Message', {
            title: strings[10133],
            message: strings[10134],
            icon: '🏠'
          });
        }, 1000);
      } else {
        setZoomLevel('frontier');
        showNotification('Message', {
          title: strings[10133],
          message: strings[10134],
          icon: '🏠'
        });
      }
    }
  };



/////////
//  Render the Profile Panel UI
////////
  
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
      titleKey="1119" panelName="ProfilePanel"
    >
      <div className="standard-panel">

        <p>{strings[4058]} {currentPlayer?.playerId || 'N/A'}</p>

        <div className="shared-buttons">
          <button className="btn-basic btn-success" onClick={() => {
            onClose();
            setTimeout(() => {
              // Create PC data structure for current player to pass to SocialPanel
              const currentPC = {
                playerId: currentPlayer._id,
                username: currentPlayer.username,
                icon: currentPlayer.icon,
                hp: currentPlayer.hp || 100,
                position: { x: 0, y: 0 }, // Position not needed for own profile
                iscamping: currentPlayer.iscamping,
                isinboat: currentPlayer.isinboat
              };
              handlePCClick(currentPC);
            }, 0);
          }}>
            Go to Player Character
          </button>
        </div>

        <br />

        <h3>{strings[4054]}</h3>

        {/* User Details Form */}
        <div className="form-group">
          <label>{strings[4052]}</label>
          <input
            name="username"
            type="text"
            value={formData.username}
            onChange={handleInputChange}
            placeholder="Enter your username"
          />
        </div>
        <h3>{strings[4076]}</h3>
        <p className="profile-password-note">{hasPassword ? strings[4085] : strings[4089]}</p>
        {hasPassword && (
          <div className="form-group">
            <label>{strings[4078]}</label>
            <input
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
              autoComplete="current-password"
            />
          </div>
        )}
        <div className="form-group">
          <label>{strings[4079]}</label>
          <input
            type="password"
            value={pwForm.next}
            onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
            autoComplete="new-password"
          />
        </div>
        {pwMessage && <p className="profile-password-message">{pwMessage}</p>}
        <div className="shared-buttons">
          <button className="btn-basic btn-neutral" onClick={handleSavePassword} disabled={pwSaving || !pwForm.next}>
            {hasPassword ? strings[4088] : strings[4077]}
          </button>
        </div>

        <h3>{strings[4106]}</h3>
        <p className="profile-email-line">{currentPlayer.email || strings[4108]}</p>
        <div className="shared-buttons">
          <button className="btn-basic btn-neutral" onClick={() => setShowEmailModal(true)}>
            {currentPlayer.email ? strings[4109] : strings[4111]}
          </button>
        </div>
        {currentPlayer.email && (
          <div className="shared-buttons">
            <button className={`btn-basic ${marketingOn ? 'btn-success' : 'btn-neutral'}`} onClick={toggleMarketing}>
              {strings[4107]}: {marketingOn ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
        {showEmailModal && (
          <EmailModal currentPlayer={currentPlayer} setCurrentPlayer={setCurrentPlayer} mode="edit" onClose={() => setShowEmailModal(false)} />
        )}

        <br />

        {isDeveloper && (
          <div className="form-group">
            <label>{strings[4055]}</label>
            <select name="accountStatus" value={formData.accountStatus} onChange={handleInputChange}>
              <option value="Free">Free</option>
              <option value="Bronze">Bronze</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
            </select>
          </div>
        )}
        
        <div className="shared-buttons">
          <button className="btn-basic btn-success" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : strings[10128]}
          </button>
        </div>

        <br />

        {/* Gold Pass Benefits button - COMMENTED OUT
        <div className="shared-buttons">
          <button className="btn-basic btn-gold" onClick={() => setShowGoldBenefitsModal(true)}>
            {formData.accountStatus === 'Gold' ? strings[10130] : strings[10131]}
          </button>
        </div>
        */}
      
        <br/>

        {/* Relocation Controls */}

        <h3>{strings[4059]}</h3>
        <p>{strings[4060]} <strong>{currentPlayer.relocations}</strong></p>
        <div className="shared-buttons">
          <button className="btn-basic btn-success" onClick={handleRelocation} disabled={!currentPlayer.relocations}>
            {isRelocating ? strings[10132] : strings[10133]}
          </button>
        </div>
        <p>{strings[4061]}</p>


        {/* Settings Toggles */}

        <h3>{strings[4062]}</h3>
        <div className="shared-buttons">
          <button className="btn-basic btn-success" onClick={handleLanguage}>
            🌎 {LANGUAGE_OPTIONS.find(l => l.code === currentPlayer.language)?.label || 'Language'}
          </button>
        </div>

        <div className="shared-buttons">
          <button
            className={`btn-basic ${localSettings.musicOn ? 'btn-success' : 'btn-neutral'}`}
            onClick={() => handleToggleChange('musicOn')}
          >
            Music: {localSettings.musicOn ? 'is ON' : 'is OFF'}
          </button>
        </div>

        <div className="shared-buttons">
          <button
            className={`btn-basic ${localSettings.soundEffectsOn ? 'btn-success' : 'btn-neutral'}`}
            onClick={() => handleToggleChange('soundEffectsOn')}
          >
            Sound Effects: {localSettings.soundEffectsOn ? 'is ON' : 'is OFF'}
          </button>
        </div>

        <div className="shared-buttons">
          <button
            className={`btn-basic ${localSettings.rangeOn ? 'btn-success' : 'btn-neutral'}`}
            onClick={() => handleToggleChange('rangeOn')}
          >
            {strings[4064]}{localSettings.rangeOn ? 'is ON' : 'is OFF'}
          </button>
        </div>

        {isDeveloper && (
          <div className="shared-buttons">
            <button
              className={`btn-basic ${localSettings.isTeleportEnabled ? 'btn-success' : 'btn-neutral'}`}
              onClick={() => handleToggleChange('isTeleportEnabled')}
            >
              Teleport: {localSettings.isTeleportEnabled ? 'is ON' : 'is OFF'}
            </button>
          </div>
        )}

        <div className="shared-buttons">
          <button
            className={`btn-basic ${localSettings.toggleVFX ? 'btn-success' : 'btn-neutral'}`}
            onClick={() => handleToggleChange('toggleVFX')}
          >
            VFX: {localSettings.toggleVFX ? 'is ON' : 'is OFF'}
          </button>
        </div>

        <div className="shared-buttons">
          <button className="btn-basic btn-neutral" onClick={() => setActiveModal('PrivacyPolicy')}>
            Privacy Policy
          </button>
        </div>

        <br/>

        <div className="shared-buttons">
          <button className="btn-basic btn-danger" onClick={handleLogout}>
            {strings[4056]}
          </button>
        </div>
      
        <div className="shared-buttons">
          <button
            className="btn-basic btn-danger"
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
            {strings[4057]}
          </button>
        </div>

        <br/>

        {isDeveloper && (
          <>
            <h4>Season Override (dev only)</h4>
            <div className="season-override-options">
              <label style={{ display: 'block', marginBottom: '10px' }}>
                <input
                  type="radio"
                  name="seasonOverride"
                  value="None"
                  checked={localSettings.seasonOverride === 'None'}
                  onChange={() => {
                    setLocalSettings(prev => ({
                      ...prev,
                      seasonOverride: 'None'
                    }));
                    updatePlayerSettings({ ...localSettings, seasonOverride: 'None' }, currentPlayer, setCurrentPlayer);
                  }}
                />
                None (Use current season)
              </label>
              <label style={{ display: 'block', marginBottom: '10px' }}>
                <input
                  type="radio"
                  name="seasonOverride"
                  value="Spring"
                  checked={localSettings.seasonOverride === 'Spring'}
                  onChange={() => {
                    setLocalSettings(prev => ({
                      ...prev,
                      seasonOverride: 'Spring'
                    }));
                    updatePlayerSettings({ ...localSettings, seasonOverride: 'Spring' }, currentPlayer, setCurrentPlayer);
                    setTimeout(() => window.location.reload(), 500);
                  }}
                />
                Spring 🌸
              </label>
              <label style={{ display: 'block', marginBottom: '10px' }}>
                <input
                  type="radio"
                  name="seasonOverride"
                  value="Summer"
                  checked={localSettings.seasonOverride === 'Summer'}
                  onChange={() => {
                    setLocalSettings(prev => ({
                      ...prev,
                      seasonOverride: 'Summer'
                    }));
                    updatePlayerSettings({ ...localSettings, seasonOverride: 'Summer' }, currentPlayer, setCurrentPlayer);
                    setTimeout(() => window.location.reload(), 500);
                  }}
                />
                Summer ☀️
              </label>
              <label style={{ display: 'block', marginBottom: '10px' }}>
                <input
                  type="radio"
                  name="seasonOverride"
                  value="Fall"
                  checked={localSettings.seasonOverride === 'Fall'}
                  onChange={() => {
                    setLocalSettings(prev => ({
                      ...prev,
                      seasonOverride: 'Fall'
                    }));
                    updatePlayerSettings({ ...localSettings, seasonOverride: 'Fall' }, currentPlayer, setCurrentPlayer);
                    setTimeout(() => window.location.reload(), 500);
                  }}
                />
                Fall 🍂
              </label>
              <label style={{ display: 'block', marginBottom: '10px' }}>
                <input
                  type="radio"
                  name="seasonOverride"
                  value="Winter"
                  checked={localSettings.seasonOverride === 'Winter'}
                  onChange={() => {
                    setLocalSettings(prev => ({
                      ...prev,
                      seasonOverride: 'Winter'
                    }));
                    updatePlayerSettings({ ...localSettings, seasonOverride: 'Winter' }, currentPlayer, setCurrentPlayer);
                    setTimeout(() => window.location.reload(), 500);
                  }}
                />
                Winter ❄️
              </label>
            </div>
          </>
        )}

        <br />
        <FeedbackLinks />

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

        {/* Gold Pass Benefits Modal - COMMENTED OUT
        <GoldPassBenefitsModal
          isOpen={showGoldBenefitsModal}
          onClose={() => setShowGoldBenefitsModal(false)}
        />
        */}
      </div>
    </Panel>
    
  );
};

export default ProfilePanel;