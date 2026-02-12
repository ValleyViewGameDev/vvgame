import React, { useEffect, useState, useRef } from 'react';
import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
import { getDerivedRange } from '../Utils/worldHelpers';
import { renderPositions } from '../PlayerMovement';
import './PCComponent.css';
import playerIconsData from '../Authentication/PlayerIcons.json';

// Normalize emoji by removing variation selectors (U+FE0F) for consistent matching
const normalizeEmoji = (emoji) => {
  if (!emoji) return emoji;
  // Remove variation selector-16 (U+FE0F) which is often appended to emojis
  return emoji.replace(/\uFE0F/g, '');
};

// Build a static lookup map from emoji value to SVG filename (created once at module load)
const iconToSvgMap = new Map();
['free', 'paid', 'platinum'].forEach(tier => {
  (playerIconsData[tier] || []).forEach(icon => {
    if (icon.filename) {
      // Store with normalized emoji key
      iconToSvgMap.set(normalizeEmoji(icon.value), icon.filename);
    }
  });
});

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
  setHoverTooltip,
  connectedPlayers
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
  const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;

  // Check if this player is currently connected (online)
  const isConnected = isCurrentPlayer || connectedPlayers?.has(pc.playerId);

  return (
    <>
      {/* Regular range indicator (gray circle) - hidden on own homestead since no range restrictions there */}
      {showRangeIndicators && derivedRange > 1 && !isOnOwnHomestead && (
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

      {/* Combat/Attack range indicator (red dotted circle) - hidden on own homestead */}
      {showRangeIndicators && attackRange > 0 && !isOnOwnHomestead && (
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
        opacity: isConnected ? 1 : 0.4,
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Player icon with modifiers */}
      <span className="pc-icon">
        {(() => {
          // Determine which icon/emoji to display based on status
          const displayIcon = pc.hp === 0 ? '💀' : pc.hp < 100 ? '🤢' : isCamping ? '🏕️' : isInBoat ? '🛶' : pc.icon;
          // Check if this icon has an SVG file (normalize to handle variation selectors)
          const normalizedIcon = normalizeEmoji(displayIcon);
          const svgFilename = iconToSvgMap.get(normalizedIcon);

          if (svgFilename) {
            return (
              <img
                src={`/assets/playerIcons/${svgFilename}`}
                alt={displayIcon}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            );
          }
          return displayIcon;
        })()}
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