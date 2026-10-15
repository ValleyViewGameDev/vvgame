import React from 'react';
import { getLocalizedString } from '../Utils/stringLookup';
import { calculateGemSpeedupCost } from './EconomyUtils';
import { GEM_PRICE, smoothGems } from './gemPricing';
import './GemCosts.css';

/**
 * Can this thing ever be had for gems? (owner 2026-10-15) Not when it is marked `nogems` in
 * resources.json (quest items and the Oracle's artifacts: the keys, the Secrets, Hope, the Home
 * Deed, the Trident, ...), and not when it has no gem price at all (it was never meant to be
 * sold for gems; this used to fall back to 1 gem, so a Skeleton Key could be skipped for 1).
 */
export const isGemBuyable = (resource) => !!resource && resource.nogems !== true && typeof resource.gemcost === 'number';

// Pure function that doesn't use hooks. Returns null (no gem button) when gems cannot pay for
// this: the item itself is `nogems`, or a missing ingredient or skill cannot be had for gems.
export const calculateGemPurchase = ({ 
    resource, 
    inventory, 
    backpack, 
    masterResources,
    currentPlayer,
    strings,
    overrideGemCost = null
}) => {
    // A nogems item is never bought or sped up with gems, whatever the cost
    if (!resource || resource.nogems === true) return null;

    // Ensure arrays are defined
    const safeInventory = inventory || [];
    const safeBackpack = backpack || [];
    const safeMasterResources = masterResources || [];
    
    // Calculate total gems from inventory and backpack
    const inventoryGems = safeInventory.find(item => item.type === 'Gem')?.quantity || 0;
    const backpackGems = safeBackpack.find(item => item.type === 'Gem')?.quantity || 0;
    const playerGems = inventoryGems + backpackGems;
    const ownedSkills = currentPlayer?.skills || [];
    
    // Track what will be spent (simplified - only actual quantities)
    const spendingItems = [];
    
    // Calculate for ingredient requirements - track what player can actually spend
    for (let i = 1; i <= 10; i++) {
        const ingredientType = resource[`ingredient${i}`];
        const ingredientQty = resource[`ingredient${i}qty`];
        
        if (ingredientType && ingredientQty) {
            const resourceData = safeMasterResources.find(r => r.type === ingredientType);
            
            // Calculate what player has
            const inventoryQty = safeInventory.find(inv => inv.type === ingredientType)?.quantity || 0;
            const backpackQty = safeBackpack.find(item => item.type === ingredientType)?.quantity || 0;
            const playerQty = inventoryQty + backpackQty;
            const willSpend = Math.min(playerQty, ingredientQty);
            
            // Track what will be spent
            if (willSpend > 0) {
                spendingItems.push({
                    symbol: resourceData?.symbol || '',
                    name: getLocalizedString(ingredientType, strings),
                    amount: willSpend
                });
            }
        }
    }
    
    // Calculate for skill requirement
    if (resource.requires) {
        const requiredSkill = safeMasterResources.find(r => r.type === resource.requires);
        
        // Check if player has the required skill
        const hasSkill = ownedSkills.some(skill => skill.type === resource.requires);
        if (hasSkill) {
            spendingItems.push({
                symbol: requiredSkill?.symbol || '',
                name: getLocalizedString(resource.requires, strings),
                amount: '✓',
                isSkill: true
            });
        }
    }
    
    // Calculate gem cost using simplified approach
    let gemCost;
    
    // If an override gem cost is provided (like for speedups), use it directly
    if (overrideGemCost !== null && overrideGemCost !== undefined) {
        gemCost = overrideGemCost;
    } else {
        // Only charge for missing ingredients - resource.gemcost is the total if you had nothing
        // Calculate missing ingredient costs
        let missingIngredientCost = 0;
        let missingFlatCost = 0; // Money: added at its flat rate, never smoothed
        for (let i = 1; i <= 10; i++) {
            const ingredientType = resource[`ingredient${i}`];
            const ingredientQty = resource[`ingredient${i}qty`];
            
            if (ingredientType && ingredientQty) {
                const inventoryQty = safeInventory.find(inv => inv.type === ingredientType)?.quantity || 0;
                const backpackQty = safeBackpack.find(item => item.type === ingredientType)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                const missingQty = Math.max(0, ingredientQty - playerQty);
                
                if (missingQty > 0) {
                    const resourceData = safeMasterResources.find(r => r.type === ingredientType);
                    if (!isGemBuyable(resourceData)) return null; // e.g. the Shrine's Skeleton Key
                    const ingredientGemCost = resourceData.gemcost;
                    if (ingredientType === GEM_PRICE.linear) missingFlatCost += ingredientGemCost * missingQty;
                    else missingIngredientCost += ingredientGemCost * missingQty;
                }
            }
        }
        
        // Check missing skill cost
        if (resource.requires) {
            const hasSkill = ownedSkills.some(skill => skill.type === resource.requires);
            if (!hasSkill) {
                const requiredSkill = safeMasterResources.find(r => r.type === resource.requires);
                if (!isGemBuyable(requiredSkill)) return null;
                const skillGemCost = requiredSkill.gemcost;
                missingIngredientCost += skillGemCost;
            }
        }
        
        // Gem cost is ONLY the cost of missing ingredients, on the same curve as the stored prices
        // (a big shortfall costs less per unit than a small one)
        gemCost = Math.ceil(missingFlatCost + smoothGems(missingIngredientCost));
        
        // Minimum of 1 gem if there are any missing ingredients
        if (gemCost === 0 && missingFlatCost + missingIngredientCost > 0) {
            gemCost = 1;
        }
    }
    
    // Create a modified recipe for purchase
    const getModifiedRecipe = () => {
        const modifiedRecipe = { ...resource };
        
        // Adjust ingredient quantities to what player actually has
        for (let i = 1; i <= 10; i++) {
            const ingredientType = resource[`ingredient${i}`];
            const ingredientQty = resource[`ingredient${i}qty`];
            
            if (ingredientType && ingredientQty) {
                const inventoryQty = safeInventory.find(inv => inv.type === ingredientType)?.quantity || 0;
                const backpackQty = safeBackpack.find(item => item.type === ingredientType)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                
                // Set to what player can actually spend
                modifiedRecipe[`ingredient${i}qty`] = Math.min(playerQty, ingredientQty);
            }
        }
        
        // Add gems as the next available ingredient slot
        // Find the first empty slot after existing ingredients
        let gemSlot = 1;
        for (let i = 1; i <= 10; i++) {
            if (!resource[`ingredient${i}`]) {
                gemSlot = i;
                break;
            }
        }
        
        modifiedRecipe[`ingredient${gemSlot}`] = 'Gem';
        modifiedRecipe[`ingredient${gemSlot}qty`] = gemCost;
        
        return modifiedRecipe;
    };
    
    const hasEnoughGems = playerGems >= gemCost;
    
    return {
        render: () => (
            <div className="gem-purchase-tooltip">                
                <div className="spending-summary">
                    <div className="spending-label">Will use:</div>
                    {spendingItems.map((item, index) => (
                        <div key={index} className="spending-line">
                            {item.symbol} {item.amount} {item.isSkill ? '(Skill)' : ''}
                        </div>
                    ))}
                    <div className="spending-line gem-line">
                        💎 {gemCost}  (You have: 💎 {playerGems})
                    </div>
                </div>
                
                
                {!hasEnoughGems && (
                    <div className="tooltip-footer">
                        Click for more 💎
                    </div>
                )}
            </div>
        ),
        getModifiedRecipe,
        hasEnoughGems,
        gemCost,
        // what the purchase spends besides gems (owned skills are only checked, not spent)
        spendingItems: spendingItems.filter(item => !item.isSkill)
    };
};

export default calculateGemPurchase;