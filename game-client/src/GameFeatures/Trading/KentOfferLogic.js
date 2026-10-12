import { isACrop, areIngredientsUnlocked } from '../../Utils/ResourceHelpers';
import { selectWeightedRandomItem } from '../../Economy/DropRates';
import { getDerivedLevel } from '../../Utils/playerManagement';

// ============================================================================
// TUNING CONSTANTS - Adjust these to balance Kent offers
// ============================================================================

// Multi-item offer target counts by player level (out of 6 offers)
// { maxLevel, min, target, max } - min/max are hard limits, target is the center of the bell curve
// The system picks a random count weighted toward 'target', within [min, max]
const MULTI_ITEM_TARGET_COUNTS = [
    { maxLevel: 5, min: 0, target: 0, max: 0 },    // Levels 1-5: always 0 multi-item
    { maxLevel: 6, min: 1, target: 1, max: 2 },    // Level 6: at least 1 (two items = double XP), sometimes 2 (tuning.md, 2026-10-05)
    { maxLevel: 7, min: 1, target: 2, max: 3 },    // Level 7: usually 2, sometimes 1 or 3, never 0
    { maxLevel: 9, min: 1, target: 3, max: 4 },    // Levels 8-9: usually 3, sometimes 2 or 4
    { maxLevel: Infinity, min: 3, target: 5, max: 6 } // Levels 10+: usually 5, sometimes 4 or 6
];

// Crop percentage enforcement by player level
// Ensures early-game players get mostly crops they can easily grow
// { maxLevel: percentage } - checked in order, first match wins
const CROP_PERCENTAGE_BY_LEVEL = [
    { maxLevel: 3, percentage: 0.8 },  // Levels 1-3: 80% crops
    { maxLevel: 7, percentage: 0.5 },  // Levels 4-7: 50% crops
    { maxLevel: Infinity, percentage: 0 } // Levels 8+: no enforcement
];

// Basic-crop guarantee (BL-15, owner 2026-10-10): through this level Kent always holds at least
// one single-item offer for a basic crop, so the grow-sell loop never stalls (and a full
// warehouse can be emptied) while multi-item and progression offers take over the board.
// Above it the rule goes away. Eligibility (level, season) still applies to the crop.
const BASIC_CROP_GUARANTEE_MAX_LEVEL = 12;
const BASIC_CROPS = ['Wheat', 'Carrot', 'Corn', 'Sugarcane'];

// Board size by player level (2026-10-12): 6 cards through level 7, 7 at level 8, 8 from level 9,
// when the basic-crop and newest-station guarantees would otherwise crowd out the random cards.
// The board still grows one card per trade up to this size.
const MAX_OFFERS_BY_LEVEL = [
    { maxLevel: 7, count: 6 },
    { maxLevel: 8, count: 7 },
    { maxLevel: Infinity, count: 8 }
];

// Newest-station guarantee (2026-10-12): the board always holds one single-item offer for a good
// from the newest crafting station the player's LEVEL has unlocked (Oven at 10 to 12, Beehive at
// 13, Kitchen at 14, ...), owned or not, so Kent advertises the station before it is bought. When
// that card is traded, its replacement is another one. Those goods carry a higher `xp` than the
// crops and older goods (resources.json), so the card is also the best-paying one.
const STATION_CATEGORY = 'crafting';

// Minimum level for valley bonus rewards on Kent offers
const VALLEY_BONUS_MIN_LEVEL = 11;

// Valley bonus quantity by rarity tier
const VALLEY_BONUS_QUANTITY = {
    legendary: { min: 1, max: 1 },
    epic: { min: 1, max: 1 },
    rare: { min: 1, max: 2 },
    uncommon: { min: 1, max: 3 },
    common: { min: 1, max: 3 }
};

// Quantity ranges for CROP items by player level
// { maxLevel: { min, max } } - checked in order, first match wins
const CROP_QUANTITY_BY_LEVEL = [
    { maxLevel: 2, min: 2, max: 3 },
    { maxLevel: 5, min: 3, max: 8 },
    { maxLevel: 6, min: 3, max: 10 },
    { maxLevel: 7, min: 5, max: 12 },
    { maxLevel: 8, min: 6, max: 15 },
    { maxLevel: 10, min: 10, max: 30 },
    { maxLevel: 20, min: 20, max: 40 },
    { maxLevel: Infinity, min: 25, max: 50 }
];

// Quantity ranges for NON-CROP items by player level
// { maxLevel: { min, max } } - checked in order, first match wins
const NON_CROP_QUANTITY_BY_LEVEL = [
    { maxLevel: 2, min: 1, max: 2 },
    { maxLevel: 5, min: 1, max: 3 },
    { maxLevel: 6, min: 2, max: 4 },
    { maxLevel: 7, min: 3, max: 6 },
    { maxLevel: 8, min: 4, max: 8 },
    { maxLevel: 10, min: 5, max: 10 },
    { maxLevel: 20, min: 8, max: 20 },
    { maxLevel: Infinity, min: 15, max: 35 }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Helper to calculate quantity range based on crop status and player level
 */
function getQuantityRange(isCrop, playerLevel) {
    const ranges = isCrop ? CROP_QUANTITY_BY_LEVEL : NON_CROP_QUANTITY_BY_LEVEL;
    for (const range of ranges) {
        if (playerLevel <= range.maxLevel) {
            return { min: range.min, max: range.max };
        }
    }
    // Fallback (shouldn't reach here due to Infinity)
    const last = ranges[ranges.length - 1];
    return { min: last.min, max: last.max };
}

/**
 * How many cards Kent's board holds at this level
 */
export function getMaxKentOffers(playerLevel) {
    return (MAX_OFFERS_BY_LEVEL.find(band => playerLevel <= band.maxLevel) || MAX_OFFERS_BY_LEVEL[MAX_OFFERS_BY_LEVEL.length - 1]).count;
}

/**
 * The eligible goods of the newest crafting station the player's level has unlocked: the
 * highest-level station at or below the player's level that has at least one eligible good.
 * Returns a Set of resource types (empty below the first station).
 */
function getNewestStationGoods(eligibleResources, masterResources, playerLevel) {
    const stations = masterResources
        .filter(r => r.category === STATION_CATEGORY && r.level && r.level <= playerLevel)
        .sort((a, b) => b.level - a.level);
    for (let i = 0; i < stations.length; i++) {
        // Stations unlocked at the same level count together
        const sameLevel = stations.filter(s => s.level === stations[i].level).map(s => s.type);
        const goods = eligibleResources.filter(r => sameLevel.includes(r.source));
        if (goods.length > 0) return new Set(goods.map(r => r.type));
        i += sameLevel.length - 1;
    }
    return new Set();
}

/**
 * XP a Kent offer pays. One function for the card's "🔷 XP" and the award, so the card stays
 * exactly what the trade pays (tuning.md principle 3). Per item: 2 x its `xp` (1 if undefined),
 * plus 2 more when the asked quantity is in the top half of the player's quantity band for that
 * kind of item (crop or not), so a big ask pays more than a small one of the same good.
 */
export function calculateKentOfferXP(offer, masterResources, playerLevel) {
    const offerItems = offer?.items?.length ? offer.items : [{ item: offer?.item, quantity: offer?.quantity }];
    let totalXP = 0;
    for (const { item, quantity } of offerItems) {
        const resource = masterResources.find(r => r.type === item);
        let itemXP = resource?.xp || 1;
        const { min, max } = getQuantityRange(isACrop(item, masterResources), playerLevel);
        if (Number(quantity) > (min + max) / 2) itemXP += 1;
        totalXP += itemXP;
    }
    return totalXP * 2;
}

/**
 * Helper to pick a random item and calculate its quantity
 * Returns { resource, quantity } or null if no resources available
 */
function pickItemWithQuantity(availableResources, playerLevel, masterResources) {
    if (availableResources.length === 0) return null;

    const randomResource = availableResources[Math.floor(Math.random() * availableResources.length)];
    const isCrop = isACrop(randomResource.type, masterResources);
    const { min, max } = getQuantityRange(isCrop, playerLevel);
    const quantity = Math.floor(Math.random() * (max - min + 1)) + min;

    return { resource: randomResource, quantity };
}

/**
 * Generates new Kent offers based on player level and available resources
 * @param {Object} currentPlayer - The current player object
 * @param {Array} masterResources - Array of all available resources
 * @param {Object} globalTuning - Global tuning configuration
 * @param {string} currentSeason - Current season (Spring, Summer, Fall, Winter)
 * @param {Array} masterXPLevels - Array of XP thresholds for level calculation
 * @param {number} targetOfferCount - Optional: generate exactly this many offers (used for discard all)
 * @returns {Array} Array of new Kent offers
 */
export function generateNewKentOffers(currentPlayer, masterResources, globalTuning, currentSeason, masterXPLevels, targetOfferCount = null) {
    const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);

    console.log('🤠 Kent offer generation:', {
        playerLevel: playerLevel
    });
    
    // Filter eligible resources for Kent offers
    const eligibleResources = masterResources.filter(resource => {
        // Must be a doober
        if (resource.category !== 'doober') return false;
        
        // Exclude resources with noBank output
        if (resource.output === 'noBank') return false;

        // Check if resource is seasonal and matches current season
        if (resource.season && resource.season !== currentSeason) {
            return false;
        }
        
        // Check if any ingredients are out of season
        const ingredients = [
            resource.ingredient1,
            resource.ingredient2,
            resource.ingredient3,
            resource.ingredient4
        ].filter(Boolean);

        for (const ingredient of ingredients) {
            const ingredientResource = masterResources.find(r => r.type === ingredient);
            if (ingredientResource && ingredientResource.season && ingredientResource.season !== currentSeason) {
                return false;
            }
        }
        // Filter out epic and legendary scroll chance items
        if (resource.scrollchance === 'epic' || resource.scrollchance === 'legendary') {
            return false;
        }
        
        // Filter out valley source items
        if (resource.source === 'valley') {
            return false;
        }

        // Filter out resources that are outputs of attack resources if player doesn't have "Explore the Valley" trophy
        const hasExploreValleyTrophy = currentPlayer?.trophies?.some(trophy => trophy.title === "Explore the Valley");
        if (!hasExploreValleyTrophy) {
            const attackResource = masterResources.find(r =>
                r.action === 'attack' && r.output === resource.type
            );

            if (attackResource) {
                console.log(`❌ Filtering out ${resource.type} - output of attack resource ${attackResource.type}, player lacks "Explore the Valley" trophy`);
                return false;
            }
        }

        // Filter out resources where resource.level is above the player's level
        if (resource.level && resource.level > playerLevel) {
            return false;
        }

        // Filter out resources where the source resource's level is above the player's level
        // e.g., if Milk comes from Cow, and Cow is level 3, don't offer Milk until level 3
        const sourceResource = masterResources.find(r => r.type === resource.source);
        if (sourceResource && sourceResource.level && sourceResource.level > playerLevel) {
            return false;
        }

        // No dead ends: every ingredient (and theirs) must be unlocked at this level too
        if (!areIngredientsUnlocked(resource, masterResources, playerLevel)) {
            return false;
        }

        return true;
    });
    
    if (eligibleResources.length === 0) {
        console.warn('No eligible resources found for Kent offers');
        return [];
    }
    
    const newOffers = [];
    const maxOffers = getMaxKentOffers(playerLevel);
    const existingOffers = currentPlayer?.kentOffers?.offers || [];
    const currentOfferCount = existingOffers.length;

    // Determine multi-item offer target count based on player level
    // Uses a weighted random to pick a count between min and max, centered on target
    let multiItemTargetConfig = { min: 0, target: 0, max: 0 };
    for (const tier of MULTI_ITEM_TARGET_COUNTS) {
        if (playerLevel <= tier.maxLevel) {
            multiItemTargetConfig = tier;
            break;
        }
    }

    // Pick a random count weighted toward target using triangular distribution
    // This gives: sometimes min, usually target, sometimes max
    const { min: multiMin, target: multiTarget, max: multiMax } = multiItemTargetConfig;
    let targetMultiItemCount;
    if (multiMin === multiMax) {
        targetMultiItemCount = multiMin;
    } else {
        // Triangular distribution: pick two random numbers and use the one closer to target
        const rand1 = Math.floor(Math.random() * (multiMax - multiMin + 1)) + multiMin;
        const rand2 = Math.floor(Math.random() * (multiMax - multiMin + 1)) + multiMin;
        // Pick whichever is closer to target (weighted toward center)
        targetMultiItemCount = Math.abs(rand1 - multiTarget) <= Math.abs(rand2 - multiTarget) ? rand1 : rand2;
    }

    console.log('🤠 Multi-item offer target:', {
        playerLevel,
        config: `min=${multiMin}, target=${multiTarget}, max=${multiMax}`,
        selectedCount: targetMultiItemCount
    });

    // Determine how many new offers to generate
    let offersToGenerate;
    if (targetOfferCount !== null) {
        // If targetOfferCount is specified (e.g., discard all), generate exactly that many
        offersToGenerate = Math.min(targetOfferCount, maxOffers);
    } else {
        // Default behavior: replace the completed offer AND add 1 more slot (growth)
        // This means each trade grows the total offer count by 1, until maxOffers is reached.
        // Example: 1 offer -> complete trade -> now have 2 offers
        //          3 offers -> complete trade -> now have 4 offers (until max 6)
        //
        // After the offer is removed, currentOfferCount reflects remaining offers.
        // To grow: we need (currentOfferCount + 2) total = +1 to replace, +1 to grow
        // But capped at maxOffers.
        const desiredTotal = Math.min(currentOfferCount + 2, maxOffers);
        offersToGenerate = desiredTotal - currentOfferCount;
    }

    // Crop balance sliding scale based on player level
    // Applied across ALL offers (existing + new), not just new ones
    let cropPercentage = 0;
    for (const tier of CROP_PERCENTAGE_BY_LEVEL) {
        if (playerLevel <= tier.maxLevel) {
            cropPercentage = tier.percentage;
            break;
        }
    }

    // Count crops and multi-item offers already in existing offers
    let existingCropCount = 0;
    let existingMultiItemCount = 0;
    existingOffers.forEach(offer => {
        if (cropPercentage > 0 && isACrop(offer.item, masterResources)) {
            existingCropCount++;
        }
        // Check if this is a multi-item offer
        if (offer.items && offer.items.length > 1) {
            existingMultiItemCount++;
        }
    });

    // Calculate how many crops we want across ALL offers (existing + new)
    const totalOffersAfter = currentOfferCount + offersToGenerate;
    const totalCropsWanted = Math.ceil(totalOffersAfter * cropPercentage);
    const cropOffersNeeded = Math.max(0, totalCropsWanted - existingCropCount);

    // Calculate how many multi-item offers we need among the NEW offers
    // Target is for all offers combined, so subtract existing multi-item count
    const multiItemOffersNeeded = Math.max(0, targetMultiItemCount - existingMultiItemCount);
    let multiItemOffersGenerated = 0;

    console.log('🤠 Multi-item balance:', {
        existingMultiItem: existingMultiItemCount,
        targetTotal: targetMultiItemCount,
        neededInNew: multiItemOffersNeeded,
        offersToGenerate
    });
    const nonCropOffersNeeded = offersToGenerate - cropOffersNeeded;

    // Basic-crop guarantee: needed when no remaining offer is already a single-item basic crop.
    // The first new offer fills it (after a trade that is the card in the traded card's slot).
    const isBasicCropOffer = (offer) => {
        const offerItems = offer.items?.length ? offer.items : (offer.item ? [{ item: offer.item }] : []);
        return offerItems.length === 1 && BASIC_CROPS.includes(offerItems[0].item);
    };
    let basicCropStillNeeded = playerLevel <= BASIC_CROP_GUARANTEE_MAX_LEVEL
        && !existingOffers.some(isBasicCropOffer)
        && eligibleResources.some(r => BASIC_CROPS.includes(r.type));
    let cropOffersGenerated = 0;

    // Newest-station guarantee: needed when no remaining offer asks for one of its goods
    const newestStationGoods = getNewestStationGoods(eligibleResources, masterResources, playerLevel);
    const hasStationGood = (offer) => {
        const offerItems = offer.items?.length ? offer.items : (offer.item ? [{ item: offer.item }] : []);
        return offerItems.some(it => newestStationGoods.has(it.item));
    };
    let stationGoodStillNeeded = newestStationGoods.size > 0 && !existingOffers.some(hasStationGood);

    // Helper to get available resources excluding already-used ones
    const getAvailableResources = (usedResourceTypes = []) => {
        // Get all existing Kent offers to check for duplicates
        const allExistingOffers = [...existingOffers, ...newOffers];

        // Count how many offers already exist for each resource type
        const resourceCounts = {};
        allExistingOffers.forEach(offer => {
            // Handle both single-item (legacy) and multi-item offers
            if (offer.items) {
                offer.items.forEach(item => {
                    resourceCounts[item.item] = (resourceCounts[item.item] || 0) + 1;
                });
            } else if (offer.item) {
                resourceCounts[offer.item] = (resourceCounts[offer.item] || 0) + 1;
            }
        });

        // Also count resources used in this same offer (for multi-item)
        usedResourceTypes.forEach(type => {
            resourceCounts[type] = (resourceCounts[type] || 0) + 1;
        });

        // Filter out resources that already have too many offers
        return eligibleResources.filter(resource => {
            const count = resourceCounts[resource.type] || 0;
            const maxAllowed = (resource.level && resource.level === playerLevel) ? 1 : 2;
            return count < maxAllowed;
        });
    };

    for (let i = 0; i < offersToGenerate; i++) {
        let availableResources = getAvailableResources();

        // Enforce crop balance across all offers (existing + new)
        if (cropPercentage > 0) {
            const cropOffersStillNeeded = cropOffersNeeded - cropOffersGenerated;
            const nonCropOffersGenerated = i - cropOffersGenerated;
            const nonCropOffersStillNeeded = nonCropOffersNeeded - nonCropOffersGenerated;

            if (cropOffersStillNeeded > 0) {
                // Still need crops — force crops only
                const cropResources = availableResources.filter(r => isACrop(r.type, masterResources));
                if (cropResources.length > 0) {
                    availableResources = cropResources;
                }
            } else if (nonCropOffersStillNeeded > 0) {
                // Crop quota met, still need non-crops — force non-crops only
                const nonCropResources = availableResources.filter(r => !isACrop(r.type, masterResources));
                if (nonCropResources.length > 0) {
                    availableResources = nonCropResources;
                }
            }
        }

        // Basic-crop guarantee: this offer is a single basic crop. Taken from all eligible basic
        // crops, so the duplicate caps never leave the board without one.
        const forceBasicCrop = basicCropStillNeeded;
        if (forceBasicCrop) {
            availableResources = eligibleResources.filter(r => BASIC_CROPS.includes(r.type));
        }

        // Newest-station guarantee (after the basic crop): a single good from that station,
        // within the duplicate caps when possible.
        const forceStationGood = !forceBasicCrop && stationGoodStillNeeded;
        if (forceStationGood) {
            const capped = getAvailableResources().filter(r => newestStationGoods.has(r.type));
            availableResources = capped.length > 0 ? capped : eligibleResources.filter(r => newestStationGoods.has(r.type));
        }

        // If no resources available (all have 2+ offers), break out of loop
        if (availableResources.length === 0) {
            console.log('🤠 No more unique resources available (all have 2+ offers)');
            break;
        }

        // Determine if this should be a multi-item offer based on how many we still need
        const multiItemStillNeeded = multiItemOffersNeeded - multiItemOffersGenerated;
        const singleItemStillNeeded = offersToGenerate - i - multiItemStillNeeded;
        // Force multi-item if we need more and don't have room for singles, otherwise random choice weighted by need
        let isMultiItem;
        if (forceBasicCrop || forceStationGood) {
            isMultiItem = false;
        } else if (multiItemStillNeeded > 0 && singleItemStillNeeded <= 0) {
            isMultiItem = true;
        } else if (multiItemStillNeeded <= 0) {
            isMultiItem = false;
        } else {
            // Random choice weighted by remaining need
            isMultiItem = Math.random() < (multiItemStillNeeded / (offersToGenerate - i));
        }

        // For single-item offers, filter out items that already have a single-item offer
        // (to avoid duplicate single-item offers for the same resource)
        if (!isMultiItem && !forceBasicCrop && !forceStationGood) {
            const allExistingOffers = [...existingOffers, ...newOffers];
            const singleItemTypes = new Set();
            allExistingOffers.forEach(offer => {
                // Check if this is a single-item offer (items array has exactly 1 item, or legacy format)
                const isSingleItem = (offer.items && offer.items.length === 1) || (!offer.items && offer.item);
                if (isSingleItem) {
                    const itemType = offer.items ? offer.items[0].item : offer.item;
                    singleItemTypes.add(itemType);
                }
            });
            availableResources = availableResources.filter(r => !singleItemTypes.has(r.type));

            if (availableResources.length === 0) {
                console.log('🤠 No unique resources available for single-item offer (all already have single-item offers)');
                continue; // Skip this iteration, try to generate another offer
            }
        }

        let items = [];
        let totalRewardAmount = 0;

        // Pick first item
        const firstPick = pickItemWithQuantity(availableResources, playerLevel, masterResources);
        if (!firstPick) {
            console.log('🤠 Could not pick first item');
            break;
        }

        items.push({ item: firstPick.resource.type, quantity: firstPick.quantity });
        const firstMaxPrice = firstPick.resource.maxprice || firstPick.resource.minprice || 10;
        totalRewardAmount += firstMaxPrice * firstPick.quantity;
        console.log(`🤠 First item: ${firstPick.resource.type} x${firstPick.quantity}, maxprice=${firstPick.resource.maxprice}, minprice=${firstPick.resource.minprice}, using=${firstMaxPrice}, subtotal=${totalRewardAmount}`);

        // Track crop offers generated (based on first item for crop balance)
        if (isACrop(firstPick.resource.type, masterResources)) {
            cropOffersGenerated++;
        }

        // Pick second item if multi-item offer
        if (isMultiItem) {
            // Get available resources excluding the first item
            let availableForSecond = getAvailableResources([firstPick.resource.type])
                .filter(r => r.type !== firstPick.resource.type); // never the same good twice on one card

            // For multi-item, don't enforce crop balance on second item - just pick randomly
            if (availableForSecond.length > 0) {
                const secondPick = pickItemWithQuantity(availableForSecond, playerLevel, masterResources);
                if (secondPick) {
                    items.push({ item: secondPick.resource.type, quantity: secondPick.quantity });
                    const secondMaxPrice = secondPick.resource.maxprice || secondPick.resource.minprice || 10;
                    totalRewardAmount += secondMaxPrice * secondPick.quantity;
                    console.log(`🤠 Second item: ${secondPick.resource.type} x${secondPick.quantity}, maxprice=${secondPick.resource.maxprice}, minprice=${secondPick.resource.minprice}, using=${secondMaxPrice}, total=${totalRewardAmount}`);
                    multiItemOffersGenerated++;
                }
            }
        }

        const rewards = [
            {
                item: 'Money',
                quantity: totalRewardAmount
            }
        ];

        // Check for bonus valley resource reward
        if (playerLevel >= VALLEY_BONUS_MIN_LEVEL) {
            const dropRate = globalTuning?.harvestDropRate || 0.1;
            const bonusRoll = Math.random();

            const itemsDescription = items.map(it => it.item).join(' + ');
            console.log(`🤠 Kent bonus reward check for ${itemsDescription}:`);
            console.log(`   Player level: ${playerLevel} (bonus rewards enabled at level ${VALLEY_BONUS_MIN_LEVEL}+)`);
            console.log(`   Drop rate: ${dropRate} (${(dropRate * 100).toFixed(1)}%)`);
            console.log(`   Roll: ${bonusRoll.toFixed(3)}`);
            console.log(`   Success: ${bonusRoll <= dropRate ? 'YES' : 'NO'}`);

            if (bonusRoll <= dropRate) {
                console.log(`🎉 Kent bonus reward roll succeeded!`);

                // Get all valley resources from masterResources
                const valleyResources = masterResources.filter(res => res.source === 'valley' && res.scrollchance);

                console.log(`   Found ${valleyResources.length} valley resources with scrollchance:`);
                valleyResources.forEach(res => {
                    console.log(`     - ${res.type} (${res.scrollchance})`);
                });

                if (valleyResources.length > 0) {
                    // Use weighted random selection based on scrollchance rarity
                    const selectedValleyResource = selectWeightedRandomItem(valleyResources, 1);

                    console.log(`   Selected valley resource: ${selectedValleyResource?.type || 'NONE'}`);

                    if (selectedValleyResource) {
                        // Get quantity range from tuning constant
                        const rarity = selectedValleyResource.scrollchance;
                        const qtyRange = VALLEY_BONUS_QUANTITY[rarity] || VALLEY_BONUS_QUANTITY.common;
                        const bonusQuantity = Math.floor(Math.random() * (qtyRange.max - qtyRange.min + 1)) + qtyRange.min;

                        rewards.push({
                            item: selectedValleyResource.type,
                            quantity: bonusQuantity
                        });

                        console.log(`🎁 ADDED valley bonus reward: ${selectedValleyResource.type} x${bonusQuantity} (${rarity})`);
                    } else {
                        console.log(`❌ selectWeightedRandomItem returned null`);
                    }
                } else {
                    console.log(`❌ No valley resources found with scrollchance`);
                }
            }
        }

        // Create offer with items array (new format supports multi-item)
        // Also include legacy item/quantity for backward compatibility with single-item offers
        const newOffer = {
            items: items,
            // Legacy fields for backward compatibility (use first item)
            item: items[0].item,
            quantity: items[0].quantity,
            rewards: rewards
        };

        newOffers.push(newOffer);
        if (forceBasicCrop) basicCropStillNeeded = false;
        if (forceStationGood) stationGoodStillNeeded = false;
    }
    
    console.log(`Generated ${newOffers.length} new Kent offers:`, newOffers);
    return newOffers;
}

/**
 * Removes a completed offer from the player's Kent offers and returns the position
 * @param {Object} kentOffers - Current kentOffers object
 * @param {Object} completedOffer - The offer that was just completed (has itemsBought array for multi-item)
 * @returns {Object} { kentOffers: updated kentOffers object, removedIndex: position of removed offer }
 */
export function removeCompletedOffer(kentOffers, completedOffer) {
    if (!kentOffers || !kentOffers.offers) {
        return { kentOffers, removedIndex: -1 };
    }

    // Find the index of the completed offer
    // Handle both multi-item (itemsBought array) and legacy single-item (itemBought) formats
    const removedIndex = kentOffers.offers.findIndex(offer => {
        if (completedOffer.itemsBought && offer.items) {
            // Multi-item comparison: check if all items match
            if (completedOffer.itemsBought.length !== offer.items.length) return false;
            return completedOffer.itemsBought.every((bought, idx) =>
                offer.items[idx]?.item === bought.item && offer.items[idx]?.quantity === bought.quantity
            );
        } else {
            // Legacy single-item comparison
            return offer.item === completedOffer.itemBought &&
                   offer.quantity === completedOffer.qtyBought;
        }
    });

    // Remove the completed offer
    const updatedOffers = kentOffers.offers.filter((offer, index) => index !== removedIndex);

    return {
        kentOffers: {
            ...kentOffers,
            offers: updatedOffers
        },
        removedIndex
    };
}

/**
 * Updates Kent offers after a trade: removes completed offer and adds new ones
 * @param {Object} currentPlayer - The current player object
 * @param {Object} completedOffer - The offer that was just completed
 * @param {Array} masterResources - Array of all available resources
 * @param {Object} globalTuning - Global tuning configuration
 * @param {string} currentSeason - Current season (Spring, Summer, Fall, Winter)
 * @param {Array} masterXPLevels - Array of XP thresholds for level calculation
 * @returns {Object} Updated kentOffers object
 */
export function updateKentOffersAfterTrade(currentPlayer, completedOffer, masterResources, globalTuning, currentSeason, masterXPLevels) {
    // Remove the completed offer and get its position
    const { kentOffers: kentOffersWithoutCompleted, removedIndex } = removeCompletedOffer(currentPlayer.kentOffers, completedOffer);

    // Generate new offers (limit to 1 to replace the removed offer)
    const newOffers = generateNewKentOffers(
        { ...currentPlayer, kentOffers: kentOffersWithoutCompleted },
        masterResources,
        globalTuning,
        currentSeason,
        masterXPLevels
    );
    
    // Insert the new offer at the same position as the removed one
    const updatedOffers = [...kentOffersWithoutCompleted.offers];
    
    if (newOffers.length > 0 && removedIndex >= 0) {
        // Insert the first new offer at the exact position of the removed offer
        updatedOffers.splice(removedIndex, 0, newOffers[0]);
        
        // Add any additional new offers at the end
        if (newOffers.length > 1) {
            updatedOffers.push(...newOffers.slice(1));
        }
    } else if (newOffers.length > 0) {
        // If we couldn't find the position, just add at the end
        updatedOffers.push(...newOffers);
    }
    
    return {
        ...kentOffersWithoutCompleted,
        offers: updatedOffers
    };
}