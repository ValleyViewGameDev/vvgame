// The Caravan's reward tiers, for display. The orders and rewards themselves are made, filled and
// mailed on the server (game-server/utils/caravan.js, which holds the generation rules and the
// same two helpers; docs/tuning.md, Train): filling every order but the aspirational ones pays the
// base tier, filling all of them adds the full tier.

const ASPIRATIONAL_ORDERS = 2;

/**
 * How many filled orders unlock the base reward: every order except the aspirational ones
 * (older Trains without bands: all but ASPIRATIONAL_ORDERS).
 */
export function getTrainBaseThreshold(offers) {
    const count = offers?.length || 0;
    const aspirational = offers?.some(o => o.band)
        ? offers.filter(o => o.band === 'aspirational').length
        : Math.min(ASPIRATIONAL_ORDERS, Math.max(0, count - 1));
    return Math.max(1, count - aspirational);
}

/**
 * Splits a Train's rewards into the base tier and the full tier. Rewards saved before tiers
 * existed have no `tier`: their XP is the base reward and the rest the full reward.
 */
export function splitTrainRewards(rewards) {
    const tierOf = (r) => r.tier || (r.item === 'XP' ? 'base' : 'full');
    return {
        base: (rewards || []).filter(r => tierOf(r) === 'base'),
        full: (rewards || []).filter(r => tierOf(r) === 'full')
    };
}
