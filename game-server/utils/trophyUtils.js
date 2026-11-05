const fs = require('fs');
const path = require('path');
const Player = require('../models/player');

let trophyDefsCache = null;
function loadTrophyDefs() {
  if (!trophyDefsCache) {
    try { trophyDefsCache = JSON.parse(fs.readFileSync(path.join(__dirname, '../tuning/trophies.json'), 'utf8')); }
    catch (e) { trophyDefsCache = []; }
  }
  return trophyDefsCache;
}

/**
 * Apply a trophy to a Player document ALREADY LOADED, in memory: no read, no save. The action
 * routes (/action/*) use this so a trophy rides in the same write as the rest of the action.
 * Returns the same shape awardTrophy answers with (success false when nothing changed).
 */
function applyTrophy(player, trophyName, progressIncrement = 1, defs = loadTrophyDefs()) {
  const trophyDef = (defs || []).find(t => t.name === trophyName);
  if (!trophyDef) return { success: false, error: 'Trophy not found in master trophies.' };
  if (!Array.isArray(player.trophies)) player.trophies = [];

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
  

  player.markModified?.('trophies');
  return {
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
}

/**
 * Award a trophy to a player: load, apply, save (the /earn-trophy route and older callers).
 * @param {string} playerId - The player's ID
 * @param {string} trophyName - The name of the trophy to earn (must match trophies.json)
 * @param {number} progressIncrement - For Progress trophies, the amount to increment (default 1)
 * @returns {Promise<Object>} Result object with success, trophy data, and whether it's a new milestone
 */
async function awardTrophy(playerId, trophyName, progressIncrement = 1) {
  try {
    const player = await Player.findById(playerId);
    if (!player) return { success: false, error: 'Player not found.' };
    const result = applyTrophy(player, trophyName, progressIncrement, loadTrophyDefs());
    if (result.success) await player.save();
    return result;
  } catch (error) {
    console.error('Error awarding trophy:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  awardTrophy,
  applyTrophy,
  loadTrophyDefs
};
