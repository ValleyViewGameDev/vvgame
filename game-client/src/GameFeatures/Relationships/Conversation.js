import React, { useState, useEffect } from 'react';
import './Conversation.css';
import ConversationManager from './ConversationManager';

// Component to display speech bubble with emoji
const SpeechBubble = ({ position, emoji, topic, isVisible }) => {
  if (!isVisible || !position) return null;
  
  return (
    <div 
      className="speech-bubble"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
    >
      <div className="speech-emoji">{topic || emoji}</div>
    </div>
  );
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
  currentPlayer = null
) => {
  console.log('🗨️ playConversation started:', { playerPosition, npcPosition, playerEmoji, npcEmoji, playerId, npcId, interaction });
  
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
  
  // Helper function to calculate screen position with current tile size
  const getScreenPosition = (gridPosition) => {
    const currentTileSize = getCurrentTileSize();
    return {
      x: gridPosition.x * currentTileSize + currentTileSize / 2, // Center horizontally
      y: gridPosition.y * currentTileSize - currentTileSize * 1.2 // Higher above the character
    };
  };
  
  // Create context for topic resolution
  const topicContext = {
    playerIcon: currentPlayer?.icon || playerEmoji,
    npcIcon: npcEmoji,
    currentPlayer: currentPlayer,
    interaction: interaction
  };
  
  // Play conversation sequence
  for (let i = 0; i < numExchanges; i++) {
    const roundNum = i + 1;
    
    // Player speaks - use provided ID or position-based ID
    const playerSpeakerId = playerId || `player_${Math.floor(playerPosition.x)}_${Math.floor(playerPosition.y)}`;
    const playerTopicKey = interaction?.[`playertopic${roundNum}`];
    const playerTopic = playerTopicKey ? getTopicSymbol(playerTopicKey, topicContext) : '💭';
    
    await showSpeech('player', playerSpeakerId, playerEmoji, playerTopic);
    await animateCharacter('player', playerPosition, getCurrentTileSize());
    await delay(1500);
    await hideSpeech(playerSpeakerId);
    
    await delay(500); // Brief pause between speakers
    
    // NPC responds - use provided ID or position-based ID
    const npcSpeakerId = npcId || `npc_${Math.floor(npcPosition.x)}_${Math.floor(npcPosition.y)}`;
    const npcTopicKey = interaction?.[`npctopic${roundNum}`];
    const npcTopic = npcTopicKey ? getTopicSymbol(npcTopicKey, topicContext) : '💭';
    
    await showSpeech('npc', npcSpeakerId, npcEmoji, npcTopic);
    await animateCharacter('npc', npcPosition, getCurrentTileSize());
    await delay(1500);
    await hideSpeech(npcSpeakerId);
    
    await delay(500); // Brief pause before next exchange
  }
  
  // Conversation complete - trigger callback
  if (onComplete) {
    onComplete();
  }
};

// Show speech bubble for a character
const showSpeech = async (speakerType, speakerId, emoji, topic) => {
  console.log('🗨️ showSpeech called:', { speakerType, speakerId, emoji, topic });
  ConversationManager.addSpeech(speakerId, emoji, topic || emoji);
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
    // Find player element
    const playerElements = document.querySelectorAll('.pc');
    characterElement = Array.from(playerElements).find(el => {
      const transform = el.style.transform;
      if (transform) {
        const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
        if (match) {
          const x = parseFloat(match[1]);
          const y = parseFloat(match[2]);
          // Check if position matches (with some tolerance)
          const expectedX = position.x * TILE_SIZE;
          const expectedY = position.y * TILE_SIZE;
          return Math.abs(x - expectedX) < TILE_SIZE/2 && Math.abs(y - expectedY) < TILE_SIZE/2;
        }
      }
      return false;
    });
  } else {
    // Find NPC element
    const npcElements = document.querySelectorAll('.npc');
    characterElement = Array.from(npcElements).find(el => {
      const transform = el.style.transform;
      if (transform) {
        const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
        if (match) {
          const x = parseFloat(match[1]);
          const y = parseFloat(match[2]);
          // Check if position matches (with some tolerance)
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

// Get topic emoji based on interaction type and relationship status
export const getConversationTopic = (interaction, relationship) => {
  // TODO: Implement topic selection algorithm
  // For now, return a default topic
  return '💭';
};

// Convert topic key to actual symbol/emoji
export const getTopicSymbol = (topicKey, context = {}) => {
  if (!topicKey) return '💭'; // Default fallback
  
  // Handle emoji shortcuts
  if (topicKey.startsWith('emoji_')) {
    const emojiMap = {
      'emoji_heart': '❤️',
      'emoji_laughing': '😂',
      'emoji_hug': '🤗',
      'emoji_wink': '😉',
      'emoji_kiss': '😘',
      'emoji_angry': '😠',
      'emoji_sad': '😢',
      'emoji_happy': '😊',
      'emoji_thinking': '🤔',
      'emoji_surprised': '😮',
      'emoji_love': '🥰',
      'emoji_cool': '😎',
      'emoji_party': '🥳',
      'emoji_sleepy': '😴',
      'emoji_hungry': '🤤'
    };
    return emojiMap[topicKey] || '💭';
  }
  
  // Handle special context-based topics
  switch (topicKey) {
    case 'player':
      return context.playerIcon || '😊';
      
    case 'npc':
      return context.npcIcon || '🤔';
      
    case 'interest':
      // TODO: Add logic for showing player's current interest
      return '💡';
      
    case 'relationship':
      // TODO: Add logic based on relationship status
      return '💕';
      
    case 'random':
      // TODO: Add random topic selection
      const randomTopics = ['🎵', '🌟', '🎨', '📚', '🎮', '🌺', '🍕', '⚡'];
      return randomTopics[Math.floor(Math.random() * randomTopics.length)];
      
    case 'quest':
      return '❗';
      
    case 'trade':
      return '💰';
      
    case 'skill':
      return '⚔️';
      
    case 'location':
      return '🗺️';
      
    case 'weather':
      return '☀️';
      
    case 'time':
      return '🕐';
      
    default:
      // If it's not a recognized key, just return it as-is (might be an emoji already)
      return topicKey;
  }
};

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