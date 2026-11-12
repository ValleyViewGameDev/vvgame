/**
 * What an NPC save from the owner's client may change (BL-20, 2026-11-11).
 *
 * The client runs the NPCs of the grid it stands on and saves each one whole through
 * /save-single-npc (GridState/GridStateNPCs.js updateNPC). That stays (the server does not
 * simulate NPCs), but the fields something is paid for are checked against the server's own copy
 * and its own clock, so a tampered save cannot:
 *
 * - finish a graze early: a grazeEnd never moves earlier than the stored one (graze-speedup, the
 *   paid way, sets it server-side), a NEW graze cannot end sooner than the type's growtime from
 *   now, and an animal may become 'processing' (ready to collect, /action/animal-collect) only
 *   once the server's grazeEnd has passed;
 * - change an NPC's maxhp (always the tuning's; /action/npc-kill's kill-rate bound reads it) or
 *   raise an existing NPC's hp, or hp above maxhp (a Healer spends 1 hp per heal and vanishes at
 *   0; nothing heals an NPC on the client).
 *
 * TOLERANCE_MS absorbs a player's clock running ahead of the server's, so a fair save is never
 * refused. A changed field is ADJUSTED, never refused: the route answers the adjusted values and
 * the client adopts them, so the board and the server agree again.
 */
const TOLERANCE_MS = 60 * 1000;

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * @param {object|undefined} prev  the NPC as stored (undefined for a new one)
 * @param {object} incoming        the NPC as the client sent it (changed in place)
 * @param {object|null} def        its resources.json row
 * @returns {object|null} the fields that were adjusted, or null when the save stands as sent
 */
function applyNpcSaveRules(prev, incoming, def, now = Date.now()) {
  const adjusted = {};

  // maxhp is the tuning's; a type without one (farm animals) keeps whatever the server has, and a
  // save that leaves it out is not a change
  const tunedMax = num(def?.maxhp);
  let maxhp = tunedMax;
  if (tunedMax !== null) {
    if (num(incoming.maxhp) !== tunedMax) { incoming.maxhp = tunedMax; adjusted.maxhp = tunedMax; }
  } else if (prev) {
    maxhp = num(prev.maxhp);
    if (incoming.maxhp !== undefined && num(incoming.maxhp) !== maxhp) { incoming.maxhp = maxhp; adjusted.maxhp = maxhp; }
  }

  // hp never rises on an NPC the grid already has, and never passes maxhp (enemies spawned before a
  // tuning change carry the old, higher numbers until their next save)
  const hp = num(incoming.hp);
  const prevHp = prev && Number.isFinite(num(prev.hp)) ? num(prev.hp) : null;
  const ceiling = prevHp !== null && maxhp !== null ? Math.min(prevHp, maxhp) : (prevHp ?? maxhp);
  if (hp !== null && ceiling !== null && hp > ceiling) { incoming.hp = ceiling; adjusted.hp = ceiling; }

  if (def?.action === 'graze') {
    const growMs = (Number(def.growtime) || 0) * 1000;
    const prevEnd = num(prev?.grazeEnd);
    let end = num(incoming.grazeEnd);
    if (end !== null) {
      if (prevEnd !== null && end < prevEnd) end = prevEnd;                                   // never shortened
      else if (prevEnd === null) end = Math.max(end, now + growMs - TOLERANCE_MS);            // a new graze runs its full time
    }
    if (end !== num(incoming.grazeEnd)) { incoming.grazeEnd = end; adjusted.grazeEnd = end; }

    if (incoming.state === 'processing' && prev?.state !== 'processing') {
      const ready = end !== null && end <= now + TOLERANCE_MS;
      if (!ready) {
        const state = prev?.state && prev.state !== 'processing' ? prev.state : (end !== null ? 'grazing' : 'idle');
        incoming.state = state;
        adjusted.state = state;
      }
    }
  }

  return Object.keys(adjusted).length ? adjusted : null;
}

/** /action/animal-collect: ready by the server's own clock (a processing animal's grazeEnd has passed). */
function grazeReady(npc, now = Date.now()) {
  if (!npc || npc.state !== 'processing') return false;
  const end = num(npc.grazeEnd);
  return end === null || end <= now + TOLERANCE_MS;
}

module.exports = { applyNpcSaveRules, grazeReady, TOLERANCE_MS };
