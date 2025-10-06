import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from './config';

const Feedback = ({ activePanel }) => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aggregatedData, setAggregatedData] = useState(null);

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
    1: "🚜 Farming",
    2: "⚔️ Adventurer", 
    3: "🏛️ Politician"
  };

  useEffect(() => {
    if (activePanel === 'feedback') {
      fetchFeedbackData();
    }
  }, [activePanel]);

  const fetchFeedbackData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch feedback data from the dedicated endpoint
      const response = await axios.get(`${API_BASE}/api/feedback-data`);
      const playersData = response.data;
      
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
      negativeResponses: 0
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

    // Count feedback from all players
    playersData.forEach(player => {
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
        <button onClick={fetchFeedbackData} className="refresh-button">
          🔄 Refresh Players
        </button>
      </div>
      
      {aggregatedData && (
        <div className="feedback-summary">
          <h3>Summary</h3>
          <p><strong>Total Players with Feedback:</strong> {aggregatedData.totalResponses}</p>
          <p><strong>Positive Responses:</strong> {aggregatedData.positiveResponses}</p>
          <p><strong>Negative Responses:</strong> {aggregatedData.negativeResponses}</p>
        </div>
      )}

      <div className="feedback-sections">
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
      </div>

      <div className="players-table-container">
        <h3>Player Feedback Details</h3>
        <table className="players-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Last Played</th>
              <th>Aspiration</th>
              <th>FTUE Step</th>
              <th>Browser</th>
              <th>Positive Feedback</th>
              <th>Negative Feedback</th>
            </tr>
          </thead>
          <tbody>
            {players
              .filter(player => 
                player.ftueFeedback && 
                (
                  (player.ftueFeedback.positive && player.ftueFeedback.positive.length > 0) ||
                  (player.ftueFeedback.negative && player.ftueFeedback.negative.length > 0)
                )
              )
              .map(player => (
              <tr key={player._id}>
                <td>{player.username}</td>
                <td>{formatLastActive(player.lastActive)}</td>
                <td>{aspirationStrings[player.aspiration] || 'Not set'}</td>
                <td>{player.ftuestep || 'Completed'}</td>
                <td>{player.ftueFeedback?.browser || 'Unknown'}</td>
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