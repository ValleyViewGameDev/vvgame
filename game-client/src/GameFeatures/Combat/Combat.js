import API_BASE from '../../config';
import axios from 'axios';
import FloatingTextManager from "../../UI/FloatingText";
import NPCsInGridManager from "../../GridState/GridStateNPCs";
import playersInGridManager from "../../GridState/PlayersInGrid";
import { calculateDistance } from "../../Utils/worldHelpers";
import { extractXY } from "../NPCs/NPCUtils";
import { updateGridResource } from "../../Utils/GridManagement";
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { createCollectEffect } from "../../VFX/VFX";
import { earnTrophy } from '../Trophies/TrophyUtils';

/** Helper to get tiles in line of sight between two points using Bresenham's algorithm **/
function getLineOfSightTiles(start, end) {
    const tiles = [];
    let x0 = Math.floor(start.x);
    let y0 = Math.floor(start.y);
    const x1 = Math.floor(end.x);
    const y1 = Math.floor(end.y);
    
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    while (true) {
        // Don't include the start or end positions
        if ((x0 !== Math.floor(start.x) || y0 !== Math.floor(start.y)) && 
            (x0 !== x1 || y0 !== y1)) {
            tiles.push({ x: x0, y: y0 });
        }
        
        if (x0 === x1 && y0 === y1) break;
        
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
    
    return tiles;
}

/** Helper to check if there's a wall blocking line of sight **/
function isWallBlocking(start, end) {
    const resources = GlobalGridStateTilesAndResources.getResources();
    const lineOfSightTiles = getLineOfSightTiles(start, end);
    
    // Check each tile in the line of sight for walls
    for (const tile of lineOfSightTiles) {
        const wall = resources.find(res => 
            res.x === tile.x && 
            res.y === tile.y && 
            res.action === 'wall'
        );
        if (wall) {
            return true; // Wall found blocking the path
        }
    }
    
    return false; // No walls blocking
}

/** Helper to check if target is in range and validate positions **/
function checkRange(player, target, TILE_SIZE) {

    const playerPos = player.position;
    const targetPos = extractXY(target.position);
    
    console.log('Fetched positions: playerPos =', playerPos, '; targetPos =', targetPos);
    if (!targetPos) {
        console.error("Invalid target position", { targetPos });
        FloatingTextManager.addFloatingText(505, 0, 0, TILE_SIZE);
        return false;
    }

    const distance = calculateDistance(playerPos, targetPos);
    const playerRange = player.attackrange || 1;
    console.log('playerRange = ',playerRange);
    console.log('playerPos = ',playerPos);

    if (distance > playerRange) {
        FloatingTextManager.addFloatingText(501, targetPos.x, targetPos.y, TILE_SIZE);
        console.log('target out of range: targetPos.x = ',targetPos.x,' targetPos.y= ',targetPos.y);
        return false;
    }
    
    // Check for walls blocking line of sight
    if (isWallBlocking(playerPos, targetPos)) {
        FloatingTextManager.addFloatingText(40, targetPos.x, targetPos.y, TILE_SIZE); // string[40] for wall blocking
        console.log('Wall blocking attack from player to target');
        return false;
    }
    
    return true;  // Target is in range and no walls blocking
}

/** Helper to determine if the attack hits **/
function isAHit(player, target, TILE_SIZE) {

    const attackRoll = Math.floor(Math.random() * 20) + 1;
    const hitRoll = attackRoll + (player.attackbonus || 0);

    console.log(`Attack roll: ${attackRoll}, Attack bonus: ${player.attackbonus}`);
    console.log(`Total hit roll: ${hitRoll}, Target armor class: ${target.armorclass}`);

    if (hitRoll >= target.armorclass) {
        FloatingTextManager.addFloatingText(502, target.position.x, target.position.y-1, TILE_SIZE);
        return true;
    } else {
        FloatingTextManager.addFloatingText(503, target.position.x, target.position.y, TILE_SIZE);
        return false;
    }
}

/** Helper to calculate damage **/
function calculateDamage(player) {
    const randomDamageModifier = Math.floor(Math.random() * 6) + 1;
    const damage = (player.damage || 0) + randomDamageModifier;
    console.log(`Damage roll: ${randomDamageModifier}, player damage: ${player.damage}, Damage dealt: ${damage}`);
    return damage;
}

/** handle attack on NPC **/
export async function handleAttackOnNPC(npc, currentPlayer, setCurrentPlayer, TILE_SIZE, setResources, masterResources, masterTrophies = null) {
    console.log(`Handling attack on NPC ${npc.id}.`);

    // Translate currentPlayer to pc from playersInGridManager
    const gridId = currentPlayer.location.g;
    const playerId = currentPlayer._id.toString();  // Convert ObjectId to string for matching
    console.log('playerId = ', playerId);
    const player = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
    console.log('player = ', player);
    if (!player) {
        console.error(`Player not found in playersInGrid for playerId: ${playerId}.`);
        return;
    }

    const freshNPC = NPCsInGridManager.getNPCsInGrid(gridId)?.[npc.id] || npc;

    if (player.iscamping) {
        FloatingTextManager.addFloatingText(31, freshNPC.position.x, freshNPC.position.y, TILE_SIZE);
        return;
    }
    if (!checkRange(player, freshNPC, TILE_SIZE)) return;
    if (!isAHit(player, freshNPC, TILE_SIZE)) return;
 
    const damage = calculateDamage(player);
    FloatingTextManager.addFloatingText(`- ${damage} ❤️‍🩹 HP`, freshNPC.position.x, freshNPC.position.y, TILE_SIZE);
    createCollectEffect(freshNPC.position.x, freshNPC.position.y, TILE_SIZE);

    freshNPC.hp -= damage;
    await NPCsInGridManager.updateNPC(gridId, freshNPC.id, {
      hp: freshNPC.hp,
      position: freshNPC.position,
      state: freshNPC.state,
    });

    if (freshNPC.hp <= 0) {
        console.log(`NPC ${freshNPC.id} killed.`);
        FloatingTextManager.addFloatingText(504, freshNPC.position.x, freshNPC.position.y-1, TILE_SIZE);

        try {
            await NPCsInGridManager.removeNPC(gridId, freshNPC.id);
            console.log(`NPC ${freshNPC.id} successfully removed from grid.`);

            // Add the Dead NPC "output" to the grid:
            if (freshNPC.output) {
                console.log(`Spawning resource: ${freshNPC.output} at NPC's death position.`);
                const resourceDetails = masterResources.find((res) => res.type === freshNPC.output);

                const enrichedResource = {
                    ...resourceDetails,
                    type: freshNPC.output,
                    x: Math.floor(freshNPC.position.x),
                    y: Math.floor(freshNPC.position.y),
                    category: resourceDetails.category || 'doober',
                    symbol: resourceDetails.symbol || '❓',
                    qtycollected: resourceDetails.qtycollected || 1,
                };

                const updatedResources = [
                    ...GlobalGridStateTilesAndResources.getResources(),
                    enrichedResource
                ];
                GlobalGridStateTilesAndResources.setResources(updatedResources);
                setResources((prevResources) => [...prevResources, enrichedResource]);

                await updateGridResource(
                    gridId, 
                    { 
                      type: freshNPC.output,
                      x: Math.floor(freshNPC.position.x),
                      y: Math.floor(freshNPC.position.y),
                    },
                    setResources,
                    true
                  );
            } else {
                console.warn(`NPC ${freshNPC.id} has no output resource defined.`);
            }
        } catch (error) {
            console.error('Error removing NPC or spawning resource:', error);
        }
        
        // Special case for Duke Angelo - auto-accept quest if not active
        if (freshNPC.type === 'Duke Angelo') {
            // Award "Kill the Duke" trophy when Duke Angelo is defeated
            if (masterTrophies && currentPlayer?.playerId) {
                try {
                    console.log('🏆 Awarding Kill the Duke trophy for defeating Duke Angelo');
                    await earnTrophy(currentPlayer.playerId, "Kill the Duke", 1, currentPlayer, masterTrophies, setCurrentPlayer);
                    console.log('✅ Successfully awarded Kill the Duke trophy');
                } catch (error) {
                    console.error('❌ Error awarding Kill the Duke trophy:', error);
                }
            }
            
            const bloodForJulietQuest = currentPlayer.activeQuests?.find(q => q.questId === 'Blood for Juliet');
            
            if (!bloodForJulietQuest) {
                // Quest not active - auto-accept it with completed status
                try {
                    const response = await axios.post(`${API_BASE}/api/add-player-quest`, {
                        playerId: currentPlayer.playerId,
                        questId: 'Blood for Juliet',
                        startTime: Date.now(),
                        progress: { goal1: 1 }, // Mark as already completed
                        completed: true, // Mark quest as completed
                    });
                    
                    if (response.data.success) {
                        setCurrentPlayer(response.data.player);
                        FloatingTextManager.addFloatingText('Quest: Blood for Juliet completed!', freshNPC.position.x, freshNPC.position.y-2, TILE_SIZE);
                        console.log('Auto-accepted and completed Blood for Juliet quest');
                    }
                } catch (error) {
                    console.error('Error auto-accepting Blood for Juliet quest:', error);
                }
            } else {
                // Quest is active - track progress normally
                await trackQuestProgress(currentPlayer, 'Kill', freshNPC.type, 1, setCurrentPlayer);
            }
        } else {
            // Normal quest progress tracking for other NPCs
            await trackQuestProgress(currentPlayer, 'Kill', freshNPC.type, 1, setCurrentPlayer);
        }
    }
}


export async function handleAttackOnPC(pc, currentPlayer, gridId, TILE_SIZE) {
  const playerId = currentPlayer._id.toString();  // Convert ObjectId to string for matching
  const player = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
  if (!player) {
    console.error('Player not found in playersInGrid.');
    return;
  }

  // Refresh the target PC from memory
  pc = playersInGridManager.getPlayersInGrid(gridId)?.[pc.playerId] || pc;

  if (!checkRange(player, pc, TILE_SIZE)) return;
  if (!isAHit(player, pc, TILE_SIZE)) return;

  const damage = calculateDamage(player, gridId);
  FloatingTextManager.addFloatingText(`- ${damage} HP`, pc.position.x, pc.position.y, TILE_SIZE);
  createCollectEffect(pc.position.x, pc.position.y, TILE_SIZE);

  const newHP = Math.max(0, pc.hp - damage);
  console.log('📢 Calling updatePC after reducing HP; current HP:', newHP);
  await playersInGridManager.updatePC(gridId, pc.playerId, { hp: newHP });

  if (newHP <= 0) {
    console.log(`PC ${pc.playerId} defeated.`);
    FloatingTextManager.addFloatingText(504, pc.position.x, pc.position.y+1, TILE_SIZE);
  }
}