// governmentUtils.js
import axios from 'axios';
import API_BASE from '../../config';

/**
 * Fetches the mayor's username for a given settlementId.
 * Returns "Vacant" if no mayor is assigned,
 * "Error" if something went wrong,
 * or the mayor's username.
 */
export async function getMayorUsername(settlementId) {
  if (!settlementId) {
    console.warn("⚠️ No settlementId provided to getMayorUsername.");
    return "Error";
  }

  try {
    // Step 1: Fetch settlement data
    const res = await axios.get(`${API_BASE}/api/get-settlement/${settlementId}`);
    const settlement = res.data;

    // Step 2: Find the role entry for Mayor
    const mayorRole = settlement.roles?.find(role => role.roleName === "Mayor");
    if (!mayorRole || !mayorRole.playerId || mayorRole.playerId === "Vacant") {
      return "Vacant";
    }

    // Step 3: Fetch player info
    const playerRes = await axios.get(`${API_BASE}/api/player/${mayorRole.playerId}`);
    return playerRes.data.username || "Unknown";
    
  } catch (err) {
    console.error("❌ Failed to fetch mayor username:", err);
    return "Error";
  }
}