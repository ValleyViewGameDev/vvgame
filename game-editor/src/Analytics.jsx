import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from './config';
import './Analytics.css';

const Analytics = ({ activePanel }) => {
  const [dailyActiveUsers, setDailyActiveUsers] = useState([]);
  const [ftueAnalytics, setFtueAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ftueLoading, setFtueLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30); // Default to last 30 days
  const [ftueStartDate, setFtueStartDate] = useState(new Date('2025-10-01').toISOString().split('T')[0]);
  const [ftueEndDate, setFtueEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (activePanel === 'analytics') {
      fetchAnalytics();
    }
  }, [activePanel, dateRange]);

  useEffect(() => {
    if (activePanel === 'analytics') {
      fetchFtueAnalytics();
    }
  }, [activePanel, ftueStartDate, ftueEndDate]);

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

  const fetchFtueAnalytics = async () => {
    setFtueLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/analytics/ftue-analytics`, {
        params: { 
          startDate: ftueStartDate,
          endDate: ftueEndDate 
        }
      });
      setFtueAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching FTUE analytics:', error);
    } finally {
      setFtueLoading(false);
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

      <div className="metric-card">
        <h3>FTUE Drop-off Analysis</h3>
        <div className="date-range-picker">
          <label>Start Date: </label>
          <input 
            type="date" 
            value={ftueStartDate} 
            onChange={(e) => setFtueStartDate(e.target.value)}
            max={ftueEndDate}
          />
          <label style={{ marginLeft: '20px' }}>End Date: </label>
          <input 
            type="date" 
            value={ftueEndDate} 
            onChange={(e) => setFtueEndDate(e.target.value)}
            min={ftueStartDate}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
        {ftueLoading ? (
          <p>Loading FTUE data...</p>
        ) : ftueAnalytics ? (
          <>
            <div className="ftue-summary">
              <div className="stat">
                <span className="stat-label">Total Users:</span>
                <span className="stat-value">{ftueAnalytics.totalUsers}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Completed FTUE:</span>
                <span className="stat-value">
                  {ftueAnalytics.stepProgression.find(s => s.step === 'completed')?.count || 0} 
                  ({ftueAnalytics.stepProgression.find(s => s.step === 'completed')?.percentage || 0}%)
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Last 30 Days:</span>
                <span className="stat-value">{ftueAnalytics.last30DaysUsers} new users</span>
              </div>
              <div className="stat">
                <span className="stat-label">Date Range Users:</span>
                <span className="stat-value">{ftueAnalytics.dateRangeUsersCount} users</span>
              </div>
            </div>

            <div className="ftue-progression">
              <h4>Step Progression:</h4>
              <div className="progression-chart">
                {ftueAnalytics.stepProgression.map((step, index) => (
                  <div key={index} className="progression-step">
                    <div className="step-label">{step.label}</div>
                    <div className="step-bar-container">
                      <div 
                        className="step-bar" 
                        style={{ 
                          width: `${step.percentage}%`,
                          backgroundColor: step.step === 'completed' ? '#28a745' : 
                                         step.step === 0 ? '#dc3545' : '#007bff'
                        }}
                      ></div>
                      <span className="step-stats">
                        {step.count} reached ({step.percentage}%)
                        {step.currentlyAt !== undefined && step.currentlyAt !== step.count && (
                          <span className="currently-at"> • {step.currentlyAt} currently here</span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="recent-users">
              <h4>Users in Selected Period ({ftueAnalytics.dateRangeUsersCount} total):</h4>
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>FTUE Status</th>
                      <th>Current Step</th>
                      <th>Registered</th>
                      <th>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ftueAnalytics.rawData.map((user, index) => (
                      <tr key={index}>
                        <td>{user.username || user.playerId.substring(0, 8)}</td>
                        <td>
                          <span className={`status ${
                            user.firsttimeuser === false || user.firsttimeuser === undefined ? 'completed' : 'in-progress'
                          }`}>
                            {user.firsttimeuser === false || user.firsttimeuser === undefined ? 'Completed' : 'In Progress'}
                          </span>
                        </td>
                        <td>
                          {user.firsttimeuser === false || user.firsttimeuser === undefined ? 
                            'Done' : 
                            `Step ${user.ftuestep || 0}`
                          }
                        </td>
                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td>{new Date(user.lastActive).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <p>No FTUE data available</p>
        )}
      </div>
    </div>
  );
};

export default Analytics;