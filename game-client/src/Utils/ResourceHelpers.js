export const canAfford = (recipe, inventory, amount = 1) => {
    if (!recipe || !Array.isArray(inventory)) return false;
  
    for (let i = 1; i <= 3; i++) {
      const ingredientType = recipe[`ingredient${i}`];
      const ingredientQty = recipe[`ingredient${i}qty`] * amount;
  
      if (ingredientType && ingredientQty >= 0) {
        const inventoryItem = inventory.find((item) => item.type === ingredientType);
        if (!inventoryItem || inventoryItem.quantity <= ingredientQty) {
          return false;
        }
      }
    }
    return true;
  };
  
  export const getIngredientDetails = (recipe, allResources) => {
  
    const ingredients = [];
    for (let i = 1; i <= 4; i++) {
      const ingredientType = recipe[`ingredient${i}`];
      const ingredientQty = recipe[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        const ingredientResource = allResources.find((res) => res.type === ingredientType);
        const symbol = ingredientResource?.symbol || '';
        ingredients.push(`${symbol} ${ingredientType} x${ingredientQty}`);
      }
    }
    return ingredients;
  };
  