import React from 'react';
import { getLocalizedString } from '../Utils/stringLookup';
import './GemPurchaseCalculation.css';

// Pure function that doesn't use hooks
export const calculateGemPurchase = ({ 
    resource, 
    inventory, 
    backpack, 
    masterResources,
    currentPlayer,
    strings
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
    for (let i = 1; i <= 4; i++) {
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
    
    // Calculate ratios and gem cost
    const hasRatio = totalValueCalc > 0 ? totalHasCalc / totalValueCalc : 0;
    const gemCost = Math.ceil(resource.gemcost * (1 - hasRatio));
    
    // Create a modified recipe for purchase
    const getModifiedRecipe = () => {
        const modifiedRecipe = { ...resource };
        
        // Adjust ingredient quantities to what player actually has
        for (let i = 1; i <= 4; i++) {
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
        
        // Add gems as ingredient5
        modifiedRecipe.ingredient5 = 'Gem';
        modifiedRecipe.ingredient5qty = gemCost;
        
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