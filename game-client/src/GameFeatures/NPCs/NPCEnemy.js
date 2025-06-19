import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import FloatingTextManager from "../../UI/FloatingText";

const updateThisNPC = async function(gridId) {
  await NPCsInGridManager.updateNPC(gridId, this.id, {
    state: this.state,
    position: this.position,
  });
};

async function handleEnemyBehavior(gridId, TILE_SIZE) {
  //console.log(`🐺 NPC ${this.id} handling enemy behavior on grid ${gridId}.`);
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources();
  const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
  //console.log('🐺 npcs = ', npcs);
  const pcs = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {}); // Get all PCs on the grid
  //console.log('😀 pcs = ', pcs);

  if (!this.state) this.state = 'idle';

  switch (this.state) {

    case 'idle': {
      this.pursueTimerStart = null; // Clear pursuit timer
      await this.handleIdleState(tiles, resources, npcs, 5, async () => {
        const closestPC = findClosestPC(this.position, pcs);
        if (closestPC) {
          //console.log(`NPC ${this.id} detected PC ${closestPC.username} within range. Entering 'pursue' state.`);
          this.targetPC = closestPC; // Set the target PC
          this.state = 'pursue';
          await updateThisNPC.call(this, gridId); // Save after transition

        } else {
          //console.log(`NPC ${this.id} did not detect any PCs within range. Entering 'roam' state.`);
          this.state = 'roam';
          await updateThisNPC.call(this, gridId); // Save after transition
        }
      });
      break;
    }

    case 'pursue': {
      this.targetPC = pcs.find(pc => pc.playerId === this.targetPC?.playerId);
      if (!this.targetPC) {
        //console.warn(`NPC ${this.id} lost its target. Returning to idle state.`);
        this.state = 'idle';
        this.pursueTimerStart = null;
        await updateThisNPC.call(this, gridId); // Save after transition
        break;
      }
      if (!this.pursueTimerStart) this.pursueTimerStart = Date.now();
      const timeSincePursueStart = Date.now() - this.pursueTimerStart;
      const distance = getDistance(this.position, this.targetPC?.position);
      if (distance > this.range * 2 && timeSincePursueStart > 5000) {
        console.log(`🐺 NPC ${this.id} gave up chasing ${this.targetPC?.username}.`);
        this.state = 'idle';
        this.pursueTimerStart = null;
        this.targetPC = null;
        await updateThisNPC.call(this, gridId);
        break;
      }
      console.log(`NPC ${this.id} is pursuing PC ${this.targetPC.username}.`);
      await this.handlePursueState(this.targetPC.position, tiles, resources, npcs, pcs, async () => {
        //console.log(`NPC ${this.id} transitioned to ATTACK state targeting ${this.targetPC.username}.`);
        this.state = 'attack';
        await updateThisNPC.call(this, gridId); // Save after transition
      });
      break;
    }

    case 'attack': {
      this.targetPC = pcs.find(pc => pc.playerId === this.targetPC?.playerId);

      if (!this.targetPC) {
        //console.warn(`NPC ${this.id} lost its target. Returning to idle state.`);
        this.pursueTimerStart = null;
        this.state = 'idle';
        await updateThisNPC.call(this, gridId); // Save after transition
        break;
      }
      if (this.targetPC.hp <= 0 || this.targetPC.iscamping) {
        this.state = 'idle';
        await updateThisNPC.call(this, gridId);
        break; // ✅ Skip PCs that are dead or camping
      }
      const distanceToTarget = getDistance(this.position, this.targetPC.position);
      if (distanceToTarget > this.attackrange) {
        //console.log(`PC ${this.targetPC.username} moved out of attack range. Returning to 'pursue' state.`);
        this.state = 'pursue';
        await updateThisNPC.call(this, gridId); // Save after transition
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
        const amountToMod = -damage;  // Damage is negative
        
        try { 
          const updatedValue = (this.targetPC.hp += amountToMod);
          playersInGridManager.updatePC(gridId, this.targetPC.playerId, { hp: updatedValue });
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
      this.pursueTimerStart = null;
      await this.handleRoamState(tiles, resources, npcs, async () => {
        //console.log(`NPC ${this.id} transitioning to IDLE state after roaming.`);
        this.state = 'idle';
        await updateThisNPC.call(this, gridId); // Save after transition
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
 * Picks randomly among PCs within an arbitrary range cap.
 */
function findClosestPC(npcPosition, pcs) {
  const validPCs = pcs.filter(pc => pc.hp > 0);
  if (validPCs.length === 0) return null;

  const pcsInRange = validPCs.filter(pc => getDistance(npcPosition, pc.position) <= 10); // Arbitrary range cap

  if (pcsInRange.length === 0) return null;

  // If multiple are in range, pick one randomly
  const randomIndex = Math.floor(Math.random() * pcsInRange.length);
  return pcsInRange[randomIndex];
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