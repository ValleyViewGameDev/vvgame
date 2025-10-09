const express = require('express');
const router = express.Router();
const Player = require('../models/player');

// Get daily active users for the last N days
router.get('/daily-active-users', async (req, res) => {
  try {
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
          isDeveloper: { $ne: true } // Exclude players where isDeveloper is true
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
    // Get all players with FTUE data (excluding developers)
    const ftueData = await Player.aggregate([
      {
        $match: {
          isDeveloper: { $ne: true } // Exclude developers
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

    // Calculate step progression percentages
    const stepProgression = [];
    const maxStep = 10; // Based on FTUE having 10 steps
    
    for (let i = 0; i <= maxStep; i++) {
      const stepKey = `step_${i}`;
      const count = stepCounts[stepKey] || 0;
      const percentage = totalUsers > 0 ? ((count / totalUsers) * 100).toFixed(1) : 0;
      
      stepProgression.push({
        step: i,
        count: count,
        percentage: parseFloat(percentage),
        label: i === 0 ? 'Not Started' : `Step ${i}`
      });
    }
    
    // Add completed users
    const completedUsers = stepCounts['completed'] || 0;
    stepProgression.push({
      step: 'completed',
      count: completedUsers,
      percentage: totalUsers > 0 ? ((completedUsers / totalUsers) * 100).toFixed(1) : 0,
      label: 'Completed'
    });

    res.json({
      totalUsers,
      stepCounts,
      stepProgression,
      last30DaysUsers: last30Days.length,
      rawData: ftueData.slice(0, 50) // Return last 50 users for detailed analysis
    });

  } catch (error) {
    console.error('Error fetching FTUE analytics:', error);
    res.status(500).json({ error: 'Failed to fetch FTUE analytics data' });
  }
});

module.exports = router;