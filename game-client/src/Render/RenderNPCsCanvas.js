import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import SVGAssetManager from './SVGAssetManager';
import { OVERLAY_SVG_MAPPING } from '../Utils/ResourceOverlayUtils';
import { generateNPCTooltipContent, handleNPCClickShared, getAttackCooldownStatus } from '../GameFeatures/NPCs/NPCInteractionUtils';
import { getNPCCursorClass, setCanvasCursor } from '../Utils/CursorUtils';
import { calculateTooltipPosition } from '../Utils/TooltipUtils';
import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
import NPCsInGridManager from '../GridState/GridStateNPCs';

// NPC art mapping - maps NPC types to SVG files
// Start with a few NPCs for testing, can expand later
const NPC_ART_MAPPING = {
  // Add NPC types as we create SVG art for them
  // 'Farmer': 'farmer.svg',
  // 'Kent': 'kent.svg',
  // For now, we'll render NPCs as emoji symbols in canvas
};

// Canvas-based NPC renderer component
const RenderNPCsCanvasComponent = ({ 
  npcs,
  TILE_SIZE,
  currentPlayer,
  globalTuning,
  gridId,
  onNPCClick,
  onMouseEnter,
  onMouseLeave,
  // Status checking functions
  checkQuestNPCStatus,
  checkTradeNPCStatus,
  checkKentNPCStatus,
  getOverlayContent,
  // Additional props for NPC interactions
  strings,
  masterResources,
  playersInGrid,
  setInventory,
  setBackpack,
  setResources,
  setCurrentPlayer,
  masterSkills,
  setModalContent,
  setIsModalOpen,
  updateStatus,
  openPanel,
  setActiveStation,
  masterTrophies,
  setHoverTooltip,
  isDeveloper = false
}) => {
  const canvasRef = useRef(null);
  const lastRenderData = useRef(null);
  const currentHoveredNPC = useRef(null); // Track which NPC is currently being hovered
  const tooltipUpdateInterval = useRef(null); // Timer for updating time-based tooltips
  const cursorUpdateInterval = useRef(null); // Timer for updating cursor when cooldown expires
  
  // Canvas-specific animation system (mimics DOM's CSS transitions)
  const canvasAnimations = useRef({});
  const animationFrameId = useRef(null);
  const renderNPCsRef = useRef(null);
  // Removed bounceAnimations - no longer bouncing
  
  // Use NPCs directly without memoization to ensure we see all position updates
  useEffect(() => {
    // Removed log to reduce noise
  }, [npcs]);
  
  // Update SVGAssetManager zoom tiers when globalTuning changes
  useEffect(() => {
    if (globalTuning) {
      SVGAssetManager.updateZoomTiers(globalTuning);
    }
  }, [globalTuning]);

  // Animation loop (mimics CSS transition behavior)
  const startAnimationLoop = useCallback(() => {
    const animate = () => {
      const now = Date.now();
      let hasActiveAnimations = false;
      
      // Update all animation positions
      Object.keys(canvasAnimations.current).forEach(npcId => {
        const animation = canvasAnimations.current[npcId];
        if (!animation || animation.duration === 0) return;
        
        const elapsed = now - animation.startTime;
        
        if (elapsed >= animation.duration) {
          // Animation complete
          animation.currentPos = { ...animation.targetPos };
          animation.duration = 0;
        } else {
          // Linear interpolation (matches DOM CSS 'linear' timing)
          const progress = elapsed / animation.duration;
          animation.currentPos = {
            x: animation.startPos.x + (animation.targetPos.x - animation.startPos.x) * progress,
            y: animation.startPos.y + (animation.targetPos.y - animation.startPos.y) * progress
          };
          hasActiveAnimations = true;
        }
      });
      
      // Re-render canvas
      if (renderNPCsRef.current) {
        renderNPCsRef.current();
      }
      
      // Removed bounce animation checks - no longer bouncing
      
      // Continue loop if there are active animations
      if (hasActiveAnimations) {
        animationFrameId.current = requestAnimationFrame(animate);
      } else {
        animationFrameId.current = null;
      }
    };
    
    animationFrameId.current = requestAnimationFrame(animate);
  }, []);

  // Start animation when NPC positions change
  // Re-run whenever the NPCs array or positions change
  useEffect(() => {
    if (!npcs || npcs.length === 0) return;
    
    // Removed log to reduce noise
    let hasPositionChanges = false;
    
    npcs.forEach(npc => {
      const currentAnimation = canvasAnimations.current[npc.id];
      
      // NPCs use their actual position, not renderPositions (that's for PCs)
      const targetPos = { x: npc.position.x, y: npc.position.y };
      
      if (!currentAnimation) {
        // First time - just set position
        // NPC initialized
        canvasAnimations.current[npc.id] = {
          startPos: { ...targetPos },
          currentPos: { ...targetPos },
          targetPos: { ...targetPos },
          startTime: Date.now(),
          duration: 0 // No animation needed for first time
        };
        hasPositionChanges = true;
      } else if (currentAnimation.targetPos.x !== targetPos.x || currentAnimation.targetPos.y !== targetPos.y) {
        // Position changed - start new animation from current position
        // NPC moved
        canvasAnimations.current[npc.id] = {
          startPos: { ...currentAnimation.currentPos },
          currentPos: { ...currentAnimation.currentPos },
          targetPos: { ...targetPos },
          startTime: Date.now(),
          duration: 1200 // 1.2s to match DOM CSS transitions
        };
        hasPositionChanges = true;
        
        // Start animation loop if not already running
        if (!animationFrameId.current) {
          startAnimationLoop();
        }
      }
    });
    
    // Always trigger a render when this effect runs
    if (renderNPCsRef.current) {
      // Triggering canvas render
      renderNPCsRef.current();
    }
  }, [npcs, startAnimationLoop]);

  // Cleanup animation loop on unmount
  useEffect(() => {
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, []);

  // Get current render position for NPC (includes animation state)
  const getNPCRenderPosition = useCallback((npc) => {
    const animation = canvasAnimations.current[npc.id];
    if (animation) {
      return animation.currentPos;
    }
    // Fallback to base position if no animation data
    return npc.position;
  }, []);

  // Removed setBounceAnimation function - no longer bouncing

  // Removed getBounceOffset function - no longer bouncing

  // Removed bounce animation management - no longer bouncing

  // Stop tooltip update timer (defined first to avoid dependency issues)
  const stopTooltipTimer = useCallback(() => {
    if (tooltipUpdateInterval.current) {
      clearInterval(tooltipUpdateInterval.current);
      tooltipUpdateInterval.current = null;
    }
  }, []);

  // Stop cursor update interval
  const stopCursorUpdateInterval = useCallback(() => {
    if (cursorUpdateInterval.current) {
      clearInterval(cursorUpdateInterval.current);
      cursorUpdateInterval.current = null;
    }
  }, []);

  // Function to update tooltip if currently hovering over an NPC
  const updateCurrentTooltip = useCallback(() => {
    if (!currentHoveredNPC.current || !setHoverTooltip) return;
    
    // Get fresh NPC data directly from NPCsInGridManager for most up-to-date info
    const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
    if (!npcsInGrid) return;
    
    // Find the current NPC being hovered in the fresh data
    const npc = Object.values(npcsInGrid).find(n => n && n.id === currentHoveredNPC.current.id);
    if (!npc) {
      // NPC no longer exists, clear tooltip
      setHoverTooltip(null);
      currentHoveredNPC.current = null;
      stopTooltipTimer();
      return;
    }
    
    // Generate fresh tooltip content with updated data
    const tooltipContent = generateNPCTooltipContent(npc, strings);
    
    // Update tooltip with fresh content, keeping same position
    if (currentHoveredNPC.current.tooltipData) {
      setHoverTooltip({
        x: currentHoveredNPC.current.tooltipData.x,
        y: currentHoveredNPC.current.tooltipData.y,
        content: tooltipContent
      });
    }
  }, [gridId, strings, setHoverTooltip, stopTooltipTimer]);

  // Start tooltip update timer for time-based data (graze countdowns, etc.)
  const startTooltipTimer = useCallback(() => {
    if (tooltipUpdateInterval.current) return; // Already running
    
    tooltipUpdateInterval.current = setInterval(() => {
      // Call updateCurrentTooltip directly without dependencies to ensure fresh data
      if (!currentHoveredNPC.current || !setHoverTooltip) return;
      
      // Get fresh NPC data directly from NPCsInGridManager for most up-to-date info
      const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
      if (!npcsInGrid) return;
      
      // Find the current NPC being hovered in the fresh data
      const npc = Object.values(npcsInGrid).find(n => n && n.id === currentHoveredNPC.current.id);
      if (!npc) {
        // NPC no longer exists, clear tooltip
        setHoverTooltip(null);
        currentHoveredNPC.current = null;
        if (tooltipUpdateInterval.current) {
          clearInterval(tooltipUpdateInterval.current);
          tooltipUpdateInterval.current = null;
        }
        return;
      }
      
      // Generate fresh tooltip content with updated data
      const tooltipContent = generateNPCTooltipContent(npc, strings);
      
      // Update tooltip with fresh content, keeping same position
      if (currentHoveredNPC.current.tooltipData) {
        setHoverTooltip({
          x: currentHoveredNPC.current.tooltipData.x,
          y: currentHoveredNPC.current.tooltipData.y,
          content: tooltipContent
        });
      }
    }, 1000); // Update every second
  }, [gridId, strings, setHoverTooltip]); // Include direct dependencies instead of updateCurrentTooltip

  // Update tooltip when NPC data changes (making tooltips reactive)
  useEffect(() => {
    updateCurrentTooltip();
  }, [npcs, updateCurrentTooltip]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      stopTooltipTimer();
      stopCursorUpdateInterval();
    };
  }, [stopTooltipTimer, stopCursorUpdateInterval]);
  
  // Render NPCs to canvas
  const renderNPCs = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !npcs) return;
    
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
    
    // First render all attack range indicators (behind NPCs)
    npcs.forEach(npc => {
      if (!npc || !npc.position || typeof npc.position.x === 'undefined' || typeof npc.position.y === 'undefined') {
        return;
      }
      renderNPCAttackRange(ctx, npc, TILE_SIZE);
    });
    
    // Then render NPCs and their overlays
    for (const npc of npcs) {
      if (!npc || !npc.position || typeof npc.position.x === 'undefined' || typeof npc.position.y === 'undefined') {
        continue; // Skip NPCs without valid position data
      }
      
      renderSingleNPC(ctx, npc, TILE_SIZE);
      await renderNPCOverlay(ctx, npc, TILE_SIZE);
    }
  }, [npcs, TILE_SIZE, checkQuestNPCStatus, checkTradeNPCStatus, checkKentNPCStatus, getNPCRenderPosition, currentPlayer]);

  // Store renderNPCs function in ref for animation loop access
  useEffect(() => {
    renderNPCsRef.current = renderNPCs;
    // Trigger immediate render when function is first set
    if (npcs && npcs.length > 0) {
      // RenderNPCs function ready
      renderNPCs();
    }
  }, [renderNPCs, npcs]);

  // Render a single NPC
  const renderSingleNPC = (ctx, npc, TILE_SIZE) => {
    // Use interpolated position for smooth movement
    const renderPos = getNPCRenderPosition(npc);
    const x = renderPos.x * TILE_SIZE;
    const y = renderPos.y * TILE_SIZE;
    
    // Removed bounce offset - no longer bouncing
    
    // Check if we have custom SVG art for this NPC type
    const customArt = NPC_ART_MAPPING[npc.type];
    
    if (customArt) {
      // For now, skip SVG loading since it's async and we don't have any NPC art yet
      // Just use emoji rendering
      renderNPCEmoji(ctx, npc, x, y, TILE_SIZE);
    } else {
      // Render NPC as emoji symbol (fallback for NPCs without SVG art)
      renderNPCEmoji(ctx, npc, x, y, TILE_SIZE);
    }
  };

  // Render NPC as emoji symbol in canvas
  const renderNPCEmoji = (ctx, npc, x, y, TILE_SIZE) => {
    ctx.save();
    ctx.font = `${TILE_SIZE * 0.8}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Position text in center of tile
    const centerX = x + TILE_SIZE / 2;
    const centerY = y + TILE_SIZE / 2;
    
    ctx.fillText(npc.symbol || '❓', centerX, centerY);
    ctx.restore();
  };

  // Render attack range indicator for NPCs
  const renderNPCAttackRange = (ctx, npc, TILE_SIZE) => {
    // Check if range indicators should be shown
    const showRangeIndicator = currentPlayer?.settings?.rangeOn !== false && 
                               (npc.action === 'attack' || npc.action === 'spawn') && 
                               npc.attackrange && 
                               npc.attackrange > 0;
    
    if (!showRangeIndicator) return;
    
    // Use interpolated position for smooth movement with range indicator
    const renderPos = getNPCRenderPosition(npc);
    const centerX = (renderPos.x + 0.5) * TILE_SIZE; // Center of the tile
    const centerY = (renderPos.y + 0.5) * TILE_SIZE;
    
    // Removed bounce offset - no longer bouncing
    
    const radius = npc.attackrange * TILE_SIZE;
    
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 100, 0.3)'; // Yellow for enemies (matching original)
    ctx.setLineDash([5, 5]); // Dashed line
    ctx.lineWidth = 2;
    
    // Draw circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  };

  // Render overlay for an NPC (status indicators)
  const renderNPCOverlay = async (ctx, npc, TILE_SIZE) => {
    // Determine what overlay to show for this NPC
    let overlayType = null;
    
    // Check quest NPCs first (including Kent)
    if (npc.action === 'quest' && checkQuestNPCStatus) {
      overlayType = await checkQuestNPCStatus(npc);
      
      // For Kent, also check affordable offers if no quest overlay
      if (!overlayType && npc.type === 'Kent' && checkKentNPCStatus) {
        overlayType = checkKentNPCStatus(npc);
      }
    }
    // Check trade NPCs
    else if (npc.action === 'trade' && checkTradeNPCStatus) {
      overlayType = checkTradeNPCStatus(npc);
    }
    
    if (!overlayType) return; // No overlay needed
    
    // For trade NPCs, overlayType might be the trade item symbol
    // For other NPCs, it's a status like 'completed', 'available', etc.
    let svgFileName = OVERLAY_SVG_MAPPING[overlayType];
    
    if (!svgFileName && overlayType && overlayType.length <= 3) {
      // Trade NPC with item symbol - use hand.svg as fallback
      svgFileName = OVERLAY_SVG_MAPPING['available']; // hand.svg
    }
    
    if (svgFileName) {
      // Use interpolated position for overlays to match NPC movement  
      const interpolatedPos = getNPCRenderPosition(npc);
      const x = interpolatedPos.x * TILE_SIZE;
      const y = interpolatedPos.y * TILE_SIZE;
      
      // Removed bounce offset - no longer bouncing
      
      // Position overlay in lower-left corner of the NPC
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
      
      const overlayX = x + 2; // Small offset from left edge
      const overlayY = y + TILE_SIZE - overlaySize - 2; // Lower corner
      
      const overlayTexture = await SVGAssetManager.getOverlayTexture(
        svgFileName, 
        overlaySize
      );
      
      if (overlayTexture) {
        ctx.drawImage(overlayTexture, overlayX, overlayY, overlaySize, overlaySize);
      } else {
        console.warn(`Failed to load overlay texture for NPC ${npc.type}: ${svgFileName}`);
      }
    }
  };

  // Re-render when NPCs change or TILE_SIZE changes
  // This ensures NPCs appear immediately when the component mounts
  useEffect(() => {
    if (renderNPCsRef.current) {
      renderNPCsRef.current();
    }
  }, [npcs, TILE_SIZE, checkQuestNPCStatus, checkTradeNPCStatus, checkKentNPCStatus, currentPlayer, renderNPCs]);

  // Handle canvas clicks and convert to grid coordinates
  const handleCanvasClick = useCallback((event) => {
    if (!onNPCClick) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const colIndex = Math.floor(x / TILE_SIZE);
    const rowIndex = Math.floor(y / TILE_SIZE);
    
    // Find NPC at this position
    const npc = npcs?.find(n => {
      const renderPos = getNPCRenderPosition(n);
      return Math.floor(renderPos.x) === colIndex && Math.floor(renderPos.y) === rowIndex;
    });
    
    if (npc) {
      // NPC found - handle the click and stop propagation
      event.preventDefault();
      event.stopPropagation();
      
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
        setActiveStation,
        isDeveloper
      });
    } else {
      // No NPC found - forward this click to the grid by finding the underlying element
      const canvas = canvasRef.current;
      if (canvas) {
        // Temporarily hide the canvas so we can find what's underneath
        canvas.style.pointerEvents = 'none';
        
        // Find the element at this position
        const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
        
        // Restore canvas pointer events
        canvas.style.pointerEvents = 'auto';
        
        // If we found an element below, simulate a click on it
        if (elementBelow) {
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: event.clientX,
            clientY: event.clientY,
            button: event.button,
            buttons: event.buttons
          });
          elementBelow.dispatchEvent(clickEvent);
        }
      }
    }
  }, [onNPCClick, npcs, TILE_SIZE, getNPCRenderPosition]);

  // Start cursor update interval for attack NPCs
  const startCursorUpdateInterval = useCallback((npc, canvas) => {
    // Only start for attack NPCs
    if (npc.action !== 'attack' && npc.action !== 'spawn') return;
    
    console.log('🎯 Starting cursor update interval for attack NPC:', npc.id);
    
    // Clear any existing interval
    if (cursorUpdateInterval.current) {
      clearInterval(cursorUpdateInterval.current);
      cursorUpdateInterval.current = null;
    }
    
    // Check cursor status every 100ms
    cursorUpdateInterval.current = setInterval(() => {
      // Make sure we're still hovering over the same NPC
      if (!currentHoveredNPC.current || currentHoveredNPC.current.id !== npc.id) {
        console.log('🎯 Stopping cursor update - no longer hovering');
        if (cursorUpdateInterval.current) {
          clearInterval(cursorUpdateInterval.current);
          cursorUpdateInterval.current = null;
        }
        return;
      }
      
      // Update cursor based on current cooldown status
      const cursorClass = getNPCCursorClass(npc);
      const currentTime = Date.now();
      console.log('🎯 Cursor update check:', {
        npc: npc.id,
        cursorClass,
        currentTime,
        globalAttackCooldown: getAttackCooldownStatus().cooldownEnd,
        isOnCooldown: getAttackCooldownStatus().isOnCooldown
      });
      setCanvasCursor(canvas, cursorClass);
    }, 100);
  }, []);

  // Handle mouse events for tooltips and dynamic cursor
  const handleCanvasMouseMove = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const colIndex = Math.floor(x / TILE_SIZE);
    const rowIndex = Math.floor(y / TILE_SIZE);
    
    // Find NPC at this position
    const npc = npcs?.find(n => {
      const renderPos = getNPCRenderPosition(n);
      return Math.floor(renderPos.x) === colIndex && Math.floor(renderPos.y) === rowIndex;
    });
    
    if (npc) {
      // NPC found - set appropriate cursor and handle tooltip
      const cursorClass = getNPCCursorClass(npc);
      setCanvasCursor(canvas, cursorClass);
      
      // Generate tooltip content using shared function
      const tooltipContent = generateNPCTooltipContent(npc, strings);
      
      // Position tooltip at mouse position and track which NPC is being hovered
      if (setHoverTooltip) {
        const tooltipPosition = calculateTooltipPosition(event.clientX, event.clientY);
        const tooltipData = {
          x: tooltipPosition.x,
          y: tooltipPosition.y,
          content: tooltipContent,
        };
        setHoverTooltip(tooltipData);
        
        // Store current hovered NPC and tooltip position for reactive updates
        currentHoveredNPC.current = {
          id: npc.id,
          tooltipData: tooltipData
        };
        
        // Start timer for time-based tooltip updates (graze countdowns, etc.)
        startTooltipTimer();
        
        // Start cursor update interval for attack NPCs
        startCursorUpdateInterval(npc, canvas);
      }
    } else {
      // No NPC - show default cursor and clear tooltip
      setCanvasCursor(canvas, null); // Reset to default
      if (setHoverTooltip) {
        setHoverTooltip(null);
      }
      // Clear tracked hovered NPC and stop timers
      currentHoveredNPC.current = null;
      stopTooltipTimer();
      stopCursorUpdateInterval();
    }
  }, [onMouseEnter, setHoverTooltip, strings, npcs, TILE_SIZE, getNPCRenderPosition, startTooltipTimer, stopTooltipTimer, startCursorUpdateInterval, stopCursorUpdateInterval]);

  const handleCanvasMouseLeave = useCallback((event) => {
    // Clear tooltip when leaving canvas
    if (setHoverTooltip) {
      setHoverTooltip(null);
    }
    
    // Clear tracked hovered NPC and stop timers
    currentHoveredNPC.current = null;
    stopTooltipTimer();
    stopCursorUpdateInterval();
    
    if (onMouseLeave) {
      onMouseLeave(event);
    }
  }, [onMouseLeave, setHoverTooltip, stopTooltipTimer]);


  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      onMouseMove={handleCanvasMouseMove}
      onMouseLeave={handleCanvasMouseLeave}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 15, // Same as DOM NPCs
        pointerEvents: 'auto'
      }}
    />
  );
};

// Export component without complex memoization to ensure position updates are seen
export const RenderNPCsCanvas = RenderNPCsCanvasComponent;