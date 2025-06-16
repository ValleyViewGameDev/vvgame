import '../App.css';
import '../UI/Panel.css';
import '../UI/Cursor.css';

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
  masterResources,
  masterSkills,
  setHoverTooltip, 
  setModalContent,
  setIsModalOpen,
  updateStatus,
}) => {
  const NPCsInGrid = useGridState(); // Use the updated NPCsInGrid from context
  const playersInGrid = usePlayersInGrid(); // Access PCs via modern PC-specific context
  const hoveredEntityIdRef = useRef(null);
  const suppressTooltipRef = useRef(false);
  
  const masterResourcesRef = useRef(masterResources); // Keep masterResources in a ref
  useEffect(() => {
    masterResourcesRef.current = masterResources;
  }, [masterResources]);

  const containerRef = useRef(null);
  const animationFrameId = useRef(null);
  const reloadRef = useRef(0); // Stores the next allowed attack time

  const npcElements = useRef(new Map());
  const pcElements = useRef(new Map());

  const hoveredNPCDivRef = useRef(null);

  // Function to create or update NPC divs
  function renderNPCs() {
    const gridId = currentPlayer?.location?.g;
    const npcs = Object.values(NPCsInGrid?.[gridId]?.npcs || {});
    const container = containerRef.current;
    if (!container) return;

    const existingIds = new Set();

    npcs.forEach((npc) => {
      existingIds.add(npc.id);
      let npcDiv = npcElements.current.get(npc.id);
      const overridePos = renderPositions[npc.id];
      const renderX = overridePos ? overridePos.x * TILE_SIZE : npc.position.x * TILE_SIZE;
      const renderY = overridePos ? overridePos.y * TILE_SIZE : npc.position.y * TILE_SIZE;      if (!npcDiv) {
        // REPLACED LOGIC FOR CREATING npcDiv:
        npcDiv = document.createElement('div');
        npcDiv.className = 'npc';
        npcDiv.style.position = 'absolute';
        npcDiv.style.width = `${TILE_SIZE}px`;
        npcDiv.style.height = `${TILE_SIZE}px`;
        npcDiv.style.fontSize = `${TILE_SIZE * 0.7}px`;
        npcDiv.style.display = 'flex';
        npcDiv.style.alignItems = 'center';
        npcDiv.style.justifyContent = 'center';
        npcDiv.style.zIndex = 15;
        npcDiv.style.pointerEvents = 'auto';
        npcDiv.textContent = npc.symbol;

        // Use mousedown, not onclick, for better cross-browser support
        npcDiv.addEventListener('mousedown', () => {
          setHoverTooltip(null);
          suppressTooltipRef.current = true;
          const currentTime = Date.now();
          if (npc.action === 'attack' || npc.action === 'spawn') {
            const pcState = playersInGrid?.[gridId]?.pcs?.[currentPlayer._id];
            const speed = pcState?.speed ?? currentPlayer.baseSpeed ?? 5;
            if (currentTime < reloadRef.current) return;
            reloadRef.current = currentTime + (speed * 1000);
          }
          if (npc.action === 'quest' || npc.action === 'heal') {
            onNPCClick(npc);
          } else {
            handleNPCClick(
              npc,
              Math.round(npc.position.y),
              Math.round(npc.position.x),
              setInventory,
              setResources,
              currentPlayer,
              TILE_SIZE,
              masterResourcesRef.current,
              masterSkills,
              currentPlayer?.location?.g,
              setModalContent,
              setIsModalOpen,
              updateStatus,
            );
          }
        });

        npcDiv.onmouseenter = (event) => {
          if (suppressTooltipRef.current) return;
          hoveredEntityIdRef.current = npc.id;
          hoveredNPCDivRef.current = npcDiv;
          handleNPCHover(event, npc, TILE_SIZE, hoveredEntityIdRef, setHoverTooltip);
        };

        npcDiv.onmouseleave = () => {
          suppressTooltipRef.current = false;
          npcDiv.classList.remove('cursor-wait', 'cursor-help', 'cursor-pointer');
          npcDiv.classList.add('cursor-pointer');
          hoveredNPCDivRef.current = null;
          handleNPCHoverLeave(npc, hoveredEntityIdRef, setHoverTooltip);
        };

        container.appendChild(npcDiv);
        npcElements.current.set(npc.id, npcDiv);

        /// Dynamic Cursors for NPCs
        const currentTime = Date.now();
        if (npc.action === 'attack' || npc.action === 'spawn') {
          if (currentTime < reloadRef.current) {
            npcDiv.style.cursor = 'wait';
          } else {
            npcDiv.style.cursor = 'crosshair';
          }
        } else if (npc.action === 'quest' || npc.action === 'heal') {
          npcDiv.style.cursor = 'help';
        } else {
          npcDiv.style.cursor = 'pointer';
        }
        
      } else {
        // Update symbol if changed
        if (npcDiv.textContent !== npc.symbol) {
          npcDiv.textContent = npc.symbol;
        }
      }
      npcDiv.style.left = `${renderX}px`;
      npcDiv.style.top = `${renderY}px`;
    });

    // Remove NPC divs that no longer exist
    npcElements.current.forEach((div, id) => {
      if (!existingIds.has(id)) {
        div.remove(); 
        npcElements.current.delete(id);
      }
    });
  }

  // Function to create or update PC divs
  function renderPCs() {
    const gridId = currentPlayer?.location?.g;
    const pcs = Object.values(playersInGrid?.[gridId]?.pcs || {});
    const container = containerRef.current;
    if (!container) return;

    const existingIds = new Set();

    pcs.forEach((pc) => {
      existingIds.add(pc.playerId);
      if (!pc || !pc.position || typeof pc.position.x !== 'number' || typeof pc.position.y !== 'number') {
        return;
      }
      const overridePos = renderPositions[pc.playerId];
      const renderX = overridePos ? overridePos.x * TILE_SIZE : pc.position.x * TILE_SIZE;
      const renderY = overridePos ? overridePos.y * TILE_SIZE : pc.position.y * TILE_SIZE;

      let symbol = '😊';
      if (pc.iscamping) symbol = '⛺️';
      else if (pc.hp <= 0) symbol = '💀';
      else if (pc.hp < 20) symbol = '🤢';

      let pcDiv = pcElements.current.get(pc.playerId);
      if (!pcDiv) {
        // REPLACED LOGIC FOR CREATING pcDiv:
        pcDiv = document.createElement('div');
        pcDiv.className = 'pc';
        pcDiv.style.position = 'absolute';
        pcDiv.style.width = `${TILE_SIZE}px`;
        pcDiv.style.height = `${TILE_SIZE}px`;
        pcDiv.style.fontSize = `${TILE_SIZE * 0.7}px`;
        pcDiv.style.display = 'flex';
        pcDiv.style.alignItems = 'center';
        pcDiv.style.justifyContent = 'center';
        pcDiv.style.zIndex = 16;
        pcDiv.style.pointerEvents = 'auto';
        //pcDiv.style.cursor = 'pointer';
        pcDiv.textContent = symbol;

        // Use mousedown, not onclick, for better cross-browser support
        pcDiv.addEventListener('mousedown', () => {
          setHoverTooltip(null);
          suppressTooltipRef.current = true;
          onPCClick(pc);
          handlePCClick(pc, currentPlayer, currentPlayer.location.g, TILE_SIZE);
        });

        pcDiv.onmouseenter = (event) => {
          if (suppressTooltipRef.current) return;
          handlePCHover(event, pc, TILE_SIZE, setHoverTooltip);
        };

        pcDiv.onmouseleave = () => {
          suppressTooltipRef.current = false;
          handlePCHoverLeave(setHoverTooltip);
        };

        container.appendChild(pcDiv);
        pcElements.current.set(pc.playerId, pcDiv);

        /// Dynamic Cursors for PCs
        if (pc.hp > 25) {
            pcDiv.style.cursor = 'crosshair';
        } else {
          pcDiv.style.cursor = 'pointer';
        }

      } else {
        if (pcDiv.textContent !== symbol) {
          pcDiv.textContent = symbol;
        }
      }
      pcDiv.style.left = `${renderX}px`;
      pcDiv.style.top = `${renderY}px`;
    });

    // Remove PC divs that no longer exist
    pcElements.current.forEach((div, id) => {
      if (!existingIds.has(id)) {
        div.remove();
        pcElements.current.delete(id);
      }
    });
  }

  // Animation loop to update positions smoothly if needed
function startRenderingLoop() {
  if (!containerRef.current) return;
  renderNPCs();
  renderPCs();

  animationFrameId.current = requestAnimationFrame(startRenderingLoop);
}



  useEffect(() => {
    startRenderingLoop();
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      // Clean up all NPC divs
      npcElements.current.forEach((div) => {
        div.remove();
      });
      npcElements.current.clear();
      // Clean up all PC divs
      pcElements.current.forEach((div) => {
        div.remove();
      });
      pcElements.current.clear();
    };
  }, [NPCsInGrid, playersInGrid, currentPlayer, TILE_SIZE, setInventory, setResources, onNPCClick, onPCClick, masterResourcesRef.current]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* NPCs and PCs are rendered manually in the container */}
    </div>
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

// React-friendly tooltip handler for NPC hover
function handleNPCHover(event, npc, TILE_SIZE, hoveredEntityIdRef, setHoverTooltip) {
  const rect = event.target.getBoundingClientRect();
  const x = rect.left + TILE_SIZE / 2;
  const y = rect.top;

  let tooltipContent = `<p>${npc.type}</p>`;

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

  hoveredEntityIdRef.current = npc.id;
  setHoverTooltip({ x, y, content: tooltipContent });
}

function handleNPCHoverLeave(npc, hoveredEntityIdRef, setHoverTooltip) {
  if (hoveredEntityIdRef.current === npc.id) {
    setHoverTooltip(null);
    hoveredEntityIdRef.current = null;
  }
}

function handlePCHover(event, pc, TILE_SIZE, setHoverTooltip) {
  const rect = event.target.getBoundingClientRect();
  const x = rect.left + TILE_SIZE / 2;
  const y = rect.top;
  
  const username = pc.username || 'Anonymous';
  let content = `<p>${username}</p><p>❤️‍🩹 HP: ${pc.hp}</p>`;
  if (pc.iscamping) content += `<p>🏕️ Camping</p>`;
  
  setHoverTooltip({ x, y, content });
}

function handlePCHoverLeave(setHoverTooltip) {
  setHoverTooltip(null);
}

export default DynamicRenderer;