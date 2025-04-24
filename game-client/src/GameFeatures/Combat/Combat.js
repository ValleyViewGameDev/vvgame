import FloatingTextManager from "../../UI/FloatingText";
import gridStateManager from "../../GridState/GridState";
import { calculateDistance } from "../NPCs/NPCHelpers";
import { extractXY } from "../NPCs/NPCHelpers";
import { updateGridResource } from "../../Utils/GridManagement";
import GlobalGridState from '../../GridState/GlobalGridState';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';

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
export async function handleAttackOnNPC(npc, currentPlayer, TILE_SIZE, setResources, masterResources) {
    console.log(`Handling attack on NPC ${npc.id}.`);

    // Translate currentPlayer to pc from gridState.pcs
    const gridId = currentPlayer.location.g;
    const playerId = currentPlayer._id.toString();  // Convert ObjectId to string for matching
    console.log('playerId = ',playerId);
    const gridState = gridStateManager.getGridState(gridId);
    console.log('gridState = ',gridState);
    if (!gridState) {
        console.error(`GridState is not available for gridId: ${gridId}`);
        return;
    }
    const player = gridState?.pcs[playerId];
    console.log('player = ',player);
    if (!player) {
        console.error(`Player not found in gridState for playerId: ${playerId}.`);
        console.log('Current gridState.pcs keys:', Object.keys(gridState.pcs));
        return;
    }

    if (player.iscamping) {
        FloatingTextManager.addFloatingText(31, npc.position.x, npc.position.y, TILE_SIZE);
        return;
    }
    if (!checkRange(player, npc, TILE_SIZE)) return;
    if (!isAHit(player, npc, TILE_SIZE)) return;
 
    const damage = calculateDamage(player);
    FloatingTextManager.addFloatingText(`- ${damage} ❤️‍🩹 HP`, npc.position.x, npc.position.y, TILE_SIZE);

    npc.hp -= damage;
    await gridStateManager.saveGridStateNPCs(gridId);

    if (npc.hp <= 0) {
        console.log(`NPC ${npc.id} killed.`);
        FloatingTextManager.addFloatingText(504, npc.position.x, npc.position.y-1, TILE_SIZE);

        try {
            gridStateManager.removeNPC(gridId, npc.id);
            await gridStateManager.saveGridStateNPCs(gridId);
            console.log(`NPC ${npc.id} successfully removed from grid.`);

            // Add the Dead NPC "output" to the grid:
            if (npc.output) {
                console.log(`Spawning resource: ${npc.output} at NPC's death position.`);
                const resourceDetails = masterResources.find((res) => res.type === npc.output);

                const enrichedResource = {
                    ...resourceDetails,
                    type: npc.output,
                    x: Math.floor(npc.position.x),
                    y: Math.floor(npc.position.y),
                    category: resourceDetails.category || 'doober',
                    symbol: resourceDetails.symbol || '❓',
                    qtycollected: resourceDetails.qtycollected || 1,
                };

                const updatedResources = [
                    ...GlobalGridState.getResources(),
                    enrichedResource
                ];
                GlobalGridState.setResources(updatedResources);
                setResources((prevResources) => [...prevResources, enrichedResource]);

                await updateGridResource(
                    gridId, 
                    { 
                      type: npc.output,
                      x: Math.floor(npc.position.x),
                      y: Math.floor(npc.position.y),
                    },
                    setResources,
                    true
                  );
            } else {
                console.warn(`NPC ${npc.id} has no output resource defined.`);
            }
        } catch (error) {
            console.error('Error removing NPC or spawning resource:', error);
        }
        await trackQuestProgress(currentPlayer, 'Kill', npc.type, 1, currentPlayer);    }
}


export async function handleAttackOnPC(pc, currentPlayer, gridId, TILE_SIZE) {
    
    // Translate currentPlayer to pc from gridState.pcs
    const playerId = currentPlayer._id.toString();  // Convert ObjectId to string for matching
    const gridState = gridStateManager.getGridState(gridId);
    const player = gridState?.pcs[playerId];
    if (!player) {
        console.error('Player not found in gridState.');
        return;
    }

    if (!checkRange(player, pc, TILE_SIZE)) return;
    if (!isAHit(player, pc, TILE_SIZE)) return;

    const damage = calculateDamage(player, gridId);
    FloatingTextManager.addFloatingText(`- ${damage} HP`, pc.position.x, pc.position.y, TILE_SIZE);

    pc.hp -= damage;
    if (pc.hp <= 0) {
        console.log(`PC ${pc.playerId} defeated.`);
        FloatingTextManager.addFloatingText(504, pc.position.x, pc.position.y+1, TILE_SIZE);
    }
}