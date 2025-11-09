import API_BASE from './config';
import axios from 'axios';

/**
 * Update player settings both locally and on the server.
 */
export async function updatePlayerSettings(newSettings, currentPlayer, setCurrentPlayer) {
  try {
    // Prepare payload - merge with existing settings to preserve equippedWeapon/equippedArmor
    const updatedPlayer = {
      ...currentPlayer,
      settings: { ...currentPlayer.settings, ...newSettings }, // Merge with existing settings
    };

    // Save to local storage first for immediate responsiveness
    localStorage.setItem('player', JSON.stringify(updatedPlayer));
    setCurrentPlayer(updatedPlayer);

    console.log('Updating settings on server:', newSettings);

    // Send update to server using dot notation to preserve existing settings
    const updates = {};
    Object.keys(newSettings).forEach(key => {
      updates[`settings.${key}`] = newSettings[key];
    });

    const response = await axios.post(`${API_BASE}/api/update-profile`, {
      playerId: currentPlayer.playerId,
      updates
    });

    if (response.data.success) {
      console.log('Settings updated successfully on server.');
    } else {
      console.error('Server update failed:', response.data.error);
    }
  } catch (error) {
    console.error('Error updating player settings:', error);
  }
}