/**
 * tileHazards - ground that hurts (lava today). Damage is a BURN on a clock: every `everyMs` spent
 * on the hazard costs `damage` hp, the same walking or standing still (owner, 2026-10-19). Two
 * callers feed the clock: every movement step (PlayerMovement `movePlayer`, keyboard and
 * tap-to-walk alike) and App's 1 s loop (for a player standing still). It used to be a once-a-second
 * sample of where React thought the player stood, so a held arrow key (a step every 90 ms)
 * crossed a whole lava field untouched; a per-tile charge that replaced it was too punishing.
 *
 * Stepping off for a moment does not reset the clock (hopping lava-rock-lava is not free); it
 * cools down after a full interval off the hazard.
 *
 * Tuning: globalTuning.tileHazards = { <tile letter>: { damage, everyMs } }; lava is "l".
 */
import playersInGridManager from '../../GridState/PlayersInGrid';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import FloatingTextManager from '../../UI/FloatingText';
import soundManager from '../../Sound/SoundManager';
import { getGlobalTuning } from '../../Utils/TuningManager';

const DEFAULT_HAZARDS = { l: { damage: 5, everyMs: 1000 } };
const SLACK_MS = 150;

let burnAt = null;   // when the next burn lands (null = off any hazard long enough to cool down)
let lastEveryMs = 1000;

function hazardAt(x, y) {
  const tile = GlobalGridStateTilesAndResources.getTiles()?.[y]?.[x];
  if (!tile) return null;
  const table = getGlobalTuning()?.tileHazards || DEFAULT_HAZARDS;
  return table[tile] || null;
}

/**
 * Advance the burn clock for the local player at (x, y): call it on every step and once a second.
 * When the clock comes due on a hazard tile, charge it.
 */
export function burnTick(gridId, playerId, TILE_SIZE) {
  const pc = playersInGridManager.getAllPCs(gridId)?.[playerId];
  const x = pc?.position?.x, y = pc?.position?.y;
  if (!pc || !(pc.hp > 0) || !Number.isInteger(x) || !Number.isInteger(y)) return;
  const now = Date.now();
  const hazard = hazardAt(x, y);
  if (!hazard?.damage) {
    if (burnAt !== null && now - burnAt > lastEveryMs) burnAt = null; // cooled down
    return;
  }
  const everyMs = Number(hazard.everyMs) > 0 ? Number(hazard.everyMs) : 1000;
  lastEveryMs = everyMs;
  if (burnAt === null) { burnAt = now + everyMs; return; }   // the first burn comes one interval in
  if (now < burnAt - SLACK_MS) return; // App's loop is itself 1 s: a burn due just after it is not pushed a whole second
  burnAt = now + everyMs;
  const hp = Math.max(0, pc.hp - hazard.damage);
  playersInGridManager.updatePC(gridId, playerId, { hp });
  if (TILE_SIZE) FloatingTextManager.addFloatingText(`- ${hazard.damage} ❤️‍🩹 HP`, x, y, TILE_SIZE);
  soundManager.playSFX('take_damage');
  if (hp <= 0) playersInGridManager.flushAfterTransaction(); // death is worth saving now
}
