// import React from 'react';
// import PCComponent from './PCComponent';

// // FTUE Cave dungeon grid ID - players in this grid should only see themselves
// const FTUE_CAVE_GRID_ID = '695bd5b76545a9be8a36ee22';

// /**
//  * DOM-based PC (Player Character) renderer - uses the original PCComponent
//  */
// export const RenderPCsDOM = ({
//   pcs,
//   TILE_SIZE,
//   currentPlayer,
//   gridId,
//   onPCClick,
//   setCurrentPlayer,
//   setInventory,
//   setBackpack,
//   masterResources,
//   strings,
//   connectedPlayers
// }) => {
//   return (
//     <div
//       style={{
//         position: 'absolute',
//         top: 0,
//         left: 0,
//         width: `${64 * TILE_SIZE}px`,
//         height: `${64 * TILE_SIZE}px`,
//         overflow: 'hidden', // Clip range indicators at grid edges
//         pointerEvents: 'none', // Let interactions pass through to underlying layers
//         zIndex: 16, // Match PC zIndex
//       }}
//     >
//       {pcs.map((pc) => {
//         // Skip PCs without valid position data
//         if (!pc || !pc.position || typeof pc.position.x === 'undefined' || typeof pc.position.y === 'undefined') {
//           console.warn('PC missing position data:', pc);
//           return null;
//         }

//         const isCurrentPlayer = String(pc.playerId) === String(currentPlayer?._id);

//         // In the FTUE Opening dungeon, only render the current player (hide all other PCs)
//         if (gridId === FTUE_CAVE_GRID_ID && !isCurrentPlayer) {
//           return null;
//         }

//         return (
//           <div
//             key={`pc-container-${pc.playerId}`}
//             style={{
//               pointerEvents: 'auto', // Re-enable pointer events for individual PCs
//             }}
//           >
//             <PCComponent
//               key={pc.playerId}
//               pc={pc}
//               TILE_SIZE={TILE_SIZE}
//               currentPlayer={currentPlayer}
//               isCurrentPlayer={isCurrentPlayer}
//               onPCClick={onPCClick}
//               setCurrentPlayer={setCurrentPlayer}
//               setInventory={setInventory}
//               setBackpack={setBackpack}
//               masterResources={masterResources}
//               strings={strings}
//               setHoverTooltip={() => {}} // TODO: Add hover tooltip support
//               connectedPlayers={connectedPlayers}
//             />
//           </div>
//         );
//       })}
//     </div>
//   );
// };

// export default RenderPCsDOM;