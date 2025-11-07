// import React, { useEffect, useState, useRef } from 'react';
// import { getDerivedRange } from '../Utils/worldHelpers';
// import { handleNPCClick } from '../GameFeatures/NPCs/NPCUtils';
// import { renderPositions } from '../PlayerMovement';
// import playersInGridManager from '../GridState/PlayersInGrid';
// import FloatingTextManager from '../UI/FloatingText';
// import { useNPCOverlay } from '../UI/NPCOverlayContext';
// import { getLocalizedString } from '../Utils/stringLookup';
// import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
// import { generateNPCTooltipContent } from '../GameFeatures/NPCs/NPCInteractionUtils';
// import { getNPCCursorClass, applyCursorClass, setGlobalAttackCooldown, getGlobalAttackCooldown } from '../Utils/CursorUtils';
// import './NPCComponent.css';

// // Note: Global attack cooldown is now managed by CursorUtils

// const NPCComponent = ({ 
//   npc, 
//   TILE_SIZE,
//   currentPlayer,
//   setHoverTooltip,
//   onNPCClick,
//   handleAttackClick,
//   gridId,
//   strings,
//   masterResources,
//   playersInGrid,
//   // Status checking functions
//   checkQuestNPCStatus,
//   checkTradeNPCStatus,
//   checkKentNPCStatus,
//   getOverlayContent,
//   // Props for handleNPCClick
//   setInventory,
//   setBackpack,
//   setResources,
//   setCurrentPlayer,
//   masterSkills,
//   setModalContent,
//   setIsModalOpen,
//   updateStatus,
//   openPanel,
//   setActiveStation,
//   masterTrophies,
//   globalTuning,
//   useCanvasResources
// }) => {
//   const { getNPCOverlay } = useNPCOverlay();
//   const [position, setPosition] = useState({ x: npc.position.x, y: npc.position.y });
//   const [isHovered, setIsHovered] = useState(false);
//   const [, forceUpdate] = useState({});
//   const [overlayType, setOverlayType] = useState(null);
//   const [speechBubble, setSpeechBubble] = useState(null);
//   const [relationshipOutcome, setRelationshipOutcome] = useState(null);
//   const suppressTooltipRef = useRef(false);
//   const elementRef = useRef(null);
//   const prevTileSizeRef = useRef(TILE_SIZE);

//   // Update position when NPC moves
//   useEffect(() => {
//     const overridePos = renderPositions[npc.id];
//     setPosition(overridePos || npc.position);
//   }, [npc.position, npc.id]);
  
//   // Detect TILE_SIZE changes to disable transitions
//   const tileSizeChanged = prevTileSizeRef.current !== TILE_SIZE;
//   useEffect(() => {
//     prevTileSizeRef.current = TILE_SIZE;
//   }, [TILE_SIZE]);

//   // Subscribe to conversation changes
//   useEffect(() => {
//     const updateConversation = () => {
//       // For conversation, use NPC type (name) as the identifier, not numeric ID
//       const speechId = npc.type; // e.g., "Kent", "Farmer", etc.
//       const speech = ConversationManager.getSpeech(speechId);
//       setSpeechBubble(speech);
      
//       const outcome = ConversationManager.getOutcome(speechId);
//       setRelationshipOutcome(outcome);
//     };
    
//     updateConversation();
//     const unsubscribe = ConversationManager.subscribe(updateConversation);
//     return unsubscribe;
//   }, [npc.type]);

//   // Handle NPC overlay status
//   useEffect(() => {
//     const updateOverlay = async () => {
//       let overlay = null;
      
//       // Check quest NPCs first (including Kent)
//       if (npc.action === 'quest' && checkQuestNPCStatus) {
//         overlay = await checkQuestNPCStatus(npc);
        
//         // For Kent, also check affordable offers if no quest overlay
//         if (!overlay && npc.type === 'Kent' && checkKentNPCStatus) {
//           overlay = checkKentNPCStatus(npc);
//         }
//       }
//       // Check trade NPCs
//       else if (npc.action === 'trade' && checkTradeNPCStatus) {
//         overlay = checkTradeNPCStatus(npc);
//       }
      
//       setOverlayType(overlay);
//     };
    
//     updateOverlay();
//   }, [npc, currentPlayer?.inventory, currentPlayer?.backpack, currentPlayer?.activeQuests, currentPlayer?.completedQuests, currentPlayer?.kentOffers, currentPlayer?.firsttimeuser, currentPlayer?.ftuestep, masterResources, checkQuestNPCStatus, checkTradeNPCStatus, checkKentNPCStatus]);

//   // Get current cursor class using shared logic
//   const getCurrentCursorClass = () => {
//     return getNPCCursorClass(npc);
//   };
  
//   const handleClick = () => {
//     const overlayData = getNPCOverlay(npc.id);
//     if (overlayData && !overlayData.clickable) {
//       return;
//     }

//     const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
//     if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead) {
//       return;
//     }

//     setHoverTooltip(null);
//     suppressTooltipRef.current = true;
//     const currentTime = Date.now();

//     if (npc.action === 'attack' || npc.action === 'spawn') {
//       const pcState = playersInGrid?.[gridId]?.pcs?.[String(currentPlayer._id)];
//       const speed = pcState?.speed ?? currentPlayer.baseSpeed ?? 5;
//       if (currentTime < getGlobalAttackCooldown()) return;
//       setGlobalAttackCooldown(currentTime + (speed * 1000));
//     }

//     if (npc.action === 'quest' || npc.action === 'heal' || npc.action === 'worker' || npc.action === 'trade') {
//       const playerPos = playersInGridManager.getPlayerPosition(currentPlayer?.location?.g, String(currentPlayer._id));
//       const npcPos = { x: Math.round(npc.position?.x || 0), y: Math.round(npc.position?.y || 0) };
      
//       if (playerPos && typeof playerPos.x === 'number' && typeof playerPos.y === 'number') {
//         const distance = Math.sqrt(Math.pow(playerPos.x - npcPos.x, 2) + Math.pow(playerPos.y - npcPos.y, 2));
//         const playerRange = getDerivedRange(currentPlayer, masterResources);
        
//         if (distance > playerRange) {
//           FloatingTextManager.addFloatingText(24, npcPos.x, npcPos.y, TILE_SIZE);
//           return;
//         }
//       }
      
//       onNPCClick(npc);
//     } else {
//       handleNPCClick(
//         npc,
//         Math.round(npc.position?.y || 0),
//         Math.round(npc.position?.x || 0),
//         setInventory,
//         setBackpack,
//         setResources,
//         currentPlayer,
//         setCurrentPlayer,
//         TILE_SIZE,
//         masterResources,
//         masterSkills,
//         currentPlayer?.location?.g,
//         setModalContent,
//         setIsModalOpen,
//         updateStatus,
//         openPanel,
//         setActiveStation,
//         strings,
//         masterTrophies,
//         globalTuning
//       );
//     }
//   };

//   const handleMouseEnter = (event) => {
//     if (suppressTooltipRef.current) return;
//     setIsHovered(true);
    
//     // For attack NPCs, start interval to update cursor
//     if (npc.action === 'attack' || npc.action === 'spawn') {
//       const interval = setInterval(() => {
//         const currentTime = Date.now();
//         if (currentTime >= getGlobalAttackCooldown()) {
//           clearInterval(interval);
//           forceUpdate({}); // Force re-render to update cursor
//         }
//       }, 100);
      
//       // Store interval for cleanup
//       elementRef.current._cursorInterval = interval;
//     }
    
//     // Generate tooltip content using shared function for consistency
//     const rect = event.target.getBoundingClientRect();
//     const x = rect.left + TILE_SIZE / 2;
//     const y = rect.top;
    
//     const tooltipContent = generateNPCTooltipContent(npc, strings);
    
//     setHoverTooltip({ x, y, content: tooltipContent });
//   };

//   const handleMouseLeave = () => {
//     suppressTooltipRef.current = false;
//     setIsHovered(false);
//     setHoverTooltip(null);
    
//     // Clear cursor update interval if exists
//     if (elementRef.current?._cursorInterval) {
//       clearInterval(elementRef.current._cursorInterval);
//       delete elementRef.current._cursorInterval;
//     }
//   };

//   const overlayData = getNPCOverlay(npc.id);
//   const isKent = npc.type === 'Kent';
//   // TODO: Implement Kent offers check
//   const hasKentOffers = false;

//   // Get cursor class using shared logic
//   const cursorClass = getCurrentCursorClass();

//   // Check if range indicators should be shown
//   const showRangeIndicator = currentPlayer?.settings?.rangeOn !== false && 
//                              (npc.action === 'attack' || npc.action === 'spawn') && 
//                              npc.attackrange && 
//                              npc.attackrange > 0;

//   return (
//     <>
//       {/* Attack range indicator - renders behind NPC */}
//       {showRangeIndicator && (
//         <div
//           className="attack-range npc-attack-range"
//           data-npc-id={npc.id}
//           style={{
//             position: 'absolute',
//             left: `${position.x * TILE_SIZE - (npc.attackrange * TILE_SIZE) + TILE_SIZE / 2}px`,
//             top: `${position.y * TILE_SIZE - (npc.attackrange * TILE_SIZE) + TILE_SIZE / 2}px`,
//             width: `${npc.attackrange * 2 * TILE_SIZE}px`,
//             height: `${npc.attackrange * 2 * TILE_SIZE}px`,
//             border: '2px dashed rgba(255, 100, 100, 0.5)',
//             borderRadius: '50%',
//             pointerEvents: 'none',
//             zIndex: 5,
//             transition: tileSizeChanged ? 'none' : 'left 1.2s linear, top 1.2s linear',
//           }}
//         />
//       )}
      
//       {/* NPC character */}
//       <div
//         ref={elementRef}
//         className={`npc ${cursorClass} ${isHovered ? 'hovered' : ''}`}
//         style={{
//           position: 'absolute',
//           left: `${position.x * TILE_SIZE}px`,
//           top: `${position.y * TILE_SIZE}px`,
//           width: `${TILE_SIZE}px`,
//           height: `${TILE_SIZE}px`,
//           fontSize: `${TILE_SIZE * 0.7}px`,
//           display: 'flex',
//           alignItems: 'center',
//           justifyContent: 'center',
//           zIndex: 15,
//           pointerEvents: 'auto',
//           transition: tileSizeChanged ? 'none' : 'left 1.2s linear, top 1.2s linear', // Linear for consistent speed
//         }}
//         onMouseDown={handleClick}
//         onMouseEnter={handleMouseEnter}
//         onMouseLeave={handleMouseLeave}
//       >
//       {npc.symbol}
      
//       {/* Overlay visual from status checking - Only render DOM overlay when canvas mode is disabled */}
//       {!useCanvasResources && overlayType && getOverlayContent && (() => {
//         const overlayContent = getOverlayContent(overlayType);
//         if (!overlayContent.emoji) return null;
//         return (
//           <div 
//             className="resource-overlay"
//             style={{
//               position: 'absolute',
//               bottom: '-10%',
//               right: '-10%',
//               fontSize: '0.5em',
//               color: overlayContent.color,
//               pointerEvents: 'none',
//               zIndex: 16,
//             }}
//           >
//             {overlayContent.emoji}
//           </div>
//         );
//       })()}
      
//       {/* NPCOverlay system (existing) */}
//       {overlayData && (
//         <div 
//           className={`npc-overlay ${overlayData.overlay.name}`}
//           style={{
//             position: 'absolute',
//             top: 0,
//             left: 0,
//             width: '100%',
//             height: '100%',
//             pointerEvents: 'none',
//           }}
//         />
//       )}
      
//       {/* Conversation speech bubble */}
//       {speechBubble && (
//         <div 
//           className={`conversation-speech-bubble npc${speechBubble.isMatch ? ' match' : ''}`}
//           style={{
//             position: 'absolute',
//             left: '50%',
//             bottom: '100%',
//             transform: 'translateX(-50%)',
//             marginBottom: `${TILE_SIZE * 0.2}px`,
//             width: `${TILE_SIZE * 1.5}px`,
//             height: `${TILE_SIZE * 1.5}px`,
//             fontSize: `${TILE_SIZE * 0.6}px`,
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//             pointerEvents: 'none',
//             zIndex: 17,
//           }}
//         >
//           <div className="speech-emoji" style={{ fontSize: `${TILE_SIZE * 0.9}px` }}>
//             {speechBubble.topic || speechBubble.emoji}
//           </div>
//         </div>
//       )}
      
//       {/* Relationship outcome VFX */}
//       {relationshipOutcome && (
//         <div 
//           className="relationship-outcome"
//           style={{
//             position: 'absolute',
//             left: '50%',
//             bottom: '100%',
//             transform: 'translateX(-50%)',
//             marginBottom: `${TILE_SIZE * 0.2}px`,
//             pointerEvents: 'none',
//             zIndex: 18,
//             fontSize: `${TILE_SIZE * 0.8}px`,
//           }}
//         >
//           {relationshipOutcome.type === 'positive' ? '👍' : '❌'}
//         </div>
//       )}
      
//       {/* Kent affordable offers indicator */}
//       {hasKentOffers && (
//         <div className="affordable-indicator">!</div>
//       )}
//       </div>
//     </>
//   );
// };

// export default React.memo(NPCComponent);