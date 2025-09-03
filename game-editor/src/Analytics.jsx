import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from './config';
import './Analytics.css';

const Analytics = ({ activePanel }) => {
  const [dailyActiveUsers, setDailyActiveUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30); // Default to last 30 days

  useEffect(() => {
    if (activePanel === 'analytics') {
      fetchAnalytics();
    }
  }, [activePanel, dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/analytics/daily-active-users`, {
        params: { days: dateRange }
      });
      setDailyActiveUsers(response.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const maxUsers = Math.max(...dailyActiveUsers.map(d => d.count), 1);

  return (
    <div className="analytics-container">
      <h2>📊 Analytics</h2>
      
      <div className="date-range-selector">
        <label>Show last: </label>
        <select value={dateRange} onChange={(e) => setDateRange(Number(e.target.value))}>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      <div className="metric-card">
        <h3>Daily Active Users</h3>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            <div className="chart-container">
              {dailyActiveUsers.length === 0 ? (
                <p>No data available</p>
              ) : (
                <div className="bar-chart">
                  {dailyActiveUsers.map((day, index) => (
                    <div key={index} className="bar-column">
                      <div className="bar-wrapper">
                        <div 
                          className="bar" 
                          style={{ height: `${(day.count / maxUsers) * 200}px` }}
                          title={`${day.count} users`}
                        >
                          <span className="bar-value">{day.count}</span>
                        </div>
                      </div>
                      <div className="bar-label">{formatDate(day.date)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-label">Average Daily Users:</span>
                <span className="stat-value">
                  {(dailyActiveUsers.reduce((sum, d) => sum + d.count, 0) / dailyActiveUsers.length || 0).toFixed(1)}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Peak Day:</span>
                <span className="stat-value">
                  {Math.max(...dailyActiveUsers.map(d => d.count), 0)} users
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Analytics;