import axios from "axios";
import API_BASE from "../config";


export const processRelocation = async (currentPlayer, setCurrentPlayer, fromGridId, targetGridCoord, settlementGrid) => {

    console.log("At processRelocation; fromGridId = ", fromGridId,"; targetGridCoord = ",targetGridCoord);
    console.log("settlementGrid = ",settlementGrid);

  try {
    const response = await axios.post(`${API_BASE}/api/relocate-homestead`, {
      fromGridId,
      targetGridCoord,
      settlementGrid,
    });

    // 🔄 Fetch updated player data to reflect relocation count change
    try {
      console.log("🔄 Fetching updated player data...");
      const response = await axios.get(`${API_BASE}/api/player/${currentPlayer.playerId}`);
      console.log("📦 Full player fetch response:", response);
      console.log("📊 Updated player object:", response.data);
      if (response.data) {
        setCurrentPlayer(response.data);
        localStorage.setItem('player', JSON.stringify(response.data));
        console.log("✅ setCurrentPlayer + localStorage update complete");
      }
    } catch (error) {
      console.error("❌ Failed to refresh player data after relocation toggle:", error);
    }

    console.log("✅ Relocation successful:", response.data);
  } catch (error) {
    console.error("❌ Relocation failed:", error.response?.data || error.message);
  }

}