// import React, { useEffect, useState, useRef } from 'react';
// import { getDerivedRange } from '../Utils/worldHelpers';
// import { handleNPCClick } from '../GameFeatures/NPCs/NPCUtils';
// import { renderPositions } from '../PlayerMovement';
// import playersInGridManager from '../GridState/PlayersInGrid';
// import FloatingTextManager from '../UI/FloatingText';
// import { useNPCOverlay } from '../UI/NPCOverlayContext';
// import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
// import { getNPCCursorClass, setGlobalAttackCooldown, getGlobalAttackCooldown } from '../Utils/CursorUtils';

// /**
//  * DOM-based NPC renderer - renders NPCs directly without NPCComponent
//  * Note: Overlays and tooltips are now handled by RenderDynamicElements
//  */
// export const RenderNPCsDOM = ({
//   npcs,
//   TILE_SIZE,
//   currentPlayer,
//   globalTuning,
//   gridId,
//   onNPCClick,
//   checkQuestNPCStatus,
//   checkTradeNPCStatus,
//   checkKentNPCStatus,
//   strings,
//   masterResources,
//   playersInGrid,
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
//   masterTrophies
// }) => {
//   const { getNPCOverlay } = useNPCOverlay();
  
//   return (
//     <>
//       {npcs.map((npc) => {
//         // Skip NPCs without valid position data
//         if (!npc || !npc.position || typeof npc.position.x === 'undefined' || typeof npc.position.y === 'undefined') {
//           console.warn('NPC missing position data:', npc);
//           return null;
//         }
        
//         return (
//           <NPCRenderer
//             key={npc.id}
//             npc={npc}
//             TILE_SIZE={TILE_SIZE}
//             currentPlayer={currentPlayer}
//             onNPCClick={onNPCClick}
//             gridId={gridId}
//             strings={strings}
//             masterResources={masterResources}
//             playersInGrid={playersInGrid}
//             getNPCOverlay={getNPCOverlay}
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
//           />
//         );
//       })}
//     </>
//   );
// };

// // Individual NPC renderer component (replaces NPCComponent)
// const NPCRenderer = ({
//   npc,
//   TILE_SIZE,
//   currentPlayer,
//   onNPCClick,
//   gridId,
//   strings,
//   masterResources,
//   playersInGrid,
//   getNPCOverlay,
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
//   globalTuning
// }) => {
//   const [position, setPosition] = useState({ x: npc.position.x, y: npc.position.y });
//   const prevTileSizeRef = useRef(TILE_SIZE);
  
//   // Update position when NPC moves or from render positions override
//   useEffect(() => {
//     const overridePos = renderPositions[npc.id];
//     setPosition(overridePos || npc.position);
//   }, [npc.position, npc.id]);
  
//   // Detect TILE_SIZE changes to disable transitions
//   const tileSizeChanged = prevTileSizeRef.current !== TILE_SIZE;
//   useEffect(() => {
//     prevTileSizeRef.current = TILE_SIZE;
//   }, [TILE_SIZE]);
  
//   const handleClick = () => {
//     const overlayData = getNPCOverlay(npc.id);
//     if (overlayData && !overlayData.clickable) {
//       return;
//     }

//     const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
//     if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead) {
//       return;
//     }

//     const currentTime = Date.now();

//     if (npc.action === 'attack' || npc.action === 'spawn') {
//       const pcState = playersInGrid?.[gridId]?.pcs?.[String(currentPlayer._id)];
//       const speed = pcState?.speed ?? currentPlayer.baseSpeed ?? 5;
//       if (currentTime < getGlobalAttackCooldown()) return;
//       setGlobalAttackCooldown(currentTime + (speed * 1000));
//     }

//     if (npc.action === 'quest' || npc.action === 'heal' || npc.action === 'worker' || npc.action === 'trade') {
//       // Check range (skip on own homestead)
//       const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
//       const playerPos = playersInGridManager.getPlayerPosition(currentPlayer?.location?.g, String(currentPlayer._id));
//       const npcPos = { x: Math.round(npc.position?.x || 0), y: Math.round(npc.position?.y || 0) };

//       if (!isOnOwnHomestead && playerPos && typeof playerPos.x === 'number' && typeof playerPos.y === 'number') {
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
  
//   // Get cursor class using shared logic
//   const cursorClass = getNPCCursorClass(npc);
  
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
//         className={`npc ${cursorClass} npc-dom`}
//         data-npc-type={npc.type}
//         data-npc-id={npc.id}
//         data-npc-x={position.x}
//         data-npc-y={position.y}
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
//           transition: tileSizeChanged ? 'none' : 'left 1.2s linear, top 1.2s linear',
//         }}
//         onMouseDown={handleClick}
//       >
//         {npc.symbol}
//       </div>
//     </>
//   );
// };

// export default RenderNPCsDOM;