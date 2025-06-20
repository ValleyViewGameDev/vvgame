import FloatingTextManager from "../../UI/FloatingText";
import NPCsInGridManager from "../../GridState/GridStateNPCs";
import playersInGridManager from "../../GridState/PlayersInGrid";
import { calculateDistance } from "../NPCs/NPCHelpers";
import { extractXY } from "../NPCs/NPCHelpers";
import { updateGridResource } from "../../Utils/GridManagement";
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { createCollectEffect } from "../../VFX/VFX";

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
    return true;  // Target is in range
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
export async function handleAttackOnNPC(npc, currentPlayer, setCurrentPlayer, TILE_SIZE, setResources, masterResources) {
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
        await trackQuestProgress(currentPlayer, 'Kill', freshNPC.type, 1, setCurrentPlayer);    }
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

  pc.hp -= damage;

  // 🆕 Update the PC's HP properly via updatePC
  console.log('📢 Calling updatePC after reducing HP; current HP:', pc.hp);
  playersInGridManager.updatePC(gridId, pc.playerId, { hp: pc.hp });

  if (pc.hp <= 0) {
    console.log(`PC ${pc.playerId} defeated.`);
    FloatingTextManager.addFloatingText(504, pc.position.x, pc.position.y+1, TILE_SIZE);
  }
}