import axios from "axios";
import API_BASE from "../config";

export const processRelocation = async (currentPlayer, setCurrentPlayer, fromGridId, targetGridCoord, settlementGrid) => {
  console.log("At processRelocation; fromGridId =", fromGridId, "; targetGridCoord =", targetGridCoord);
  console.log("settlementGrid =", settlementGrid);

  try {
    const relocationResponse = await axios.post(`${API_BASE}/api/relocate-homestead`, {
      fromGridId,
      targetGridCoord,
    });

    // 🔄 Refresh player data
    try {
      console.log("🔄 Fetching updated player data...");
      const playerResponse = await axios.get(`${API_BASE}/api/player/${currentPlayer.playerId}`);
      console.log("📊 Updated player object:", playerResponse.data);

      if (playerResponse.data) {
        setCurrentPlayer(playerResponse.data);
        localStorage.setItem("player", JSON.stringify(playerResponse.data));
        console.log("✅ setCurrentPlayer + localStorage update complete");
      }
    } catch (error) {
      console.error("❌ Failed to refresh player data after relocation:", error);
    }

    console.log("✅ Relocation successful:", relocationResponse.data);
    return relocationResponse.data;
  } catch (error) {
    console.error("❌ Relocation failed:", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
};