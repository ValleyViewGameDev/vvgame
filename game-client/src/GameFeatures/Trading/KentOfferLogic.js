import { isACrop } from '../../Utils/ResourceHelpers';

/**
 * Generates new Kent offers based on player skills and available resources
 * @param {Object} currentPlayer - The current player object
 * @param {Array} masterResources - Array of all available resources
 * @param {Object} globalTuning - Global tuning configuration
 * @param {string} currentSeason - Current season (Spring, Summer, Fall, Winter)
 * @returns {Array} Array of new Kent offers
 */
export function generateNewKentOffers(currentPlayer, masterResources, globalTuning, currentSeason) {
    const playerSkills = currentPlayer?.skills || [];
    const playerSkillTypes = playerSkills.map(skill => skill.type);
    
    console.log('🤠 Kent offer generation:', {
        isFirstTimeUser: currentPlayer?.firsttimeuser,
        playerSkills: playerSkillTypes
    });
    
    // Filter eligible resources for Kent offers
    const eligibleResources = masterResources.filter(resource => {
        // Must be a doober
        if (resource.category !== 'doober') return false;
        
        // Exclude resources with noBank output
        if (resource.output === 'noBank') return false;
        
        // Check if player has required skills
        if (resource.requires && !playerSkillTypes.includes(resource.requires)) {
            return false;
        }
        
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
        
        // === FIRST-TIME USER ONLY FILTERS ===
        // If player is first time user, only show crops
        if (currentPlayer?.firsttimeuser === true) {
            if (!isACrop(resource.type, masterResources)) {
                return false;
            }
        }
        
        // === FILTERS FOR ALL USERS (including first-time users) ===
        // Filter out epic and legendary scroll chance items
        if (resource.scrollchance === 'epic' || resource.scrollchance === 'legendary') {
            return false;
        }
        
        // Filter out valley source items
        if (resource.source === 'valley') {
            return false;
        }
        
        // Filter out resources where the source requires skills the player doesn't have
        const sourceResource = masterResources.find(r => r.type === resource.source);
        
        console.log(`🔍 Checking ${resource.type} (source: ${resource.source}):`, {
            foundSourceResource: !!sourceResource,
            sourceType: sourceResource?.type,
            sourceRequires: sourceResource?.requires,
            playerSkills: playerSkillTypes,
            hasRequiredSkill: sourceResource?.requires ? playerSkillTypes.includes(sourceResource.requires) : 'N/A',
            shouldFilter: sourceResource && sourceResource.requires && !playerSkillTypes.includes(sourceResource.requires)
        });
        
        // If source resource exists and requires a skill the player doesn't have, exclude
        if (sourceResource && sourceResource.requires && !playerSkillTypes.includes(sourceResource.requires)) {
            console.log(`❌ Filtering out ${resource.type} - source ${resource.source} requires ${sourceResource.requires} skill`);
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
    let offersToGenerate = 2; // Default to 2
    if (currentOfferCount + 2 > maxOffers) {
        offersToGenerate = Math.max(0, maxOffers - currentOfferCount);
    }
    
    for (let i = 0; i < offersToGenerate; i++) {
        // Get all existing Kent offers to check for duplicates
        const allExistingOffers = [...(currentPlayer?.kentOffers?.offers || []), ...newOffers];
        
        // Count how many offers already exist for each resource type
        const resourceCounts = {};
        allExistingOffers.forEach(offer => {
            resourceCounts[offer.item] = (resourceCounts[offer.item] || 0) + 1;
        });
        
        // Filter out resources that already have 2 or more offers
        const availableResources = eligibleResources.filter(resource => 
            (resourceCounts[resource.type] || 0) < 2
        );
        
        // If no resources available (all have 2+ offers), break out of loop
        if (availableResources.length === 0) {
            console.log('🤠 No more unique resources available (all have 2+ offers)');
            break;
        }
        
        const randomResource = availableResources[Math.floor(Math.random() * availableResources.length)];
        
        // Determine quantity based on crop status and first-time user status
        let quantity;
        if (isACrop(randomResource.type, masterResources)) {
            if (currentPlayer?.firsttimeuser === true) {
                quantity = Math.floor(Math.random() * 9) + 4; // Random from 4 to 12 for first-time users
            } else {
                quantity = Math.floor(Math.random() * 37) + 4; // Random from 4 to 40 for regular users
            }
        } else {
            quantity = Math.floor(Math.random() * 10) + 1; // Random from 1 to 10
        }
        
        // Calculate reward (Money = maxprice * quantity)
        const rewardAmount = (randomResource.maxprice || 100) * quantity;
        
        const newOffer = {
            item: randomResource.type,
            quantity: quantity,
            rewards: [
                {
                    item: 'Money',
                    quantity: rewardAmount
                }
            ]
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
 * @returns {Object} Updated kentOffers object
 */
export function updateKentOffersAfterTrade(currentPlayer, completedOffer, masterResources, globalTuning, currentSeason) {
    // Remove the completed offer and get its position
    const { kentOffers: kentOffersWithoutCompleted, removedIndex } = removeCompletedOffer(currentPlayer.kentOffers, completedOffer);
    
    // Generate new offers (limit to 1 to replace the removed offer)
    const newOffers = generateNewKentOffers(
        { ...currentPlayer, kentOffers: kentOffersWithoutCompleted }, 
        masterResources, 
        globalTuning,
        currentSeason
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