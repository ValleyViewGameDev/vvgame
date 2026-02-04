import { isACrop } from '../../Utils/ResourceHelpers';
import { selectWeightedRandomItem } from '../../Economy/DropRates';
import { getDerivedLevel } from '../../Utils/playerManagement';

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

        return true;
    });
    
    if (eligibleResources.length === 0) {
        console.warn('No eligible resources found for Kent offers');
        return [];
    }
    
    const newOffers = [];
    const maxOffers = globalTuning?.maxKentOffers || 6;
    const currentOfferCount = currentPlayer?.kentOffers?.offers?.length || 0;

    // Determine how many new offers to generate
    let offersToGenerate;
    if (targetOfferCount !== null) {
        // If targetOfferCount is specified (e.g., discard all), generate exactly that many
        offersToGenerate = Math.min(targetOfferCount, maxOffers);
    } else {
        // Default behavior: generate 2 new offers, but ensure we reach at least 3 total
        // This helps new players ramp up faster from the initial 1 offer
        const minTotalOffers = 3;
        const neededToReachMin = Math.max(0, minTotalOffers - currentOfferCount);
        offersToGenerate = Math.max(2, neededToReachMin);

        // Cap by maxOffers
        if (currentOfferCount + offersToGenerate > maxOffers) {
            offersToGenerate = Math.max(0, maxOffers - currentOfferCount);
        }
    }
    
    // Crop balance sliding scale based on player level
    // Level 1-3: 70% crops, Level 4: 40% crops, Level 5+: random
    let cropPercentage = 0;
    if (playerLevel <= 3) {
        cropPercentage = 0.7;
    } else if (playerLevel === 4) {
        cropPercentage = 0.4;
    }
    // Level 5+ has cropPercentage = 0 (no enforcement)

    const cropOffersNeeded = Math.ceil(offersToGenerate * cropPercentage);
    let cropOffersGenerated = 0;

    for (let i = 0; i < offersToGenerate; i++) {
        // Get all existing Kent offers to check for duplicates
        const allExistingOffers = [...(currentPlayer?.kentOffers?.offers || []), ...newOffers];

        // Count how many offers already exist for each resource type
        const resourceCounts = {};
        allExistingOffers.forEach(offer => {
            resourceCounts[offer.item] = (resourceCounts[offer.item] || 0) + 1;
        });

        // Filter out resources that already have 2 or more offers
        let availableResources = eligibleResources.filter(resource =>
            (resourceCounts[resource.type] || 0) < 2
        );

        // Enforce crop balance if needed
        if (cropOffersNeeded > 0) {
            const remainingOffers = offersToGenerate - i;
            const cropOffersStillNeeded = cropOffersNeeded - cropOffersGenerated;

            // If we still need crop offers and this is one of the slots for crops, filter to crops only
            if (cropOffersStillNeeded > 0 && cropOffersStillNeeded >= remainingOffers - (remainingOffers - cropOffersStillNeeded)) {
                const cropResources = availableResources.filter(r => isACrop(r.type, masterResources));
                if (cropResources.length > 0) {
                    availableResources = cropResources;
                }
            }
        }

        // If no resources available (all have 2+ offers), break out of loop
        if (availableResources.length === 0) {
            console.log('🤠 No more unique resources available (all have 2+ offers)');
            break;
        }

        const randomResource = availableResources[Math.floor(Math.random() * availableResources.length)];

        // Track crop offers generated
        if (isACrop(randomResource.type, masterResources)) {
            cropOffersGenerated++;
        }
        
        // Determine quantity based on crop status and player level
        // Quantities scale up as players level, with both min and max increasing
        let quantity;
        let minQty, maxQty;

        if (isACrop(randomResource.type, masterResources)) {
            // Crop quantity ranges by level
            if (playerLevel <= 2) {
                minQty = 2; maxQty = 3;
            } else if (playerLevel <= 5) {
                minQty = 3; maxQty = 8;
            } else if (playerLevel <= 7) {
                minQty = 5; maxQty = 15;
            } else if (playerLevel <= 10) {
                minQty = 10; maxQty = 30;
            } else {
                minQty = 15; maxQty = 50;
            }
        } else {
            // Non-crop quantity ranges by level
            if (playerLevel <= 2) {
                minQty = 1; maxQty = 2;
            } else if (playerLevel <= 5) {
                minQty = 1; maxQty = 3;
            } else if (playerLevel <= 7) {
                minQty = 4; maxQty = 8;
            } else if (playerLevel <= 10) {
                minQty = 5; maxQty = 10;
            } else {
                minQty = 8; maxQty = 20;
            }
        }

        quantity = Math.floor(Math.random() * (maxQty - minQty + 1)) + minQty;
        
        // Calculate primary reward (Money = maxprice * quantity)
        const rewardAmount = (randomResource.maxprice || 100) * quantity;
        
        const rewards = [
            {
                item: 'Money',
                quantity: rewardAmount
            }
        ];

        // Check for bonus valley resource reward (only for level 11+)
        // This prevents early-game players from getting too many valley resources
        if (playerLevel >= 11) {
            const dropRate = globalTuning?.harvestDropRate || 0.1;
            const bonusRoll = Math.random();

            console.log(`🤠 Kent bonus reward check for ${randomResource.type}:`);
            console.log(`   Player level: ${playerLevel} (bonus rewards enabled)`);
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
                    // Valley resources drop 1-3 quantity based on rarity
                    let bonusQuantity = 1;
                    switch(selectedValleyResource.scrollchance) {
                        case 'legendary':
                        case 'epic':
                            bonusQuantity = 1;
                            break;
                        case 'rare':
                            bonusQuantity = Math.floor(Math.random() * 2) + 1; // 1-2
                            break;
                        case 'uncommon':
                        case 'common':
                        default:
                            bonusQuantity = Math.floor(Math.random() * 3) + 1; // 1-3
                            break;
                    }
                    
                    rewards.push({
                        item: selectedValleyResource.type,
                        quantity: bonusQuantity
                    });
                    
                    console.log(`🎁 ADDED valley bonus reward: ${selectedValleyResource.type} x${bonusQuantity} (${selectedValleyResource.scrollchance})`);
                } else {
                    console.log(`❌ selectWeightedRandomItem returned null`);
                }
            } else {
                console.log(`❌ No valley resources found with scrollchance`);
            }
            }
        }

        const newOffer = {
            item: randomResource.type,
            quantity: quantity,
            rewards: rewards
        };
        
        newOffers.push(newOffer);
    }
    
    console.log(`Generated ${newOffers.length} new Kent offers:`, newOffers);
    return newOffers;
}

/**
 * Removes a completed offer from the player's Kent offers and returns the position
 * @param {Object} kentOffers - Current kentOffers object
 * @param {Object} completedOffer - The offer that was just completed
 * @returns {Object} { kentOffers: updated kentOffers object, removedIndex: position of removed offer }
 */
export function removeCompletedOffer(kentOffers, completedOffer) {
    if (!kentOffers || !kentOffers.offers) {
        return { kentOffers, removedIndex: -1 };
    }
    
    // Find the index of the completed offer
    const removedIndex = kentOffers.offers.findIndex(offer => 
        offer.item === completedOffer.itemBought && 
        offer.quantity === completedOffer.qtyBought
    );
    
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