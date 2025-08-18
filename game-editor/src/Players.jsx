import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import './Players.css';
import API_BASE from './config';

const Players = ({ selectedFrontier, selectedSettlement, frontiers, settlements, activePanel }) => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Function to get settlement name by ID
  const getSettlementName = (settlementId) => {
    const settlement = settlements.find(s => s._id === settlementId);
    return settlement ? settlement.name : 'Unknown Settlement';
  };

  // Fetch players from the database
  const fetchPlayers = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔍 Fetching players from database...');
      const response = await axios.get(`${API_BASE}/api/players`);
      console.log('✅ Players fetched:', response.data);
      setPlayers(response.data || []);
    } catch (error) {
      console.error('❌ Failed to fetch players:', error);
      setError('Failed to fetch players from database');
    } finally {
      setLoading(false);
    }
  };

  // Fetch players when component mounts or when activePanel changes to 'players'
  useEffect(() => {
    if (activePanel === 'players') {
      fetchPlayers();
    }
  }, [activePanel]);

  // Memoized filtered players based on current frontier/settlement selection
  const filteredPlayers = useMemo(() => {
    let filtered = players;

    // Filter by frontier if one is selected
    if (selectedFrontier) {
      const frontierSettlements = settlements
        .filter(s => String(s.frontierId?._id || s.frontierId) === String(selectedFrontier))
        .map(s => s._id);

      filtered = filtered.filter(player => 
        frontierSettlements.includes(player.settlementId)
      );
    }

    // Further filter by settlement if one is selected
    if (selectedSettlement) {
      filtered = filtered.filter(player => 
        String(player.settlementId) === String(selectedSettlement)
      );
    }

    return filtered;
  }, [players, selectedFrontier, selectedSettlement, settlements]);

  // Handle player row selection
  const handlePlayerSelect = (player) => {
    console.log('🎯 Selected player:', player.username);
    console.log('📊 Player skills:', player.skills);
    console.log('⚡ Player powers:', player.powers);
    
    // Validate skills data
    if (player.skills && Array.isArray(player.skills)) {
      player.skills.forEach((skill, index) => {
        if (typeof skill === 'object' && skill !== null) {
          console.log(`🔧 Skill ${index}:`, skill);
        }
      });
    }
    
    // Validate powers data
    if (player.powers && Array.isArray(player.powers)) {
      player.powers.forEach((power, index) => {
        if (typeof power === 'object' && power !== null) {
          console.log(`⚡ Power ${index}:`, power);
        }
      });
    }
    
    setSelectedPlayer(player);
  };

  // Handle account deletion
  const handleDeleteAccount = async (player) => {
    if (!player) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete the account for "${player.username}"?\n\n` +
      `This will permanently delete:\n` +
      `• All player data\n` +
      `• All inventory items\n` +
      `• All progress and achievements\n\n` +
      `This action cannot be undone!`
    );
    
    if (!confirmed) return;
    
    try {
      console.log(`🗑️ Deleting account for player: ${player.username} (ID: ${player._id})`);
      
      const response = await axios.post(`${API_BASE}/api/delete-player`, {
        playerId: player._id,
      });
      
      if (response.data.success) {
        alert(`✅ Account for "${player.username}" deleted successfully.`);
        console.log(`✅ Account deleted for username: ${player.username}`);
        
        // Remove the deleted player from the list
        setPlayers(players.filter(p => p._id !== player._id));
        
        // Clear the selected player
        setSelectedPlayer(null);
      } else {
        alert("❌ Failed to delete account. See console for details.");
        console.error("Delete failed:", response.data);
      }
    } catch (error) {
      console.error("❌ Error deleting player:", error);
      alert(`❌ Error deleting account: ${error.message}`);
    }
  };

  // Handle sending player home
  const handleSendHome = async (player) => {
    if (!player) return;
    
    const confirmed = window.confirm(
      `Send "${player.username}" back to their home grid?\n\n` +
      `This will:\n` +
      `• Move them to their home grid\n` +
      `• Reset their position to (0, 0)\n` +
      `• Restore their HP to full\n\n` +
      `Continue?`
    );
    
    if (!confirmed) return;
    
    try {
      console.log(`🏠 Sending player home: ${player.username} (ID: ${player._id})`);
      
      const response = await axios.post(`${API_BASE}/api/send-player-home`, {
        playerId: player._id,
      });
      
      if (response.data.success) {
        alert(`✅ "${player.username}" has been sent home successfully.`);
        console.log(`✅ Player sent home: ${player.username}`);
        
        // Optionally refresh the player data to show updated location
        if (player.location) {
          player.location.x = 0;
          player.location.y = 0;
          setSelectedPlayer({...player});
        }
      } else {
        alert("❌ Failed to send player home. See console for details.");
        console.error("Send home failed:", response.data);
      }
    } catch (error) {
      console.error("❌ Error sending player home:", error);
      alert(`❌ Error sending player home: ${error.message}`);
    }
  };

  // Handle column sorting
  const handleSort = (columnKey) => {
    let direction = 'asc';
    if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnKey, direction });
  };

  // Sort and filter players
  const sortedAndFilteredPlayers = useMemo(() => {
    let filtered = filteredPlayers;

    // Apply sorting if configured
    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle special cases for sorting
        if (sortConfig.key === 'created' || sortConfig.key === 'lastActive') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        } else if (sortConfig.key === 'netWorth' || sortConfig.key === 'ftuestep') {
          aValue = Number(aValue) || 0;
          bValue = Number(bValue) || 0;
        } else if (sortConfig.key === 'money') {
          // Extract money from inventory for sorting
          const aMoneyItem = a.inventory?.find(item => item.type === 'Money');
          const bMoneyItem = b.inventory?.find(item => item.type === 'Money');
          aValue = Number(aMoneyItem?.quantity) || 0;
          bValue = Number(bMoneyItem?.quantity) || 0;
        } else if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = (bValue || '').toLowerCase();
        } else if (aValue === null || aValue === undefined) {
          aValue = '';
        }
        
        if (bValue === null || bValue === undefined) {
          bValue = '';
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [filteredPlayers, sortConfig]);

  return (
    <div className="players-layout">
      {/* BASE PANEL UI - Always visible */}
      <div className="players-base-panel">
        <h2>😀 Players</h2>
        
        <div className="players-stats">
          <p><strong>Total Players:</strong> {players.length}</p>
          {(selectedFrontier || selectedSettlement) && (
            <p><strong>Filtered Players:</strong> {sortedAndFilteredPlayers.length}</p>
          )}
          {selectedFrontier && !selectedSettlement && (
            <p><strong>In Current Frontier:</strong> {sortedAndFilteredPlayers.length}</p>
          )}
          {selectedSettlement && (
            <p><strong>In Current Settlement:</strong> {sortedAndFilteredPlayers.length}</p>
          )}
        </div>

        <button onClick={fetchPlayers} className="refresh-btn">
          🔄 Refresh Data
        </button>

        {/* Selected Player Info */}
        {selectedPlayer && (
          <div className="selected-player-info">
            <h3>Selected Player:</h3>
            <div className="player-details">
              <h3><strong>{selectedPlayer.icon || '😀'} {selectedPlayer.username}</strong></h3>
            </div>
            
            {/* Player management buttons */}
            <div className="player-actions">
              <h4>Actions</h4>
              <button className="action-btn" disabled>
                View Details
              </button>
              <button className="action-btn" disabled>
                Send Message
              </button>
              <button 
                className="action-btn" 
                onClick={() => handleSendHome(selectedPlayer)}
                style={{ backgroundColor: '#28a745', color: 'white' }}
              >
                🏠 Send Home
              </button>
              <button className="action-btn" disabled>
                Modify Account
              </button>
              <button 
                className="action-btn delete-btn" 
                onClick={() => handleDeleteAccount(selectedPlayer)}
                style={{ backgroundColor: '#dc3545', color: 'white' }}
              >
                🗑️ Delete Account
              </button>
              <p className="coming-soon">Some functions coming soon...</p>
            </div>

            {/* Player Stats */}
            <div className="player-stats">
              <p><strong>First time user?:</strong> {selectedPlayer.firsttimeuser === true ? 'true' : 'false'}</p>
              <p><strong>Active Quests:</strong> {selectedPlayer.activeQuests?.length || 0}</p>
              <p><strong>Completed Quests:</strong> {selectedPlayer.completedQuests?.length || 0}</p>
              
              {selectedPlayer.skills && selectedPlayer.skills.length > 0 && (
                <div className="skills-section">
                  <p><strong>Skills:</strong></p>
                  <ul className="skills-list">
                    {selectedPlayer.skills.map((skill, index) => {
                      // Handle different skill data formats
                      if (typeof skill === 'string') {
                        return <li key={index}>{skill}</li>;
                      } else if (skill && typeof skill === 'object') {
                        const name = skill.name || skill.type || 'Unknown Skill';
                        const level = skill.level || skill.quantity || '';
                        return <li key={index}>{name}{level ? `: ${level}` : ''}</li>;
                      }
                      return <li key={index}>Invalid skill data</li>;
                    })}
                  </ul>
                </div>
              )}
              
              {selectedPlayer.powers && selectedPlayer.powers.length > 0 && (
                <div className="powers-section">
                  <p><strong>Powers:</strong></p>
                  <ul className="powers-list">
                    {selectedPlayer.powers.map((power, index) => {
                      // Handle different power data formats
                      if (typeof power === 'string') {
                        return <li key={index}>{power}</li>;
                      } else if (power && typeof power === 'object') {
                        const name = power.name || power.type || 'Unknown Power';
                        return <li key={index}>{name}</li>;
                      }
                      return <li key={index}>Invalid power data</li>;
                    })}
                  </ul>
                </div>
              )}
              
              {selectedPlayer.inventory && selectedPlayer.inventory.length > 0 && (
                <div className="inventory-section">
                  <p><strong>Inventory:</strong></p>
                  <ul className="skills-list">
                    {selectedPlayer.inventory.map((item, index) => {
                      // Handle different inventory item formats
                      if (item && typeof item === 'object' && item.type && item.quantity !== undefined) {
                        return <li key={index}>{item.type}: {item.quantity}</li>;
                      }
                      return <li key={index}>Invalid inventory item</li>;
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="players-main-container">
        {loading ? (
          <div className="loading">Loading players...</div>
        ) : error ? (
          <div className="error">
            <p>{error}</p>
            <button onClick={fetchPlayers}>Retry</button>
          </div>
        ) : (
          <div className="players-table-container">
            <table className="players-table">
              <thead>
                <tr>
                  <th 
                    onClick={() => handleSort('username')}
                    className={`sortable ${sortConfig.key === 'username' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Username {sortConfig.key === 'username' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('language')}
                    className={`sortable ${sortConfig.key === 'language' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Language {sortConfig.key === 'language' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('netWorth')}
                    className={`sortable ${sortConfig.key === 'netWorth' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Net Worth {sortConfig.key === 'netWorth' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('money')}
                    className={`sortable ${sortConfig.key === 'money' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Money {sortConfig.key === 'money' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('accountStatus')}
                    className={`sortable ${sortConfig.key === 'accountStatus' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Account Status {sortConfig.key === 'accountStatus' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('role')}
                    className={`sortable ${sortConfig.key === 'role' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Role {sortConfig.key === 'role' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('created')}
                    className={`sortable ${sortConfig.key === 'created' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Created {sortConfig.key === 'created' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('lastActive')}
                    className={`sortable ${sortConfig.key === 'lastActive' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Last Active {sortConfig.key === 'lastActive' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Last Location</th>
                  <th 
                    onClick={() => handleSort('ftuestep')}
                    className={`sortable ${sortConfig.key === 'ftuestep' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    FTUE Step {sortConfig.key === 'ftuestep' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredPlayers.map((player) => (
                  <tr 
                    key={player._id}
                    className={selectedPlayer?._id === player._id ? 'selected' : ''}
                    onClick={() => handlePlayerSelect(player)}
                  >
                    <td className="username">
                      {player.icon || '😀'} {player.username}
                    </td>
                    <td>{player.language || 'Unknown'}</td>
                    <td>{player.netWorth || 0}</td>
                    <td>{(() => {
                      const moneyItem = player.inventory?.find(item => item.type === 'Money');
                      return moneyItem?.quantity || 0;
                    })()}</td>
                    <td>
                      <span className={`status ${player.accountStatus?.toLowerCase() || 'free'}`}>
                        {player.accountStatus || 'Free'}
                      </span>
                    </td>
                    <td>
                      <span className={`role ${player.role?.toLowerCase() || 'citizen'}`}>
                        {player.role || 'Citizen'}
                      </span>
                    </td>
                    <td>{player.created ? new Date(player.created).toLocaleDateString() : 'Unknown'}</td>
                    <td>
                      {player.lastActive ? (
                        <span title={new Date(player.lastActive).toLocaleString()}>
                          {(() => {
                            const now = new Date();
                            const lastActive = new Date(player.lastActive);
                            const diffMs = now - lastActive;
                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                            const diffMinutes = Math.floor(diffMs / (1000 * 60));
                            
                            if (diffDays > 0) return `${diffDays}d ago`;
                            if (diffHours > 0) return `${diffHours}h ago`;
                            if (diffMinutes > 0) return `${diffMinutes}m ago`;
                            return 'Just now';
                          })()}
                        </span>
                      ) : (
                        'Never'
                      )}
                    </td>
                    <td>
                      {player.location?.gtype ? (
                        <span>
                          {player.location.gtype} ({player.location.x}, {player.location.y})
                        </span>
                      ) : (
                        'Unknown'
                      )}
                    </td>
                    <td>{player.ftuestep || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {sortedAndFilteredPlayers.length === 0 && !loading && !error && (
              <div className="no-players">
                {selectedSettlement ? 
                  'No players found in the selected settlement.' :
                  selectedFrontier ? 
                    'No players found in the selected frontier.' :
                    'No players found.'
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Players;