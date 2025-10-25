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
        // Start with base gem cost from resource data (includes ^0.45 time calculation)
        const baseGemCost = resource.gemcost || 0;
        
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
        
        // Total gem cost = base cost + missing ingredients cost
        gemCost = Math.ceil(baseGemCost + missingIngredientCost);
        
        // Minimum of 1 gem if there are any missing ingredients or base cost
        if (gemCost === 0 && (missingIngredientCost > 0 || baseGemCost > 0)) {
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
        gemCost
    };
};

export default calculateGemPurchase;