import '../App.css';
import '../UI/Panel.css';
import '../UI/Cursor.css';
import './Render.css';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import API_BASE from '../config';
import { getDerivedRange } from '../Utils/worldHelpers';
import { useGridState } from '../GridState/GridStateContext'; 
import { usePlayersInGrid } from '../GridState/GridStatePCContext';
import { renderPositions } from '../PlayerMovement';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import ConversationManager from '../GameFeatures/Relationships/ConversationManager';
import questCache from '../Utils/QuestCache';
import '../GameFeatures/Relationships/Conversation.css';

// Import our new React components
import NPCComponent from './NPCComponent';
import PCComponent from './PCComponent';

const DynamicRendererNew = ({
  TILE_SIZE,
  openPanel,
  setActiveStation,
  setInventory,
  setBackpack,
  setResources,
  currentPlayer,
  setCurrentPlayer,
  onNPCClick,
  onPCClick,
  masterResources,
  masterSkills,
  masterTrophies,
  setHoverTooltip, 
  setModalContent,
  setIsModalOpen,
  updateStatus,
  strings,
  globalTuning,
}) => {
  const NPCsInGrid = useGridState();
  const playersInGrid = usePlayersInGrid();
  const [conversationVersion, setConversationVersion] = useState(0);
  const containerRef = useRef(null);
  const masterResourcesRef = useRef(masterResources);
  const questNPCStatusRef = useRef({});
  
  // Clear quest cache when player data changes
  useEffect(() => {
    questNPCStatusRef.current = {};
    // Also invalidate the quest cache to force fresh data
    questCache.invalidate();
  }, [currentPlayer?.activeQuests, currentPlayer?.completedQuests]);

  // Update master resources ref when it changes
  useEffect(() => {
    masterResourcesRef.current = masterResources;
  }, [masterResources]);

  // Check quest NPC status
  const checkQuestNPCStatus = useCallback(async (npc) => {
    if (!currentPlayer) return null;
    
    // Skip cache for now to ensure reactivity
    // const cachedStatus = questNPCStatusRef.current[npc.id];
    // if (cachedStatus?.timestamp && Date.now() - cachedStatus.timestamp < 5000) {
    //   return cachedStatus.status;
    // }
    
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

      let status = null;
      if (hasCompletedQuests) {
        status = 'completed'; // Show checkmark
      } else if (npcQuests.length > 0) {
        status = 'available'; // Show question mark/hand
      }
      
      // Skip caching for now to ensure reactivity
      // questNPCStatusRef.current[npc.id] = {
      //   status,
      //   timestamp: Date.now()
      // };
      
      return status;
    } catch (error) {
      console.error('Error checking quest NPC status:', error);
      return null;
    }
  }, [currentPlayer]);

  // Check trade NPC status
  const checkTradeNPCStatus = useCallback((npc) => {
    if (!npc.symbol || !masterResourcesRef.current) return null;
    
    const tradeResource = masterResourcesRef.current.find(r => 
      r.category === 'trader' && r.symbol === npc.symbol
    );
    
    if (!tradeResource) return null;
    
    // Trade NPCs show their trade item symbol as the overlay
    return tradeResource.input;
  }, []);

  // Check Kent NPC status  
  const checkKentNPCStatus = useCallback((npc) => {
    if (npc.type !== 'Kent' || !currentPlayer) return null;
    
    try {
      const kentOffers = currentPlayer?.kentOffers?.offers || [];
      
      // Check if player can afford any of Kent's offers
      const canAffordAny = kentOffers.some(offer => {
        // Calculate player's total quantity from inventory and backpack
        const inventoryQty = currentPlayer?.inventory?.find(item => item.type === offer.item)?.quantity || 0;
        const backpackQty = currentPlayer?.backpack?.find(item => item.type === offer.item)?.quantity || 0;
        const playerQty = inventoryQty + backpackQty;
        
        return playerQty >= offer.quantity;
      });
      
      return canAffordAny ? 'completed' : null;
    } catch (error) {
      console.error('Error checking Kent status:', error);
      return null;
    }
  }, [currentPlayer]);

  // Subscribe to conversation changes
  useEffect(() => {
    const unsubscribe = ConversationManager.subscribe(() => {
      console.log('🗨️ DynamicRenderer: Conversation changed, triggering update');
      setConversationVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

  // Get overlay content for different types
  const getOverlayContent = (overlayType) => {
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
      case 'campaign':
        return { emoji: '🕐', color: '#FFD700' };
      case 'voting':
        return { emoji: '✅', color: 'green' };
      default:
        // For trade NPCs, the overlayType is the actual trade item symbol
        if (overlayType && overlayType.length <= 3) {
          return { emoji: overlayType, color: '#4B9BFF' };
        }
        return { emoji: '', color: '#888' };
    }
  };

  // Get current grid data
  const gridId = currentPlayer?.location?.g;
  const npcs = Object.values(NPCsInGrid?.[gridId]?.npcs || {});
  const pcs = Object.values(playersInGrid?.[gridId]?.pcs || {});
  
  // Helper function to render attack ranges
  const renderAttackRanges = () => {
    // Check if range indicators are disabled in settings
    if (currentPlayer?.settings?.rangeOn === false) return [];
    
    const ranges = [];
    
    // Player range
    if (currentPlayer) {
      const playerPos = playersInGridManager.getPlayerPosition(gridId, String(currentPlayer._id));
      if (playerPos) {
        // Regular range (gray circle)
        const derivedRange = getDerivedRange(currentPlayer, masterResources);
        if (derivedRange > 1) {
          const radius = derivedRange * TILE_SIZE;
          ranges.push(
            <div
              key="player-range"
              id="player-range-circle"
              className="attack-range player-range"
              style={{
                position: 'absolute',
                left: `${playerPos.x * TILE_SIZE - radius + TILE_SIZE / 2}px`,
                top: `${playerPos.y * TILE_SIZE - radius + TILE_SIZE / 2}px`,
                width: `${radius * 2}px`,
                height: `${radius * 2}px`,
                backgroundColor: 'rgba(128, 128, 128, 0.2)',
                borderRadius: '50%',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          );
        }
        
        // Attack range (red dotted ring) - check playersInGrid for attackrange
        const pcData = playersInGrid?.[gridId]?.pcs?.[currentPlayer._id];
        const attackRange = pcData?.attackrange;
        if (attackRange && attackRange > 0 && currentPlayer?.location?.gtype !== "homestead") {
          const attackRadius = attackRange * TILE_SIZE;
          ranges.push(
            <div
              key="player-attackrange"
              id="player-attackrange-ring"
              className="attack-range player-attackrange"
              style={{
                position: 'absolute',
                left: `${playerPos.x * TILE_SIZE - attackRadius + TILE_SIZE / 2}px`,
                top: `${playerPos.y * TILE_SIZE - attackRadius + TILE_SIZE / 2}px`,
                width: `${attackRadius * 2}px`,
                height: `${attackRadius * 2}px`,
                border: '3px dotted rgba(255, 0, 0, 0.4)',
                borderRadius: '50%',
                pointerEvents: 'none',
                zIndex: 11,
              }}
            />
          );
        }
      }
    }
    
    // NPC attack ranges
    npcs.forEach((npc) => {
      if ((npc.action === 'attack' || npc.action === 'spawn') && npc.attackrange && npc.attackrange > 0) {
        const radius = npc.attackrange * TILE_SIZE;
        ranges.push(
          <div
            key={`npc-range-${npc.id}`}
            className="attack-range npc-attack-range"
            data-npc-id={npc.id}
            style={{
              position: 'absolute',
              left: `${npc.position.x * TILE_SIZE - radius + TILE_SIZE / 2}px`,
              top: `${npc.position.y * TILE_SIZE - radius + TILE_SIZE / 2}px`,
              width: `${radius * 2}px`,
              height: `${radius * 2}px`,
              border: '2px dashed rgba(255, 100, 100, 0.5)',
              borderRadius: '50%',
              pointerEvents: 'none',
              zIndex: 9,
            }}
          />
        );
      }
    });
    
    return ranges;
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: `${64 * TILE_SIZE}px`,
        height: `${64 * TILE_SIZE}px`,
        overflow: 'hidden',
      }}
    >
      {/* Render attack ranges */}
      {renderAttackRanges()}
      
      {/* Render NPCs using React components */}
      {npcs.map((npc) => {
        // Skip NPCs without valid position data
        if (!npc || !npc.position || typeof npc.position.x === 'undefined' || typeof npc.position.y === 'undefined') {
          console.warn('NPC missing position data:', npc);
          return null;
        }
        
        return (
          <NPCComponent
            key={npc.id}
            npc={npc}
            TILE_SIZE={TILE_SIZE}
            currentPlayer={currentPlayer}
            setHoverTooltip={setHoverTooltip}
            onNPCClick={onNPCClick}
            gridId={gridId}
            strings={strings}
            masterResources={masterResourcesRef.current}
            playersInGrid={playersInGrid}
            // Status checking functions
            checkQuestNPCStatus={checkQuestNPCStatus}
            checkTradeNPCStatus={checkTradeNPCStatus}
            checkKentNPCStatus={checkKentNPCStatus}
            getOverlayContent={getOverlayContent}
            // Props for handleNPCClick
            setInventory={setInventory}
            setBackpack={setBackpack}
            setResources={setResources}
            setCurrentPlayer={setCurrentPlayer}
            masterSkills={masterSkills}
            setModalContent={setModalContent}
            setIsModalOpen={setIsModalOpen}
            updateStatus={updateStatus}
            openPanel={openPanel}
            setActiveStation={setActiveStation}
            masterTrophies={masterTrophies}
            globalTuning={globalTuning}
          />
        );
      })}
      
      {/* Render PCs using React components */}
      {pcs.map((pc) => {
        // Skip PCs without valid position data
        if (!pc || !pc.position || typeof pc.position.x === 'undefined' || typeof pc.position.y === 'undefined') {
          console.warn('PC missing position data:', pc);
          return null;
        }
        
        const isCurrentPlayer = String(pc.playerId) === String(currentPlayer?._id);
        
        return (
          <PCComponent
            key={pc.playerId}
            pc={pc}
            TILE_SIZE={TILE_SIZE}
            currentPlayer={currentPlayer}
            isCurrentPlayer={isCurrentPlayer}
            onPCClick={onPCClick}
            setCurrentPlayer={setCurrentPlayer}
            setInventory={setInventory}
            setBackpack={setBackpack}
            masterResources={masterResourcesRef.current}
            strings={strings}
            setHoverTooltip={setHoverTooltip}
          />
        );
      })}
    </div>
  );
};

export default DynamicRendererNew;