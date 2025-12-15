import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Modals/Modal.css';
import '../../UI/Buttons/SharedButtons.css';
import './Leaderboard.css';
import HopeQuest from '../Social/HopeQuest';
import { getDerivedLevel, getXpForNextLevel } from '../../Utils/playerManagement';
import { useStrings } from '../../UI/StringsContext';

function LeaderboardPanel({ onClose, currentPlayer, setModalContent, setIsModalOpen, masterResources, masterTraders, masterXPLevels }) {
  const strings = useStrings();
  const [isLoading, setIsLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState([]);

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      if (!currentPlayer || !currentPlayer.frontierId) {
        console.warn("� currentPlayer or frontierId is not available yet.");
        return;
      }

      setIsLoading(true);
      try {
        console.log("🏆 Fetching leaderboard data for frontier:", currentPlayer.frontierId);

        // Get summary player data
        const response = await axios.get(`${API_BASE}/api/players-by-frontier-with-dev-status/${currentPlayer.frontierId}`);
        const players = response.data;

        // Sort players by net worth, excluding developers, and get top 10
        const topPlayers = players
          .filter(player => !player.isDeveloper)
          .sort((a, b) => (b.netWorth || 0) - (a.netWorth || 0))
          .slice(0, 10);

        console.log("🏆 Top 10 players summary:", topPlayers);

        // Fetch full player data for each top player
        const fullPlayerDataPromises = topPlayers.map(async (player) => {
          try {
            // Determine the correct ID field (could be playerId, _id, or id)
            const playerId = player.playerId || player._id || player.id;
            console.log(`🏆 Fetching full data for ${player.username} using ID:`, playerId);

            if (!playerId) {
              console.error(`❌ No ID found for player ${player.username}:`, player);
              throw new Error('No player ID found');
            }

            // Fetch full player data using playerId
            const fullPlayerResponse = await axios.get(`${API_BASE}/api/player/${playerId}`);
            const fullPlayer = fullPlayerResponse.data;
            console.log(`🏆 Full data for ${player.username}:`, fullPlayer);

            return {
              username: fullPlayer.username || player.username,
              icon: fullPlayer.icon || '🙂',
              netWorth: player.netWorth || 0,
              xp: fullPlayer.xp || 0,
              inventory: fullPlayer.inventory || [],
              backpack: fullPlayer.backpack || []
            };
          } catch (error) {
            console.error(`❌ Error fetching full data for player ${player.username}:`, error);
            // Return partial data if fetch fails
            return {
              username: player.username,
              icon: '🙂',
              netWorth: player.netWorth || 0,
              xp: 0,
              inventory: [],
              backpack: []
            };
          }
        });

        const sortedPlayers = await Promise.all(fullPlayerDataPromises);

        setLeaderboardData(sortedPlayers);
        setIsLoading(false);
      } catch (error) {
        console.error("❌ Error fetching leaderboard data:", error);
        setIsLoading(false);
      }
    };

    fetchLeaderboardData();
  }, [currentPlayer]);

  return (
    <Panel onClose={onClose} descriptionKey="1040" titleKey="1140" panelName="LeaderboardPanel">
      {isLoading ? (
        <p>Loading leaderboard...</p>
      ) : (
        <>
          <h2 className="leaderboard-title">Top players by net worth:</h2>
          {leaderboardData.length > 0 ? (
            <div className="leaderboard-container">
              {leaderboardData.slice(0, 10).map((player, index) => {
                const playerLevel = getDerivedLevel(player, masterXPLevels);
                const xpForNextLevel = getXpForNextLevel(player, masterXPLevels);

                // Calculate XP progress percentage (same logic as PlayerPanel)
                // masterXPLevels is an array of XP thresholds: [40, 100, 180, ...]
                const currentLevelIndex = playerLevel - 2; // Level 1 = no threshold, Level 2 = index 0
                const currentLevelXP = currentLevelIndex >= 0 ? (masterXPLevels?.[currentLevelIndex] || 0) : 0;
                const xpIntoLevel = player.xp - currentLevelXP;
                const xpRangeForLevel = xpForNextLevel - currentLevelXP;
                const xpProgress = xpRangeForLevel <= 0 ? 100 : Math.min(100, Math.max(0, (xpIntoLevel / xpRangeForLevel) * 100));

                return (
                  <div key={index} className="player-card">
                    <div className="player-header">
                      <div className="player-rank">
                        #{index + 1}
                      </div>
                      <div className="player-info">
                        {player.icon} <strong>{player.username}</strong>
                      </div>
                    </div>
                    <div className="player-networth">
                      💰 {player.netWorth.toLocaleString()}
                    </div>

                    {/* Level Display */}
                    <div className="player-stats">
                      {strings[10150]} {playerLevel}
                    </div>

                    {/* XP Display */}
                    <div className="player-stats">
                      {strings[10151]} {player.xp} / {xpForNextLevel}
                    </div>

                    {/* XP Progress Bar */}
                    <div className="xp-bar-container">
                      <div className="xp-bar-fill" style={{
                        width: `${xpProgress}%`
                      }}>
                      </div>
                    </div>

                    <HopeQuest
                      inventory={player.inventory}
                      backpack={player.backpack}
                      masterResources={masterResources}
                      masterTraders={masterTraders}
                      showTitle={false}
                      size="small"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p>No leaderboard data available.</p>
          )}
        </>
      )}
    </Panel>
  );
}

export default LeaderboardPanel;
