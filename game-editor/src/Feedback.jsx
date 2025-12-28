import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from './config';
import developerUsernames from '../../game-server/tuning/developerUsernames.json';
import '../../game-client/src/UI/Styles/theme.css';
import '../../game-client/src/UI/Buttons/SharedButtons.css';

const Feedback = ({ activePanel }) => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aggregatedData, setAggregatedData] = useState(null);
  const [startDate, setStartDate] = useState(new Date('2025-10-01').toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [sortField, setSortField] = useState('username');
  const [sortDirection, setSortDirection] = useState('asc');

  // String mappings for feedback options
  const feedbackStrings = {
    784: "Looks fun",
    785: "I like the visuals", 
    786: "I like farming",
    787: "I look forward to collaborating with others",
    790: "I couldn't figure it out",
    791: "I don't like the visuals",
    792: "I had a technical issue",
    793: "It's just not for me"
  };

  // Aspiration mappings with emojis
  const aspirationStrings = {
    1: "🌱 Farming",
    2: "⚔️ Adventurer", 
    3: "🏛️ Politician"
  };

  useEffect(() => {
    if (activePanel === 'feedback') {
      fetchFeedbackData();
    }
  }, [activePanel, startDate, endDate]);

  const fetchFeedbackData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch feedback data from the dedicated endpoint with user creation date range
      const response = await axios.get(`${API_BASE}/api/feedback-data`, {
        params: { 
          createdStartDate: startDate,
          createdEndDate: endDate 
        }
      });
      const playersData = response.data;
      
      // Debug logging for created date field
      console.log('🐛 Debug: First player data:', playersData[0]);
      console.log('🐛 Debug: Available fields:', Object.keys(playersData[0] || {}));
      console.log('🐛 Debug: created field:', playersData[0]?.created);
      console.log('🐛 Debug: createdAt field:', playersData[0]?.createdAt);
      
      setPlayers(playersData);
      
      // Calculate aggregated data
      const aggregated = calculateAggregatedData(playersData);
      setAggregatedData(aggregated);
      
    } catch (err) {
      console.error('Error fetching feedback data:', err);
      setError('Failed to load feedback data');
    } finally {
      setLoading(false);
    }
  };

  const calculateAggregatedData = (playersData) => {
    const aggregatedFeedback = {
      positive: {},
      negative: {},
      totalResponses: 0,
      positiveResponses: 0,
      negativeResponses: 0,
      aspirations: {
        1: 0, // Farming
        2: 0, // Adventurer
        3: 0  // Politician
      }
    };

    // Initialize counts for all possible feedback options
    Object.keys(feedbackStrings).forEach(key => {
      const index = parseInt(key);
      if (index >= 784 && index <= 787) {
        aggregatedFeedback.positive[index] = 0;
      } else {
        aggregatedFeedback.negative[index] = 0;
      }
    });

    // Count feedback from all players (excluding developers)
    playersData.filter(player => !developerUsernames.includes(player.username)).forEach(player => {
      // Count aspirations for players who gave feedback
      if (player.ftueFeedback && 
          ((player.ftueFeedback.positive && player.ftueFeedback.positive.length > 0) ||
           (player.ftueFeedback.negative && player.ftueFeedback.negative.length > 0))) {
        if (player.aspiration && aggregatedFeedback.aspirations[player.aspiration] !== undefined) {
          aggregatedFeedback.aspirations[player.aspiration]++;
        }
      }
      
      if (player.ftueFeedback) {
        let hasPositive = false;
        let hasNegative = false;

        // Count positive feedback
        if (player.ftueFeedback.positive && player.ftueFeedback.positive.length > 0) {
          hasPositive = true;
          player.ftueFeedback.positive.forEach(index => {
            if (aggregatedFeedback.positive[index] !== undefined) {
              aggregatedFeedback.positive[index]++;
            }
          });
        }

        // Count negative feedback
        if (player.ftueFeedback.negative && player.ftueFeedback.negative.length > 0) {
          hasNegative = true;
          player.ftueFeedback.negative.forEach(index => {
            if (aggregatedFeedback.negative[index] !== undefined) {
              aggregatedFeedback.negative[index]++;
            }
          });
        }

        // Count total responses
        if (hasPositive || hasNegative) {
          aggregatedFeedback.totalResponses++;
          if (hasPositive) aggregatedFeedback.positiveResponses++;
          if (hasNegative) aggregatedFeedback.negativeResponses++;
        }
      }
    });

    return aggregatedFeedback;
  };

  const formatLastActive = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedAndFilteredPlayers = () => {
    return players
      .filter(player => 
        player.ftueFeedback && 
        (
          (player.ftueFeedback.positive && player.ftueFeedback.positive.length > 0) ||
          (player.ftueFeedback.negative && player.ftueFeedback.negative.length > 0)
        ) &&
        !developerUsernames.includes(player.username)
      )
      .sort((a, b) => {
        let aVal, bVal;
        
        switch (sortField) {
          case 'username':
            aVal = a.username || '';
            bVal = b.username || '';
            break;
          case 'lastActive':
            aVal = new Date(a.lastActive || 0);
            bVal = new Date(b.lastActive || 0);
            break;
          case 'aspiration':
            aVal = aspirationStrings[a.aspiration] || 'Not set';
            bVal = aspirationStrings[b.aspiration] || 'Not set';
            break;
          case 'language':
            aVal = a.language || 'en';
            bVal = b.language || 'en';
            break;
          case 'ftuestep':
            aVal = a.ftuestep || 999;
            bVal = b.ftuestep || 999;
            break;
          case 'browser':
            aVal = a.ftueFeedback?.browser || 'Unknown';
            bVal = b.ftueFeedback?.browser || 'Unknown';
            break;
          case 'os':
            aVal = a.ftueFeedback?.os || 'Unknown';
            bVal = b.ftueFeedback?.os || 'Unknown';
            break;
          case 'created':
            aVal = new Date(a.created || 0);
            bVal = new Date(b.created || 0);
            break;
          default:
            aVal = a[sortField] || '';
            bVal = b[sortField] || '';
        }
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return ' ↕️';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  if (loading) {
    return (
      <div className="feedback-container">
        <h2>✅ FTUE Feedback</h2>
        <p>Loading feedback data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="feedback-container">
        <h2>✅ FTUE Feedback</h2>
        <p className="error">Error: {error}</p>
        <button onClick={fetchFeedbackData} className="refresh-button">Retry</button>
      </div>
    );
  }

  return (
    <div className="feedback-container">
      <div className="feedback-header">
        <h2>✅ FTUE Feedback</h2>
        <div className="shared-buttons">
          <button onClick={fetchFeedbackData} className="btn-basic btn-mini">
            🔄 Refresh Players
          </button>
        </div>
      </div>
      
      <div className="date-range-picker">
        <label>User Registration Start Date: </label>
        <input 
          type="date" 
          value={startDate} 
          onChange={(e) => setStartDate(e.target.value)}
          max={endDate}
        />
        <label style={{ marginLeft: '20px' }}>User Registration End Date: </label>
        <input 
          type="date" 
          value={endDate} 
          onChange={(e) => setEndDate(e.target.value)}
          min={startDate}
          max={new Date().toISOString().split('T')[0]}
        />
      </div>
      
      {aggregatedData && (
        <div className="feedback-summary" style={{ padding: '10px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Summary</h3>
          <p style={{ fontSize: '14px', margin: '3px 0' }}><strong>Total Players with Feedback:</strong> {aggregatedData.totalResponses}</p>
          <p style={{ fontSize: '14px', margin: '3px 0' }}><strong>Positive Responses:</strong> {aggregatedData.positiveResponses}</p>
          <p style={{ fontSize: '14px', margin: '3px 0' }}><strong>Negative Responses:</strong> {aggregatedData.negativeResponses}</p>
        </div>
      )}

      <div className="feedback-sections" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="feedback-section positive">
          <h3>Positive Feedback Counts</h3>
          {aggregatedData && Object.entries(aggregatedData.positive).map(([index, count]) => (
            <div key={index} className="feedback-item">
              <span className="feedback-text">{feedbackStrings[index]}</span>
              <span className="feedback-count">{count}</span>
            </div>
          ))}
        </div>

        <div className="feedback-section negative">
          <h3>Negative Feedback Counts</h3>
          {aggregatedData && Object.entries(aggregatedData.negative).map(([index, count]) => (
            <div key={index} className="feedback-item">
              <span className="feedback-text">{feedbackStrings[index]}</span>
              <span className="feedback-count">{count}</span>
            </div>
          ))}
        </div>

        <div className="feedback-section" style={{ borderLeft: '4px solid #2196F3' }}>
          <h3>Aspiration</h3>
          {aggregatedData && Object.entries(aggregatedData.aspirations).map(([aspiration, count]) => (
            <div key={aspiration} className="feedback-item">
              <span className="feedback-text">{aspirationStrings[aspiration]}</span>
              <span className="feedback-count">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="players-table-container">
        <h3>Player Feedback Details</h3>
        <table className="players-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('username')} style={{ cursor: 'pointer' }}>
                Username{getSortIcon('username')}
              </th>
              <th onClick={() => handleSort('lastActive')} style={{ cursor: 'pointer' }}>
                Last Played{getSortIcon('lastActive')}
              </th>
              <th onClick={() => handleSort('aspiration')} style={{ cursor: 'pointer' }}>
                Aspiration{getSortIcon('aspiration')}
              </th>
              <th onClick={() => handleSort('language')} style={{ cursor: 'pointer' }}>
                Language{getSortIcon('language')}
              </th>
              <th onClick={() => handleSort('ftuestep')} style={{ cursor: 'pointer' }}>
                FTUE Step{getSortIcon('ftuestep')}
              </th>
              <th onClick={() => handleSort('browser')} style={{ cursor: 'pointer' }}>
                Browser{getSortIcon('browser')}
              </th>
              <th onClick={() => handleSort('os')} style={{ cursor: 'pointer' }}>
                OS{getSortIcon('os')}
              </th>
              <th onClick={() => handleSort('created')} style={{ cursor: 'pointer' }}>
                Created{getSortIcon('created')}
              </th>
              <th>Positive Feedback</th>
              <th>Negative Feedback</th>
            </tr>
          </thead>
          <tbody>
            {getSortedAndFilteredPlayers().map(player => (
              <tr key={player._id}>
                <td>{player.username}</td>
                <td>{formatLastActive(player.lastActive)}</td>
                <td>{aspirationStrings[player.aspiration] || 'Not set'}</td>
                <td>{player.language || 'en'}</td>
                <td>{player.ftuestep || 'Completed'}</td>
                <td>{player.ftueFeedback?.browser || 'Unknown'}</td>
                <td>{player.ftueFeedback?.os || 'Unknown'}</td>
                <td>{player.created ? new Date(player.created).toLocaleDateString() : 'Unknown'}</td>
                <td>
                  {player.ftueFeedback?.positive?.map(index => feedbackStrings[index]).join(', ') || 'None'}
                </td>
                <td>
                  {player.ftueFeedback?.negative?.map(index => feedbackStrings[index]).join(', ') || 'None'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Feedback;