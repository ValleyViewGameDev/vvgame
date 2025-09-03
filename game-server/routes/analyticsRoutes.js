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

    // Aggregate daily active users
    const dailyData = await Player.aggregate([
      {
        $match: {
          lastActive: { 
            $gte: startDate,
            $lte: endDate 
          }
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

module.exports = router;