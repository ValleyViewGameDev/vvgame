/**
 * Combat.js - the player's attack (docs/audits/combat-and-npc-review-2026-10-07.md, Track 1).
 *
 * The whole swing resolves on the client, on the input: reach check, hit roll, damage, the
 * board feedback (CombatFX) and the local kill (sprite death, XP, loot, quest tick) all happen
 * at once. The server is told afterwards, in the background, and never gates the visual.
 * Knobs live in globalTuning.json `combat` (docs/tuning.md).
 */
import API_BASE from '../../config';
import axios from 'axios';
import FloatingTextManager from "../../UI/FloatingText";
import NPCsInGridManager from "../../GridState/GridStateNPCs";
import playersInGridManager from "../../GridState/PlayersInGrid";
import { extractXY } from "../NPCs/NPCUtils";
import { updateGridResource, isWallBlocking } from "../../Utils/GridManagement";
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { earnTrophy } from '../Trophies/TrophyUtils';
import soundManager from '../../Sound/SoundManager';
import CombatFX from '../../Render/PixiRenderer/CombatFX';

// Defaults when globalTuning.combat is missing (the server copy is the real knob)
const COMBAT_DEFAULTS = {
  attackCooldownMinMs: 400,
  attackCooldownMaxMs: 800,
  attackCooldownPerSpeedMs: 100,
};

let attackReadyAt = 0; // module-wide: one swing timer for the local player

export function combatTuning(globalTuning) {
  return { ...COMBAT_DEFAULTS, ...(globalTuning?.combat || {}) };
}

/** Swing cooldown from the PC's speed stat: speed 1 → min, speed 5 → max, modifiers in between (clamped). */
export function attackCooldownMs(speed, globalTuning) {
  const t = combatTuning(globalTuning);
  const s = Number.isFinite(speed) ? speed : 5;
  const ms = t.attackCooldownMinMs + (s - 1) * t.attackCooldownPerSpeedMs;
  return Math.max(t.attackCooldownMinMs, Math.min(t.attackCooldownMaxMs, ms));
}

export function getAttackCooldownStatus() {
  return { cooldownEnd: attackReadyAt, isOnCooldown: Date.now() < attackReadyAt };
}

/** Board distance for reach: Chebyshev, so the eight neighbours are all 1 away. */
export function reachDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

const isHostile = (npc) => npc && (npc.action === 'attack' || npc.action === 'spawn');

/** The hostile NPC the player can reach right now (nearest first), or null. */
export function findEnemyInReach(gridId, playerId) {
  const player = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
  if (!player?.position) return null;
  const reach = player.attackrange || 1;
  let best = null; let bestD = Infinity;
  for (const npc of Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {})) {
    if (!isHostile(npc) || !npc.position || npc.hp <= 0) continue;
    const d = reachDistance(player.position, npc.position);
    if (d > reach || isWallBlocking(player.position, npc.position)) continue;
    const euclid = Math.hypot(player.position.x - npc.position.x, player.position.y - npc.position.y);
    if (euclid < bestD) { bestD = euclid; best = npc; }
  }
  return best;
}

/** Helper to check if target is in range and no wall is between **/
function checkRange(player, target, TILE_SIZE) {
    const playerPos = player.position;
    const targetPos = extractXY(target.position);
    if (!targetPos) {
        FloatingTextManager.addFloatingText(505, 0, 0, TILE_SIZE);
        return false;
    }
    const playerRange = player.attackrange || 1;
    if (reachDistance(playerPos, targetPos) > playerRange) {
        CombatFX.text(targetPos.x, targetPos.y, '🎯', 'miss');
        FloatingTextManager.addFloatingText(501, targetPos.x, targetPos.y, TILE_SIZE);
        return false;
    }
    if (isWallBlocking(playerPos, targetPos)) {
        FloatingTextManager.addFloatingText(40, targetPos.x, targetPos.y, TILE_SIZE);
        return false;
    }
    return true;
}

/** d20 + attack bonus vs armour class **/
function rollHit(player, target) {
    const attackRoll = Math.floor(Math.random() * 20) + 1;
    return attackRoll + (player.attackbonus || 0) >= (target.armorclass || 0);
}

/** damage stat + d6 **/
function rollDamage(player) {
    return (player.damage || 0) + Math.floor(Math.random() * 6) + 1;
}

/**
 * Attack the nearest hostile NPC in reach (keyboard / tap-to-attack). Returns true if a swing
 * happened (hit or miss), false if nothing was in reach or the swing is cooling down.
 */
export function attackNearestEnemy(ctx) {
    const { currentPlayer } = ctx;
    const gridId = currentPlayer?.location?.g;
    const playerId = String(currentPlayer?._id || '');
    if (!gridId || !playerId) return false;
    const npc = findEnemyInReach(gridId, playerId);
    if (!npc) return false;
    return handleAttackOnNPC(npc, currentPlayer, ctx.setCurrentPlayer, ctx.TILE_SIZE, ctx.setResources, ctx.masterResources, ctx.masterTrophies, ctx.globalTuning);
}

/**
 * handle attack on NPC. Synchronous: everything the player sees happens on the call.
 * Returns true when a swing happened (so callers can distinguish "cooling down" / "no reach").
 */
export function handleAttackOnNPC(npc, currentPlayer, setCurrentPlayer, TILE_SIZE, setResources, masterResources, masterTrophies = null, globalTuning = null) {
    const gridId = currentPlayer.location.g;
    const playerId = currentPlayer._id.toString();
    const player = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
    if (!player) {
        console.error(`Player not found in playersInGrid for playerId: ${playerId}.`);
        return false;
    }

    const freshNPC = NPCsInGridManager.getNPCsInGrid(gridId)?.[npc.id] || npc;
    if (freshNPC.hp <= 0) return false; // already dying

    if (player.iscamping) {
        FloatingTextManager.addFloatingText(31, freshNPC.position.x, freshNPC.position.y, TILE_SIZE);
        return false;
    }
    // Cooling down: no swing, no feedback beyond the ring that is already showing
    if (Date.now() < attackReadyAt) return false;
    if (!checkRange(player, freshNPC, TILE_SIZE)) return false;

    // A valid swing: the cooldown starts now (never on a refused click)
    const cooldown = attackCooldownMs(player.speed, globalTuning);
    attackReadyAt = Date.now() + cooldown;
    CombatFX.showCooldown(attackReadyAt, cooldown);
    CombatFX.playerLunge(player.position.x, player.position.y, freshNPC.position.x, freshNPC.position.y);
    CombatFX.engageEnemy(freshNPC.id, freshNPC.hp, freshNPC.maxhp);
    soundManager.playSFX('attack_melee');

    // The roll is decided now; the feedback lands when the blow does (at once for melee,
    // when the projectile arrives for a ranged weapon)
    const hit = rollHit(player, freshNPC);
    const damage = hit ? rollDamage(player) : 0;
    const from = { x: player.position.x, y: player.position.y };
    const to = { x: freshNPC.position.x, y: freshNPC.position.y };
    const land = () => {
        const live = NPCsInGridManager.getNPCsInGrid(gridId)?.[freshNPC.id];
        if (!hit) { CombatFX.text(to.x, to.y, 'miss', 'miss'); return; }
        if (!live || live.hp <= 0) return; // died to something else meanwhile
        live.hp -= damage;
        CombatFX.hitEnemy(live.id, from.x, from.y, live.position.x, live.position.y);
        CombatFX.text(live.position.x, live.position.y, `-${damage}`, 'damage');
        CombatFX.engageEnemy(live.id, live.hp, live.maxhp);
        if (live.hp > 0) {
            // Persist the wound in the background (Track 2 folds this into the kill route)
            NPCsInGridManager.updateNPC(gridId, live.id, { hp: live.hp, position: live.position, state: live.state })
              .catch((e) => console.warn('hp save failed', e?.message));
            return;
        }
        resolveKill(live, gridId, currentPlayer, setCurrentPlayer, setResources, masterResources, masterTrophies);
    };
    if (reachDistance(from, to) > 1) CombatFX.projectile(from.x, from.y, to.x, to.y, land);
    else land();
    return true;
}

/** The kill, resolved locally first; every server write follows in the background. */
function resolveKill(npc, gridId, currentPlayer, setCurrentPlayer, setResources, masterResources, masterTrophies) {
    const pos = { x: Math.floor(npc.position.x), y: Math.floor(npc.position.y) };
    const npcResource = masterResources.find((r) => r.type === npc.type && r.category === 'npc');
    const xp = npcResource?.xp || 0;

    // 1. The board: death animation takes the sprite over, the store forgets the NPC at once.
    //    The feedback is staggered so it can be read: skull, then XP, then the drop.
    CombatFX.killEnemy(npc.id);
    setTimeout(() => CombatFX.text(pos.x, pos.y - 0.2, '💀', 'kill'), 150);
    setTimeout(() => soundManager.playSFX('collect_money'), CombatFX.FX.DEATH_XP_DELAY_MS);
    const removal = NPCsInGridManager.removeNPC(gridId, npc.id); // local delete now, POST inside

    // 2. XP: header updates now, the server's total replaces it when it answers
    if (xp && currentPlayer.playerId) {
        setCurrentPlayer((prev) => ({ ...prev, xp: (prev.xp || 0) + xp }));
        setTimeout(() => CombatFX.text(pos.x, pos.y - 0.6, `+${xp} XP`, 'gain'), CombatFX.FX.DEATH_XP_DELAY_MS);
        axios.post(`${API_BASE}/api/addXP`, { playerId: currentPlayer.playerId, xpAmount: xp })
          .then((res) => { if (res.data?.success && Number.isFinite(res.data.newXP)) setCurrentPlayer((prev) => ({ ...prev, xp: res.data.newXP })); })
          .catch((e) => console.error('Error awarding XP:', e?.message));
    }

    // 3. Loot: on the board now, written behind
    if (npc.output) {
        const details = masterResources.find((r) => r.type === npc.output) || {};
        const drop = {
            ...details,
            type: npc.output,
            x: pos.x, y: pos.y,
            category: details.category || 'doober',
            symbol: details.symbol || '❓',
            qtycollected: details.qtycollected || 1,
        };
        // on the board once the body has faded; written behind right away
        setTimeout(() => {
            GlobalGridStateTilesAndResources.setResources([...GlobalGridStateTilesAndResources.getResources(), drop]);
            setResources((prev) => [...prev, drop]);
        }, CombatFX.FX.DEATH_LOOT_DELAY_MS);
        updateGridResource(gridId, { type: npc.output, x: pos.x, y: pos.y }).catch((e) => console.error('drop save failed', e?.message));
    }

    // 4. Position save for the player (a kill is a moment worth keeping)
    playersInGridManager.flushAfterTransaction();

    // 5. Quests and trophies, after the removal has been sent
    Promise.resolve(removal).finally(async () => {
        try {
            if (npc.type === 'Duke Angelo') {
                if (masterTrophies && currentPlayer?.playerId) {
                    await earnTrophy(currentPlayer.playerId, 'Kill the Duke', 1, currentPlayer, masterTrophies, setCurrentPlayer);
                }
                const active = currentPlayer.activeQuests?.find((q) => q.questId === 'Blood for Juliet');
                if (!active) {
                    const response = await axios.post(`${API_BASE}/api/add-player-quest`, {
                        playerId: currentPlayer.playerId, questId: 'Blood for Juliet', startTime: Date.now(),
                        progress: { goal1: 1 }, completed: true,
                    });
                    if (response.data?.success) {
                        setCurrentPlayer(response.data.player);
                        CombatFX.text(pos.x, pos.y - 1.4, 'Quest: Blood for Juliet', 'gain');
                    }
                    return;
                }
            }
            await trackQuestProgress(currentPlayer, 'Kill', npc.type, 1, setCurrentPlayer);
        } catch (error) {
            console.error('Kill follow-up failed:', error);
        }
    });
}
