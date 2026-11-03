import React, { useState, useEffect } from 'react';
import './Conversation.css';
import ConversationManager from './ConversationManager';
import RelationshipMatrix from './RelationshipMatrix.json';
import Topics from './Topics.json';
import { lastDoober, lastNpcInteraction } from './conversationMemory';

// A conversation's three rounds (owner 2026-11-02; Talk in interactions.json, and every
// interaction that uses these topic keys):
//   1 'interest'     a resource. Player: the last doober collected (conversationMemory.js).
//                    NPC: its FIRST Interest, every time (the panel lists it first).
//   2 'people'       an NPC. Player: the last NPC they used a relationship button on, not counting
//                    this one. NPC: one of its relations at random (RelationshipMatrix friend /
//                    love / rival), else any character at random.
//   3 'anyinterest'  a resource again. Player: any doober at random. NPC: one of its own
//                    Interests at random.
// So a player who reads an NPC's panel can collect its first Interest and open with it, and bring
// up someone it likes. A resource round where the two match earns a little extra
// (INTEREST_MATCH_BONUS) on top of any match bonus.
export const INTEREST_MATCH_BONUS = 0.05;
const INTEREST_KEYS = ['interest', 'anyinterest'];

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
const symbolOf = (type, masterResources) => masterResources?.find((r) => r.type === type)?.symbol || null;
// an NPC's Interests as symbols, in the panel's order (NPCConnections.js lists the same, deduped)
const npcInterestSymbols = (npcId, masterResources) => {
  const entry = RelationshipMatrix.find((e) => e.type === npcId);
  if (!entry || !masterResources) return [];
  const types = [];
  for (let i = 1; entry[`interest${i}`]; i++) types.push(entry[`interest${i}`]);
  return [...new Set(types)].map((type) => symbolOf(type, masterResources)).filter(Boolean);
};
// the characters an NPC has feelings about (RelationshipMatrix: another NPC's name keyed to a status)
const npcRelationSymbols = (npcId) => {
  const entry = RelationshipMatrix.find((e) => e.type === npcId);
  if (!entry) return [];
  return RelationshipMatrix
    .filter((other) => other.type !== npcId && ['friend', 'love', 'rival', 'married'].includes(entry[other.type]))
    .map((other) => other.symbol).filter(Boolean);
};

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

  // 2b. A little extra for each Interest the player matched with the NPC's (any interaction)
  if (conversationResults.matchingInterests > 0) {
    modifiedChance += INTEREST_MATCH_BONUS * conversationResults.matchingInterests;
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
    npcId: npcId,
    playerId: currentPlayer?.playerId,
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
    await delay(1200);
    await hideSpeech(playerSpeakerId);

    await delay(400); // Brief pause between speakers

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
      if (INTEREST_KEYS.includes(playerTopicKey) && INTEREST_KEYS.includes(npcTopicKey)) conversationResults.matchingInterests++;
    } else if (matchState === 'rival') {
      conversationResults.rivalTopics++;
    }

    await showSpeech('npc', npcSpeakerId, npcEmoji, npcTopic, matchState);
    // Removed character animation
    await delay(1200);
    await hideSpeech(npcSpeakerId);

    await delay(400); // Brief pause before next exchange
  }
  
  // Conversation complete - trigger callback with results
  if (onComplete) {
    onComplete(conversationResults);
  }
};


/**
 * A conversation between two CITIZENS (docs/citizens.md §2.2): the same bubbles, the same
 * topic resolution and the same comparison as the player's Talk, except that both sides
 * resolve their topics as an NPC does (interests from the RelationshipMatrix) and the partner
 * reacts to what the initiator shows exactly as an NPC reacts to the player. Speakers are the
 * two NPC types (the renderer finds an NPC speaker by type). `control.aborted`, set by the
 * caller, ends it between beats with both bubbles removed.
 *
 * Resolves { aborted, results } where results counts the matching and rival topics.
 */
export const playNPCConversation = async ({
  initiatorType, partnerType, initiatorEmoji = '🙂', partnerEmoji = '🙂',
  interaction = null, masterResources = null, relscore = 0, control = {},
}) => {
  const results = { matchingInterests: 0, matchingRandom: 0, matchingTopics: 0, rivalTopics: 0, totalRounds: 0 };
  const rounds = interaction?.rounds || 3;
  const base = { masterResources, relscore, interaction };
  const clear = () => { ConversationManager.removeSpeech(initiatorType); ConversationManager.removeSpeech(partnerType); };
  const beat = async (ms) => { await delay(ms); return !control.aborted; };
  for (let i = 0; i < rounds; i++) {
    const roundNum = i + 1;
    results.totalRounds = roundNum;
    const aKey = interaction?.[`playertopic${roundNum}`] || 'random';
    const aTopic = getTopicSymbol(aKey, { ...base, npcId: initiatorType, npcIcon: initiatorEmoji, roundNum }, false);
    ConversationManager.addSpeech(initiatorType, initiatorEmoji, aTopic, false);
    if (!(await beat(1200))) { clear(); return { aborted: true, results }; }
    ConversationManager.removeSpeech(initiatorType);
    if (!(await beat(400))) { clear(); return { aborted: true, results }; }

    const bKey = interaction?.[`npctopic${roundNum}`] || 'random';
    const bTopic = getTopicSymbol(bKey, { ...base, npcId: partnerType, npcIcon: partnerEmoji, playerTopic: aTopic, roundNum }, false);
    const { matchState } = compareTopics(aTopic, bTopic, partnerType, interaction, roundNum);
    if (matchState === 'match') {
      results.matchingTopics++;
      if (INTEREST_KEYS.includes(aKey) && INTEREST_KEYS.includes(bKey)) results.matchingInterests++;
    } else if (matchState === 'rival') results.rivalTopics++;
    ConversationManager.addSpeech(partnerType, partnerEmoji, bTopic, matchState);
    if (!(await beat(1200))) { clear(); return { aborted: true, results }; }
    ConversationManager.removeSpeech(partnerType);
    if (!(await beat(400))) { clear(); return { aborted: true, results }; }
  }
  return { aborted: false, results };
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
      // Round 1. Player: the last doober they collected (else one of their most-held doobers)
      if (isPlayerTurn) {
        const last = symbolOf(lastDoober(context.playerId), context.masterResources);
        if (last) return last;
        if (context.currentPlayer && context.masterResources) {
          const backpack = context.currentPlayer.backpack || [];
          const itemSource = backpack.length > 0 ? backpack : (context.currentPlayer.inventory || []);
          const topItems = itemSource
            .filter((item) => context.masterResources.find((r) => r.type === item.type)?.category === 'doober')
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5)
            .map((item) => symbolOf(item.type, context.masterResources))
            .filter(Boolean);
          if (topItems.length > 0) return pickOne(topItems);
        }
      } else if (context.npcId) {
        // NPC: its first Interest, every time
        const first = npcInterestSymbols(context.npcId, context.masterResources)[0];
        if (first) return first;
      }
      return pickOne(Topics.fallbackInterests);

    case 'anyinterest':
      // Round 3. Player: any doober at all; NPC: one of its own Interests
      if (isPlayerTurn) {
        const all = (context.masterResources || [])
          .filter((r) => r.category === 'doober' && r.type !== 'Money' && r.symbol)
          .map((r) => r.symbol);
        if (all.length > 0) return pickOne(all);
      } else if (context.npcId) {
        const own = npcInterestSymbols(context.npcId, context.masterResources);
        if (own.length > 0) return pickOne(own);
      }
      return pickOne(Topics.fallbackInterests);

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
      // Random topic selection (secret topics once the relationship is close)
      if (context.relscore > 80) return pickOne(Topics.secretTopics);
      return pickOne(Topics.randomTopics);

    case 'people':
      // Round 2: a character
      if (isPlayerTurn) {
        // PLAYER: the last NPC they used a relationship button on, not counting this one
        const lastNpc = lastNpcInteraction(context.playerId, context.npcId);
        const lastSymbol = lastNpc && RelationshipMatrix.find((entry) => entry.type === lastNpc)?.symbol;
        if (lastSymbol) return lastSymbol;
        // none yet: their best relationship (married first, else the highest score), among the NPCs
        // in the relationship system (Kent, the order board, is not: owner 2026-11-02)
        const relationships = (context.currentPlayer?.relationships || [])
          .filter((rel) => rel.name !== context.npcId && RelationshipMatrix.some((entry) => entry.type === rel.name));
        if (relationships.length > 0) {
          const married = relationships.filter((rel) => rel.married === true);
          const maxScore = Math.max(...relationships.map((rel) => rel.relscore || 0));
          const chosen = pickOne(married.length > 0 ? married : relationships.filter((rel) => (rel.relscore || 0) === maxScore));
          const symbol = RelationshipMatrix.find((entry) => entry.type === chosen.name)?.symbol;
          if (symbol) return symbol;
        }
        return '👫';
      }
      // NPC: one of its relations at random; with none, any character at random
      {
        const relations = context.npcId ? npcRelationSymbols(context.npcId) : [];
        if (relations.length > 0) return pickOne(relations);
        const characters = RelationshipMatrix.filter((entry) => entry.type !== context.npcId && entry.symbol).map((entry) => entry.symbol);
        return characters.length > 0 ? pickOne(characters) : '👤';
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