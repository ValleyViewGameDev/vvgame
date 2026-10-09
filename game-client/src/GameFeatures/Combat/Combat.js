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
import { isWallBlocking } from "../../Utils/GridManagement";
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { earnTrophy } from '../Trophies/TrophyUtils';
import soundManager from '../../Sound/SoundManager';
import CombatFX from '../../Render/PixiRenderer/CombatFX';
import { createImpactEffect, createNPCDeathEffect } from '../../VFX/VFX';

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

/**
 * Melee or ranged is the EQUIPPED WEAPON's `ranged` flag (resources.json), not the reach:
 * reach-adding powers still extend a sword's swing, but only a bow shows a projectile.
 * (Owner note 2026-10-08: revisit whether range powers should apply to melee at all.)
 */
export function isRangedWeaponEquipped(currentPlayer, masterResources) {
  const weapon = currentPlayer?.settings?.equippedWeapon;
  if (!weapon) return false;
  const def = (masterResources || []).find((r) => r.type === weapon);
  return !!def?.ranged;
}

/** Where a kill's drop lands: the NPC's tile if nothing sits there, else the nearest free tile. */
function findDropTile(x, y, avoid = null) {
  const tiles = GlobalGridStateTilesAndResources.getTiles() || [];
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  const taken = new Set();
  if (avoid) taken.add(`${Math.round(avoid.x)},${Math.round(avoid.y)}`); // not under the player's feet: walking ON is what collects
  for (const r of resources) {
    if (!r) continue;
    const span = r.size || 1;
    for (let dx = 0; dx < span; dx++) for (let dy = 0; dy < span; dy++) taken.add(`${r.x + dx},${r.y - dy}`);
  }
  const free = (tx, ty) => tiles[ty]?.[tx] && !['w', 'l'].includes(tiles[ty][tx]) && !taken.has(`${tx},${ty}`);
  if (free(x, y)) return { x, y };
  for (let radius = 1; radius <= 3; radius++) {
    const ring = [];
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      if (free(x + dx, y + dy)) ring.push({ x: x + dx, y: y + dy, d: dx * dx + dy * dy });
    }
    if (ring.length) { ring.sort((a, b) => a.d - b.d); return { x: ring[0].x, y: ring[0].y }; }
  }
  return { x, y }; // nowhere free nearby: stack after all
}

/** The hostile NPC the player can reach right now (nearest first), or null. */
export function findEnemyInReach(gridId, playerId) {
  const player = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
  if (!player?.position) return null;
  const reach = player.attackrange || 1;
  let best = null; let bestD = Infinity;
  for (const npc of Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {})) {
    if (!isHostile(npc) || !npc.position || npc.hp <= 0) continue;
    const d = reachDistance(player.position, npc.position);
    if (d > reach || isWallBlocking(player.position, npc.position, { trees: true })) continue;
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
    if (isWallBlocking(playerPos, targetPos, { trees: true })) {
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

    // The roll is decided now; the feedback lands when the blow does (at once for melee,
    // when the projectile arrives for a ranged weapon). Sound: the swoosh is the miss; a hit
    // plays attack_hit when it lands (Sound/SFXMap.json; the hit file is a placeholder).
    const hit = rollHit(player, freshNPC);
    const damage = hit ? rollDamage(player) : 0;
    const ranged = isRangedWeaponEquipped(currentPlayer, masterResources);
    if (!hit || ranged) soundManager.playSFX('attack_miss');
    const from = { x: player.position.x, y: player.position.y };
    const to = { x: freshNPC.position.x, y: freshNPC.position.y };
    const land = () => {
        const live = NPCsInGridManager.getNPCsInGrid(gridId)?.[freshNPC.id];
        if (!hit) { CombatFX.text(to.x, to.y, 'miss', 'miss'); return; }
        if (!live || live.hp <= 0) return; // died to something else meanwhile
        live.hp -= damage;
        soundManager.playSFX('attack_hit');
        CombatFX.hitEnemy(live.id, from.x, from.y, live.position.x, live.position.y);
        createImpactEffect(live.position.x, live.position.y, from.x, from.y);
        CombatFX.text(live.position.x, live.position.y, `-${damage}`, 'damage');
        CombatFX.engageEnemy(live.id, live.hp, live.maxhp);
        if (live.hp > 0) return; // a wound stays client-side; the server only hears about the kill
        resolveKill(live, gridId, currentPlayer, setCurrentPlayer, setResources, masterResources, masterTrophies);
    };
    if (ranged) CombatFX.projectile(from.x, from.y, to.x, to.y, land);
    else land();
    return true;
}

/**
 * The kill, resolved locally first (death beat, drop, XP in the header), then reported ONCE to
 * POST /action/npc-kill, which removes the NPC, grants the xp, places the drop and advances Kill
 * quests on the server (docs/audits/combat-and-npc-review-2026-10-07.md, Track 2). The server's
 * answer reconciles the header xp, the quest list and, if it chose another tile, the drop.
 */
function resolveKill(npc, gridId, currentPlayer, setCurrentPlayer, setResources, masterResources, masterTrophies) {
    const pos = { x: Math.floor(npc.position.x), y: Math.floor(npc.position.y) };
    const npcResource = masterResources.find((r) => r.type === npc.type && r.category === 'npc');
    const xp = npcResource?.xp || 0;
    const playerId = String(currentPlayer._id || currentPlayer.playerId);
    const myTile = playersInGridManager.getPlayersInGrid(gridId)?.[playerId]?.position;

    // 1. The board: the death beat takes the sprite over and a burst (VFX.js, picked by the
    //    template's deathVfx) explodes from the tile; the store forgets the NPC at once.
    CombatFX.killEnemy(npc.id);
    setTimeout(() => createNPCDeathEffect(pos.x, pos.y, npcResource?.deathVfx), CombatFX.FX.DEATH_BURST_DELAY_MS);
    setTimeout(() => soundManager.playSFX('collect_money'), CombatFX.FX.DEATH_XP_DELAY_MS);
    NPCsInGridManager.forgetNPC(gridId, npc.id);

    // 2. XP in the header now; the server's total replaces it when it answers
    if (xp) {
        setCurrentPlayer((prev) => ({ ...prev, xp: (prev.xp || 0) + xp }));
        setTimeout(() => CombatFX.text(pos.x, pos.y, `+${xp} XP`, 'gain'), CombatFX.FX.DEATH_XP_DELAY_MS);
    }

    // 3. The drop: the client's guess at the nearest free tile falls in and bounces; the server
    //    confirms the tile (or moves it) in its answer
    let localDrop = null;
    if (npc.output) {
        const details = masterResources.find((r) => r.type === npc.output) || {};
        const at = findDropTile(pos.x, pos.y, myTile);
        localDrop = { ...details, type: npc.output, x: at.x, y: at.y, category: details.category || 'doober', symbol: details.symbol || '❓', qtycollected: details.qtycollected || 1 };
        const placed = localDrop;
        setTimeout(() => {
            CombatFX.dropBounce(placed.x, placed.y, { symbol: placed.symbol, filename: placed.filename || null });
            GlobalGridStateTilesAndResources.setResources([...GlobalGridStateTilesAndResources.getResources(), placed]);
            setResources((prev) => [...prev, placed]);
        }, CombatFX.FX.DEATH_LOOT_DELAY_MS);
    }

    // 4. Position save for the player (a kill is a moment worth keeping)
    playersInGridManager.flushAfterTransaction();

    // 5. The one combat write
    const report = axios.post(`${API_BASE}/api/action/npc-kill`, {
        playerId, gridId, npcId: npc.id, dropAt: localDrop ? { x: localDrop.x, y: localDrop.y } : undefined,
    }).then((res) => {
        const d = res.data || {};
        if (!d.success) return false;
        setCurrentPlayer((prev) => ({
            ...prev,
            ...(Number.isFinite(d.xp) ? { xp: d.xp } : {}),
            ...(Array.isArray(d.activeQuests) ? { activeQuests: d.activeQuests } : {}),
        }));
        if (localDrop && d.drop && (d.drop.x !== localDrop.x || d.drop.y !== localDrop.y)) {
            // the server placed it elsewhere: move ours to match
            const moveLocal = (list) => list.map((r) => (r && r.type === localDrop.type && r.x === localDrop.x && r.y === localDrop.y) ? { ...r, x: d.drop.x, y: d.drop.y } : r);
            GlobalGridStateTilesAndResources.setResources(moveLocal(GlobalGridStateTilesAndResources.getResources()));
            setResources((prev) => moveLocal(prev));
        }
        return true;
    }).catch((e) => {
        // Refused (not your grid, unknown NPC, too fast) or failed: the board keeps the local
        // outcome for this session; the next grid load shows the server's truth
        console.warn('npc-kill not accepted:', e?.response?.data?.reason || e?.message);
        return false;
    });

    // 6. Duke Angelo's trophy and story quest ride on the accepted kill (client paths, unchanged)
    if (npc.type === 'Duke Angelo') {
        report.then(async (ok) => {
            if (!ok) return;
            try {
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
                }
            } catch (error) {
                console.error('Duke follow-up failed:', error);
            }
        });
    }
}
