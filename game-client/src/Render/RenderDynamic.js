import '../App.css';
import '../UI/Panel.css';
import '../UI/Cursor.css';
import './Render.css';

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import API_BASE from '../config';
import { getDerivedRange } from '../Utils/worldHelpers';
import { useGridState } from '../GridState/GridStateContext'; 
import { usePlayersInGrid } from '../GridState/GridStatePCContext';
import { handleNPCClick } from '../GameFeatures/NPCs/NPCUtils';
import { handleAttackOnPC } from '../GameFeatures/Combat/Combat';
import { renderPositions } from '../PlayerMovement';
import { useNPCOverlay } from '../UI/NPCOverlayContext';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import questCache from '../Utils/QuestCache';
import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
import '../GameFeatures/Relationships/Conversation.css';


const DynamicRenderer = ({
  TILE_SIZE,
  openPanel,
  setActiveStation,
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
  const { getNPCOverlay } = useNPCOverlay();
  
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
  const questNPCStatusRef = useRef(new Map()); // Cache quest NPC status
  
  // State for active conversations
  const [conversationVersion, setConversationVersion] = useState(0);

  // Function to check quest NPC status
  async function checkQuestNPCStatus(npc) {
    if (npc.action !== 'quest' || !currentPlayer) return null;
    
    try {
      // Use cached quests instead of direct API call
      const allQuests = await questCache.getQuests();
      
      // Use same filtering logic as NPCPanel
      let npcQuests = allQuests
        .filter((quest) => quest.giver === npc.type)
        .filter((quest) => {
          const activeQuest = currentPlayer.activeQuests?.find(q => q.questId === quest.title);
          if (activeQuest) {
            return activeQuest.completed && !activeQuest.rewardCollected;
          }
          return (quest.repeatable === true || quest.repeatable === 'true') || !currentPlayer.completedQuests?.some(q => q.questId === quest.title);
        });

      // Apply FTUE filtering for first-time users
      if (currentPlayer.firsttimeuser === true) {
        npcQuests = npcQuests.filter((quest) => {
          const hasFtuestep = quest.ftuestep != null && 
                             quest.ftuestep !== undefined && 
                             quest.ftuestep !== '' && 
                             quest.ftuestep !== 0;
          
          if (!hasFtuestep) {
            return false;
          } else if (quest.ftuestep > (currentPlayer.ftuestep || 0)) {
            return false;
          } else {
            return true;
          }
        });
      }

      // Check if any quests have completed rewards to collect
      const hasCompletedQuests = npcQuests.some(quest => {
        const activeQuest = currentPlayer.activeQuests?.find(q => q.questId === quest.title);
        return activeQuest && activeQuest.completed && !activeQuest.rewardCollected;
      });

      if (hasCompletedQuests) {
        return 'completed'; // Show checkmark
      } else if (npcQuests.length > 0) {
        return 'available'; // Show question mark
      }
      
      return null;
    } catch (error) {
      console.error('Error checking quest NPC status:', error);
      return null;
    }
  }

  // Check trade NPC status - returns the first trade item symbol
  function checkTradeNPCStatus(npc) {
    if (npc.action !== 'trade') return null;
    
    try {
      // Find recipes that this NPC trades
      const tradeRecipes = masterResourcesRef.current.filter(resource => 
        resource.source === npc.type
      );
      
      if (tradeRecipes.length > 0) {
        // Return the symbol of the first trade item
        return tradeRecipes[0].symbol || '📦';
      }
      
      return null;
    } catch (error) {
      console.error('Error checking trade NPC status:', error);
      return null;
    }
  }

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
      const renderY = overridePos ? overridePos.y * TILE_SIZE : npc.position.y * TILE_SIZE;
      
      if (!npcDiv) {
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
          // Check if NPC has an overlay that prevents clicking
          const overlayData = getNPCOverlay(npc.id);
          if (overlayData && !overlayData.clickable) {
            return; // Prevent clicking on non-clickable overlay NPCs
          }
          
          // 🛡️ Prevent interaction with NPCs on another player's homestead
          const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
          if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead) {
            return; // Cannot interact with NPCs on another player's homestead
          }
          
          setHoverTooltip(null);
          suppressTooltipRef.current = true;
          const currentTime = Date.now();
          if (npc.action === 'attack' || npc.action === 'spawn') {
            const pcState = playersInGrid?.[gridId]?.pcs?.[currentPlayer._id];
            const speed = pcState?.speed ?? currentPlayer.baseSpeed ?? 5;
            if (currentTime < reloadRef.current) return;
            reloadRef.current = currentTime + (speed * 1000);
          }
          if (npc.action === 'quest' || npc.action === 'heal' || npc.action === 'worker' || npc.action === 'trade') {
            onNPCClick(npc);
          } else {
            handleNPCClick(
              npc,
              Math.round(npc.position.y),
              Math.round(npc.position.x),
              setInventory,
              setResources,
              currentPlayer,
              setCurrentPlayer,
              TILE_SIZE,
              masterResourcesRef.current,
              masterSkills,
              currentPlayer?.location?.g,
              setModalContent,
              setIsModalOpen,
              updateStatus,
              openPanel,
              setActiveStation,
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
        
        // Add overlay visual element if needed
        const overlayData = getNPCOverlay(npc.id);
        if (overlayData) {
          renderOverlay(npcDiv, overlayData.overlay);
        } else if (npc.action === 'quest') {
          // Check quest NPC status only if not already cached
          const cachedStatus = questNPCStatusRef.current.get(npc.id);
          if (!cachedStatus) {
            checkQuestNPCStatus(npc).then(status => {
              if (status) {
                questNPCStatusRef.current.set(npc.id, status);
                const npcDivCheck = npcElements.current.get(npc.id);
                if (npcDivCheck && !npcDivCheck.querySelector('.npc-overlay')) {
                  renderOverlay(npcDivCheck, status);
                }
              }
            });
          } else {
            // Use cached status
            renderOverlay(npcDiv, cachedStatus);
          }
        } else if (npc.action === 'trade') {
          // Check trade NPC for trade item symbol
          const tradeSymbol = checkTradeNPCStatus(npc);
          if (tradeSymbol) {
            renderOverlay(npcDiv, tradeSymbol);
          }
        }

        /// Dynamic Cursors for NPCs
        const currentTime = Date.now();
        if (npc.action === 'attack' || npc.action === 'spawn') {
          if (currentTime < reloadRef.current) {
            npcDiv.style.cursor = 'wait';
          } else {
            npcDiv.style.cursor = 'crosshair';
          }
        } else if (npc.action === 'quest' || npc.action === 'heal' || npc.action === 'trade') {
          npcDiv.style.cursor = 'help';
        } else {
          npcDiv.style.cursor = 'pointer';
        }
        
      } else {
        // Update symbol if changed
        if (npcDiv.textContent !== npc.symbol) {
          npcDiv.textContent = npc.symbol;
        }
        
        // Update overlay visual if changed
        const overlayData = getNPCOverlay(npc.id);
        const existingOverlay = npcDiv.querySelector('.npc-overlay');
        
        if (overlayData && !existingOverlay) {
          renderOverlay(npcDiv, overlayData.overlay);
        } else if (!overlayData && existingOverlay) {
          // Check if this is a quest NPC that might need overlay
          if (npc.action === 'quest') {
            // Check cached status first
            const cachedStatus = questNPCStatusRef.current.get(npc.id);
            if (cachedStatus) {
              // Keep the overlay if we have a cached status
              const currentType = existingOverlay.getAttribute('data-overlay-type');
              if (currentType !== cachedStatus) {
                existingOverlay.remove();
                renderOverlay(npcDiv, cachedStatus);
              }
            } else {
              // Re-check quest status
              checkQuestNPCStatus(npc).then(status => {
                if (status) {
                  questNPCStatusRef.current.set(npc.id, status);
                  if (existingOverlay) {
                    existingOverlay.remove();
                  }
                  renderOverlay(npcDiv, status);
                } else {
                  existingOverlay.remove();
                  questNPCStatusRef.current.delete(npc.id);
                }
              });
            }
          } else if (npc.action === 'trade') {
            // Check if trade NPC still has items to trade
            const tradeSymbol = checkTradeNPCStatus(npc);
            if (tradeSymbol) {
              const currentType = existingOverlay.getAttribute('data-overlay-type');
              if (currentType !== tradeSymbol) {
                existingOverlay.remove();
                renderOverlay(npcDiv, tradeSymbol);
              }
            } else {
              existingOverlay.remove();
            }
          } else {
            existingOverlay.remove();
          }
        } else if (overlayData && existingOverlay) {
          // Update existing overlay if type changed
          const currentType = existingOverlay.getAttribute('data-overlay-type');
          if (currentType !== overlayData.overlay) {
            existingOverlay.remove();
            renderOverlay(npcDiv, overlayData.overlay);
          }
        } else if (!overlayData && npc.action === 'quest' && !existingOverlay) {
          // Quest NPC without overlay - check if it needs one
          const cachedStatus = questNPCStatusRef.current.get(npc.id);
          if (cachedStatus) {
            renderOverlay(npcDiv, cachedStatus);
          } else {
            checkQuestNPCStatus(npc).then(status => {
              if (status) {
                questNPCStatusRef.current.set(npc.id, status);
                const npcDivCheck = npcElements.current.get(npc.id);
                if (npcDivCheck && !npcDivCheck.querySelector('.npc-overlay')) {
                  renderOverlay(npcDivCheck, status);
                }
              }
            });
          }
        } else if (!overlayData && npc.action === 'trade' && !existingOverlay) {
          // Trade NPC without overlay - check if it needs one
          const tradeSymbol = checkTradeNPCStatus(npc);
          if (tradeSymbol) {
            renderOverlay(npcDiv, tradeSymbol);
          }
        }
      }
      npcDiv.style.left = `${renderX}px`;
      npcDiv.style.top = `${renderY}px`;
      
      // Render speech bubble if active - use NPC type as ID for consistency
      const npcSpeakerId = npc.type;
      renderSpeechBubble(npcDiv, npcSpeakerId, 'npc');
      
      // Render relationship outcome if active
      renderRelationshipOutcome(npcDiv, npcSpeakerId);
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

      let symbol = pc.icon || '😊';
      if (pc.iscamping) symbol = '⛺️';
      else if (pc.isinboat) symbol = '🛶';
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
      
      // Render speech bubble if active - use player ID for consistency
      const pcSpeakerId = pc.playerId;
      renderSpeechBubble(pcDiv, pcSpeakerId, 'player');
      
      // Render relationship outcome if active
      renderRelationshipOutcome(pcDiv, pcSpeakerId);
    });

    // Remove PC divs that no longer exist
    pcElements.current.forEach((div, id) => {
      if (!existingIds.has(id)) {
        div.remove();
        pcElements.current.delete(id);
      }
    });
  }

function renderPlayerRange() {
    if (currentPlayer?.settings?.rangeOn === false) return; 
//    if (currentPlayer?.location?.gtype === "homestead") return; 
    const gridId = currentPlayer?.location?.g;
    if (!gridId || !currentPlayer) return;
    const container = containerRef.current; if (!container) return;

    // Ensure overflow and position only (no fixed size or margin here)
    container.style.overflow = 'hidden';
    container.style.position = 'relative';

    let rangeCircle = document.getElementById('player-range-circle');

    if (!rangeCircle) {
      rangeCircle = document.createElement('div');
      rangeCircle.id = 'player-range-circle';
      rangeCircle.style.position = 'absolute';
      rangeCircle.style.backgroundColor = 'rgba(128, 128, 128, 0.2)';
      rangeCircle.style.border = 'none';
      rangeCircle.style.borderRadius = '50%';
      rangeCircle.style.pointerEvents = 'none';
      rangeCircle.style.zIndex = 10;
      container.appendChild(rangeCircle);
    }

    const position = playersInGrid?.[gridId]?.pcs?.[currentPlayer._id]?.position;
    if (!position) return;

    const pixelX = position.x * TILE_SIZE;
    const pixelY = position.y * TILE_SIZE;

    // Calculate derivedRange using utility
    const derivedRange = getDerivedRange(currentPlayer, masterResourcesRef.current);
    const radius = derivedRange * TILE_SIZE;

    rangeCircle.style.width = `${radius * 2}px`;
    rangeCircle.style.height = `${radius * 2}px`;
    rangeCircle.style.left = `${pixelX - radius + TILE_SIZE / 2}px`;
    rangeCircle.style.top = `${pixelY - radius + TILE_SIZE / 2}px`;

    // Add a second ring for attackrange
    const attackRange = playersInGrid?.[gridId]?.pcs?.[currentPlayer._id]?.attackrange;
    if (attackRange && attackRange > 0 && (currentPlayer?.location?.gtype != "homestead")) {
      let attackRangeRing = document.getElementById('player-attackrange-ring');
      if (!attackRangeRing) {
        attackRangeRing = document.createElement('div');
        attackRangeRing.id = 'player-attackrange-ring';
        attackRangeRing.style.position = 'absolute';
        attackRangeRing.style.border = '2px dotted rgba(255, 0, 0, 0.4)';
        attackRangeRing.style.borderRadius = '50%';
        attackRangeRing.style.pointerEvents = 'none';
        attackRangeRing.style.zIndex = 11;
        container.appendChild(attackRangeRing);
      }

      const attackRadius = attackRange * TILE_SIZE;
      attackRangeRing.style.width = `${attackRadius * 2}px`;
      attackRangeRing.style.height = `${attackRadius * 2}px`;
      attackRangeRing.style.left = `${pixelX - attackRadius + TILE_SIZE / 2}px`;
      attackRangeRing.style.top = `${pixelY - attackRadius + TILE_SIZE / 2}px`;
    } else {
      // Remove attack range ring if attackrange is not present or 0
      const existingAttackRing = document.getElementById('player-attackrange-ring');
      if (existingAttackRing) existingAttackRing.remove();
    }
  }

  // Animation loop to update positions smoothly if needed
function startRenderingLoop() {
  if (!containerRef.current) return;
  renderNPCs();
  renderPCs();
  renderPlayerRange();
  
  animationFrameId.current = requestAnimationFrame(startRenderingLoop);
}



  // Clear quest NPC status cache when player's quests change
  useEffect(() => {
    questNPCStatusRef.current.clear();
  }, [currentPlayer?.activeQuests, currentPlayer?.completedQuests]);
  
  // Subscribe to conversation changes
  useEffect(() => {
    const unsubscribe = ConversationManager.subscribe(() => {
      console.log('🗨️ DynamicRenderer: Conversation changed, triggering update');
      setConversationVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

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
      const existingRangeCircle = document.getElementById('player-range-circle');
      if (existingRangeCircle) existingRangeCircle.remove();
      const existingAttackRing = document.getElementById('player-attackrange-ring');
      if (existingAttackRing) existingAttackRing.remove();
    };
  }, [NPCsInGrid, playersInGrid, currentPlayer, TILE_SIZE, setInventory, setResources, onNPCClick, onPCClick, masterResourcesRef.current]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: `${64 * TILE_SIZE}px`,
        height: `${64 * TILE_SIZE}px`,
        overflow: 'hidden',
//        margin: '0 auto'
      }}
    >
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

  const isNotSelf = String(pc.playerId) !== String(currentPlayer._id);
  const isAttackable = pc.hp > 0 && !pc.iscamping;
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const isTown = currentPlayer?.location?.gtype === 'town';

  if (isNotSelf && isAttackable && !isHomestead && !isTown) {
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
      tooltipContent = `<p>${npc.type}</p><p>"Need some advice?"</p>`;
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
  if (pc.isinboat) content += `<p>🛶 In a boat</p>`;
  
  setHoverTooltip({ x, y, content });
}

function handlePCHoverLeave(setHoverTooltip) {
  setHoverTooltip(null);
}

// Render visual overlay on any entity (NPC, crafting station, etc)
export function renderOverlay(parentDiv, overlayType) {
  const overlay = document.createElement('div');
  overlay.className = 'game-overlay';
  overlay.setAttribute('data-overlay-type', overlayType);
  
  const content = getOverlayContent(overlayType);
  overlay.textContent = content.emoji;
  overlay.style.color = content.color;
  
  parentDiv.appendChild(overlay);
}

// Render speech bubble on entity
function renderSpeechBubble(parentDiv, speakerId, speakerType) {
  const speech = ConversationManager.getSpeech(speakerId);
  
  // Check if bubble already exists with correct content
  const existingBubble = parentDiv.querySelector('.conversation-speech-bubble');
  if (existingBubble) {
    const existingEmoji = existingBubble.querySelector('.speech-emoji')?.textContent;
    if (!speech) {
      existingBubble.remove();
      return;
    }
    if (existingEmoji === (speech.topic || speech.emoji)) {
      return; // Bubble already exists with correct content
    }
    existingBubble.remove();
  }
  
  if (!speech) return;
  
  const bubble = document.createElement('div');
  bubble.className = `conversation-speech-bubble ${speakerType}`;
  bubble.style.position = 'absolute';
  bubble.style.left = '50%';
  bubble.style.bottom = '100%';
  bubble.style.transform = 'translateX(-50%)';
  bubble.style.marginBottom = '10px';
  
  // Scale bubble size based on parent size (which scales with zoom)
  const parentSize = parseInt(window.getComputedStyle(parentDiv).width);
  const scale = parentSize / 30 * 0.5; // Base size is 30px, then 50% of that
  bubble.style.fontSize = `${20 * scale}px`;
  bubble.style.width = `${80 * scale}px`;
  bubble.style.height = `${80 * scale}px`;
  bubble.style.padding = `${15 * scale}px`;
  bubble.style.borderWidth = `${3 * scale}px`;
  // Don't set borderRadius here - let CSS handle it for the circular shape
  
  const emojiDiv = document.createElement('div');
  emojiDiv.className = 'speech-emoji';
  emojiDiv.textContent = speech.topic || speech.emoji;
  emojiDiv.style.fontSize = `${32 * scale * 2}px`; // Scale emoji size (compensate for smaller bubble)
  bubble.appendChild(emojiDiv);
  
  parentDiv.appendChild(bubble);
  
  // Log detailed position info
  const bubbleRect = bubble.getBoundingClientRect();
  const parentRect = parentDiv.getBoundingClientRect();
}

// React component for overlay content
export const getOverlayContent = (overlayType) => {
  switch (overlayType) {
    case 'exclamation':
      return { emoji: '❗', color: '#FF6B35' };
    case 'attack':
      return { emoji: '⚔️', color: '#DC143C' };
    case 'completed':
      return { emoji: '✅', color: '#32CD32' };
    case 'available':
      return { emoji: '👋', color: '#FFD700' };
    case 'ready':
      return { emoji: '✅', color: 'green' };
    case 'inprogress':
      return { emoji: '🕑', color: 'orange' };
    default:
      // For trade NPCs, the overlayType is the actual trade item symbol
      if (overlayType && overlayType.length <= 3) {
        return { emoji: overlayType, color: '#4B9BFF' };
      }
      return { emoji: '', color: '#888' };
  }
};

// Render relationship outcome VFX on entity
function renderRelationshipOutcome(parentDiv, speakerId) {
  const outcome = ConversationManager.getOutcome(speakerId);
  
  // Check if outcome element exists
  const existingOutcome = parentDiv.querySelector('.relationship-outcome');
  if (existingOutcome) {
    if (!outcome) {
      existingOutcome.remove();
      return;
    }
    // If same type and timestamp, keep it
    const existingType = existingOutcome.getAttribute('data-outcome-type');
    const existingTimestamp = existingOutcome.getAttribute('data-timestamp');
    if (existingType === outcome.type && existingTimestamp === String(outcome.timestamp)) {
      return;
    }
    existingOutcome.remove();
  }
  
  if (!outcome) return;
  
  const outcomeDiv = document.createElement('div');
  outcomeDiv.className = 'relationship-outcome';
  outcomeDiv.setAttribute('data-outcome-type', outcome.type);
  outcomeDiv.setAttribute('data-timestamp', String(outcome.timestamp));
  outcomeDiv.style.position = 'absolute';
  outcomeDiv.style.left = '50%';
  outcomeDiv.style.bottom = '100%';
  outcomeDiv.style.transform = 'translateX(-50%)';
  outcomeDiv.style.marginBottom = '10px';
  outcomeDiv.style.pointerEvents = 'none';
  outcomeDiv.style.zIndex = '1001';
  
  // Scale based on parent size (which scales with zoom)
  const parentSize = parseInt(window.getComputedStyle(parentDiv).width);
  const scale = parentSize / 30; // Base size is 30px
  
  if (outcome.type === 'positive') {
    outcomeDiv.textContent = '👍';
    outcomeDiv.style.color = 'rgb(252, 249, 249)';
    outcomeDiv.style.fontSize = `${24 * scale}px`;
    outcomeDiv.style.fontWeight = 'bold';
    outcomeDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.3)';
  } else {
    outcomeDiv.textContent = '❌';
    outcomeDiv.style.fontSize = `${20 * scale}px`;
  }
  
  parentDiv.appendChild(outcomeDiv);
}

export default DynamicRenderer;