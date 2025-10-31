import React, { useState, useEffect } from 'react';
import './Conversation.css';
import ConversationManager from './ConversationManager';
import RelationshipMatrix from './RelationshipMatrix.json';

// Track conversation results for chance modification
let conversationResults = {
  matchingInterests: 0,
  matchingRandom: 0,
  totalRounds: 0
};

// Calculate modified chance based on conversation results
export const calculateModifiedChance = (baseChance, interaction, conversationResults, currentPlayer, targetName) => {
  let modifiedChance = baseChance || 1.0;
  
  // 1. Add bonus for matching interests during conversation
  if (interaction.interaction === 'Talk' && conversationResults.matchingInterests > 0) {
    // Add 0.5 for each matching interest
    modifiedChance += (0.5 * conversationResults.matchingInterests);
  }
  
  // 1b. Add bonus for matching random topics during conversation
  if (interaction.interaction === 'Talk' && conversationResults.matchingRandom > 0) {
    // Add 0.5 for each matching random topic
    modifiedChance += (0.5 * conversationResults.matchingRandom);
  }
  
  // 2. Add bonus for relationship status buffs
  if (currentPlayer && currentPlayer.relationships) {
    const relationship = currentPlayer.relationships.find(rel => rel.name === targetName);
    if (relationship && relationship.relstatus) {
      // Check relbuff1, relbuff2, relbuff3
      for (let i = 1; i <= 3; i++) {
        const buffField = interaction[`relbuff${i}`];
        if (buffField && relationship.relstatus.includes(buffField)) {
          // Add the buff amount (default 0.2 if not specified)
          const buffAmount = interaction[`relbuffamount${i}`] || 0.2;
          modifiedChance += buffAmount;
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
  console.log('🗨️ playConversation started:', { playerPosition, npcPosition, playerEmoji, npcEmoji, playerId, npcId, interaction });
  
  // Reset conversation results
  conversationResults = {
    matchingInterests: 0,
    matchingRandom: 0,
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
    await animateCharacter('player', playerPosition, getCurrentTileSize());
    await delay(1500);
    await hideSpeech(playerSpeakerId);
    
    await delay(500); // Brief pause between speakers
    
    // NPC responds - use provided ID or position-based ID
    const npcSpeakerId = npcId || `npc_${Math.floor(npcPosition.x)}_${Math.floor(npcPosition.y)}`;
    const npcTopicKey = interaction?.[`npctopic${roundNum}`];
    const npcTopic = npcTopicKey ? getTopicSymbol(npcTopicKey, topicContext, false) : '💭';
    
    // Check if topics match for bonus
    let isMatch = false;
    
    // Check if both topics are interests and if they match
    if (playerTopicKey === 'interest' && npcTopicKey === 'interest' && playerTopic === npcTopic) {
      conversationResults.matchingInterests++;
      isMatch = true;
      console.log('🎯 Matching interests!', playerTopic, npcTopic, 'Total matches:', conversationResults.matchingInterests);
    }
    
    // Check if both topics are random and if they match
    if (playerTopicKey === 'random' && npcTopicKey === 'random' && playerTopic === npcTopic) {
      conversationResults.matchingRandom++;
      isMatch = true;
      console.log('🎯 Matching random topics!', playerTopic, npcTopic, 'Total matches:', conversationResults.matchingRandom);
    }
    
    await showSpeech('npc', npcSpeakerId, npcEmoji, npcTopic, isMatch);
    await animateCharacter('npc', npcPosition, getCurrentTileSize());
    await delay(1500);
    await hideSpeech(npcSpeakerId);
    
    await delay(500); // Brief pause before next exchange
  }
  
  // Conversation complete - trigger callback with results
  if (onComplete) {
    onComplete(conversationResults);
  }
};


// Get topic emoji based on interaction type and relationship status
export const getConversationTopic = (interaction, relationship) => {
  // TODO: Implement topic selection algorithm
  // For now, return a default topic

  return '?';
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
      // Show player's top resources from inventory/backpack
      if (isPlayerTurn && context.currentPlayer && context.masterResources) {
        const inventory = context.currentPlayer.inventory || [];
        const backpack = context.currentPlayer.backpack || [];
        
        // Combine inventory and backpack items
        const allItems = [...inventory, ...backpack];
        
        // Sort by quantity and get top 3 (excluding Money)
        const topItems = allItems
          .filter(item => item.type !== 'Money' && item.type !== 'Gem')
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5)
          .map(item => {
            const resource = context.masterResources.find(r => r.type === item.type);
            return resource?.symbol || item.type;
          })
          .filter(symbol => symbol); // Remove any undefined
        
        // Return random item from top 3, or fallback
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
      const interests = ['🎨', '📚', '🛶', '🔬', '🪉', '⛺', '💰'];
      return interests[Math.floor(Math.random() * interests.length)];

    case 'relationship':
      // TODO: Add logic based on relationship status
      return '👫';
      
    case 'random':
      // TODO: Add random topic selection
      if (context.relscore > 80) {
        // If relscore is high, use secret topics
        const secretTopics = ['🧝‍♀️', '🐲', '🧌', '💍', '👻', '🔱', '🎪', '🦄', '🔑', '🖼️'];
        return secretTopics[Math.floor(Math.random() * secretTopics.length)];
      } else {
        const randomTopics = ['🚂', '🚜', '👩‍🌾', '🐺', '🐻'];
        return randomTopics[Math.floor(Math.random() * randomTopics.length)];
      };

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
const showSpeech = async (speakerType, speakerId, emoji, topic, isMatch = false) => {
  console.log('🗨️ showSpeech called:', { speakerType, speakerId, emoji, topic, isMatch });
  ConversationManager.addSpeech(speakerId, emoji, topic || emoji, isMatch);
};

// Hide speech bubble for a character
const hideSpeech = async (speakerId) => {
  ConversationManager.removeSpeech(speakerId);
};

// Animate character bouncing
const animateCharacter = async (characterType, position, TILE_SIZE) => {
  // Find the character element based on type and position
  let characterElement;
  
  if (characterType === 'player') {
    // Find player element - new React components use left/top positioning
    const playerElements = document.querySelectorAll('.pc');
    characterElement = Array.from(playerElements).find(el => {
      // Check both transform (old) and left/top (new) positioning
      const transform = el.style.transform;
      const left = parseFloat(el.style.left);
      const top = parseFloat(el.style.top);
      
      if (!isNaN(left) && !isNaN(top)) {
        // New positioning system
        const expectedX = position.x * TILE_SIZE;
        const expectedY = position.y * TILE_SIZE;
        return Math.abs(left - expectedX) < TILE_SIZE/2 && Math.abs(top - expectedY) < TILE_SIZE/2;
      } else if (transform) {
        // Old positioning system fallback
        const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
        if (match) {
          const x = parseFloat(match[1]);
          const y = parseFloat(match[2]);
          const expectedX = position.x * TILE_SIZE;
          const expectedY = position.y * TILE_SIZE;
          return Math.abs(x - expectedX) < TILE_SIZE/2 && Math.abs(y - expectedY) < TILE_SIZE/2;
        }
      }
      return false;
    });
  } else {
    // Find NPC element - new React components use left/top positioning
    const npcElements = document.querySelectorAll('.npc');
    characterElement = Array.from(npcElements).find(el => {
      // Check both transform (old) and left/top (new) positioning
      const transform = el.style.transform;
      const left = parseFloat(el.style.left);
      const top = parseFloat(el.style.top);
      
      if (!isNaN(left) && !isNaN(top)) {
        // New positioning system
        const expectedX = position.x * TILE_SIZE;
        const expectedY = position.y * TILE_SIZE;
        return Math.abs(left - expectedX) < TILE_SIZE/2 && Math.abs(top - expectedY) < TILE_SIZE/2;
      } else if (transform) {
        // Old positioning system fallback
        const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
        if (match) {
          const x = parseFloat(match[1]);
          const y = parseFloat(match[2]);
          const expectedX = position.x * TILE_SIZE;
          const expectedY = position.y * TILE_SIZE;
          return Math.abs(x - expectedX) < TILE_SIZE/2 && Math.abs(y - expectedY) < TILE_SIZE/2;
        }
      }
      return false;
    });
  }
  
  if (characterElement) {
    // Simply add the animation class
    characterElement.classList.add('speaking-animation');
    
    // Remove animation class after duration
    setTimeout(() => {
      characterElement.classList.remove('speaking-animation');
    }, 1500);
  }
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