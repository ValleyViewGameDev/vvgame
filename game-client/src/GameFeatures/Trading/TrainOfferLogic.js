import { isACrop } from '../../Utils/ResourceHelpers';

/**
 * Generates new Train offers based on player skills and available resources
 * @param {Object} currentPlayer - The current player object
 * @param {Array} masterResources - Array of all available resources
 * @param {Object} globalTuning - Global tuning configuration
 * @param {string} currentSeason - Current season (Spring, Summer, Fall, Winter)
 * @returns {Array} Array of new Train offers
 */
export function generateNewTrainOffers(currentPlayer, masterResources, globalTuning, currentSeason) {
    const playerSkills = currentPlayer?.skills || [];
    const playerSkillTypes = playerSkills.map(skill => skill.type);
    
    console.log('🚂 Train offer generation:', {
        isFirstTimeUser: currentPlayer?.firsttimeuser,
        playerSkills: playerSkillTypes
    });
    
    // Filter eligible resources for Train offers
    const eligibleResources = masterResources.filter(resource => {
        // Must be a doober
        if (resource.category !== 'doober') return false;
        
        // Exclude resources with noBank output
        if (resource.output === 'noBank') return false;
        
        // Exclude resources that don't have a source defined (player cannot create them)
        if (!resource.source) return false;
        
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
        
        // If source resource exists and requires a skill the player doesn't have, exclude
        if (sourceResource && sourceResource.requires && !playerSkillTypes.includes(sourceResource.requires)) {
            return false;
        }
        
        // Filter out resources that are outputs of attack resources if player doesn't have "Explore the Valley" trophy
        const hasExploreValleyTrophy = currentPlayer?.trophies?.some(trophy => trophy.title === "Explore the Valley");
        if (!hasExploreValleyTrophy) {
            const attackResource = masterResources.find(r => 
                r.action === 'attack' && r.output === resource.type
            );
            
            if (attackResource) {
                return false;
            }
        }
        
        return true;
    });
    
    if (eligibleResources.length === 0) {
        console.warn('No eligible resources found for Train offers');
        return [];
    }
    
    const newOffers = [];
    const maxOffers = globalTuning?.maxTrainOffers || 8; // Trains typically have more offers than Kent
    
    // Generate offers (typically 6-8 for trains)
    const offersToGenerate = Math.min(maxOffers, eligibleResources.length);
    
    for (let i = 0; i < offersToGenerate; i++) {
        // Avoid duplicates by tracking used resources
        const usedResources = newOffers.map(offer => offer.item);
        const availableResources = eligibleResources.filter(resource => 
            !usedResources.includes(resource.type)
        );
        
        if (availableResources.length === 0) {
            console.log('🚂 No more unique resources available for train offers');
            break;
        }
        
        const randomResource = availableResources[Math.floor(Math.random() * availableResources.length)];
        
        // Determine quantity - trains typically want larger quantities than Kent
        let quantity;
        if (isACrop(randomResource.type, masterResources)) {
            if (currentPlayer?.firsttimeuser === true) {
                quantity = Math.floor(Math.random() * 16) + 5; // Random from 5 to 20 for first-time users
            } else {
                quantity = Math.floor(Math.random() * 46) + 5; // Random from 5 to 50 for regular users
            }
        } else {
            quantity = Math.floor(Math.random() * 15) + 2; // Random from 2 to 16
        }
        
        const newOffer = {
            item: randomResource.type,
            quantity: quantity
        };
        
        newOffers.push(newOffer);
    }
    
    console.log(`Generated ${newOffers.length} new Train offers:`, newOffers);
    return newOffers;
}

/**
 * Generates new Train rewards based on train offers and current season
 * @param {Array} trainOffers - Array of train offers
 * @param {Object} currentPlayer - The current player object
 * @param {Array} masterResources - Array of all available resources
 * @param {Object} globalTuning - Global tuning configuration
 * @param {string} currentSeason - Current season (Spring, Summer, Fall, Winter)
 * @returns {Array} Array of train rewards
 */
export function generateTrainRewards(trainOffers, currentPlayer, masterResources, globalTuning, currentSeason) {
    const rewards = [];
    
    console.log('🚂 Train reward generation for season:', currentSeason);
    
    // Convert season to lowercase to match globalTuning format
    const seasonKey = currentSeason ? currentSeason.toLowerCase() : 'spring';
    console.log('🚂 Looking for season key:', seasonKey);
    
    // Get train rewards from globalTuning based on current season
    const seasonalRewards = globalTuning?.trainRewards?.[seasonKey];
    console.log('🚂 Seasonal rewards found:', seasonalRewards);
    
    if (!seasonalRewards || !Array.isArray(seasonalRewards)) {
        console.warn('🚂 No train rewards found for season:', seasonKey, 'in globalTuning');
        console.warn('🚂 Available keys:', Object.keys(globalTuning?.trainRewards || {}));
        return rewards;
    }
    
    console.log('🚂 Available seasonal rewards:', seasonalRewards);
    
    // Generate seasonal resource rewards (1-3 different rewards from the season's trainRewards)
    const numSeasonalRewards = Math.floor(Math.random() * Math.min(3, seasonalRewards.length)) + 1; // 1 to 3 or max available
    const usedRewards = new Set();
    
    for (let i = 0; i < numSeasonalRewards; i++) {
        // Filter out already used rewards
        const availableRewards = seasonalRewards.filter(reward => !usedRewards.has(reward));
        
        if (availableRewards.length === 0) break;
        
        const randomReward = availableRewards[Math.floor(Math.random() * availableRewards.length)];
        usedRewards.add(randomReward);
        
        // Determine reward quantity (typically smaller quantities for special items)
        let quantity;
        if (isACrop(randomReward, masterResources)) {
            quantity = Math.floor(Math.random() * 10) + 1; // 1 to 10 for crops
        } else {
            quantity = Math.floor(Math.random() * 3) + 1; // 1 to 3 for special items like hearts
        }
        
        rewards.push({
            item: randomReward,
            quantity: quantity
        });
    }
    
    console.log(`Generated ${rewards.length} train rewards:`, rewards);
    return rewards;
}

/**
 * Generates complete train data for a player (both offers and rewards)
 * @param {Object} currentPlayer - The current player object
 * @param {Array} masterResources - Array of all available resources
 * @param {Object} globalTuning - Global tuning configuration
 * @param {string} currentSeason - Current season
 * @param {number} trainNumber - The train number to generate for
 * @returns {Object} { offers: [], rewards: [] }
 */
export function generateCompleteTrainData(currentPlayer, masterResources, globalTuning, currentSeason, trainNumber) {
    console.log(`🚂 Generating complete train data for train #${trainNumber} in ${currentSeason}`);
    
    const offers = generateNewTrainOffers(currentPlayer, masterResources, globalTuning, currentSeason);
    const rewards = generateTrainRewards(offers, currentPlayer, masterResources, globalTuning, currentSeason);
    
    return {
        offers,
        rewards
    };
}