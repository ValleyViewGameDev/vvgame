import React from 'react';
import { getLocalizedString } from '../Utils/stringLookup';
import { calculateGemSpeedupCost } from './EconomyUtils';
import './GemCosts.css';

// Pure function that doesn't use hooks
export const calculateGemPurchase = ({ 
    resource, 
    inventory, 
    backpack, 
    masterResources,
    currentPlayer,
    strings,
    overrideGemCost = null
}) => {
    // Ensure arrays are defined
    const safeInventory = inventory || [];
    const safeBackpack = backpack || [];
    const safeMasterResources = masterResources || [];
    
    // Calculate total gems from inventory and backpack
    const inventoryGems = safeInventory.find(item => item.type === 'Gem')?.quantity || 0;
    const backpackGems = safeBackpack.find(item => item.type === 'Gem')?.quantity || 0;
    const playerGems = inventoryGems + backpackGems;
    const ownedSkills = currentPlayer?.skills || [];
    
    // Calculate gem cost and spending
    let totalValueCalc = 0;
    let totalHasCalc = 0;
    const spendingItems = [];
    
    // Calculate for ingredient requirements
    for (let i = 1; i <= 10; i++) {
        const ingredientType = resource[`ingredient${i}`];
        const ingredientQty = resource[`ingredient${i}qty`];
        
        if (ingredientType && ingredientQty) {
            const resourceData = safeMasterResources.find(r => r.type === ingredientType);
            const moneyValue = resourceData?.moneyvalue || 0;
            
            // Add to total value needed
            totalValueCalc += moneyValue * ingredientQty;
            
            // Calculate what player has
            const inventoryQty = safeInventory.find(inv => inv.type === ingredientType)?.quantity || 0;
            const backpackQty = safeBackpack.find(item => item.type === ingredientType)?.quantity || 0;
            const playerQty = inventoryQty + backpackQty;
            const willSpend = Math.min(playerQty, ingredientQty);
            
            // Add to total value player has (capped at required qty)
            totalHasCalc += moneyValue * Math.min(playerQty, ingredientQty);
            
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
        const skillMoneyValue = requiredSkill?.moneyvalue || 0;
        
        totalValueCalc += skillMoneyValue;
        
        // Check if player has the required skill
        const hasSkill = ownedSkills.some(skill => skill.type === resource.requires);
        if (hasSkill) {
            totalHasCalc += skillMoneyValue;
            spendingItems.push({
                symbol: requiredSkill?.symbol || '',
                name: getLocalizedString(resource.requires, strings),
                amount: '✓',
                isSkill: true
            });
        }
    }
    
    // Calculate gem cost based on context
    let gemCost;
    
    // If an override gem cost is provided (like for speedups), use it directly
    if (overrideGemCost !== null && overrideGemCost !== undefined) {
        gemCost = overrideGemCost;
    } else if (resource.crafttime && resource.source !== 'Buy' && resource.source !== 'Build' && resource.source !== 'BuildTown' && resource.source !== 'BuildValley') {
        // For crafting items: base cost is time + missing ingredient costs
        const craftTimeMs = resource.crafttime * 60 * 1000; // Convert minutes to milliseconds
        const timeCost = calculateGemSpeedupCost(craftTimeMs);
        
        // Calculate missing ingredient costs
        let missingIngredientCost = 0;
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
                    const ingredientGemCost = resourceData?.gemcost || 1;
                    missingIngredientCost += ingredientGemCost * missingQty;
                }
            }
        }
        
        // Check missing skill cost
        if (resource.requires) {
            const hasSkill = ownedSkills.some(skill => skill.type === resource.requires);
            if (!hasSkill) {
                const requiredSkill = safeMasterResources.find(r => r.type === resource.requires);
                const skillGemCost = requiredSkill?.gemcost || 1;
                missingIngredientCost += skillGemCost;
            }
        }
        
        gemCost = Math.ceil(timeCost + missingIngredientCost);
    } else {
        // For non-crafting items: calculate cost based on missing ingredients
        let missingIngredientCost = 0;
        
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
                    const ingredientGemCost = resourceData?.gemcost || 1;
                    const calculatedCost = ingredientGemCost * missingQty;
                    
                    // Debug logging for Money calculations
                    if (ingredientType === 'Money') {
                        console.log(`[GEM DEBUG] Money calculation: missing ${missingQty}, gemcost ${ingredientGemCost}, calculated ${calculatedCost}`);
                    }
                    
                    missingIngredientCost += Math.ceil(calculatedCost);
                }
            }
        }
        
        // Check missing skill cost
        if (resource.requires) {
            const hasSkill = ownedSkills.some(skill => skill.type === resource.requires);
            if (!hasSkill) {
                const requiredSkill = safeMasterResources.find(r => r.type === resource.requires);
                const skillGemCost = requiredSkill?.gemcost || 1;
                missingIngredientCost += skillGemCost;
            }
        }
        
        // Use missing ingredient cost, with minimum of 1 gem if there are missing ingredients
        gemCost = missingIngredientCost > 0 ? Math.max(1, Math.ceil(missingIngredientCost)) : 0;
    }
    
    // Final safety check: ensure gemCost is always an integer
    gemCost = Math.ceil(gemCost);
    
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
        gemCost
    };
};

export default calculateGemPurchase;