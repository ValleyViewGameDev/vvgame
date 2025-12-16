import React, { useEffect, useState, useRef } from 'react';
import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
import { getDerivedRange } from '../Utils/worldHelpers';
import { renderPositions } from '../PlayerMovement';
import './PCComponent.css';

const PCComponent = ({ 
  pc, 
  TILE_SIZE,
  currentPlayer,
  isCurrentPlayer,
  onPCClick,
  setCurrentPlayer,
  setInventory,
  setBackpack,
  masterResources,
  strings,
  setHoverTooltip
}) => {
  const [isHovered, setIsHovered] = useState(false);
  // Health bar removed - using tooltips instead
  const [conversationIcon, setConversationIcon] = useState(null);
  const [speechBubble, setSpeechBubble] = useState(null);
  const [relationshipOutcome, setRelationshipOutcome] = useState(null);
  const elementRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const prevTileSizeRef = useRef(TILE_SIZE);

  // State to force re-renders during animation
  const [, forceUpdate] = useState({});
  
  // Use renderPositions for interpolated movement, fallback to pc.position
  const overridePos = renderPositions[pc.playerId];
  const position = overridePos || pc.position;
  
  // Animation loop to update position from renderPositions
  useEffect(() => {
    let animationFrameId;
    
    const updatePosition = () => {
      // Force re-render if we have an override position
      if (renderPositions[pc.playerId]) {
        forceUpdate({});
      }
      animationFrameId = requestAnimationFrame(updatePosition);
    };
    
    animationFrameId = requestAnimationFrame(updatePosition);
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [pc.playerId]);
  
  // Detect TILE_SIZE changes to disable transitions
  const tileSizeChanged = prevTileSizeRef.current !== TILE_SIZE;
  useEffect(() => {
    prevTileSizeRef.current = TILE_SIZE;
  }, [TILE_SIZE]);

  // Subscribe to conversation changes
  useEffect(() => {
    const updateConversation = () => {
      const speech = ConversationManager.getSpeech(pc.playerId);
      setSpeechBubble(speech);
      
      const outcome = ConversationManager.getOutcome(pc.playerId);
      setRelationshipOutcome(outcome);
    };
    
    updateConversation();
    const unsubscribe = ConversationManager.subscribe(updateConversation);
    return unsubscribe;
  }, [pc.playerId]);

  const handleClick = async (e) => {
    e.stopPropagation();

    // Only open social panel - no combat
    if (onPCClick) {
      onPCClick(pc);
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    
    // Removed health bar logic - using tooltips instead

    // Show tooltip only for other players
    if (!isCurrentPlayer && setHoverTooltip) {
      const rect = elementRef.current?.getBoundingClientRect();
      if (rect) {
        const username = pc.username || 'Anonymous';
        let content = `<p>${username}</p><p>❤️‍🩹 HP: ${pc.hp}</p>`;
        if (pc.iscamping) content += `<p>🏕️ Camping</p>`;
        if (pc.isinboat) content += `<p>🛶 In a boat</p>`;
        
        setHoverTooltip({
          x: rect.left + rect.width / 2,
          y: rect.top,
          content
        });
      }
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Health bar state removed
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    if (setHoverTooltip) {
      setHoverTooltip(null);
    }
  };

  // Health calculations removed - using tooltips
  const isCamping = pc.iscamping;
  const isInBoat = pc.isinboat;
  
  // Check if range indicators should be shown (only for current player)
  const showRangeIndicators = isCurrentPlayer && currentPlayer?.settings?.rangeOn !== false;
  const derivedRange = showRangeIndicators ? getDerivedRange(currentPlayer, masterResources) : 0;
  const attackRange = showRangeIndicators ? pc.attackrange : 0;
  const isInHomestead = currentPlayer?.location?.gtype === "homestead";

  return (
    <>
      {/* Regular range indicator (gray circle) */}
      {showRangeIndicators && derivedRange > 1 && (
        <div
          className="attack-range player-range"
          style={{
            position: 'absolute',
            left: `${position.x * TILE_SIZE - derivedRange * TILE_SIZE + TILE_SIZE / 2}px`,
            top: `${position.y * TILE_SIZE - derivedRange * TILE_SIZE + TILE_SIZE / 2}px`,
            width: `${derivedRange * 2 * TILE_SIZE}px`,
            height: `${derivedRange * 2 * TILE_SIZE}px`,
            backgroundColor: 'rgba(128, 128, 128, 0.2)',
            borderRadius: '50%',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}

      {/* Combat/Attack range indicator (red dotted circle) */}
      {showRangeIndicators && attackRange > 0 && !isInHomestead && (
        <div
          className="attack-range player-attack-range"
          style={{
            position: 'absolute',
            left: `${position.x * TILE_SIZE - attackRange * TILE_SIZE + TILE_SIZE / 2 - 3}px`,
            top: `${position.y * TILE_SIZE - attackRange * TILE_SIZE + TILE_SIZE / 2 - 3}px`,
            width: `${attackRange * 2 * TILE_SIZE}px`,
            height: `${attackRange * 2 * TILE_SIZE}px`,
            border: '3px dotted rgba(255, 0, 0, 0.4)',
            borderRadius: '50%',
            pointerEvents: 'none',
            zIndex: 11,
          }}
        />
      )}


      {/* PC character */}
      <div
        ref={elementRef}
        className={`pc ${isCurrentPlayer ? 'current-player' : 'other-player'} ${isHovered ? 'hovered' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x * TILE_SIZE}px`,
        top: `${position.y * TILE_SIZE}px`,
        width: `${TILE_SIZE}px`,
        height: `${TILE_SIZE}px`,
        fontSize: `${TILE_SIZE * 0.7}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 16,
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Player icon with modifiers */}
      <span className="pc-icon">
        {pc.hp === 0 ? '💀' : pc.hp < 100 ? '🤢' : isCamping ? '🏕️' : isInBoat ? '🛶' : pc.icon}
      </span>

      {/* Conversation speech bubble - Moved to RenderDynamicElements */}
      
      {/* Relationship outcome VFX - Moved to RenderDynamicElements */}

      {/* Health bar - removed to avoid duplicate UI */}

      {/* Player name - now in tooltip */}
      </div>
    </>
  );
};

export default React.memo(PCComponent);