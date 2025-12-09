import React, { useRef, useEffect, useState, memo } from 'react';
import { getResourceOverlayStatus, OVERLAY_EMOJI_MAPPING } from '../Utils/ResourceOverlayUtils';
import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
import '../GameFeatures/Relationships/Conversation.css';
import './Tooltip.css';

/**
 * DOM-based dynamic elements renderer
 * Handles tooltips, overlays, badges, attack ranges, VFX, etc.
 */
export const RenderDynamicElementsDOM = ({
  resources,
  npcs,
  pcs,
  craftingStatus,
  tradingStatus,
  badgeState,
  electionPhase,
  currentPlayer,
  hoverTooltip,
  setHoverTooltip,
  TILE_SIZE,
  strings,
  generateResourceTooltip,
  generateNPCTooltip,
  generatePCTooltip
}) => {
  const hoverTimersRef = useRef({});
  const [conversationVersion, setConversationVersion] = useState(0);
  
  // Subscribe to conversation changes
  useEffect(() => {
    const unsubscribe = ConversationManager.subscribe(() => {
      console.log('🗨️ RenderDynamicElementsDOM: Conversation changed, triggering update');
      setConversationVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);
  
  // Clean up all tooltip timers when component unmounts
  useEffect(() => {
    return () => {
      Object.keys(hoverTimersRef.current).forEach(key => {
        clearInterval(hoverTimersRef.current[key]);
      });
      hoverTimersRef.current = {};
    };
  }, []);

  // Set up hover listeners for resource elements
  useEffect(() => {
    const handleResourceMouseEnter = (event) => {
      const resourceEl = event.target.closest('.resource-tile');
      if (!resourceEl) return;
      
      const resourceX = parseInt(resourceEl.dataset.resourceX);
      const resourceY = parseInt(resourceEl.dataset.resourceY);
      const resource = resources?.find(r => r.x === resourceX && r.y === resourceY);
      
      if (!resource || resource.category === 'doober' || resource.category === 'source') return;
      
      const rect = resourceEl.getBoundingClientRect();
      const key = `${resourceX}-${resourceY}`;
      
      const updateTooltip = () => {
        setHoverTooltip({
          x: rect.left + rect.width / 2,
          y: rect.top,
          content: generateResourceTooltip(resource, strings),
        });
      };
      
      updateTooltip(); // Immediate render
      hoverTimersRef.current[key] = setInterval(updateTooltip, 1000);
    };
    
    const handleResourceMouseLeave = (event) => {
      const resourceEl = event.target.closest('.resource-tile');
      if (!resourceEl) return;
      
      const resourceX = parseInt(resourceEl.dataset.resourceX);
      const resourceY = parseInt(resourceEl.dataset.resourceY);
      const key = `${resourceX}-${resourceY}`;
      
      if (hoverTimersRef.current[key]) {
        clearInterval(hoverTimersRef.current[key]);
        delete hoverTimersRef.current[key];
      }
      setHoverTooltip(null);
    };
    
    // Add event listeners to the grid container
    const gridContainer = document.querySelector('.homestead');
    if (gridContainer) {
      gridContainer.addEventListener('mouseenter', handleResourceMouseEnter, true);
      gridContainer.addEventListener('mouseleave', handleResourceMouseLeave, true);
    }
    
    return () => {
      if (gridContainer) {
        gridContainer.removeEventListener('mouseenter', handleResourceMouseEnter, true);
        gridContainer.removeEventListener('mouseleave', handleResourceMouseLeave, true);
      }
    };
  }, [resources, setHoverTooltip, generateResourceTooltip, strings]);

  // Render speech bubbles for NPCs and PCs
  const renderSpeechBubbles = () => {
    const bubbles = [];
    
    // Render NPC speech bubbles
    npcs?.forEach(npc => {
      const speech = ConversationManager.getSpeech(npc.type);
      if (!speech) return;
      
      const position = npc.position;
      if (!position) return;
      
      bubbles.push(
        <div
          key={`speech-npc-${npc.id}`}
          className={`conversation-speech-bubble npc${speech.matchState === 'match' ? ' match' : speech.matchState === 'rival' ? ' rival' : ''}`}
          style={{
            position: 'absolute',
            left: position.x * TILE_SIZE + TILE_SIZE / 2,
            top: position.y * TILE_SIZE - TILE_SIZE * 0.2,
            transform: 'translateX(-50%)',
            fontSize: `${TILE_SIZE * 0.6}px`,
            width: `${TILE_SIZE * 1.5}px`,
            height: `${TILE_SIZE * 1.5}px`,
            padding: `${TILE_SIZE * 0.3}px`,
            borderWidth: `${TILE_SIZE * 0.06}px`,
            zIndex: 1000,
          }}
        >
          <div className="speech-emoji" style={{ fontSize: `${TILE_SIZE * 0.9}px` }}>
            {speech.topic || speech.emoji}
          </div>
        </div>
      );
      
      // Also render relationship outcome if present
      const outcome = ConversationManager.getOutcome(npc.type);
      if (outcome) {
        bubbles.push(
          <div
            key={`outcome-npc-${npc.id}`}
            className="relationship-outcome"
            style={{
              position: 'absolute',
              left: position.x * TILE_SIZE + TILE_SIZE / 2,
              top: position.y * TILE_SIZE - TILE_SIZE * 0.2,
              transform: 'translateX(-50%)',
              fontSize: `${TILE_SIZE * 0.8}px`,
              zIndex: 1001,
              animation: 'floatUp 2s ease-out forwards',
            }}
          >
            {outcome.emoji}
          </div>
        );
      }
    });
    
    // Render PC speech bubbles
    pcs?.forEach(pc => {
      const speech = ConversationManager.getSpeech(pc.playerId);
      if (!speech) return;
      
      const position = pc.position;
      if (!position) return;
      
      bubbles.push(
        <div
          key={`speech-pc-${pc.playerId}`}
          className={`conversation-speech-bubble pc${speech.matchState === 'match' ? ' match' : speech.matchState === 'rival' ? ' rival' : ''}`}
          style={{
            position: 'absolute',
            left: position.x * TILE_SIZE + TILE_SIZE / 2,
            top: position.y * TILE_SIZE - TILE_SIZE * 0.2,
            transform: 'translateX(-50%)',
            fontSize: `${TILE_SIZE * 0.6}px`,
            width: `${TILE_SIZE * 1.5}px`,
            height: `${TILE_SIZE * 1.5}px`,
            padding: `${TILE_SIZE * 0.3}px`,
            borderWidth: `${TILE_SIZE * 0.06}px`,
            zIndex: 1000,
          }}
        >
          <div className="speech-emoji" style={{ fontSize: `${TILE_SIZE * 0.9}px` }}>
            {speech.topic || speech.emoji}
          </div>
        </div>
      );
      
      // Also render relationship outcome if present
      const outcome = ConversationManager.getOutcome(pc.playerId);
      if (outcome) {
        bubbles.push(
          <div
            key={`outcome-pc-${pc.playerId}`}
            className="relationship-outcome"
            style={{
              position: 'absolute',
              left: position.x * TILE_SIZE + TILE_SIZE / 2,
              top: position.y * TILE_SIZE - TILE_SIZE * 0.2,
              transform: 'translateX(-50%)',
              fontSize: `${TILE_SIZE * 0.8}px`,
              zIndex: 1001,
              animation: 'floatUp 2s ease-out forwards',
            }}
          >
            {outcome.emoji}
          </div>
        );
      }
    });
    
    return bubbles;
  };

  return (
    <>
      {/* Resource Overlays */}
      {resources?.map((resource) => {
        if (resource.category === 'doober' || resource.category === 'source') return null;
        
        const overlayInfo = getResourceOverlayStatus(
          resource, 
          craftingStatus, 
          tradingStatus, 
          badgeState, 
          electionPhase,
          currentPlayer
        );
        
        if (!overlayInfo) return null;
        
        const emojiMapping = OVERLAY_EMOJI_MAPPING[overlayInfo.type];
        if (!emojiMapping) return null;
        
        return (
          <div
            key={`overlay-${resource.x}-${resource.y}`}
            style={{
              position: 'absolute',
              top: resource.y * TILE_SIZE,
              left: resource.x * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
              color: emojiMapping.color,
              fontSize: '0.5em',
              fontWeight: 'bold',
              zIndex: 11,
              pointerEvents: 'none',
              textShadow: '0 0 3px rgba(0, 0, 0, 0.8)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-start',
              padding: '2px',
            }}
          >
            {emojiMapping.emoji}
          </div>
        );
      })}
      
      {/* Speech bubbles and relationship outcomes */}
      {renderSpeechBubbles()}
    </>
  );
};

export default RenderDynamicElementsDOM;