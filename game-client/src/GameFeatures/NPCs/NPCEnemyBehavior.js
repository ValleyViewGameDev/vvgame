import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import soundManager from '../../Sound/SoundManager';
import CombatFX from '../../Render/PixiRenderer/CombatFX';
import { createImpactEffect } from '../../VFX/VFX';
import { isWallBlocking } from '../../Utils/GridManagement';

/**
 * Sight vs. a clear swing (Utils/GridManagement.isWallBlocking, one line-of-sight rule for the
 * whole game). Walls and doors block both. Trees only block the swing: an enemy still notices
 * and chases you past a tree, but cannot hit you through one, the same as you cannot hit it.
 */
function canSeeTarget(npcPosition, targetPosition) {
    return !isWallBlocking(npcPosition, targetPosition);
}
function canHitTarget(npcPosition, targetPosition) {
    return !isWallBlocking(npcPosition, targetPosition, { trees: true });
}

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
  // Single-PC store: the only PC on the grid is the local player (if present)
  const localPC = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {})[0] || null;

  // Force initial state to roam if not set
  if (!this.state || this.state === 'idle') {
    this.state = 'roam';
    await updateThisNPC.call(this, gridId);
  }
 
  // Check whether the PC is visible at the start of any state (immediate reaction)
  const pcVisibleInRange = !!localPC &&
    localPC.hp > 0 &&
    getDistance(this.position, localPC.position) <= this.range &&
    canSeeTarget(this.position, localPC.position);

  // If we see the PC and we're not already pursuing/attacking, immediately react
  if (pcVisibleInRange && this.state === 'roam') {
    console.log(`⚡ NPC ${this.id} spotted PC ${localPC.username}! Entering pursue state.`);
    this.targetPC = localPC;
    this.state = 'pursue';
    this.pursueTimerStart = null;
    await updateThisNPC.call(this, gridId);
    return; // Skip the rest of the state processing
  }
 
  switch (this.state) {

    case 'idle': {
      // Idle is ONLY used to get unstuck - always transitions to roam, never back to idle
      this.pursueTimerStart = null; // Clear pursuit timer
      await this.handleIdleState(tiles, resources, npcs, 2, async () => {
        // After idle, always go to roam (never back to idle)
        this.state = 'roam';
        this.targetPC = null;
        await updateThisNPC.call(this, gridId);
      });
      break;
    }

    case 'pursue': {
      this.targetPC = refreshTarget(this.targetPC, localPC); // Refresh position from latest state
      if (!this.targetPC) {
        //console.warn(`NPC ${this.id} lost its target. Returning to roam state.`);
        this.state = 'roam';
        this.pursueTimerStart = null;
        await updateThisNPC.call(this, gridId); // Save after transition
        break;
      }
      
      // First check if we can still see the target at all
      const canStillSeeTarget = canSeeTarget(this.position, this.targetPC.position);
      if (!canStillSeeTarget) {
        console.log(`👁️ NPC ${this.id} lost sight of ${this.targetPC?.username} during pursuit. Returning to roam.`);
        this.state = 'roam';
        this.pursueTimerStart = null;
        this.targetPC = null;
        await updateThisNPC.call(this, gridId);
        break;
      }
      
      // Check if already in attack range AND can see target before pursuing
      const currentDistance = reach(this.position, this.targetPC.position);
      if (currentDistance <= this.attackrange) {
        // Verify a clear swing before switching to attack
        if (canHitTarget(this.position, this.targetPC.position)) {
          this.state = 'attack';
          await updateThisNPC.call(this, gridId);
          performAttack.call(this, gridId, TILE_SIZE); // no dead tick between arriving and swinging
          break;
        }
      }
      if (!this.pursueTimerStart) this.pursueTimerStart = Date.now();
      const timeSincePursueStart = Date.now() - this.pursueTimerStart;
      const distance = getDistance(this.position, this.targetPC?.position);
      // Give up if: 
      // 1. Target is too far AND we've been chasing for a while, OR
      // 2. We can't see the target anymore (behind wall)
      const canSeeTargetNow = canSeeTarget(this.position, this.targetPC.position);
      
      if ((distance > this.range * 2 && timeSincePursueStart > 5000) || !canSeeTargetNow) {
        if (!canSeeTargetNow) {
          console.log(`👁️ NPC ${this.id} lost sight of ${this.targetPC?.username} (wall blocking). Giving up pursuit.`);
        } else {
          console.log(`🐺 NPC ${this.id} gave up chasing ${this.targetPC?.username} (too far).`);
        }
        this.state = 'roam';
        this.pursueTimerStart = null;
        this.targetPC = null;
        await updateThisNPC.call(this, gridId);
        break;
      }

      // Chase along an A* path (AllNPCsShared.followPath: the NPC's own terrain, no corner
      // cutting, never onto the player's or another NPC's tile), ending beside the player.
      // A single greedy step toward the player stalled whenever that one direction was
      // blocked (a rock on the diagonal's corner), leaving the enemy unable to reach a player
      // who could still hit it.
      const handlePursueWithLineOfSight = async () => {
        // Check if already in attack range AND can hit target BEFORE attempting to move
        const distanceToPlayer = reach(this.position, this.targetPC.position);
        if (distanceToPlayer <= this.attackrange) {
          if (canHitTarget(this.position, this.targetPC.position)) {
            this.state = 'attack';
            await updateThisNPC.call(this, gridId);
            performAttack.call(this, gridId, TILE_SIZE);
            return;
          }
        }

        const before = { x: Math.floor(this.position.x), y: Math.floor(this.position.y) };
        const result = this.followPath(
          Math.floor(this.targetPC.position.x), Math.floor(this.targetPC.position.y),
          tiles, resources, npcs, { stopShort: true }
        );
        const moved = Math.floor(this.position.x) !== before.x || Math.floor(this.position.y) !== before.y;
        if (moved) { this.stuckCounter = 0; return; }
        if (result === 'arrived') return; // beside the player, waiting on a clear swing

        // No route this tick (or none at all): after a few tries, wander to get unstuck
        if (!this.stuckCounter) this.stuckCounter = 0;
        this.stuckCounter++;
        if (result === 'blocked' || this.stuckCounter >= 3) {
          console.log(`NPC ${this.id} has no route to ${this.targetPC?.username}. Using idle to unstick.`);
          this.state = 'idle';
          this.stuckCounter = 0;
          this.path = null;
          await updateThisNPC.call(this, gridId);
        }
      };

      await handlePursueWithLineOfSight();
      break;
    }

    case 'attack': {
      this.targetPC = refreshTarget(this.targetPC, localPC); // Refresh position from latest state

      if (!this.targetPC) {
        //console.warn(`NPC ${this.id} lost its target. Returning to roam state.`);
        this.pursueTimerStart = null;
        this.state = 'roam';
        await updateThisNPC.call(this, gridId); // Save after transition
        break;
      }
      if (this.targetPC.hp <= 0 || this.targetPC.iscamping) {
        this.state = 'roam';
        await updateThisNPC.call(this, gridId);
        break; // ✅ Skip PCs that are dead or camping
      }
      const distanceToTarget = reach(this.position, this.targetPC.position);
      if (distanceToTarget > this.attackrange) {
        //console.log(`PC ${this.targetPC.username} moved out of attack range. Returning to 'pursue' state.`);
        this.state = 'pursue';
        await updateThisNPC.call(this, gridId); // Save after transition
        break;
      }
      
      // Check for a clear swing (walls, doors, trees) before attacking
      if (!canHitTarget(this.position, this.targetPC.position)) {
        this.state = 'pursue';
        await updateThisNPC.call(this, gridId);
        break;
      }
 
      performAttack.call(this, gridId, TILE_SIZE);
      break;
    }

    case 'roam': {
      this.pursueTimerStart = null;
      await this.handleRoamState(tiles, resources, npcs, () => {
        // Don't change state - stay in roam
        // This callback is called after roam completes, but we just continue roaming
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
 * Re-read the current target from the store so position/hp are fresh.
 * Returns null if the target is no longer the PC on this grid.
 */
function refreshTarget(targetPC, localPC) {
  if (!targetPC || !localPC) return null;
  return localPC.playerId === targetPC.playerId ? localPC : null;
}

/**
 * Calculates the Euclidean distance between two points (sight range).
 */
function getDistance(pos1, pos2) {
  return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2);
}

/** Board reach (Chebyshev): the eight neighbours are all 1 away, like the player's swing. */
function reach(pos1, pos2) {
  return Math.max(Math.abs(pos1.x - pos2.x), Math.abs(pos1.y - pos2.y));
}

/**
 * The swing (docs/audits/combat-and-npc-review-2026-10-07.md, Track 1.6): a short wind-up on
 * the sprite, then the roll resolves, provided the enemy is still attacking a live target in
 * reach. Called on the tick the enemy enters `attack` and on every attack tick after.
 */
function performAttack(gridId, TILE_SIZE) {
  if (this.swingPending) return;
  this.swingPending = true;
  CombatFX.enemyWindup(this.id);
  CombatFX.engageEnemy(this.id, this.hp, this.maxhp);
  setTimeout(() => {
    this.swingPending = false;
    const target = this.targetPC;
    if (this.state !== 'attack' || !target || target.hp <= 0 || target.iscamping) return;
    // Re-read the live PC: it may have stepped away during the wind-up
    const live = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {})[0];
    if (!live || live.playerId !== target.playerId) return;
    if (reach(this.position, live.position) > this.attackrange || !canHitTarget(this.position, live.position)) return;

    const attackRoll = Math.floor(Math.random() * 20) + 1;
    const isAHit = attackRoll + (this.attackbonus || 0) >= (live.armorclass || 0);
    const damage = isAHit ? Math.floor(Math.random() * 6) + 1 + (this.damage || 0) : 0;
    const land = () => {
      const pc = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {})[0];
      if (!pc || pc.hp <= 0) return;
      if (!isAHit) { CombatFX.text(pc.position.x, pc.position.y, 'miss', 'miss'); return; }
      const newHP = Math.max(0, pc.hp - damage);
      CombatFX.playerHit();
      createImpactEffect(pc.position.x, pc.position.y, this.position.x, this.position.y);
      CombatFX.text(pc.position.x, pc.position.y, `-${damage}`, 'player');
      soundManager.playSFX('take_damage');
      playersInGridManager.updatePC(gridId, pc.playerId, { hp: newHP, lastUpdated: Date.now() });
      if (newHP <= 0) playersInGridManager.flushAfterTransaction(); // death is worth saving now
    };
    // A ranged enemy's shot flies to the player; a melee blow lands at once
    if (reach(this.position, live.position) > 1) CombatFX.projectile(this.position.x, this.position.y, live.position.x, live.position.y, land);
    else land();
  }, CombatFX.FX.WINDUP_MS);
}


export function attachEnemyBehavior(NPC) {
  NPC.prototype.handleEnemyBehavior = handleEnemyBehavior;
}