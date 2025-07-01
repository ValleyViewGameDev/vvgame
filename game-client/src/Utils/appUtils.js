import axios from 'axios';
import API_BASE from '../config';

// Utility function: return boolean indicating developer status
export const checkDeveloperStatus = async (username) => {
  try {
    const response = await axios.get(`${API_BASE}/api/check-developer-status/${username}`);
    return !!response.data?.isDeveloper;
  } catch (err) {
    console.warn('⚠️ Failed to check developer status:', err);
    return false;
  }
};

// Badge update helper
export function updateBadge(currentPlayer, setBadgeState, category, value = true) {
  const key = `badges_${currentPlayer.username}`;
  const current = JSON.parse(localStorage.getItem(key)) || {};
  const updated = { ...current, [category]: value };
  localStorage.setItem(key, JSON.stringify(updated));
  setBadgeState(updated);
}

// Badge read helper
export function getBadgeState(currentPlayer) {
  if (!currentPlayer?.username) {
    console.warn("⚠️ getBadgeState called without valid currentPlayer");
    return {};
  }
  const key = `badges_${currentPlayer.username}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : {};
}