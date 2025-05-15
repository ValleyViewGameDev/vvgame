import '../App.css';
import '../UI/Panel.css';

import React, { useEffect, useRef } from 'react';
import { useGridState } from '../GridState/GridStateContext'; 
import { usePlayersInGrid } from '../GridState/GridStatePCContext';
import { handleNPCClick } from '../GameFeatures/NPCs/NPCHelpers';
import { handleAttackOnPC } from '../GameFeatures/Combat/Combat';
import { renderPositions } from '../PlayerMovement';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';


const DynamicRenderer = ({
  TILE_SIZE,
  setInventory,
  setResources,
  currentPlayer,
  setCurrentPlayer,
  onNPCClick, // This is needed because of the Quest NPCs and their Panels
  onPCClick,  // This is needed for the Social Panel
  masterResources
}) => {
  const NPCsInGrid = useGridState(); // Use the updated NPCsInGrid from context
  const playersInGrid = usePlayersInGrid(); // Access PCs via modern PC-specific context

  // console.log("🔄 Re-rendering PCs! Latest playersInGrid:", playersInGrid);
  // console.log("🔄 Re-rendering NPCs! Latest NPCsInGrid:", NPCsInGrid);

  const masterResourcesRef = useRef(masterResources); // Keep masterResources in a ref
  useEffect(() => {
    masterResourcesRef.current = masterResources;
  }, [masterResources]);

  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const animationFrameId = useRef(null);
  const reloadRef = useRef(0); // Stores the next allowed attack time
  // Removed unused rangeIndicatorRef

  const npcElements = useRef(new Map());
  const pcElements = useRef(new Map());



  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const gridId = currentPlayer?.location?.g;
    if (!gridId) return;
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-container';
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '20';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    container.appendChild(tooltip);
    tooltipRef.current = tooltip;

    // Store references at effect entry to avoid stale refs in cleanup
    const npcRefs = npcElements.current;
    const pcRefs = pcElements.current;

    ///////////////////////////////////////////////////////
    const renderNPCs = () => {
      const npcs = Object.values(NPCsInGrid?.[currentPlayer?.location?.g]?.npcs || {});
      
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

        npcElement.textContent = npc.symbol;
        npcElement.style.top = `${npc.position.y * TILE_SIZE}px`;
        npcElement.style.left = `${npc.position.x * TILE_SIZE}px`;

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
              handleNPCClick(npc, Math.round(npc.position.y), Math.round(npc.position.x), setInventory, setResources, currentPlayer, TILE_SIZE, masterResourcesRef.current, gridId);
            }
          });

          npcElement.addEventListener('mouseenter', (event) => handleNPCHover(event, npc, tooltipRef.current, TILE_SIZE));
          npcElement.addEventListener('mouseleave', () => handleNPCHoverLeave(tooltipRef.current));

          npcElement.hasClickListener = true;
        }
      });

      npcElements.current.forEach((_, id) => {
        if (!npcs.find((npc) => npc.id === id)) {
          const element = npcElements.current.get(id);
          container.removeChild(element);
          npcElements.current.delete(id);
        }
      });
    };

    ///////////////////////////////////////////////////////
    const renderPCs = () => {

      const pcs = Object.values(playersInGrid?.[currentPlayer?.location?.g]?.pcs || {});

      pcs.forEach((pc) => {
        // Validate the pc object and its position
        if (!pc || !pc.position || typeof pc.position.x !== 'number' || typeof pc.position.y !== 'number') {
          console.warn('Skipping invalid PC:', pc);
          return; // Skip this PC if it's invalid
        }

        let pcElement = pcElements.current.get(pc.playerId);

        if (!pcElement) {
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

        const username = pc.username || 'Anonymous';
        let tooltipContent = `<p>${username}</p><p>❤️‍🩹 HP: ${pc.hp}</p>`;

        pcElement.textContent = pc.iscamping ? '⛺️' : pc.hp <= 0 ? '💀' : pc.hp < 20 ? '🤢' : '😊';
        // Use renderPositions override if available, else fallback to pc.position
        const overridePos = renderPositions[pc.playerId];
        const renderX = overridePos ? overridePos.x * TILE_SIZE : pc.position.x * TILE_SIZE;
        const renderY = overridePos ? overridePos.y * TILE_SIZE : pc.position.y * TILE_SIZE;

        pcElement.style.left = `${renderX}px`;
        pcElement.style.top = `${renderY}px`;
      });

      pcElements.current.forEach((_, id) => {
        if (!pcs.find((pc) => pc.playerId === id)) {
          const element = pcElements.current.get(id);
          container.removeChild(element);
          pcElements.current.delete(id);
        }
      });
    };

    const startRenderingLoop = () => {
      const loop = () => {
        renderNPCs();
        renderPCs();
        animationFrameId.current = requestAnimationFrame(loop);
      };
      loop();
    };

    startRenderingLoop();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      npcRefs.forEach((npcElement) => {
        container.removeChild(npcElement);
      });
      npcRefs.clear();

      pcRefs.forEach((pcElement) => {
        container.removeChild(pcElement);
      });
      pcRefs.clear();

      container.removeChild(tooltip);
    };
  // Add all required dependencies
  }, [NPCsInGrid, TILE_SIZE, currentPlayer, onNPCClick, onPCClick, setInventory, setResources]);

  return <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }} />;
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
  const username = pc.username || 'Anonymous';
  let tooltipContent = `<p>${username}</p><p>❤️‍🩹 HP: ${pc.hp}</p>`;
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