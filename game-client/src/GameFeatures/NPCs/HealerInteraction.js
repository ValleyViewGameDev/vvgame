import React, { useEffect, useRef } from 'react';
import ConversationManager from '../Relationships/ConversationManager';
import playersInGridManager from '../../GridState/PlayersInGrid';

const HealerInteraction = ({
  isHealing,
  currentPlayer,
  TILE_SIZE,
  healAmount,
  onHealingComplete
}) => {
  const animationTimeoutRef = useRef(null);
  const conversationTimeoutRef = useRef(null);

  useEffect(() => {
    // Get player position for speech bubble
    const gridId = currentPlayer?.location?.g;
    const playerId = currentPlayer._id?.toString();
    const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
    const speakerId = playerId || `player_${Math.floor(playerInGridState?.position?.x || 0)}_${Math.floor(playerInGridState?.position?.y || 0)}`;
    
    if (isHealing && currentPlayer && playerInGridState?.position) {
      console.log('🙏 Starting heal animation');
      // Show prayer bubble over player
      ConversationManager.addSpeech(speakerId, '🙏', '🙏', false);
      
      // Removed player bounce animation
      
      // Remove speech bubble after animation
      conversationTimeoutRef.current = setTimeout(() => {
        console.log('🙏 Removing speech bubble after timeout');
        ConversationManager.removeSpeech(speakerId);
      }, 1500);
    }
    
    // Cleanup function - runs when isHealing changes or component unmounts
    return () => {
      console.log('🙏 Cleanup - isHealing changed to:', isHealing);
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
      }
      
      // Ensure speech bubble is removed
      ConversationManager.removeSpeech(speakerId);
      
      // Removed animation cleanup - no longer animating
    };
  }, [isHealing, currentPlayer, TILE_SIZE]);
  
  // Removed animatePlayer function - no longer bouncing
  
  // This component doesn't render anything visible - it just manages the animation
  return null;
};

export default HealerInteraction;