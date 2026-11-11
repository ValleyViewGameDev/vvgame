import axios from 'axios';
import API_BASE from '../config';

export const MIN_PASSWORD_LENGTH = 4; // the server's rule (/player/change-password)

/**
 * Set or change the player's password (/player/change-password): a passwordless profile sets its
 * first one with no current password; one with a password must give the current one. Shared by
 * Profile > Secure your profile and the Add Password prompt (UI/Modals/PasswordModal.js).
 * Throws the axios error on failure (map it with authErrors.js); returns the updated player.
 */
export async function savePassword({ currentPlayer, setCurrentPlayer, currentPassword, newPassword }) {
  const hasPassword = !!currentPlayer?.hasPassword;
  await axios.post(`${API_BASE}/api/player/change-password`, {
    playerId: currentPlayer.playerId,
    currentPassword: hasPassword ? currentPassword : undefined,
    newPassword,
  });
  const updatedPlayer = { ...currentPlayer, hasPassword: true };
  setCurrentPlayer(updatedPlayer);
  try { localStorage.setItem('player', JSON.stringify(updatedPlayer)); } catch (_) { /* storage off */ }
  return updatedPlayer;
}
