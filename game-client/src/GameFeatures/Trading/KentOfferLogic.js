import { getAskCenter } from '../../Economy/askSizing';

/*
 * Kent's offers are made on the server (game-server/utils/kentOffers.js: eligibility, ask sizes,
 * the board). The client only needs the XP an offer pays, to print it on the card.
 */

/**
 * XP a Kent offer pays. One function for the card's "🔷 XP" and the award, so the card stays
 * exactly what the trade pays (tuning.md principle 3). Per item: 2 x its `xp` (1 if undefined),
 * plus 2 more when the asked quantity is above the good's usual ask at this level (the center of
 * its effort-sized ask), so a big ask pays more than a small one of the same good.
 */
export function calculateKentOfferXP(offer, masterResources, playerLevel, globalTuning) {
    const offerItems = offer?.items?.length ? offer.items : [{ item: offer?.item, quantity: offer?.quantity }];
    let totalXP = 0;
    for (const { item, quantity } of offerItems) {
        const resource = masterResources.find(r => r.type === item);
        let itemXP = resource?.xp || 1;
        if (resource && Number(quantity) > Math.round(getAskCenter(resource, playerLevel, globalTuning, 'kent'))) itemXP += 1;
        totalXP += itemXP;
    }
    return totalXP * 2;
}
