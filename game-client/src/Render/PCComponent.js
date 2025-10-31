import React, { useEffect, useState, useRef } from 'react';
import { handleAttackOnPC } from '../GameFeatures/Combat/Combat';
import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
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
  const [position, setPosition] = useState({ x: pc.position.x, y: pc.position.y });
  const [isHovered, setIsHovered] = useState(false);
  // Health bar removed - using tooltips instead
  const [conversationIcon, setConversationIcon] = useState(null);
  const [speechBubble, setSpeechBubble] = useState(null);
  const [relationshipOutcome, setRelationshipOutcome] = useState(null);
  const elementRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const prevTileSizeRef = useRef(TILE_SIZE);

  // Update position when PC moves
  useEffect(() => {
    setPosition(pc.position);
  }, [pc.position]);
  
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

    // Always call onPCClick to open social panel
    if (onPCClick) {
      onPCClick(pc);
    }
    
    // Check if we should also trigger combat
    const isNotSelf = String(pc.playerId) !== String(currentPlayer._id);
    const isAttackable = pc.hp > 0 && !pc.iscamping;
    const isHomestead = currentPlayer?.location?.gtype === 'homestead';
    const isTown = currentPlayer?.location?.gtype === 'town';
    
    if (isNotSelf && isAttackable && !isHomestead && !isTown) {
      await handleAttackOnPC(
        pc, // target PC
        currentPlayer, // attacking player
        currentPlayer?.location?.g, // gridId
        TILE_SIZE
      );
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

  return (
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
        cursor: pc.hp > 25 ? 'crosshair' : 'pointer',
        transition: tileSizeChanged ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out',
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Player icon with modifiers */}
      <span className="pc-icon">
        {pc.hp === 0 ? '💀' : pc.hp < 20 ? '🤢' : isCamping ? '🏕️' : isInBoat ? '🛶' : pc.icon}
      </span>

      {/* Conversation speech bubble */}
      {speechBubble && (
        <div 
          className={`conversation-speech-bubble pc${speechBubble.isMatch ? ' match' : ''}`}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '100%',
            transform: 'translateX(-50%)',
            marginBottom: '10px',
            width: `${TILE_SIZE * 2.5}px`,
            height: `${TILE_SIZE * 2.5}px`,
            fontSize: `${TILE_SIZE}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 17,
          }}
        >
          <div className="speech-emoji" style={{ fontSize: `${TILE_SIZE * 1.6}px` }}>
            {speechBubble.topic || speechBubble.emoji}
          </div>
        </div>
      )}
      
      {/* Relationship outcome VFX */}
      {relationshipOutcome && (
        <div 
          className="relationship-outcome"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '100%',
            transform: 'translateX(-50%)',
            marginBottom: '10px',
            pointerEvents: 'none',
            zIndex: 18,
            fontSize: `${TILE_SIZE * 1.5}px`,
          }}
        >
          {relationshipOutcome.type === 'positive' ? '👍' : '❌'}
        </div>
      )}

      {/* Health bar - removed to avoid duplicate UI */}

      {/* Player name - now in tooltip */}
    </div>
  );
};

export default React.memo(PCComponent);