/**
 * What a Citizen is doing, as one short line: the Citizens' counterpart of the Farm Animal
 * status ("Cow is grazing. 3m 2s"). Used by the board tooltip (Render/RenderDynamicElements.js)
 * and the panels (CitizenStatusLine.js). Pure: no imports, so the renderer can use it.
 *
 * Reads the brain's persisted fields (NPCCitizenBehavior.js): citizenState, citizenStateUntil,
 * citizenTask. Returns null for a citizen with no state loop (legacy behaviour).
 */
const S = {
  working: 17501,
  toTree: 17502,
  collectWood: 17503,
  toWarehouse: 17504,
  rancher: 17505,
  farmHand: 17506,
  crafter: 17507,
  resting: 17508,
  roaming: 17509,
  eatingLooking: 17510,
  eatingGoing: 17511,
  socializing: 17512,
  waiting: 17513,
  talking: 17514,
};
const FALLBACK = {
  17501: 'is working.', 17502: 'is heading to a tree.', 17503: 'is collecting the wood.',
  17504: 'is carrying wood to the Warehouse.', 17505: 'is tending the animals.',
  17506: 'is harvesting crops.', 17507: 'is collecting from the crafting stations.',
  17508: 'is resting.', 17509: 'is out for a walk.', 17510: 'is looking for something to eat.',
  17511: 'is going to eat.', 17512: 'is socializing.', 17513: 'is waiting for you.',
  17514: 'is talking with you.',
};
const t = (strings, key) => strings?.[key] || FALLBACK[key];

function workingKey(npc) {
  const phase = npc.citizenTask?.phase;
  switch (npc.type) {
    case 'Lumberjack':
      if (phase === 'collect') return S.collectWood;
      if (phase === 'toWarehouse') return S.toWarehouse;
      return S.toTree;
    case 'Rancher': return S.rancher;
    case 'Farm Hand':
    case 'Farmer': return S.farmHand;
    case 'Crafter': return S.crafter;
    default: return S.working;
  }
}

/** "3m 2s" (or "1h 4m") until the current loop state ends; '' when there is no clock. */
export function citizenCountdown(npc, now = Date.now()) {
  if (!npc?.citizenStateUntil || npc.citizenState === 'waiting') return '';
  const ms = Math.max(0, npc.citizenStateUntil - now);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

/**
 * The status sentence (without the name), e.g. "is resting.", or null when the citizen has no
 * loop state. `inPanel`: the player has this citizen's panel open, so "waiting for you" reads
 * "talking with you".
 */
export function citizenStatusText(npc, strings, { inPanel = false } = {}) {
  const state = npc?.citizenState;
  if (!state) return null;
  switch (state) {
    case 'waiting': return t(strings, inPanel ? S.talking : S.waiting);
    case 'working': return t(strings, workingKey(npc));
    case 'resting': return t(strings, S.resting);
    case 'roaming': return t(strings, S.roaming);
    case 'eating': return t(strings, npc.citizenTask?.x != null ? S.eatingGoing : S.eatingLooking);
    case 'socializing': return t(strings, S.socializing);
    default: return null;
  }
}
