import stringsEN from '../UI/Strings/stringsEN.json';

// Create a reverse lookup map: value -> key
const createReverseLookupMap = () => {
  const reverseMap = {};
  Object.entries(stringsEN).forEach(([key, value]) => {
    reverseMap[value] = key;
  });
  return reverseMap;
};

// Cached reverse lookup map
let reverseLookupMap = null;

/**
 * Looks up a string value in stringsEN.json and returns its key (ID)
 * This allows server-side strings to be mapped to localized client strings
 * @param {string} value - The string value to look up
 * @returns {string|null} - The string ID/key if found, null otherwise
 */
export const getStringIdByValue = (value) => {
  if (!reverseLookupMap) {
    reverseLookupMap = createReverseLookupMap();
  }
  
  return reverseLookupMap[value] || null;
};

/**
 * Helper function for use in React components
 * Returns the localized string from the provided strings object
 * @param {string} value - The string value to look up
 * @param {object} strings - The localized strings object from useStrings()
 * @returns {string} - The localized string if found, original value otherwise
 */
export const getLocalizedString = (value, strings) => {
  // Handle undefined strings object
  if (!strings) {
    console.warn('getLocalizedString: strings object is undefined, returning original value');
    return value;
  }
  
  const stringId = getStringIdByValue(value);
  if (stringId && strings[stringId]) {
    return strings[stringId];
  }
  // Fallback to original value if not found
  return value;
};