// import '../App.css';
// import '../UI/Panels/Panel.css';
// import '../UI/Cursor.css';
// import './Render.css';

// import React, { useEffect, useRef, useState, useCallback } from 'react';
// import axios from 'axios';
// import API_BASE from '../config';
// import { getDerivedRange } from '../Utils/worldHelpers';
// import { useGridState } from '../GridState/GridStateContext'; 
// import { usePlayersInGrid } from '../GridState/GridStatePCContext';
// import { renderPositions } from '../PlayerMovement';
// import NPCsInGridManager from '../GridState/GridStateNPCs';
// import playersInGridManager from '../GridState/PlayersInGrid';
// import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
// import questCache from '../Utils/QuestCache';
// import '../GameFeatures/Relationships/Conversation.css';

// // Import our new React components
// import NPCComponent from './NPCComponent';
// import PCComponent from './PCComponent';
// import { RenderNPCsCanvas } from './RenderNPCsCanvas';
// import { generateNPCTooltipContent } from '../GameFeatures/NPCs/NPCInteractionUtils';

// const DynamicRenderer = ({
//   TILE_SIZE,
//   openPanel,
//   setActiveStation,
//   setInventory,
//   setBackpack,
//   setResources,
//   currentPlayer,
//   setCurrentPlayer,
//   onNPCClick,
//   onPCClick,
//   masterResources,
//   masterSkills,
//   masterTrophies,
//   setHoverTooltip, 
//   setModalContent,
//   setIsModalOpen,
//   updateStatus,
//   strings,
//   globalTuning,
//   useCanvasResources,
// }) => {
//   const NPCsInGrid = useGridState();
//   const playersInGrid = usePlayersInGrid();
//   const [conversationVersion, setConversationVersion] = useState(0);
//   const containerRef = useRef(null);
//   const masterResourcesRef = useRef(masterResources);
//   const questNPCStatusRef = useRef({});
  
//   // Clear quest cache when player data changes
//   useEffect(() => {
//     questNPCStatusRef.current = {};
//     // Also invalidate the quest cache to force fresh data
//     questCache.invalidate();
//   }, [currentPlayer?.activeQuests, currentPlayer?.completedQuests]);

//   // Update master resources ref when it changes
//   useEffect(() => {
//     masterResourcesRef.current = masterResources;
//   }, [masterResources]);

//   // Check quest NPC status
//   const checkQuestNPCStatus = useCallback(async (npc) => {
//     if (!currentPlayer) return null;
    
//     // Skip cache for now to ensure reactivity
//     // const cachedStatus = questNPCStatusRef.current[npc.id];
//     // if (cachedStatus?.timestamp && Date.now() - cachedStatus.timestamp < 5000) {
//     //   return cachedStatus.status;
//     // }
    
//     try {
//       // Use cached quests instead of direct API call
//       const allQuests = await questCache.getQuests();
      
//       // Use same filtering logic as NPCPanel
//       let npcQuests = allQuests
//         .filter((quest) => quest.giver === npc.type)
//         .filter((quest) => {
//           const activeQuest = currentPlayer.activeQuests?.find(q => q.questId === quest.title);
//           if (activeQuest) {
//             return activeQuest.completed && !activeQuest.rewardCollected;
//           }
//           return (quest.repeatable === true || quest.repeatable === 'true') || !currentPlayer.completedQuests?.some(q => q.questId === quest.title);
//         });

//       // Apply FTUE filtering for first-time users
//       if (currentPlayer.firsttimeuser === true) {
//         npcQuests = npcQuests.filter((quest) => {
//           const hasFtuestep = quest.ftuestep != null && 
//                              quest.ftuestep !== undefined && 
//                              quest.ftuestep !== '' && 
//                              quest.ftuestep !== 0;
          
//           if (!hasFtuestep) {
//             return false;
//           } else if (quest.ftuestep > (currentPlayer.ftuestep || 0)) {
//             return false;
//           } else {
//             return true;
//           }
//         });
//       }

//       // Check if any quests have completed rewards to collect
//       const hasCompletedQuests = npcQuests.some(quest => {
//         const activeQuest = currentPlayer.activeQuests?.find(q => q.questId === quest.title);
//         return activeQuest && activeQuest.completed && !activeQuest.rewardCollected;
//       });

//       let status = null;
//       if (hasCompletedQuests) {
//         status = 'completed'; // Show checkmark
//       } else if (npcQuests.length > 0) {
//         status = 'available'; // Show question mark/hand
//       }
      
//       // Skip caching for now to ensure reactivity
//       // questNPCStatusRef.current[npc.id] = {
//       //   status,
//       //   timestamp: Date.now()
//       // };
      
//       return status;
//     } catch (error) {
//       console.error('Error checking quest NPC status:', error);
//       return null;
//     }
//   }, [currentPlayer]);

//   // Check trade NPC status
//   const checkTradeNPCStatus = useCallback((npc) => {
//     if (!npc.symbol || !masterResourcesRef.current) return null;
    
//     const tradeResource = masterResourcesRef.current.find(r => 
//       r.category === 'trader' && r.symbol === npc.symbol
//     );
    
//     if (!tradeResource) return null;
    
//     // Trade NPCs show their trade item symbol as the overlay
//     return tradeResource.input;
//   }, []);

//   // Check Kent NPC status  
//   const checkKentNPCStatus = useCallback((npc) => {
//     if (npc.type !== 'Kent' || !currentPlayer) return null;
    
//     try {
//       const kentOffers = currentPlayer?.kentOffers?.offers || [];
      
//       // Check if player can afford any of Kent's offers
//       const canAffordAny = kentOffers.some(offer => {
//         // Calculate player's total quantity from inventory and backpack
//         const inventoryQty = currentPlayer?.inventory?.find(item => item.type === offer.item)?.quantity || 0;
//         const backpackQty = currentPlayer?.backpack?.find(item => item.type === offer.item)?.quantity || 0;
//         const playerQty = inventoryQty + backpackQty;
        
//         return playerQty >= offer.quantity;
//       });
      
//       return canAffordAny ? 'completed' : null;
//     } catch (error) {
//       console.error('Error checking Kent status:', error);
//       return null;
//     }
//   }, [currentPlayer]);

//   // Subscribe to conversation changes
//   useEffect(() => {
//     const unsubscribe = ConversationManager.subscribe(() => {
//       console.log('🗨️ DynamicRenderer: Conversation changed, triggering update');
//       setConversationVersion(v => v + 1);
//     });
//     return unsubscribe;
//   }, []);


//   // Get overlay content for different types
//   const getOverlayContent = (overlayType) => {
//     switch (overlayType) {
//       case 'exclamation':
//         return { emoji: '❗', color: '#FF6B35' };
//       case 'attack':
//         return { emoji: '⚔️', color: '#DC143C' };
//       case 'completed':
//         return { emoji: '✅', color: '#32CD32' };
//       case 'available':
//         return { emoji: '👋', color: '#FFD700' };
//       case 'ready':
//         return { emoji: '✅', color: 'green' };
//       case 'inprogress':
//         return { emoji: '🕑', color: 'orange' };
//       case 'campaign':
//         return { emoji: '🕐', color: '#FFD700' };
//       case 'voting':
//         return { emoji: '✅', color: 'green' };
//       default:
//         // For trade NPCs, the overlayType is the actual trade item symbol
//         if (overlayType && overlayType.length <= 3) {
//           return { emoji: overlayType, color: '#4B9BFF' };
//         }
//         return { emoji: '', color: '#888' };
//     }
//   };

//   // Get current grid data
//   const gridId = currentPlayer?.location?.g;
  
//   // Memoize NPCs array to prevent unnecessary re-renders
//   // Include timestamp to force updates when NPCs change
//   const npcs = React.useMemo(() => {
//     const npcArray = Object.values(NPCsInGrid?.[gridId]?.npcs || {});
//     // NPCs array updated
//     return npcArray;
//   }, [NPCsInGrid?.[gridId]?.NPCsInGridLastUpdated, gridId]);
  
//   const pcs = Object.values(playersInGrid?.[gridId]?.pcs || {});
  
//   // Helper function to render attack ranges
//   const renderAttackRanges = () => {
//     // All range indicators are now rendered in their respective components (PCComponent and NPCComponent)
//     // for smooth transitions that follow the character movements
//     return [];
//   };

//   return (
//     <div
//       ref={containerRef}
//       style={{
//         position: 'relative',
//         width: `${64 * TILE_SIZE}px`,
//         height: `${64 * TILE_SIZE}px`,
//         overflow: 'hidden',
//       }}
//     >
//       {/* Render attack ranges */}
//       {renderAttackRanges()}
      
//       {/* Canvas NPCs - renders NPCs and overlays as SVG when canvas mode is enabled */}
//       {useCanvasResources && (
//         <RenderNPCsCanvas
//           npcs={npcs}
//           TILE_SIZE={TILE_SIZE}
//           currentPlayer={currentPlayer}
//           globalTuning={globalTuning}
//           gridId={gridId}
//           onNPCClick={onNPCClick}
//           onMouseEnter={(event, npc, rowIndex, colIndex) => {
//             // Generate tooltip content for canvas NPCs
//             const rect = event.currentTarget.getBoundingClientRect();
//             setHoverTooltip({
//               x: rect.left + rect.width / 2,
//               y: rect.top,
//               content: generateNPCTooltipContent(npc, strings),
//             });
//           }}
//           onMouseLeave={() => {
//             setHoverTooltip(null);
//           }}
//           checkQuestNPCStatus={checkQuestNPCStatus}
//           checkTradeNPCStatus={checkTradeNPCStatus}
//           checkKentNPCStatus={checkKentNPCStatus}
//           getOverlayContent={getOverlayContent}
//           strings={strings}
//           masterResources={masterResourcesRef.current}
//           playersInGrid={playersInGrid}
//           setInventory={setInventory}
//           setBackpack={setBackpack}
//           setResources={setResources}
//           setCurrentPlayer={setCurrentPlayer}
//           masterSkills={masterSkills}
//           setModalContent={setModalContent}
//           setIsModalOpen={setIsModalOpen}
//           updateStatus={updateStatus}
//           openPanel={openPanel}
//           setActiveStation={setActiveStation}
//           masterTrophies={masterTrophies}
//           setHoverTooltip={setHoverTooltip}
//         />
//       )}
      
//       {/* DOM NPCs - renders NPCs as React components when canvas mode is disabled */}
//       {!useCanvasResources && npcs.map((npc) => {
//         // Skip NPCs without valid position data
//         if (!npc || !npc.position || typeof npc.position.x === 'undefined' || typeof npc.position.y === 'undefined') {
//           console.warn('NPC missing position data:', npc);
//           return null;
//         }
        
//         return (
//           <NPCComponent
//             key={npc.id}
//             npc={npc}
//             TILE_SIZE={TILE_SIZE}
//             currentPlayer={currentPlayer}
//             setHoverTooltip={setHoverTooltip}
//             onNPCClick={onNPCClick}
//             gridId={gridId}
//             strings={strings}
//             masterResources={masterResourcesRef.current}
//             playersInGrid={playersInGrid}
//             // Status checking functions
//             checkQuestNPCStatus={checkQuestNPCStatus}
//             checkTradeNPCStatus={checkTradeNPCStatus}
//             checkKentNPCStatus={checkKentNPCStatus}
//             getOverlayContent={getOverlayContent}
//             // Props for handleNPCClick
//             setInventory={setInventory}
//             setBackpack={setBackpack}
//             setResources={setResources}
//             setCurrentPlayer={setCurrentPlayer}
//             masterSkills={masterSkills}
//             setModalContent={setModalContent}
//             setIsModalOpen={setIsModalOpen}
//             updateStatus={updateStatus}
//             openPanel={openPanel}
//             setActiveStation={setActiveStation}
//             masterTrophies={masterTrophies}
//             globalTuning={globalTuning}
//             useCanvasResources={useCanvasResources}
//           />
//         );
//       })}
      
//       {/* Render PCs using React components */}
//       {pcs.map((pc) => {
//         // Skip PCs without valid position data
//         if (!pc || !pc.position || typeof pc.position.x === 'undefined' || typeof pc.position.y === 'undefined') {
//           console.warn('PC missing position data:', pc);
//           return null;
//         }
        
//         const isCurrentPlayer = String(pc.playerId) === String(currentPlayer?._id);
        
//         return (
//           <PCComponent
//             key={pc.playerId}
//             pc={pc}
//             TILE_SIZE={TILE_SIZE}
//             currentPlayer={currentPlayer}
//             isCurrentPlayer={isCurrentPlayer}
//             onPCClick={onPCClick}
//             setCurrentPlayer={setCurrentPlayer}
//             setInventory={setInventory}
//             setBackpack={setBackpack}
//             masterResources={masterResourcesRef.current}
//             strings={strings}
//             setHoverTooltip={setHoverTooltip}
//           />
//         );
//       })}
//     </div>
//   );
// };

// export default DynamicRenderer;