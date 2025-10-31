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
      
      // Animate player bouncing
      animatePlayer(playerInGridState.position, TILE_SIZE);
      
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
      
      // Ensure animation is removed
      const playerElements = document.querySelectorAll('.pc');
      playerElements.forEach(el => {
        el.classList.remove('speaking-animation');
      });
    };
  }, [isHealing, currentPlayer, TILE_SIZE]);
  
  // Animate player bouncing - similar to conversation
  const animatePlayer = (position, TILE_SIZE) => {
    // First remove any existing animation from all players
    const allPlayerElements = document.querySelectorAll('.pc');
    allPlayerElements.forEach(el => {
      el.classList.remove('speaking-animation');
    });
    
    // Find the specific player element
    const playerElement = Array.from(allPlayerElements).find(el => {
      const left = parseFloat(el.style.left);
      const top = parseFloat(el.style.top);
      
      if (!isNaN(left) && !isNaN(top)) {
        const expectedX = position.x * TILE_SIZE;
        const expectedY = position.y * TILE_SIZE;
        return Math.abs(left - expectedX) < TILE_SIZE/2 && Math.abs(top - expectedY) < TILE_SIZE/2;
      }
      return false;
    });
    
    if (playerElement) {
      // Add bounce animation class
      playerElement.classList.add('speaking-animation');
      
      // Remove animation after duration
      animationTimeoutRef.current = setTimeout(() => {
        playerElement.classList.remove('speaking-animation');
      }, 1500);
    }
  };
  
  // This component doesn't render anything visible - it just manages the animation
  return null;
};

export default HealerInteraction;