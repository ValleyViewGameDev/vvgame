import socket from '../../socketManager'; 
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import FloatingTextManager from "../../UI/FloatingText";
import { modifyPlayerStatsInGridState } from '../../Utils/playerManagement';

async function handleEnemyBehavior(gridId, TILE_SIZE) {
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources();
  const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId)?.npcs || {});
  const pcs = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {}); // Get all PCs on the grid

  //console.log(`NPC ${this.id} handling enemy behavior on grid ${gridId}.`);

  if (!this.state) this.state = 'idle';

  switch (this.state) {

    case 'idle': {
      await this.handleIdleState(tiles, resources, pcs, 5, () => {
        const closestPC = findClosestPC(this.position, pcs);
        if (closestPC && getDistance(this.position, closestPC.position) <= this.range) {
          //console.log(`NPC ${this.id} detected PC ${closestPC.username} within range. Entering 'pursue' state.`);
          this.targetPC = closestPC; // Set the target PC
          this.state = 'pursue';
          NPCsInGridManager.saveGridStateNPCs(gridId); // Save after transition

        } else {
          //console.log(`NPC ${this.id} did not detect any PCs within range. Entering 'roam' state.`);
          this.state = 'roam';
          NPCsInGridManager.saveGridStateNPCs(gridId); // Save after transition
        }
      });
      break;
    }

    case 'pursue': {
      if (!this.targetPC) {
        //console.warn(`NPC ${this.id} lost its target. Returning to idle state.`);
        this.state = 'idle';
        NPCsInGridManager.saveGridStateNPCs(gridId); // Save after transition
        break;
      }

      //console.log(`NPC ${this.id} is pursuing PC ${this.targetPC.username}.`);
      await this.handlePursueState(this.targetPC.position, tiles, resources, pcs, () => {
        //console.log(`NPC ${this.id} transitioned to ATTACK state targeting ${this.targetPC.username}.`);
        this.state = 'attack';
      });
      break;
    }

    case 'attack': {
      if (!this.targetPC) {
        //console.warn(`NPC ${this.id} lost its target. Returning to idle state.`);
        this.state = 'idle';
        NPCsInGridManager.saveGridStateNPCs(gridId); // Save after transition
        break;
      }
      if (this.targetPC.hp <= 0 || this.targetPC.iscamping) {
        this.state = 'idle';
        break; // ✅ Skip PCs that are dead or camping
      }
      const distanceToTarget = getDistance(this.position, this.targetPC.position);
      if (distanceToTarget > this.attackrange) {
        //console.log(`PC ${this.targetPC.username} moved out of attack range. Returning to 'pursue' state.`);
        this.state = 'pursue';
        NPCsInGridManager.saveGridStateNPCs(gridId); // Save after transition
        break;
      }
 
      // Perform the attack
      const attackRoll = Math.floor(Math.random() * 20) + 1;
      const hitRoll = attackRoll + this.attackbonus;
      const isAHit = hitRoll >= this.targetPC.armorclass;

      // console.log('attackRoll = ', attackRoll);
      // console.log('this.attackBonus = ', this.attackbonus)
      // console.log('this.targetPC = ',this.targetPC);
      // console.log('this.targetPC.armorclass = ',this.targetPC.armorclass);
      // console.log('hitRoll = ', hitRoll);
      // console.log('isAHit = ', isAHit);

      if (!isAHit) {
        //console.log(`NPC ${this.id} missed the attack on ${this.targetPC.username}.`);
        FloatingTextManager.addFloatingText(503, this.targetPC.position.x, this.targetPC.position.y, TILE_SIZE);
        setTimeout(() => {
          this.state = 'attack'; // Retry attack after waiting
        }, this.speed);
      } else {
        // apply damage
        const damage = Math.floor(Math.random() * 6) + 1 + this.damage;
        // Define the stat and amount to modify before calling modifyPlayerStats
        const statToMod = 'hp';
        const amountToMod = -damage;  // Damage is negative
        
        try {
          await modifyPlayerStatsInGridState(statToMod, amountToMod, this.targetPC.playerId, gridId);
          FloatingTextManager.addFloatingText(`- ${damage} ❤️‍🩹 HP`, this.targetPC.position.x, this.targetPC.position.y, TILE_SIZE );
          // ✅ Force update of NPCsInGrid after modifying HP
          NPCsInGridManager.saveGridStateNPCs(gridId);  // ✅ Ensures NPC logic reads the updated HP in next cycle
          // ✅ Immediately fetch the latest grid state
          const updatedPcs = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {});
          this.targetPC = updatedPcs.find(pc => pc.playerId === this.targetPC.playerId);
        } catch (error) {
          console.error(`Error applying damage to player ${this.targetPC.username}:`, error);
        }
      }
      break;
    }

    case 'roam': {
      await this.handleRoamState(tiles, resources, pcs, () => {
        //console.log(`NPC ${this.id} transitioning to IDLE state after roaming.`);
        this.state = 'idle';
        NPCsInGridManager.saveGridStateNPCs(gridId); // Save after transition
      });
      break;
    }

    default: {
      console.warn(`Unhandled state: ${this.state}`);
      break;
    }
  }
}

/**
 * Finds the closest PC to the given position.
 */
function findClosestPC(npcPosition, pcs) {
  let closestPC = null;
  let minDistance = Infinity;

  pcs.forEach((pc) => {
    if (pc.hp <= 0) return; // ✅ Skip PCs that are dead
    const distance = getDistance(npcPosition, pc.position);
    if (distance < minDistance) {
      minDistance = distance;
      closestPC = pc;
    }
  });

  return closestPC;
}

/**
 * Calculates the Euclidean distance between two points.
 */
function getDistance(pos1, pos2) {
  return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2);
}


export function attachEnemyBehavior(NPC) {
  NPC.prototype.handleEnemyBehavior = handleEnemyBehavior;
}