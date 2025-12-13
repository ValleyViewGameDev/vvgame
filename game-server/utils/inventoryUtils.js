const { readJSON, writeJSON } = require('./fileUtils');
const path = require('path');

const inventoryFilePath = path.join(__dirname, '../playerInventory.json');
const resourcesFilePath = path.join(__dirname, '../resources.json');

// Load resources data from resources.json
const resourcesData = readJSON(resourcesFilePath);

function loadInventory() {
  console.log('Loading inventory from:', inventoryFilePath);
  const inventory = readJSON(inventoryFilePath) || {};
  if (Object.keys(inventory).length > 0) {
//  console.log('Loaded inventory:', inventory);
    console.log('Loaded inventory:');
} else {
    console.warn('Inventory is empty or not found');
  }
  return inventory;
}

function saveInventory(inventory) {
  console.log(`Saving inventory to: ${inventoryFilePath}`);
  writeJSON(inventoryFilePath, inventory);
}

// Initialize inventory dynamically from resources.json
function initializeInventory() {
  const inventory = {};
  resourcesData.forEach(resource => {
    inventory[resource.type] = 0; // Start with zero quantity for all resources
  });
//  console.log('Initialized inventory:', inventory);
  console.log('Initialized inventory:');
return inventory;
}

/**
 * Checks if a resource type is considered "currency" (doesn't count against inventory capacity)
 * @param {string} resourceType - The type of resource to check
 * @returns {boolean} - True if the resource is a currency type
 */
function isCurrency(resourceType) {
  return resourceType === 'Money' ||
         resourceType === 'Gem' ||
         resourceType === 'Home Deed' ||
         resourceType === 'Town Key' ||
         resourceType === 'Skeleton Key' ||
         resourceType === 'Golden Key' ||
         resourceType === 'Dungeon Key' ||
         resourceType === 'Mirror Key' ||         resourceType === 'Yellow Heart' ||
         resourceType === 'Green Heart' ||
         resourceType === 'Purple Heart';
}

module.exports = {
  loadInventory,
  saveInventory,
  initializeInventory,
  isCurrency
};
