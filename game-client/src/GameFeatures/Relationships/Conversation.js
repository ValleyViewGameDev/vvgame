import React, { useState, useEffect } from 'react';
import './Conversation.css';
import ConversationManager from './ConversationManager';
import RelationshipMatrix from './RelationshipMatrix.json';
import Topics from './Topics.json';

// Track conversation results for chance modification
let conversationResults = {
  matchingInterests: 0,
  matchingRandom: 0,
  matchingTopics: 0,
  rivalTopics: 0,
  totalRounds: 0
};

// Helper function to check NPC relationship between two NPCs
// Returns 'rival', 'friend', 'love', or null
const checkNPCRelationship = (currentNpcType, targetNpcType) => {
  if (!currentNpcType || !targetNpcType) return null;

  const npcEntry = RelationshipMatrix.find(entry => entry.type === currentNpcType);
  if (!npcEntry) return null;

  // Check if the target NPC is defined as a relationship in the current NPC's entry
  const relationship = npcEntry[targetNpcType];
  if (relationship === 'rival' || relationship === 'friend' || relationship === 'love') {
    return relationship;
  }

  return null;
};

// Helper function to find NPC type from symbol
const findNPCTypeFromSymbol = (symbol) => {
  if (!symbol) return null;
  const entry = RelationshipMatrix.find(entry => entry.symbol === symbol);
  return entry?.type || null;
};

/**
 * Centralized topic comparison function
 * Determines match state and chance modifier based on player and NPC topics
 * Can have custom rules per interaction type and round number
 *
 * @param {string} playerTopic - The symbol shown by the player
 * @param {string} npcTopic - The symbol shown by the NPC
 * @param {string} npcId - The NPC being talked to
 * @param {object} interaction - The interaction definition (Talk, Joke, etc.)
 * @param {number} roundNum - Which round of conversation (1, 2, 3)
 * @returns {{ matchState: false|'match'|'rival', chanceModifier: number }}
 */
const compareTopics = (playerTopic, npcTopic, npcId, interaction, roundNum) => {
  let matchState = false;
  let chanceModifier = 0;

  // Check if player showed an NPC character
  const playerNpcType = findNPCTypeFromSymbol(playerTopic);

  // For interactions involving NPC symbols (like Talk round 3), use relationship-based matching
  if (playerNpcType) {
    // Player showed an NPC - check NPC's relationship to that character
    const relationship = checkNPCRelationship(npcId, playerNpcType);

    if (relationship === 'rival') {
      // NPC considers player's shown character a rival - always negative
      matchState = 'rival';
      chanceModifier = -0.15;
    } else if (relationship === 'friend' || relationship === 'love') {
      // NPC likes player's shown character - always positive
      matchState = 'match';
      chanceModifier = 0.1;
    } else if (playerTopic === npcTopic) {
      // Neutral relationship but exact match (coincidental) - positive
      matchState = 'match';
      chanceModifier = 0.1;
    }
    // If neutral and no match, matchState stays false (neutral)
  } else {
    // Player showed a non-NPC symbol (resource, emoji, etc.)
    if (playerTopic === npcTopic) {
      // Exact match on non-NPC symbols
      matchState = 'match';
      chanceModifier = 0.1;
    }
    // No match = neutral
  }

  // Future: Add custom rules per interaction type
  // if (interaction?.interaction === 'Joke') { ... }
  // if (interaction?.interaction === 'Compliment') { ... }

  return { matchState, chanceModifier };
};

// Calculate modified chance based on conversation results
export const calculateModifiedChance = (baseChance, interaction, conversationResults, currentPlayer, targetName) => {
  let modifiedChance = baseChance || 1.0;

  // 1. Add bonus for matching topics during conversation (any topic type)
  if (interaction.interaction === 'Talk' && conversationResults.matchingTopics > 0) {
    // Add 0.1 for each matching topic (compounding effect for all 3 rounds)
    modifiedChance += (0.1 * conversationResults.matchingTopics);
  }

  // 2. Subtract penalty for rival topics during conversation
  if (interaction.interaction === 'Talk' && conversationResults.rivalTopics > 0) {
    // Subtract 0.15 for each rival topic (significant penalty)
    modifiedChance -= (0.15 * conversationResults.rivalTopics);
  }

  // 3. Add bonus for relationship status buffs
  // Note: Statuses are stored as boolean properties on relationship (e.g., rel.friend = true)
  if (currentPlayer && currentPlayer.relationships) {
    const relationship = currentPlayer.relationships.find(rel => rel.name === targetName);
    if (relationship) {
      // Check relbuff1, relbuff2, relbuff3
      for (let i = 1; i <= 3; i++) {
        const buffField = interaction[`relbuff${i}`];
        if (buffField && relationship[buffField] === true) {
          // Add the buff amount (default 0.2 if not specified)
          modifiedChance += (interaction.relbuff || 0.2);
          break; // Only apply buff once
        }
      }
    }
  }
  
  // Cap at 1.0 (100% chance)
  return Math.min(modifiedChance, 1.0);
};

// Main conversation sequence handler
export const playConversation = async (
  playerPosition,
  npcPosition,
  playerEmoji = '😊',
  npcEmoji = '🤔',
  TILE_SIZE,
  onComplete,
  playerId = null,
  npcId = null,
  interaction = null,
  currentPlayer = null,
  masterResources = null
) => {
  
  // Reset conversation results
  conversationResults = {
    matchingInterests: 0,
    matchingRandom: 0,
    matchingTopics: 0,
    rivalTopics: 0,
    totalRounds: 0
  };
  
  // Use rounds from interaction if available, otherwise random 1-3
  const numExchanges = interaction?.rounds || (Math.floor(Math.random() * 3) + 1);
  
  // Helper function to get current TILE_SIZE dynamically
  const getCurrentTileSize = () => {
    // Try to get the actual tile size from the DOM element
    const gameContainer = document.querySelector('.homestead');
    if (gameContainer) {
      const gridElement = gameContainer.querySelector('.grid');
      if (gridElement) {
        const firstTile = gridElement.querySelector('.tile');
        if (firstTile) {
          return firstTile.offsetWidth;
        }
      }
    }
    return TILE_SIZE; // Fallback to passed TILE_SIZE
  };

  
  // Create context for topic resolution
  const topicContext = {
    playerIcon: currentPlayer?.icon || playerEmoji,
    npcIcon: npcEmoji,
    currentPlayer: currentPlayer,
    interaction: interaction,
    masterResources: masterResources,
    npcId: npcId
  };
  
  // Add relationship score if it exists
  if (currentPlayer?.relationships && npcId) {
    const relationship = currentPlayer.relationships.find(rel => rel.name === npcId);
    if (relationship) {
      topicContext.relscore = relationship.relscore;
    }
  }
  
  // Play conversation sequence
  for (let i = 0; i < numExchanges; i++) {
    const roundNum = i + 1;
    conversationResults.totalRounds = roundNum;
    
    // Player speaks - use provided ID or position-based ID
    const playerSpeakerId = playerId || `player_${Math.floor(playerPosition.x)}_${Math.floor(playerPosition.y)}`;
    const playerTopicKey = interaction?.[`playertopic${roundNum}`];
    const playerTopic = playerTopicKey ? getTopicSymbol(playerTopicKey, topicContext, true) : '💭';
    
    await showSpeech('player', playerSpeakerId, playerEmoji, playerTopic);
    // Removed character animation
    await delay(1500);
    await hideSpeech(playerSpeakerId);
    
    await delay(500); // Brief pause between speakers

    // NPC responds - use provided ID or position-based ID
    const npcSpeakerId = npcId || `npc_${Math.floor(npcPosition.x)}_${Math.floor(npcPosition.y)}`;
    const npcTopicKey = interaction?.[`npctopic${roundNum}`];

    // Pass player's topic to context so NPC can react dynamically
    topicContext.playerTopic = playerTopic;
    topicContext.roundNum = roundNum;

    const npcTopic = npcTopicKey ? getTopicSymbol(npcTopicKey, topicContext, false) : '💭';

    // Use centralized comparison function to determine match state
    const { matchState, chanceModifier } = compareTopics(
      playerTopic,
      npcTopic,
      npcId,
      interaction,
      roundNum
    );

    // Track results for chance calculation
    if (matchState === 'match') {
      conversationResults.matchingTopics++;
    } else if (matchState === 'rival') {
      conversationResults.rivalTopics++;
    }

    await showSpeech('npc', npcSpeakerId, npcEmoji, npcTopic, matchState);
    // Removed character animation
    await delay(1500);
    await hideSpeech(npcSpeakerId);
    
    await delay(500); // Brief pause before next exchange
  }
  
  // Conversation complete - trigger callback with results
  if (onComplete) {
    onComplete(conversationResults);
  }
};


// Convert topic key to actual symbol/emoji
export const getTopicSymbol = (topicKey, context = {}, isPlayerTurn = false) => {
  if (!topicKey) return '❓'; // Default fallback
  
  // Handle emoji shortcuts
  if (topicKey.startsWith('emoji_')) {
    const emojiMap = {
      'emoji_heart': '❤️',
      'emoji_pinkheart': '💖',
      'emoji_friend': '👫',
      'emoji_diamond': '💍',
      'emoji_forgive': '🙏',
      'emoji_questionmark': '❓',
      'emoji_annoyed': '😠',
      'emoji_laughing': '😂',
      'emoji_blush': '😊',
      'emoji_hug': '🤗',
      'emoji_wink': '😉',
      'emoji_kiss': '😘',
      'emoji_angry': '😡',
      'emoji_sad': '😢',
      'emoji_happy': '😊',
      'emoji_thinking': '🤔',
      'emoji_wow': '😮',
      'emoji_love': '🥰',
      'emoji_cool': '😎',
      'emoji_party': '🥳',
      'emoji_sleepy': '😴',
      'emoji_hungry': '😋',
      'emoji_brokenheart': '💔'
    };
    return emojiMap[topicKey] || '❓';
  }
  
  // Handle special context-based topics
  switch (topicKey) {
    case 'player':
      return context.playerIcon || '😊';
      
    case 'npc':
      return context.npcIcon || '🤔';
      
    case 'interest':
      // Show player's top resources from backpack (priority) or inventory (fallback)
      if (isPlayerTurn && context.currentPlayer && context.masterResources) {
        const inventory = context.currentPlayer.inventory || [];
        const backpack = context.currentPlayer.backpack || [];

        // Use backpack if it has items, otherwise fall back to inventory
        const itemSource = backpack.length > 0 ? backpack : inventory;

        // Sort by quantity and get top 5, only from doober category resources
        const topItems = itemSource
          .filter(item => {
            const resource = context.masterResources.find(r => r.type === item.type);
            return resource && resource.category === 'doober';
          })
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5)
          .map(item => {
            const resource = context.masterResources.find(r => r.type === item.type);
            return resource?.symbol || item.type;
          })
          .filter(symbol => symbol); // Remove any undefined

        // Return random item from top 5, or fallback
        if (topItems.length > 0) {
          return topItems[Math.floor(Math.random() * topItems.length)];
        }
      }
      
      // For NPC turn, check RelationshipMatrix for interests
      if (!isPlayerTurn && context.npcId && context.masterResources) {
        const npcEntry = RelationshipMatrix.find(entry => entry.type === context.npcId);
        if (npcEntry) {
          // Collect all defined interests (interest1, interest2, interest3, etc.)
          const npcInterests = [];
          let i = 1;
          while (npcEntry[`interest${i}`]) {
            // Look up the interest in masterResources to get its symbol
            const interest = npcEntry[`interest${i}`];
            const resource = context.masterResources.find(r => r.type === interest);
            if (resource && resource.symbol) {
              npcInterests.push(resource.symbol);
            }
            i++;
          }
          
          // If NPC has interests defined, return one randomly
          if (npcInterests.length > 0) {
            return npcInterests[Math.floor(Math.random() * npcInterests.length)];
          }
        }
      }
      
      // Fallback to default interests
      return Topics.fallbackInterests[Math.floor(Math.random() * Topics.fallbackInterests.length)];

    case 'npcinterest1':
      // NPC's first interest from RelationshipMatrix
      if (context.npcId && context.masterResources) {
        const npcEntry = RelationshipMatrix.find(entry => entry.type === context.npcId);
        if (npcEntry && npcEntry.interest1) {
          const resource = context.masterResources.find(r => r.type === npcEntry.interest1);
          if (resource && resource.symbol) {
            return resource.symbol;
          }
        }
      }
      return '❓';

    case 'npcinterest2':
      // NPC's second interest from RelationshipMatrix
      if (context.npcId && context.masterResources) {
        const npcEntry = RelationshipMatrix.find(entry => entry.type === context.npcId);
        if (npcEntry && npcEntry.interest2) {
          const resource = context.masterResources.find(r => r.type === npcEntry.interest2);
          if (resource && resource.symbol) {
            return resource.symbol;
          }
        }
      }
      return '❓';

    case 'relationship':
      // TODO: Add logic based on relationship status
      return '👫';
      
    case 'random':
      // Random topic selection - includes NPC's interest2 if available
      if (context.relscore > 80) {
        // If relscore is high, use secret topics
        return Topics.secretTopics[Math.floor(Math.random() * Topics.secretTopics.length)];
      } else {
        // Base random topics (copy array so we can modify it)
        const randomTopics = [...Topics.randomTopics];

        // For NPC turn, add their interest2 to the pool
        if (!isPlayerTurn && context.npcId && context.masterResources) {
          const npcEntry = RelationshipMatrix.find(entry => entry.type === context.npcId);
          if (npcEntry && npcEntry.interest2) {
            const resource = context.masterResources.find(r => r.type === npcEntry.interest2);
            if (resource && resource.symbol) {
              randomTopics.push(resource.symbol);
            }
          }
        }

        return randomTopics[Math.floor(Math.random() * randomTopics.length)];
      }

    case 'people':
      // Generic "people" topic - behavior differs for player vs NPC
      if (isPlayerTurn) {
        // PLAYER: Show their best relationship (married > highest relscore)
        if (context.currentPlayer && context.masterResources) {
          const relationships = context.currentPlayer.relationships || [];

          if (relationships.length > 0) {
            // First, check for any married relationships
            const marriedRels = relationships.filter(rel => rel.married === true);
            if (marriedRels.length > 0) {
              const chosen = marriedRels[Math.floor(Math.random() * marriedRels.length)];
              const npcEntry = RelationshipMatrix.find(entry => entry.type === chosen.name);
              return npcEntry?.symbol || '👫';
            }

            // No married, find highest relscore
            const maxScore = Math.max(...relationships.map(rel => rel.relscore || 0));
            const topRels = relationships.filter(rel => (rel.relscore || 0) === maxScore);
            const chosen = topRels[Math.floor(Math.random() * topRels.length)];
            const npcEntry = RelationshipMatrix.find(entry => entry.type === chosen.name);
            return npcEntry?.symbol || '👫';
          }

          // No relationships at all, fallback to Kent
          const kentEntry = RelationshipMatrix.find(entry => entry.type === 'Kent');
          return kentEntry?.symbol || '👨🏽';
        }
        return '👫';

      } else {
        // NPC: Be reactive to player's shown NPC, or pick interest3/random
        if (context.npcId && context.masterResources) {
          const npcEntry = RelationshipMatrix.find(entry => entry.type === context.npcId);

          // Check if player showed an NPC character
          const playerShownNpcType = context.playerTopic ? findNPCTypeFromSymbol(context.playerTopic) : null;

          if (playerShownNpcType) {
            // Player showed an NPC - check if we have a relationship with them
            const relationship = checkNPCRelationship(context.npcId, playerShownNpcType);

            if (relationship === 'rival' || relationship === 'friend' || relationship === 'love') {
              // NPC has strong feelings about player's shown character - ECHO it
              return context.playerTopic;
            }
          }

          // Player showed someone neutral (or not an NPC) - pick our own topic
          if (npcEntry) {
            // First try interest3
            if (npcEntry.interest3) {
              const resource = context.masterResources.find(r => r.type === npcEntry.interest3);
              if (resource && resource.symbol) {
                return resource.symbol;
              }
            }
          }

          // No interest3 defined - pick a random NPC character (trade or quest action)
          const npcCharacters = context.masterResources.filter(
            r => r.action === 'trade' || r.action === 'quest'
          );
          if (npcCharacters.length > 0) {
            const randomNpc = npcCharacters[Math.floor(Math.random() * npcCharacters.length)];
            return randomNpc.symbol || '👤';
          }
        }
        return '👤';
      }

    case 'quest':
      return '✅';
      
    case 'trade':
      return '💰';
      
    case 'skill':
      return '💪';
      
    case 'location':
      return '🗺️';
      
    case 'weather':
      const weatherTopics = ['☀️', '🌨️', '🌦️', '🌩️'];
      return weatherTopics[Math.floor(Math.random() * weatherTopics.length)];
      
    case 'time':
      return '🕐';
      
    default:
      // If it's not a recognized key, just return it as-is (might be an emoji already)
      return topicKey;
  }
};


// Show speech bubble for a character
// matchState can be: false, 'match', or 'rival'
const showSpeech = async (speakerType, speakerId, emoji, topic, matchState = false) => {
  ConversationManager.addSpeech(speakerId, emoji, topic || emoji, matchState);
};

// Hide speech bubble for a character
const hideSpeech = async (speakerId) => {
  ConversationManager.removeSpeech(speakerId);
};


// Utility delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Component for rendering conversation UI if needed
const ConversationUI = ({ isActive, playerData, npcData }) => {
  if (!isActive) return null;
  
  return (
    <div className="conversation-overlay">
      {/* This can be used for additional UI elements if needed */}
    </div>
  );
};

export default ConversationUI;