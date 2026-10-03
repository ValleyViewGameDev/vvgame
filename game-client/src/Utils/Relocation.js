import axios from "axios";
import API_BASE from "../config";
import GlobalGridStateTilesAndResources from "../GridState/GlobalGridStateTilesAndResources";
import { fetchWorldMap } from "./WorldMap";

/**
 * Move the player's homestead to `targetGridCoord`. The server moves the Grid
 * reference between Settlement cells and rewrites player.settlementId /
 * homesteadGridCoord (and location.s/gridCoord when the player is standing at
 * home). The player is NOT moved; we refetch the player and refresh the
 * loaded grid's meta so Transit / the minimap see the new coordinate.
 */
export const processRelocation = async (currentPlayer, setCurrentPlayer, fromGridId, targetGridCoord, settlementGrid) => {
  console.log("At processRelocation; fromGridId =", fromGridId, "; targetGridCoord =", targetGridCoord);
  console.log("settlementGrid =", settlementGrid);

  try {
    const relocationResponse = await axios.post(`${API_BASE}/api/relocate-homestead`, {
      fromGridId,
      targetGridCoord,
    });

    // Refresh player data
    try {
      const playerResponse = await axios.get(`${API_BASE}/api/player/${currentPlayer.playerId}`);
      const freshPlayer = playerResponse.data;
      if (freshPlayer) {
        setCurrentPlayer(freshPlayer);
        localStorage.setItem("player", JSON.stringify(freshPlayer));

        // Standing at home during the move: the loaded grid's cell changed
        const meta = GlobalGridStateTilesAndResources.getGridMeta();
        if (meta && freshPlayer.location?.g && String(freshPlayer.location.g) === meta.gridId) {
          GlobalGridStateTilesAndResources.setGridMeta({
            ...meta,
            gridCoord: freshPlayer.location.gridCoord ?? meta.gridCoord,
            settlementId: freshPlayer.location.s ? String(freshPlayer.location.s) : meta.settlementId,
          });
        }
        console.log("✅ setCurrentPlayer + localStorage update complete");

        // The homestead cell moved: refresh the world map so canTravel sees the new M/H cells
        await fetchWorldMap(freshPlayer.frontierId || freshPlayer.location?.f, freshPlayer.playerId || freshPlayer._id);
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
