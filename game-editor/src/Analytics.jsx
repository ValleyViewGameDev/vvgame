import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import API_BASE from './config';
import './Analytics.css';

const Analytics = ({ activePanel }) => {
  const [dailyActiveUsers, setDailyActiveUsers] = useState([]);
  const [ftueAnalytics, setFtueAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ftueLoading, setFtueLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30); // Default to last 30 days
  const [ftueStartDate, setFtueStartDate] = useState('2026-01-09');
  const [ftueEndDate, setFtueEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Filter states - each is a Set of selected values (all selected by default)
  const [selectedOS, setSelectedOS] = useState(new Set());
  const [selectedBrowser, setSelectedBrowser] = useState(new Set());
  const [selectedTimezone, setSelectedTimezone] = useState(new Set());
  const [selectedLanguage, setSelectedLanguage] = useState(new Set());
  const [filterOptions, setFilterOptions] = useState({ os: [], browser: [], timezone: [], language: [] });

  // Static language options
  const languageOptions = ['English', 'Spanish', 'French', 'German'];

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

  // Initialize filters when filterOptions change (all checked by default)
  useEffect(() => {
    if (filterOptions.os.length > 0 && selectedOS.size === 0) {
      setSelectedOS(new Set(filterOptions.os));
    }
    if (filterOptions.browser.length > 0 && selectedBrowser.size === 0) {
      setSelectedBrowser(new Set(filterOptions.browser));
    }
    if (filterOptions.timezone.length > 0 && selectedTimezone.size === 0) {
      setSelectedTimezone(new Set(filterOptions.timezone));
    }
    // Initialize language filter with all options
    if (selectedLanguage.size === 0) {
      setSelectedLanguage(new Set(languageOptions));
    }
  }, [filterOptions]);

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
      // Update filter options from server response
      if (response.data.filterOptions) {
        setFilterOptions(response.data.filterOptions);
      }
    } catch (error) {
      console.error('Error fetching FTUE analytics:', error);
    } finally {
      setFtueLoading(false);
    }
  };

  // Toggle a filter value
  const toggleFilter = (filterSet, setFilter, value) => {
    const newSet = new Set(filterSet);
    if (newSet.has(value)) {
      newSet.delete(value);
    } else {
      newSet.add(value);
    }
    setFilter(newSet);
  };

  // Select all for a filter
  const selectAllFilter = (setFilter, allOptions) => {
    setFilter(new Set(allOptions));
  };

  // Deselect all for a filter
  const deselectAllFilter = (setFilter) => {
    setFilter(new Set());
  };

  // Filter the raw data based on selected filters
  // All filters are cumulative AND - user must match at least one selected option in EACH category
  const filteredData = useMemo(() => {
    if (!ftueAnalytics?.rawData) return [];

    return ftueAnalytics.rawData.filter(user => {
      const userOS = user.ftueFeedback?.os;
      const userBrowser = user.ftueFeedback?.browser;
      const userTimezone = user.ftueFeedback?.timezone;
      const userLanguage = user.language || 'English';

      // Each category: user must match at least one selected option
      // If category has no selections, no users can match (returns false)
      // If user has no data for a field, they only pass if that field's filter is empty OR has their value
      const osMatch = selectedOS.size === 0 ? false : (!userOS || selectedOS.has(userOS));
      const browserMatch = selectedBrowser.size === 0 ? false : (!userBrowser || selectedBrowser.has(userBrowser));
      const timezoneMatch = selectedTimezone.size === 0 ? false : (!userTimezone || selectedTimezone.has(userTimezone));
      const languageMatch = selectedLanguage.size === 0 ? false : selectedLanguage.has(userLanguage);

      // Cumulative AND across all categories
      return osMatch && browserMatch && timezoneMatch && languageMatch;
    });
  }, [ftueAnalytics?.rawData, selectedOS, selectedBrowser, selectedTimezone, selectedLanguage]);

  // Recalculate analytics based on filtered data
  const filteredAnalytics = useMemo(() => {
    if (!ftueAnalytics || filteredData.length === 0) {
      return {
        totalUsers: 0,
        stepCounts: {},
        stepProgression: [],
        completedCount: 0,
        completedPercentage: 0
      };
    }

    const totalUsers = filteredData.length;
    const stepCounts = {};

    // Count users at each step
    filteredData.forEach(player => {
      if (player.firsttimeuser === false || player.firsttimeuser === undefined) {
        stepCounts['completed'] = (stepCounts['completed'] || 0) + 1;
      } else if (player.ftuestep !== undefined && player.ftuestep !== null) {
        const step = `step_${player.ftuestep}`;
        stepCounts[step] = (stepCounts[step] || 0) + 1;
      } else {
        stepCounts['step_0'] = (stepCounts['step_0'] || 0) + 1;
      }
    });

    // Calculate step progression using the same logic as server
    const stepProgression = [];
    const maxStep = ftueAnalytics.stepProgression.length > 0
      ? Math.max(...ftueAnalytics.stepProgression.filter(s => s.step !== 'completed').map(s => s.step))
      : 9;
    const completedUsers = stepCounts['completed'] || 0;

    for (let i = 0; i <= maxStep; i++) {
      let cumulativeCount = 0;

      if (i === 0) {
        cumulativeCount = totalUsers;
      } else {
        for (let j = i; j <= maxStep; j++) {
          const stepKey = `step_${j}`;
          cumulativeCount += stepCounts[stepKey] || 0;
        }
        cumulativeCount += completedUsers;
      }

      const percentage = totalUsers > 0 ? ((cumulativeCount / totalUsers) * 100).toFixed(1) : 0;

      // Get trigger name from original data
      const originalStep = ftueAnalytics.stepProgression.find(s => s.step === i);

      stepProgression.push({
        step: i,
        count: cumulativeCount,
        percentage: parseFloat(percentage),
        label: originalStep?.label || (i === 0 ? 'Started FTUE' : `Reached Step ${i}`),
        trigger: originalStep?.trigger,
        currentlyAt: stepCounts[`step_${i}`] || 0
      });
    }

    // Add completed users
    const completedPercentage = totalUsers > 0 ? ((completedUsers / totalUsers) * 100).toFixed(1) : 0;
    stepProgression.push({
      step: 'completed',
      count: completedUsers,
      percentage: parseFloat(completedPercentage),
      label: 'Completed FTUE',
      currentlyAt: completedUsers
    });

    return {
      totalUsers,
      stepCounts,
      stepProgression,
      completedCount: completedUsers,
      completedPercentage
    };
  }, [filteredData, ftueAnalytics]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const maxUsers = Math.max(...dailyActiveUsers.map(d => d.count), 1);

  // Render a filter section with checkboxes
  const renderFilterSection = (title, options, selectedSet, setSelected) => {
    return (
      <div className="filter-section">
        <div className="filter-header">
          <span className="filter-title">{title}</span>
          <div className="filter-buttons">
            <button
              className="filter-toggle-all"
              onClick={() => selectAllFilter(setSelected, options)}
            >
              Select All
            </button>
            <button
              className="filter-toggle-all"
              onClick={() => deselectAllFilter(setSelected)}
            >
              Deselect All
            </button>
          </div>
        </div>
        <div className="filter-options">
          {options.map(option => (
            <label key={option} className="filter-checkbox">
              <input
                type="checkbox"
                checked={selectedSet.has(option)}
                onChange={() => toggleFilter(selectedSet, setSelected, option)}
              />
              <span className="filter-label">{option}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

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

        {/* Filter sections */}
        {ftueAnalytics && (
          <div className="ftue-filters">
            {renderFilterSection('Operating System', filterOptions.os, selectedOS, setSelectedOS)}
            {renderFilterSection('Browser', filterOptions.browser, selectedBrowser, setSelectedBrowser)}
            {renderFilterSection('Time Zone', filterOptions.timezone, selectedTimezone, setSelectedTimezone)}
            {renderFilterSection('Language', languageOptions, selectedLanguage, setSelectedLanguage)}
          </div>
        )}

        {ftueLoading ? (
          <p>Loading FTUE data...</p>
        ) : ftueAnalytics ? (
          <>
            <div className="ftue-summary">
              <div className="stat">
                <span className="stat-label">Total Users in Range:</span>
                <span className="stat-value">
                  {filteredAnalytics.totalUsers}
                  {filteredAnalytics.totalUsers !== ftueAnalytics.totalUsers && (
                    <span className="filtered-note"> (filtered from {ftueAnalytics.totalUsers})</span>
                  )}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Completed FTUE:</span>
                <span className="stat-value">
                  {filteredAnalytics.completedCount}
                  ({filteredAnalytics.completedPercentage}%)
                </span>
              </div>
            </div>

            <div className="ftue-progression">
              <h4>Step Progression:</h4>
              <div className="progression-chart">
                {filteredAnalytics.stepProgression
                  .filter(step => step.step !== 0) // Filter out step 0 (no longer used)
                  .map((step, index) => {
                  // Use trigger from server response
                  const triggerName = step.trigger || step.label;
                  const displayLabel = step.step === 'completed'
                    ? 'Completed FTUE'
                    : `Step ${step.step}: ${triggerName}`;

                  return (
                  <div key={index} className="progression-step">
                    <div className="step-label">{displayLabel}</div>
                    <div className="step-bar-container">
                      <div
                        className="step-bar"
                        style={{
                          width: `${step.percentage}%`,
                          backgroundColor: step.step === 'completed' ? '#28a745' : '#007bff'
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
                  );
                })}
              </div>
            </div>

            <div className="recent-users">
              <h4>Users in Selected Period ({filteredData.length} total{filteredData.length !== ftueAnalytics.rawData.length ? ` - filtered from ${ftueAnalytics.rawData.length}` : ''}):</h4>
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>FTUE Status</th>
                      <th>Current Step</th>
                      <th>Language</th>
                      <th>OS</th>
                      <th>Browser</th>
                      <th>Timezone</th>
                      <th>Registered</th>
                      <th>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((user, index) => (
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
                        <td>{user.language || 'English'}</td>
                        <td>{user.ftueFeedback?.os || 'Unknown'}</td>
                        <td>{user.ftueFeedback?.browser || 'Unknown'}</td>
                        <td>{user.ftueFeedback?.timezone || 'Unknown'}</td>
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
