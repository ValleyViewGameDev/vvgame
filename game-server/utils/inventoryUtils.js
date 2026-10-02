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
         resourceType === 'Mirror Key' ||
         resourceType === 'Yellow Heart' ||
         resourceType === 'Green Heart' ||
         resourceType === 'Purple Heart';
}

module.exports = { isCurrency };
