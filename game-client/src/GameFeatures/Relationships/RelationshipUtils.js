import axios from 'axios';
import API_BASE from '../../config';

/**
 * Central utility for managing relationship changes
 * Creates a new relationship if it doesn't exist, or updates existing one
 */
export const updateRelationship = async (currentPlayer, targetName, delta) => {
  try {
    const playerId = currentPlayer._id || currentPlayer.playerId;
    
    // Check if relationship exists
    const existingRelationship = currentPlayer.relationships?.find(rel => rel.name === targetName);
    
    if (!existingRelationship) {
      // Create new relationship
      const response = await axios.post(`${API_BASE}/api/add-relationship`, {
        playerId,
        targetName,
        initialScore: delta
      });
      
      return {
        success: response.data.success,
        player: response.data.player,
        relationships: response.data.relationships
      };
    } else {
      // Update existing relationship
      const response = await axios.post(`${API_BASE}/api/update-relationship`, {
        playerId,
        targetName,
        delta: delta
      });
      
      return {
        success: response.data.success,
        player: response.data.player,
        relationships: response.data.relationships,
        relationship: response.data.relationship
      };
    }
  } catch (error) {
    console.error('Error updating relationship:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Update relationship status (friend, crush, love, married, rival, etc.)
 */
export const updateRelationshipStatus = async (currentPlayer, targetName, status, value) => {
  try {
    const playerId = currentPlayer._id || currentPlayer.playerId;
    
    const response = await axios.post(`${API_BASE}/api/add-or-update-relationship-status`, {
      playerId,
      name: targetName,
      status: status,
      value: value
    });
    
    return {
      success: response.data.success,
      player: response.data.player,
      relationship: response.data.relationship
    };
  } catch (error) {
    console.error('Error updating relationship status:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get relationship status between player and target
 */
export const getRelationshipStatus = (currentPlayer, targetName) => {
  if (!currentPlayer?.relationships) return null;
  
  return currentPlayer.relationships.find(rel => rel.name === targetName) || {
    name: targetName,
    relscore: 0
  };
};

/**
 * Calculate relationship change with modifiers
 */
export const calculateRelationshipChange = (baseChange, modifiers = {}) => {
  let finalChange = baseChange;

  // Apply modifiers (e.g., skills, items, events)
  if (modifiers.charismaBonus) {
    finalChange *= (1 + modifiers.charismaBonus);
  }

  if (modifiers.dailyLimit) {
    // Implement daily interaction limits
    finalChange = Math.min(finalChange, modifiers.dailyLimit);
  }

  // Ensure score stays within bounds (-100 to 100)
  return Math.round(finalChange);
};

/**
 * Get all NPCs that would be affected by a relationship change
 */
export const getCascadeTargets = (targetName, relationshipType) => {
  // This would be defined based on game logic
  // Example: changing relationship with one merchant affects all merchants
  const cascadeRules = {
    merchant: ['all_merchants'],
    guard: ['all_guards'],
    noble: ['related_nobles']
  };

  return cascadeRules[relationshipType] || [];
};