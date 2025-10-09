const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const fs = require('fs');
const path = require('path');

// Get daily active users for the last N days
router.get('/daily-active-users', async (req, res) => {
  try {
    // Load developer usernames from JSON file
    let developerUsernames = [];
    try {
      const developerUsernamesPath = path.join(__dirname, '../tuning/developerUsernames.json');
      const developerData = fs.readFileSync(developerUsernamesPath, 'utf8');
      developerUsernames = JSON.parse(developerData);
    } catch (error) {
      console.warn('Could not load developer usernames:', error.message);
    }

    const days = parseInt(req.query.days) || 30;
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Aggregate daily active users (excluding developers)
    const dailyData = await Player.aggregate([
      {
        $match: {
          lastActive: { 
            $gte: startDate,
            $lte: endDate 
          },
          $and: [
            { isDeveloper: { $ne: true } }, // Exclude players marked as developers
            { username: { $nin: developerUsernames } } // Exclude developer usernames
          ]
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$lastActive" },
            month: { $month: "$lastActive" },
            day: { $dayOfMonth: "$lastActive" }
          },
          count: { $sum: 1 },
          date: { $first: "$lastActive" }
        }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: "$_id.year",
              month: "$_id.month",
              day: "$_id.day"
            }
          },
          count: 1
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);

    // Fill in missing days with 0 users
    const dateMap = new Map();
    dailyData.forEach(item => {
      const dateStr = item.date.toISOString().split('T')[0];
      dateMap.set(dateStr, item.count);
    });

    const result = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: dateMap.get(dateStr) || 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json(result);

  } catch (error) {
    console.error('Error fetching daily active users:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Get FTUE progression analytics
router.get('/ftue-analytics', async (req, res) => {
  try {
    // Get date range from query parameters
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date('2025-10-01T00:00:00.000Z');
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    
    // Set time to start and end of day
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    // Load developer usernames from JSON file
    let developerUsernames = [];
    try {
      const developerUsernamesPath = path.join(__dirname, '../tuning/developerUsernames.json');
      const developerData = fs.readFileSync(developerUsernamesPath, 'utf8');
      developerUsernames = JSON.parse(developerData);
    } catch (error) {
      console.warn('Could not load developer usernames:', error.message);
    }

    // Get all players with FTUE data within date range (excluding developers)
    const ftueData = await Player.aggregate([
      {
        $match: {
          $and: [
            { isDeveloper: { $ne: true } }, // Exclude players marked as developers
            { username: { $nin: developerUsernames } }, // Exclude developer usernames
            { createdAt: { $gte: startDate, $lte: endDate } } // Only users within date range
          ]
        }
      },
      {
        $project: {
          playerId: 1,
          firsttimeuser: 1,
          ftuestep: 1,
          createdAt: 1,
          lastActive: 1,
          username: 1
        }
      }
    ]);

    // Process the data
    const stepCounts = {};
    const completedCount = 0;
    const totalUsers = ftueData.length;
    
    // Count users at each step
    ftueData.forEach(player => {
      if (player.firsttimeuser === false || player.firsttimeuser === undefined) {
        // FTUE completed
        stepCounts['completed'] = (stepCounts['completed'] || 0) + 1;
      } else if (player.ftuestep !== undefined && player.ftuestep !== null) {
        // Still in FTUE
        const step = `step_${player.ftuestep}`;
        stepCounts[step] = (stepCounts[step] || 0) + 1;
      } else {
        // No FTUE step recorded (probably step 0)
        stepCounts['step_0'] = (stepCounts['step_0'] || 0) + 1;
      }
    });

    // Calculate retention by registration date
    const last30Days = ftueData.filter(player => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return new Date(player.createdAt) >= thirtyDaysAgo;
    });

    // Calculate funnel progression (cumulative: users who reached AT LEAST each step)
    const stepProgression = [];
    const maxStep = 10; // Based on FTUE having 10 steps
    const completedUsers = stepCounts['completed'] || 0;
    
    for (let i = 0; i <= maxStep; i++) {
      // Count users who reached AT LEAST this step
      // This includes users currently at this step + users at any higher step + completed users
      let cumulativeCount = 0;
      
      if (i === 0) {
        // Step 0: All users (everyone starts here)
        cumulativeCount = totalUsers;
      } else {
        // For step X: count users at step X and all higher steps + completed
        for (let j = i; j <= maxStep; j++) {
          const stepKey = `step_${j}`;
          cumulativeCount += stepCounts[stepKey] || 0;
        }
        cumulativeCount += completedUsers; // Add completed users
      }
      
      const percentage = totalUsers > 0 ? ((cumulativeCount / totalUsers) * 100).toFixed(1) : 0;
      
      stepProgression.push({
        step: i,
        count: cumulativeCount,
        percentage: parseFloat(percentage),
        label: i === 0 ? 'Started FTUE' : `Reached Step ${i}`,
        currentlyAt: stepCounts[`step_${i}`] || 0 // Also include count of users currently stuck at this step
      });
    }
    
    // Add completed users as final step
    stepProgression.push({
      step: 'completed',
      count: completedUsers,
      percentage: totalUsers > 0 ? ((completedUsers / totalUsers) * 100).toFixed(1) : 0,
      label: 'Completed FTUE',
      currentlyAt: completedUsers
    });

    // Get users within the specified date range
    const recentUsers = await Player.aggregate([
      {
        $match: {
          $and: [
            { isDeveloper: { $ne: true } }, // Exclude players marked as developers
            { username: { $nin: developerUsernames } }, // Exclude developer usernames
            { createdAt: { $gte: startDate, $lte: endDate } } // Only users within date range
          ]
        }
      },
      {
        $project: {
          playerId: 1,
          firsttimeuser: 1,
          ftuestep: 1,
          createdAt: 1,
          lastActive: 1,
          username: 1
        }
      },
      {
        $sort: { createdAt: -1 } // Sort by creation date, newest first
      }
    ]);

    res.json({
      totalUsers,
      stepCounts,
      stepProgression,
      last30DaysUsers: last30Days.length,
      dateRangeUsersCount: recentUsers.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      rawData: recentUsers // Return all users within date range
    });

  } catch (error) {
    console.error('Error fetching FTUE analytics:', error);
    res.status(500).json({ error: 'Failed to fetch FTUE analytics data' });
  }
});

module.exports = router;