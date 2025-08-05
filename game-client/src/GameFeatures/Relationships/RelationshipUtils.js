import axios from 'axios';
import API_BASE from '../../config';
import RelationshipMatrix from './RelationshipMatrix.json';

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
 * Get NPC reactions when player forms a new relationship status
 * Returns an array of NPCs that would react and their relationship changes
 */
export const getNPCReactions = (targetNPC, newStatus) => {
  const reactions = [];
  
  // Check each NPC in the matrix
  Object.entries(RelationshipMatrix).forEach(([npc, relationships]) => {
    // Skip the target NPC
    if (npc === targetNPC) return;
    
    // Check if this NPC has a relationship with the target
    const npcRelationshipWithTarget = relationships[targetNPC];
    
    if (npcRelationshipWithTarget) {
      // If new status is love, and another NPC loves this NPC
      if (newStatus === 'love' && npcRelationshipWithTarget === 'love') {
        reactions.push({
          npc: npc,
          setScore: -50,
          clearAllStatuses: true,
          setStatus: 'rival'
        });
      }
      // If new status is friend, and another NPC has Rival with this NPC
      else if (newStatus === 'friend' && npcRelationshipWithTarget === 'rival') {
        reactions.push({
          npc: npc,
          setScore: -50,
          clearAllStatuses: true,
          setStatus: 'rival'
        });
      }
      // If new status is friend, and another NPC has Friend with this NPC
      else if (newStatus === 'friend' && npcRelationshipWithTarget === 'friend') {
        reactions.push({
          npc: npc,
          scoreChange: 10
        });
      }
      // If new status is rival, and another NPC has Rival with this NPC
      else if (newStatus === 'rival' && npcRelationshipWithTarget === 'rival') {
        reactions.push({
          npc: npc,
          scoreChange: 50
        });
      }
    }
  });
  
  return reactions;
};

/**
 * Check if an interaction should be blocked based on other relationships
 * Returns { allowed: boolean, reason?: string }
 */
export const checkOtherRelationships = (currentPlayer, targetNPC, interaction) => {
  // Check if this interaction would add a relationship status
  if (!interaction.relbitadd) {
    return { allowed: true };
  }
  
  // Check for married status - can only be married to one NPC
  if (interaction.relbitadd === 'married') {
    const existingMarriage = currentPlayer.relationships?.find(rel => 
      rel.married === true && rel.name !== targetNPC
    );
    if (existingMarriage) {
      return { 
        allowed: false, 
        reason: `You are already married to ${existingMarriage.name}` 
      };
    }
  }
  
  // Check for friend status with rivals
  if (interaction.relbitadd === 'friend') {
    // Get all NPCs that are rivals of the target
    const targetRivals = [];
    Object.entries(RelationshipMatrix).forEach(([npc, relationships]) => {
      if (relationships[targetNPC] === 'rival') {
        targetRivals.push(npc);
      }
    });
    
    // Check if player is friends with any of target's rivals
    for (const rival of targetRivals) {
      const playerRelWithRival = currentPlayer.relationships?.find(rel => rel.name === rival);
      if (playerRelWithRival?.friend === true) {
        return { 
          allowed: false, 
          reason: `${targetNPC} won't be friends with you because you're friends with ${rival}` 
        };
      }
    }
  }
  
  // Check for love/crush status with NPCs who are already in love
  if (interaction.relbitadd === 'love' || interaction.relbitadd === 'crush') {
    // Check if target NPC already loves someone else
    const targetRelationships = RelationshipMatrix[targetNPC];
    if (targetRelationships) {
      const targetLoves = Object.entries(targetRelationships).find(([npc, status]) => 
        status === 'love'
      );
      if (targetLoves) {
        return { 
          allowed: false, 
          reason: `${targetNPC} is already in love with ${targetLoves[0]}` 
        };
      }
    }
  }
  
  return { allowed: true };
};

/**
 * Generate a status message for relationship changes
 * @param {string} targetName - The NPC the player interacted with
 * @param {string} newStatus - The new relationship status (if any)
 * @param {boolean} success - Whether the interaction was successful
 * @param {Array} reactions - Array of NPC reactions from getNPCReactions
 * @returns {string} The status message to display
 */
export const generateRelationshipStatusMessage = (targetName, newStatus, success, reactions = []) => {
  let message = '';
  
  if (success && newStatus) {
    // Generate primary status message based on the new status
    switch (newStatus) {
      case 'met':
        message = `You've met ${targetName}.`;
        break;
      case 'friend':
        message = `You're now friends with ${targetName}.`;
        break;
      case 'crush':
        message = `You have a crush on ${targetName}.`;
        break;
      case 'love':
        message = `You're in love with ${targetName}.`;
        break;
      case 'married':
        message = `You and ${targetName} are now married.`;
        break;
      case 'rival':
        message = `You and ${targetName} are now rivals.`;
        break;
      default:
        message = `Your relationship with ${targetName} has changed.`;
    }
    
    // Add reaction messages if there are any
    if (reactions && reactions.length > 0) {
      const negativeReactions = reactions.filter(r => r.setStatus === 'rival' || r.scoreChange < 0);
      const positiveReactions = reactions.filter(r => r.scoreChange > 0 && r.setStatus !== 'rival');
      
      if (negativeReactions.length > 0) {
        if (negativeReactions.length === 1) {
          const reaction = negativeReactions[0];
          if (reaction.setStatus === 'rival') {
            message += ` ${reaction.npc} is now your rival because of this.`;
          } else {
            message += ` ${reaction.npc} isn't going to be very happy about this...`;
          }
        } else {
          const npcNames = negativeReactions.map(r => r.npc).join(' and ');
          message += ` ${npcNames} aren't going to be very happy about this...`;
        }
      }
      
      if (positiveReactions.length > 0) {
        if (positiveReactions.length === 1) {
          const reaction = positiveReactions[0];
          message += ` ${reaction.npc} approves of this.`;
        } else {
          const npcNames = positiveReactions.map(r => r.npc).join(' and ');
          message += ` ${npcNames} approve of this.`;
        }
      }
    }
  }
  
  return message;
};
