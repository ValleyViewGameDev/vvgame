const fs = require('fs');
const path = require('path');
const Player = require('../models/player');

/**
 * Award a trophy to a player
 * @param {string} playerId - The player's ID
 * @param {string} trophyName - The name of the trophy to earn (must match trophies.json)
 * @param {number} progressIncrement - For Progress trophies, the amount to increment (default 1)
 * @returns {Promise<Object>} Result object with success, trophy data, and whether it's a new milestone
 */
async function awardTrophy(playerId, trophyName, progressIncrement = 1) {
  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return { 
        success: false, 
        error: 'Player not found.' 
      };
    }
    
    // Load master trophies directly from file
    const trophiesPath = path.join(__dirname, '../tuning/trophies.json');
    const masterTrophies = JSON.parse(fs.readFileSync(trophiesPath, 'utf8'));
    const trophyDef = masterTrophies.find(t => t.name === trophyName);
    
    if (!trophyDef) {
      return { 
        success: false, 
        error: 'Trophy not found in master trophies.' 
      };
    }
    
    // Check if player already has this trophy
    let existingTrophy = player.trophies.find(t => t.name === trophyName);
    let isNewMilestone = false;
    let currentProgress = 0;
    let nextMilestone = null;
    
    if (trophyDef.type === 'Progress' && trophyDef.progress) {
      // Handle Progress trophy - tracks progress towards milestones
      if (existingTrophy) {
        // Increment existing progress
        currentProgress = (existingTrophy.progress || 0) + progressIncrement;
        existingTrophy.progress = currentProgress;
      } else {
        // First time earning progress - create trophy entry
        currentProgress = progressIncrement;
        existingTrophy = {
          name: trophyName,
          progress: currentProgress,
          collected: false,
          timestamp: new Date()
        };
        player.trophies.push(existingTrophy);
      }
      
      // Check if current progress matches a milestone
      const progressMilestones = trophyDef.progress;
      isNewMilestone = progressMilestones.includes(currentProgress);
      
      // If hitting a new milestone, set collected to false
      if (isNewMilestone) {
        existingTrophy.collected = false;
        console.log(`🏆 Player ${player.username} hit milestone for ${trophyName}: ${currentProgress}!`);
      } else {
        console.log(`📈 Player ${player.username} progress on ${trophyName}: ${currentProgress}`);
      }
      
      // Find next milestone
      nextMilestone = progressMilestones.find(m => m > currentProgress) || progressMilestones[progressMilestones.length - 1];
      
    } else if (trophyDef.type === 'Count') {
      // Handle Count trophy - tracks quantity/count
      if (existingTrophy) {
        existingTrophy.qty = (existingTrophy.qty || 0) + 1;
        console.log(`🏆 Player ${player.username} earned another ${trophyName} (total: ${existingTrophy.qty})`);
        isNewMilestone = true; // Count trophies always show notification on increment
      } else {
        existingTrophy = {
          name: trophyName,
          qty: 1,
          collected: false,
          timestamp: new Date()
        };
        player.trophies.push(existingTrophy);
        isNewMilestone = true;
        console.log(`🏆 Player ${player.username} earned first ${trophyName} trophy!`);
      }
      
    } else {
      // Handle Event trophy - one-time achievements
      if (existingTrophy) {
        // Already has this event trophy, don't duplicate
        console.log(`⚠️ Player ${player.username} already has ${trophyName} trophy`);
        return {
          success: false,
          message: 'Trophy already earned',
          trophy: existingTrophy
        };
      } else {
        existingTrophy = {
          name: trophyName,
          collected: false,
          timestamp: new Date()
        };
        player.trophies.push(existingTrophy);
        isNewMilestone = true;
        console.log(`🏆 Player ${player.username} earned ${trophyName} trophy!`);
      }
    }
    
    await player.save();
    
    // Return trophy data including progress info
    const result = {
      success: true,
      trophy: {
        name: existingTrophy.name,
        progress: existingTrophy.progress,
        qty: existingTrophy.qty,
        type: trophyDef.type,
        nextMilestone: nextMilestone
      },
      isNewMilestone: isNewMilestone,
      message: isNewMilestone ? `Trophy milestone reached: ${trophyName}!` : `Progress updated for ${trophyName}`
    };
    
    return result;
    
  } catch (error) {
    console.error('Error awarding trophy:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

module.exports = {
  awardTrophy
};