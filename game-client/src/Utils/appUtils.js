import axios from 'axios';
import API_BASE from '../config';

// Utility: detect mobile browser
export function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Utility function: return boolean indicating developer status
export const checkDeveloperStatus = async (username) => {
  console.log(`🔍 [DEV CHECK] Checking developer status for username: "${username}"`);
  console.log(`🔍 [DEV CHECK] API_BASE: ${API_BASE}`);
  try {
    const url = `${API_BASE}/api/check-developer-status/${username}`;
    console.log(`🔍 [DEV CHECK] Full URL: ${url}`);
    const response = await axios.get(url);
    console.log(`🔍 [DEV CHECK] Response:`, response.data);
    const result = !!response.data?.isDeveloper;
    console.log(`🔍 [DEV CHECK] Result: ${result}`);
    return result;
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
  // Callers outside App (Mailbox, Store, Chat) pass a no-op setter; App listens for this event so the
  // header dots and the grid overlays (mailbox checkmark) react without a socket round trip.
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vv-badge-change', { detail: updated }));
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