import './App.css';
import './UI/Panel.css';

import React, { useEffect, useRef } from 'react';
import { useGridState } from './GridState/GridStateContext'; 
import { handleNPCClick } from './GameFeatures/NPCs/NPCHelpers';
import { handleAttackOnPC } from './GameFeatures/Combat/Combat';


const DynamicRenderer = ({
  TILE_SIZE,
  setInventory,
  setResources,
  currentPlayer,
  setCurrentPlayer,
  onNPCClick, // This is needed because of the Quest NPCs and their Panels
  onPCClick,  // This is needed for the Social Panel
  masterResources,
}) => {
  const gridState = useGridState(); 
  const masterResourcesRef = useRef(masterResources);  // ✅ Create a ref to hold masterResources
  useEffect(() => {
    // ✅ Keep the ref updated whenever masterResources changes
    masterResourcesRef.current = masterResources;
  }, [masterResources]);

  const containerRef = useRef(null); 
  const tooltipRef = useRef(null); 
  const animationFrameId = useRef(null); 
  const reloadRef = useRef(0);  // Stores the next allowed attack time
  const rangeIndicatorRef = useRef(null);

  const npcElements = useRef(new Map());
  const pcElements = useRef(new Map());


  useEffect(() => {
    console.log("🔄 Re-rendering PCs! Latest gridState:", gridState);
    const container = containerRef.current;
    if (!container) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-container';
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '20';
    tooltip.style.pointerEvents = 'none'; 
    tooltip.style.display = 'none'; 
    container.appendChild(tooltip);
    tooltipRef.current = tooltip;


    ///////////////////////////////////////////////////////
    const renderNPCs = () => {
      const npcs = Object.values(gridState?.npcs || {});
      const currentTime = Date.now();

      npcs.forEach((npc) => {
        let npcElement = npcElements.current.get(npc.id);

        if (!npcElement) {
          npcElement = document.createElement('div');
          npcElement.className = 'npc';
          npcElement.style.position = 'absolute';
          npcElement.style.width = `${TILE_SIZE}px`;
          npcElement.style.height = `${TILE_SIZE}px`;
          npcElement.style.fontSize = `${TILE_SIZE * 0.7}px`;
          npcElement.style.display = 'flex';
          npcElement.style.alignItems = 'center';
          npcElement.style.justifyContent = 'center';
          npcElement.style.zIndex = 15;
          container.appendChild(npcElement);
          npcElements.current.set(npc.id, npcElement);
        } 

        // ✅ Update cursor dynamically
        if (npc.action === 'attack' || npc.action === 'spawn') {
          npcElement.style.cursor = currentTime < reloadRef.current ? 'wait' : 'crosshair';
        } else if (npc.action === 'quest' || npc.action === 'heal') {
          npcElement.style.cursor = 'pointer';
        } else {
          npcElement.style.cursor = 'pointer';
        }

        npcElement.textContent = npc.symbol;
        npcElement.style.top = `${npc.position.y * TILE_SIZE}px`;
        npcElement.style.left = `${npc.position.x * TILE_SIZE}px`;

        // ✅ Attach event listener only once per NPC
        if (!npcElement.hasClickListener) {
          npcElement.addEventListener('click', () => {
            tooltip.style.display = 'none';
            const currentTime = Date.now();
            if (npc.action === 'attack' || npc.action === 'spawn') {
              if (currentTime < reloadRef.current) {
                console.log("Attack on cooldown!");
                npcElement.style.cursor = 'wait';
                return;
              }
              reloadRef.current = currentTime + (currentPlayer.speed * 1000); // Apply cooldown
            }
            if (npc.action === 'quest' || npc.action === 'heal') {
              onNPCClick(npc); // Open quest/healing panel
            } else {
              handleNPCClick(npc, Math.round(npc.position.y), Math.round(npc.position.x), setInventory, setResources, currentPlayer, TILE_SIZE, masterResourcesRef.current);
            }
          });

          // ✅ Add hover event listeners for NPC tooltips
          npcElement.addEventListener('mouseenter', (event) => handleNPCHover(event, npc, tooltipRef.current, TILE_SIZE));
          npcElement.addEventListener('mouseleave', () => handleNPCHoverLeave(tooltipRef.current));

          npcElement.hasClickListener = true; // ✅ Prevent duplicate listeners
        }
      });

      // Cleanup: Remove NPC elements no longer in gridState
      npcElements.current.forEach((_, id) => {
        if (!npcs.find((npc) => npc.id === id)) {
          const element = npcElements.current.get(id);
          container.removeChild(element);
          npcElements.current.delete(id);
        }
      });
    };

    ///////////////////////////////////////////////////////
    // Function to render all PCs
    const renderPCs = () => {
      const pcs = Object.values(gridState?.pcs || {});
      
      pcs.forEach((pc) => {

        let pcElement = pcElements.current.get(pc.playerId);

        if (!pcElement) {
          // Create a new PC element if it doesn’t exist
          pcElement = document.createElement('div');
          pcElement.className = 'pc';
          Object.assign(pcElement.style, {
            position: 'absolute',
            width: `${TILE_SIZE}px`,
            height: `${TILE_SIZE}px`,
            fontSize: `${TILE_SIZE * 0.7}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 16,
            cursor: 'pointer',
          });

          container.appendChild(pcElement);
          pcElements.current.set(pc.playerId, pcElement);

          // Attach event listeners for click and hover interactions
          pcElement.addEventListener('click', () => {
            tooltip.style.display = 'none';
            onPCClick(pc); // Open Social Panel
            handlePCClick(pc, currentPlayer, currentPlayer.location.g, TILE_SIZE);
          });

          pcElement.addEventListener('mouseenter', (event) => handlePCHover(event, pc, tooltip, TILE_SIZE));
          pcElement.addEventListener('mouseleave', () => handlePCHoverLeave(tooltip));

          container.appendChild(pcElement);
          pcElements.current.set(pc.playerId, pcElement);
        }

        if (pc.iscamping) {
          pcElement.textContent = '⛺️';  // Camping PC icon
        } else if (pc.hp <= 0) {
          pcElement.textContent = '💀';  // Dead PC icon
        } else if (pc.hp < 20) {
          pcElement.textContent = '🤢';  // Low HP icon
        } else {
          pcElement.textContent = '😊';  // Normal icon
        }

        // Update position of the PC
        pcElement.style.top = `${pc.position.y * TILE_SIZE}px`;
        pcElement.style.left = `${pc.position.x * TILE_SIZE}px`;


        // ✅ If this is the current player, update the range indicator
        if (String(pc.playerId) === String(currentPlayer._id) && currentPlayer.range) {
          if (!rangeIndicatorRef.current) {
            const rangeIndicator = document.createElement("div");
            rangeIndicator.className = "range-indicator";
            rangeIndicator.style.position = "absolute";
            rangeIndicator.style.borderRadius = "50%";
            rangeIndicator.style.backgroundColor = "rgba(0, 100, 255, 0.08)"; // ✅ Light blue translucent effect
            rangeIndicator.style.zIndex = 10;
            container.appendChild(rangeIndicator);
            rangeIndicatorRef.current = rangeIndicator;
          }

          const playerCenterX = pc.position.x * TILE_SIZE + TILE_SIZE / 2; // ✅ Center X
          const playerCenterY = pc.position.y * TILE_SIZE + TILE_SIZE / 2; // ✅ Center Y
          const rangeSize = currentPlayer.range * TILE_SIZE * 1.8; // Diameter, not radius

          rangeIndicatorRef.current.style.width = `${rangeSize}px`;
          rangeIndicatorRef.current.style.height = `${rangeSize}px`;
          rangeIndicatorRef.current.style.left = `${playerCenterX - rangeSize / 2}px`; // ✅ Centered Left
          rangeIndicatorRef.current.style.top = `${playerCenterY - rangeSize / 2}px`;  // ✅ Centered Top
          rangeIndicatorRef.current.style.display = "block"; // Ensure it's visible
        }


      });

      // Cleanup: Remove PC elements that are no longer present in gridState
      pcElements.current.forEach((_, id) => {
        if (!pcs.find((pc) => pc.playerId === id)) {
          const element = pcElements.current.get(id);
          container.removeChild(element);
          pcElements.current.delete(id);
        }
      });
    };
    
    // Start the rendering loop for NPCs and PCs
    const startRenderingLoop = () => {
      const loop = () => {
        renderNPCs();
        renderPCs(); 
        animationFrameId.current = requestAnimationFrame(loop);
      };
      loop();
    };

    startRenderingLoop();

    // Cleanup function to properly remove elements and event listeners
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      npcElements.current.forEach((npcElement) => {
        npcElement.removeEventListener('click', handleNPCClick);
        npcElement.removeEventListener('mouseenter', handleNPCHover);
        npcElement.removeEventListener('mouseleave', handleNPCHoverLeave);
        container.removeChild(npcElement);
      });
      npcElements.current.clear();

      pcElements.current.forEach((pcElement) => {
        pcElement.removeEventListener('click', handlePCClick);
        pcElement.removeEventListener('mouseenter', handlePCHover);
        pcElement.removeEventListener('mouseleave', handlePCHoverLeave);
        container.removeChild(pcElement);
      });
      pcElements.current.clear();

      container.removeChild(tooltip);
    };
  }, [gridState, TILE_SIZE, handleNPCClick]); // Depend on gridState and TILE_SIZE

  return (
    <>
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }} />
    </>
  );
};


// CLICKING ON A PC
//
function handlePCClick(pc, currentPlayer, gridId, TILE_SIZE) {
  if (!pc) {
      console.warn("handlePCClick was called with an undefined PC.");
      return;
  }
  if (String(pc.playerId) !== String(currentPlayer._id) && pc.hp > 0 && !pc.iscamping) {
    handleAttackOnPC(pc, currentPlayer, gridId, TILE_SIZE);
  }
}


// PC & NPC HOVER
// CUSTOM TOOLTIP CODE FOR NPCS AND PCS

function handlePCHover(event, pc, tooltip, TILE_SIZE) {
  let tooltipContent = `<p>${pc.username}</p><p>❤️‍🩹 HP: ${pc.hp}</p>`;
  // ✅ Add "Camping" if pc.iscamping is true
  if (pc.iscamping) {
    tooltipContent += `<p>🏕️ Camping</p>`;
  }

  tooltip.innerHTML = tooltipContent;
  tooltip.style.top = `${event.target.offsetTop - 60}px`;
  tooltip.style.left = `${event.target.offsetLeft + TILE_SIZE / 2 - tooltip.offsetWidth / 2}px`;
  tooltip.style.display = 'block';
}

function handlePCHoverLeave(tooltip) {
  tooltip.style.display = 'none'; // Hide tooltip
}

function handleNPCHover(event, npc, tooltip, TILE_SIZE) {
  let tooltipContent = `<p>${npc.type}</p>`; // Use 'let' instead of 'const'

  console.log('NPC tooltip in RenderDynamic');

  switch (npc.action) {
    case 'graze': {
      switch (npc.state) {
        case 'processing':
          tooltipContent = `<p>${npc.type}</p><p>is ready.</p>`;
          break;
        case 'hungry':
          tooltipContent = `<p>${npc.type}</p><p>is hungry and</p><p>looking for grass.</p>`;
          break;
        case 'grazing': {
          let countdownText = "";
          if (npc.grazeEnd) {
            const remainingTime = Math.max(0, npc.grazeEnd - Date.now());
            const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
            countdownText = `<p>${minutes}m ${seconds}s</p>`;
          }
          tooltipContent = `<p>${npc.type}</p><p>is grazing.</p>${countdownText}`;
          break;
          }
        case 'idle':
          tooltipContent = `<p>Zzzz...</p>`;
          break;
        case 'roam':
          tooltipContent = `<p>${npc.type}</p><p>is roaming.</p>`;
          break;
        case 'stall':
          tooltipContent = `<p>${npc.type}</p><p>is looking for an Animal Stall.</p>`;
          break;
        default:
          tooltipContent = `<p>${npc.type}</p>`;
          break;
      }
      break;
    }
    case 'quest':
      tooltipContent = `<p>${npc.type}</p><p>Quest, anyone?</p>`;
      break;
    case 'attack':
    case 'spawn':
      tooltipContent = `<p>${npc.type}</p><p>HP: ${npc.hp}/${npc.maxhp}</p>`;
      break;
    default:
      tooltipContent = `<p>${npc.type}</p>`;
      break;
  }

  tooltip.innerHTML = tooltipContent;
  tooltip.style.top = `${event.target.offsetTop - 60}px`;
  tooltip.style.left = `${event.target.offsetLeft + TILE_SIZE / 2 - tooltip.offsetWidth / 2}px`;
  tooltip.style.display = 'block'; // Show tooltip
}

function handleNPCHoverLeave(tooltip) {
  tooltip.style.display = 'none'; // Hide tooltip
}

export default DynamicRenderer;