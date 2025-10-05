import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Feedback = () => {
  const [feedbackData, setFeedbackData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // String mappings for feedback options
  const feedbackStrings = {
    784: "Looks fun",
    785: "I like the visuals", 
    786: "I like farming",
    787: "I look forward to collaborating with others",
    790: "I couldn't figure it out",
    791: "I don't like the visuals",
    792: "It's just not for me",
    793: "Other" // Added the missing string 793
  };

  useEffect(() => {
    fetchFeedbackData();
  }, []);

  const fetchFeedbackData = async () => {
    try {
      setLoading(true);
      
      // Fetch feedback data from the dedicated endpoint
      const response = await axios.get('/api/feedback-data');
      const players = response.data;
      
      // Aggregate feedback data
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
      players.forEach(player => {
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

      setFeedbackData(aggregatedFeedback);
    } catch (err) {
      console.error('Error fetching feedback data:', err);
      setError('Failed to load feedback data');
    } finally {
      setLoading(false);
    }
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
        <button onClick={fetchFeedbackData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="feedback-container">
      <h2>✅ FTUE Feedback</h2>
      
      <div className="feedback-summary">
        <h3>Summary</h3>
        <p><strong>Total Responses:</strong> {feedbackData.totalResponses}</p>
        <p><strong>Positive Responses:</strong> {feedbackData.positiveResponses}</p>
        <p><strong>Negative Responses:</strong> {feedbackData.negativeResponses}</p>
      </div>

      <div className="feedback-sections">
        <div className="feedback-section positive">
          <h3>Positive Feedback: "I'll keep playing, and here's why:"</h3>
          {Object.entries(feedbackData.positive).map(([index, count]) => (
            <div key={index} className="feedback-item">
              <span className="feedback-text">{feedbackStrings[index]}</span>
              <span className="feedback-count">{count}</span>
            </div>
          ))}
        </div>

        <div className="feedback-section negative">
          <h3>Negative Feedback: "I doubt I'll return, and here's why:"</h3>
          {Object.entries(feedbackData.negative).map(([index, count]) => (
            <div key={index} className="feedback-item">
              <span className="feedback-text">{feedbackStrings[index]}</span>
              <span className="feedback-count">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={fetchFeedbackData} className="refresh-button">
        🔄 Refresh Data
      </button>
    </div>
  );
};

export default Feedback;