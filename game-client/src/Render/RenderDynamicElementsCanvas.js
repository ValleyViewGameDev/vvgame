import React, { useRef, useEffect, useState, memo, useCallback } from 'react';
import { getResourceOverlayStatus, OVERLAY_SVG_MAPPING } from '../Utils/ResourceOverlayUtils';
import SVGAssetManager from './SVGAssetManager';
import { getResourceCursorClass, getNPCCursorClass, setCanvasCursor } from '../Utils/CursorUtils';
import { handleNPCClickShared, getAttackCooldownStatus } from '../GameFeatures/NPCs/NPCInteractionUtils';
import { calculateTooltipPosition } from '../Utils/TooltipUtils';
import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
import '../GameFeatures/Relationships/Conversation.css';
import './Tooltip.css';

/**
 * Canvas-based dynamic elements renderer
 * Handles tooltips, overlays, badges, attack ranges, VFX, etc.
 */
export const RenderDynamicElementsCanvas = ({
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
  timers,
  generateResourceTooltip,
  generateNPCTooltip,
  generatePCTooltip,
  handleTileClick,
  onNPCClick,
  onPCClick,
  // Additional props needed for NPC interactions
  setInventory,
  setBackpack,
  setResources,
  setCurrentPlayer,
  masterSkills,
  masterResources,
  setModalContent,
  setIsModalOpen,
  updateStatus,
  openPanel,
  setActiveStation,
  masterTrophies,
  globalTuning,
  gridId,
  playersInGrid
}) => {
  const canvasRef = useRef(null);
  const lastRenderData = useRef(null);
  const [conversationVersion, setConversationVersion] = useState(0);
  const currentHoveredNPC = useRef(null);
  const cursorUpdateInterval = useRef(null);
  const tooltipUpdateInterval = useRef(null);
  const currentTooltipData = useRef(null);

  // Subscribe to conversation changes
  useEffect(() => {
    const unsubscribe = ConversationManager.subscribe(() => {
      console.log('🗨️ RenderDynamicElementsCanvas: Conversation changed, triggering update');
      setConversationVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

  // Render overlays to canvas
  const renderOverlays = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !resources) return;
    
    const ctx = canvas.getContext('2d');
    
    // Get device pixel ratio for high-DPI support
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Calculate display size and actual canvas size
    const displayWidth = 64 * TILE_SIZE;
    const displayHeight = 64 * TILE_SIZE;
    const actualWidth = displayWidth * devicePixelRatio;
    const actualHeight = displayHeight * devicePixelRatio;
    
    // Set actual canvas size (for high-DPI)
    canvas.width = actualWidth;
    canvas.height = actualHeight;
    
    // Set display size (CSS size)
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    // Scale canvas context for high-DPI
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    
    // Render resource overlays
    for (const resource of resources) {
      if (resource.type === 'shadow' || resource.category === 'doober' || resource.category === 'source') continue;
      
      const overlayInfo = getResourceOverlayStatus(
        resource, 
        craftingStatus, 
        tradingStatus, 
        badgeState, 
        electionPhase,
        currentPlayer
      );
      
      if (!overlayInfo) continue;
      
      const overlayType = overlayInfo.type;
      if (!overlayType || !OVERLAY_SVG_MAPPING[overlayType]) continue;
      
      const x = resource.x * TILE_SIZE;
      const y = resource.y * TILE_SIZE;
      const size = TILE_SIZE * (resource.range || 1);
      
      // Position overlay in lower-left corner of the resource
      // Scale overlay more appropriately for different zoom levels
      let overlaySize;
      if (TILE_SIZE <= 16) {
        // Far zoom: use smaller minimum and ratio
        overlaySize = Math.max(6, TILE_SIZE * 0.35);
      } else if (TILE_SIZE <= 30) {
        // Close zoom: standard sizing
        overlaySize = Math.max(10, TILE_SIZE * 0.35);
      } else {
        // Closer zoom: allow larger overlays
        overlaySize = Math.max(14, TILE_SIZE * 0.35);
      }
      
      const overlayX = x + 2;
      const overlayY = y + TILE_SIZE - overlaySize - 2;
      
      const overlayTexture = await SVGAssetManager.getOverlayTexture(
        OVERLAY_SVG_MAPPING[overlayType], 
        overlaySize
      );
      
      if (overlayTexture) {
        ctx.drawImage(overlayTexture, overlayX, overlayY, overlaySize, overlaySize);
      }
    }
  };

  // Re-render when dependencies change
  useEffect(() => {
    const currentData = JSON.stringify({ 
      resources: resources?.map(r => ({ 
        x: r.x, 
        y: r.y, 
        type: r.type
      })), 
      TILE_SIZE,
      craftingReady: craftingStatus?.ready,
      craftingInProgress: craftingStatus?.inProgress,
      tradingReady: tradingStatus?.ready,
      mailboxBadge: badgeState?.mailbox,
      electionPhase,
      playerId: currentPlayer?.id
    });
    
    if (currentData !== lastRenderData.current) {
      renderOverlays();
      lastRenderData.current = currentData;
    }
  }, [resources, TILE_SIZE, craftingStatus, tradingStatus, badgeState, electionPhase, currentPlayer]);

  // Stop cursor update interval
  const stopCursorUpdateInterval = useCallback(() => {
    if (cursorUpdateInterval.current) {
      clearInterval(cursorUpdateInterval.current);
      cursorUpdateInterval.current = null;
    }
  }, []);

  // Start cursor update interval for attack NPCs
  const startCursorUpdateInterval = useCallback((npc, element) => {
    // Only start for attack NPCs
    if (npc.action !== 'attack' && npc.action !== 'spawn') return;
    
    
    // Clear any existing interval
    if (cursorUpdateInterval.current) {
      clearInterval(cursorUpdateInterval.current);
      cursorUpdateInterval.current = null;
    }
    
    // Check cursor status every 100ms
    cursorUpdateInterval.current = setInterval(() => {
      // Make sure we're still hovering over the same NPC
      if (!currentHoveredNPC.current || currentHoveredNPC.current.id !== npc.id) {
        if (cursorUpdateInterval.current) {
          clearInterval(cursorUpdateInterval.current);
          cursorUpdateInterval.current = null;
        }
        return;
      }
      
      // Update cursor based on current cooldown status
      const cursorClass = getNPCCursorClass(npc);
      const cooldownStatus = getAttackCooldownStatus();
      setCanvasCursor(element, cursorClass);
    }, 100);
  }, []);

  // Function to stop tooltip update interval
  const stopTooltipUpdateInterval = useCallback(() => {
    if (tooltipUpdateInterval.current) {
      clearInterval(tooltipUpdateInterval.current);
      tooltipUpdateInterval.current = null;
      currentTooltipData.current = null;
    }
  }, []);
  
  // Function to start tooltip update interval for time-sensitive tooltips
  const startTooltipUpdateInterval = useCallback((entity, entityType, position) => {
    // Clear any existing interval
    stopTooltipUpdateInterval();
    
    // Store current tooltip data
    currentTooltipData.current = { entity, entityType, position };
    
    // Determine if this entity needs real-time updates
    const needsRealtimeUpdate = (
      (entityType === 'resource' && (
        entity.type === 'Dungeon Entrance' ||
        (entity.category === 'farmplot' && entity.growEnd) ||
        (entity.category === 'crafting' && entity.craftEnd) ||
        (entity.category === 'pet' && entity.craftEnd)
      )) ||
      (entityType === 'npc' && entity.action === 'graze' && entity.grazeEnd)
    );
    
    if (!needsRealtimeUpdate) return;
    
    // Update tooltip every 100ms
    tooltipUpdateInterval.current = setInterval(() => {
      if (!currentTooltipData.current) {
        stopTooltipUpdateInterval();
        return;
      }
      
      // Regenerate tooltip content
      let content = '';
      if (entityType === 'resource') {
        content = generateResourceTooltip(entity, strings, timers);
      } else if (entityType === 'npc') {
        content = generateNPCTooltip(entity, strings);
      }
      
      if (content) {
        setHoverTooltip({
          x: position.x,
          y: position.y,
          content: content
        });
      }
    }, 100);
  }, [strings, timers, stopTooltipUpdateInterval, setHoverTooltip]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      stopCursorUpdateInterval();
      stopTooltipUpdateInterval();
    };
  }, [stopCursorUpdateInterval, stopTooltipUpdateInterval]);

  // Handle mouse events for tooltips and cursors - check ALL entity types
  const handleCanvasMouseMove = (event) => {
    const canvas = canvasRef.current;
    const overlayDiv = event.currentTarget; // The div that received the event
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const colIndex = Math.floor(x / TILE_SIZE);
    const rowIndex = Math.floor(y / TILE_SIZE);
    
    // Debug logging
    if (!window._tooltipDebugLogged) {
      console.log('RenderDynamicElementsCanvas - Available entities:', {
        resources: resources?.length || 0,
        npcs: npcs?.length || 0,
        pcs: pcs?.length || 0,
        TILE_SIZE
      });
      window._tooltipDebugLogged = true;
    }
    
    // Check for NPC at this position FIRST (they render on top of resources)
    const npc = npcs?.find(n => 
      n && n.position && 
      Math.floor(n.position.x) === colIndex && 
      Math.floor(n.position.y) === rowIndex
    );
    
    if (npc) {
      const tooltipPosition = calculateTooltipPosition(event.clientX, event.clientY);
      setHoverTooltip({
        x: tooltipPosition.x,
        y: tooltipPosition.y,
        content: generateNPCTooltip(npc, strings),
      });
      
      // Start tooltip update interval for NPCs with timers
      startTooltipUpdateInterval(npc, 'npc', tooltipPosition);
      
      // Track current hovered NPC
      currentHoveredNPC.current = { id: npc.id };
      
      // Set cursor for the NPC
      const cursorClass = getNPCCursorClass(npc);
      setCanvasCursor(overlayDiv, cursorClass);
      
      // Start cursor update interval for attack NPCs
      startCursorUpdateInterval(npc, overlayDiv);
      
      return;
    }
    
    // Check for any resource at this position (including doobers for cursor)
    const anyResource = resources?.find(r => {
      if (r.type === 'shadow') return false;
      const range = r.range || 1;
      // Multi-tile resources grow upward from anchor
      return colIndex >= r.x && colIndex < r.x + range &&
             rowIndex <= r.y && rowIndex > r.y - range;
    });
    
    // Check for tooltip-eligible resource (excluding doobers and sources)
    const tooltipResource = anyResource && anyResource.category !== 'doober' && anyResource.category !== 'deco' && anyResource.category !== 'source' ? anyResource : null;
    
    if (tooltipResource) {
      const tooltipPosition = calculateTooltipPosition(event.clientX, event.clientY);
      setHoverTooltip({
        x: tooltipPosition.x,
        y: tooltipPosition.y,
        content: generateResourceTooltip(tooltipResource, strings, timers),
      });
      // Start tooltip update interval for time-sensitive resources
      startTooltipUpdateInterval(tooltipResource, 'resource', tooltipPosition);
      // Set cursor for the resource
      const cursorClass = getResourceCursorClass(tooltipResource);
      setCanvasCursor(overlayDiv, cursorClass);
      return;
    } else if (anyResource) {
      // Resource exists but no tooltip (doober or source)
      setHoverTooltip(null);
      stopTooltipUpdateInterval();
      // Doobers should show pointer cursor
      const cursorClass = anyResource.category === 'doober' ? 'cursor-pointer' : getResourceCursorClass(anyResource);
      setCanvasCursor(overlayDiv, cursorClass);
      return;
    }
    
    // Check for PC at this position (excluding current player)
    const pc = pcs?.find(p => 
      p && p.position && 
      Math.floor(p.position.x) === colIndex && 
      Math.floor(p.position.y) === rowIndex &&
      String(p.playerId) !== String(currentPlayer?._id)
    );
    
    if (pc) {
      const tooltipPosition = calculateTooltipPosition(event.clientX, event.clientY);
      setHoverTooltip({
        x: tooltipPosition.x,
        y: tooltipPosition.y,
        content: generatePCTooltip(pc),
      });
      // PCs are generally not interactive, so use default cursor
      setCanvasCursor(overlayDiv, null);
      return;
    }
    
    // No entity found - clear tooltip and reset cursor
    setHoverTooltip(null);
    setCanvasCursor(overlayDiv, null);
    
    // Clear tracked NPC and stop cursor update interval
    currentHoveredNPC.current = null;
    stopCursorUpdateInterval();
    stopTooltipUpdateInterval();
  };

  const handleCanvasMouseLeave = (event) => {
    setHoverTooltip(null);
    // Reset cursor when leaving
    const overlayDiv = event.currentTarget;
    if (overlayDiv) {
      setCanvasCursor(overlayDiv, null);
    }
    
    // Clear tracked NPC and stop cursor update interval
    currentHoveredNPC.current = null;
    stopCursorUpdateInterval();
    
    // Stop tooltip update interval
    stopTooltipUpdateInterval();
  };

  // Handle clicks and forward to appropriate handlers
  const handleCanvasClick = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const colIndex = Math.floor(x / TILE_SIZE);
    const rowIndex = Math.floor(y / TILE_SIZE);
    
    // Check if there's an NPC at this position
    const npc = npcs?.find(n => 
      n && n.position && 
      Math.floor(n.position.x) === colIndex && 
      Math.floor(n.position.y) === rowIndex
    );
    
    if (npc) {
      // Use the shared click handler that includes cooldown logic for attack NPCs
      handleNPCClickShared(npc, {
        currentPlayer,
        playersInGrid,
        gridId,
        TILE_SIZE,
        masterResources,
        masterSkills,
        masterTrophies,
        globalTuning,
        strings,
        // Event handlers
        onNPCClick,
        setHoverTooltip,
        setInventory,
        setBackpack,
        setResources,
        setCurrentPlayer,
        setModalContent,
        setIsModalOpen,
        updateStatus,
        openPanel,
        setActiveStation
      });
      return;
    }
    
    // Check if there's a PC at this position
    const pc = pcs?.find(p => 
      p && p.position && 
      Math.floor(p.position.x) === colIndex && 
      Math.floor(p.position.y) === rowIndex
    );
    
    if (pc && onPCClick) {
      onPCClick(pc);
      return;
    }
    
    // No NPC or PC found, forward to tile/resource handler
    if (handleTileClick) {
      handleTileClick(rowIndex, colIndex);
    }
  };

  // Render speech bubbles for NPCs and PCs
  const renderSpeechBubbles = () => {
    const bubbles = [];
    
    // Render NPC speech bubbles
    npcs?.forEach(npc => {
      
      const speech = ConversationManager.getSpeech(npc.type);
      const outcome = ConversationManager.getOutcome(npc.type) || ConversationManager.getOutcome(npc.id);
      const position = npc.position;
      if (!position) return;
      
      // Render speech bubble if there's active speech and no outcome
      if (speech && !outcome) {
        // Create wrapper div for entity + bubble (only animate if no outcome)
        bubbles.push(
          <div
            key={`speech-wrapper-npc-${npc.id}`}
            className="speaking-animation"
            style={{
              position: 'absolute',
              left: position.x * TILE_SIZE,
              top: position.y * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            <div
              className={`conversation-speech-bubble npc${speech.isMatch ? ' match' : ''}`}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '100%',
                transform: 'translateX(-50%)',
                marginBottom: '10px',
                fontSize: `${TILE_SIZE * 0.6}px`,
                width: `${TILE_SIZE * 1.5}px`,
                height: `${TILE_SIZE * 1.5}px`,
                padding: `${TILE_SIZE * 0.3}px`,
                borderWidth: `${TILE_SIZE * 0.06}px`,
              }}
            >
              <div className="speech-emoji" style={{ fontSize: `${TILE_SIZE * 0.9}px` }}>
                {speech.topic || speech.emoji}
              </div>
            </div>
          </div>
        );
      }
      
      // Render relationship outcome if present (already checked above)
      if (outcome) {
        // Render outcome as a simple emoji "speech bubble" without the bubble container
        bubbles.push(
          <div
            key={`outcome-npc-${npc.id}`}
            style={{
              position: 'absolute',
              left: position.x * TILE_SIZE,
              top: position.y * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
              pointerEvents: 'none',
              zIndex: 1100, // Higher than speech bubbles
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '100%',
                transform: 'translateX(-50%)',
                marginBottom: '10px',
                fontSize: `${TILE_SIZE * 1.2}px`,
                textAlign: 'center',
              }}
            >
              {outcome.type === 'positive' ? '👍' : '❌'}
            </div>
          </div>
        );
      }
    });
    
    // Render PC speech bubbles
    pcs?.forEach(pc => {
      const speech = ConversationManager.getSpeech(pc.playerId);
      const outcome = ConversationManager.getOutcome(pc.playerId);
      
      const position = pc.position;
      if (!position) return;
      
      // Only render speech bubble if no outcome is showing
      if (speech && !outcome) {
        // Create wrapper div for entity + bubble
        bubbles.push(
          <div
            key={`speech-wrapper-pc-${pc.playerId}`}
            className="speaking-animation"
            style={{
              position: 'absolute',
              left: position.x * TILE_SIZE,
              top: position.y * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            <div
              className={`conversation-speech-bubble pc${speech.isMatch ? ' match' : ''}`}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '100%',
                transform: 'translateX(-50%)',
                marginBottom: '10px',
                fontSize: `${TILE_SIZE * 0.6}px`,
                width: `${TILE_SIZE * 1.5}px`,
                height: `${TILE_SIZE * 1.5}px`,
                padding: `${TILE_SIZE * 0.3}px`,
                borderWidth: `${TILE_SIZE * 0.06}px`,
              }}
            >
              <div className="speech-emoji" style={{ fontSize: `${TILE_SIZE * 0.9}px` }}>
                {speech.topic || speech.emoji}
              </div>
            </div>
          </div>
        );
      }
      
      // Render relationship outcome if present
      if (outcome) {
        // Render outcome as a simple emoji "speech bubble" without the bubble container
        bubbles.push(
          <div
            key={`outcome-pc-${pc.playerId}`}
            style={{
              position: 'absolute',
              left: position.x * TILE_SIZE,
              top: position.y * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
              pointerEvents: 'none',
              zIndex: 1100, // Higher than speech bubbles
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '100%',
                transform: 'translateX(-50%)',
                marginBottom: '10px',
                fontSize: `${TILE_SIZE * 1.2}px`,
                textAlign: 'center',
              }}
            >
              {outcome.type === 'positive' ? '👍' : '❌'}
            </div>
          </div>
        );
      }
    });
    
    return bubbles;
  };

  return (
    <>
      {/* Overlay Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${64 * TILE_SIZE}px`,
          height: `${64 * TILE_SIZE}px`,
          zIndex: 20, // Higher than all entity layers
          pointerEvents: 'none', // Canvas doesn't need pointer events
        }}
      />
      
      {/* Invisible div for mouse detection */}
      <div
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        onClick={handleCanvasClick}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${64 * TILE_SIZE}px`,
          height: `${64 * TILE_SIZE}px`,
          zIndex: 21, // Just above the canvas
          pointerEvents: 'auto',
          background: 'transparent',
          cursor: 'inherit', // Allow cursor to be set
        }}
      />
      
      {/* Speech bubbles and relationship outcomes */}
      {renderSpeechBubbles()}
    </>
  );
};

export default RenderDynamicElementsCanvas;