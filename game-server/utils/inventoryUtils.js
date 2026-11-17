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
         resourceType === "Hecate's Torch" || // held like a key (lights the Black Fog), owner 2026-11-07
         resourceType === 'Yellow Heart' ||
         resourceType === 'Green Heart' ||
         resourceType === 'Purple Heart' ||
         isSecret(resourceType);
}

// The Secrets (Portia's Secret, Caliban's Secret, ...): held like keys, free of backpack and
// warehouse capacity, kept in the warehouse list wherever they are picked up (owner 2026-11-16).
// Any resource whose type ends in "'s Secret" is one; the client has the same rule.
function isSecret(resourceType) {
  return typeof resourceType === 'string' && /'s Secret$/.test(resourceType);
}

module.exports = { isCurrency, isSecret };
