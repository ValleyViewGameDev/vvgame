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
 * Player-facing names that differ from a resource's code name (the type stays in data, routes,
 * panels and schedulers; only what the player reads changes). The alias is the English name,
 * so the reverse map finds its id and every language gets its own translation of that id.
 */
export const DISPLAY_ALIASES = {
  Train: 'Caravan',
  Carnival: 'Harvest Fair',
  Shiro: "Oracle's Sanctuary",
  // the Shakespearean pass (docs/narrative-pass.md P1.2, owner 2026-10-24)
  Restaurant: "Boar's Head",
  Inn: 'Garter Inn',
  Bank: 'Counting House',
  'Ancient Temple': 'Temple of Apollo',
  Library: "Prospero's Library",
  'Magic Shop': "Oberon's Bower",
  School: 'Wittenberg',
  'Agriculture Center': 'Grange at Arden',
  Courthouse: "Portia's Court",
  Shrine: "Neptune's Shrine",
  Castle: "Leontes' Castle",
  Laboratory: "Quickly's Lab",
  Factory: 'The Wall',
  "Warrior's Den": "Tybalt's",
  'General Store': "Woodman's Yard",
  Fairy: 'Peaseblossom',          // the healer fairy (Titania's attendant); Doctor, Surgeon, Field Nurse stay plain
  Armory: 'Hector Protector',
  // the four farm workers, one of each per player, so each is a character
  'Farm Hand': 'Audrey',
  Rancher: 'Corin',
  Lumberjack: 'Peter Quince',
  Crafter: 'Nick Bottom',
  // and their slots (the haybale each one rests on: "spot", owner 2026-10-24)
  'Farm Hand Slot': "Audrey's Spot",
  'Rancher Slot': "Corin's Spot",
  'Lumberjack Slot': "Peter Quince's Spot",
  'Crafter Slot': "Nick Bottom's Spot",
};

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
  
  return reverseLookupMap[DISPLAY_ALIASES[value] || value] || null;
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
  // Fallback to the alias or the original value if not found
  return DISPLAY_ALIASES[value] || value;
};