import axios from 'axios';
import API_BASE from '../config';
import playersInGridManager from '../GridState/PlayersInGrid';

export const updatePlayerIcon = async (currentPlayer, setCurrentPlayer, playerId, icon, updateStatus) => {

    // ✅ Validate that the icon is a proper emoji
    const isEmoji = (icon) => {
      return typeof icon === 'string' && /\p{Emoji}/u.test(icon);
    };

    if (!isEmoji(icon)) {
        console.error('❌ Attempted to set non-emoji icon:', icon);
        updateStatus?.("Please select a valid emoji.");
        return;
    }

    const updates = { icon };

    const res = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId,
        updates
    });
    if (!res.data.success) {
        throw new Error('Failed to update icon');
    }

    // ✅ Proceed only if DB update was successful
    const gridId = currentPlayer?.location?.g;
    if (gridId) {
        const playerData = playersInGridManager.getPlayersInGrid(gridId)?.[currentPlayer.playerId];
        if (playerData) {
            const updatedPlayerData = {
                ...playerData,
                icon: icon,
            };
            playersInGridManager.updatePC(gridId, currentPlayer.playerId, updatedPlayerData);
            console.log(`✅ Updated icon in playersInGrid: ${currentPlayer.playerId} → ${icon}`);
        }
    } else {
        console.warn("⚠️ No valid gridId found, skipping NPCsInGrid update.");
    }

    const updatedCurrentPlayer = { ...currentPlayer, icon };
    localStorage.setItem('player', JSON.stringify(updatedCurrentPlayer));
    setCurrentPlayer(updatedCurrentPlayer); // ✅ Trigger React state update
    console.log('✅ Updated localStorage and state for currentPlayer:', icon);

  return res.data.player;
};