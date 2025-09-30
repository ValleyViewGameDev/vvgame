/**
 * Shared formatters for collection status messages
 * Used by both single and bulk collection operations
 */

/**
 * Format harvest/collection results for status bar
 * @param {String} operation - Type of operation ('harvest', 'craft', 'animal', 'logging')
 * @param {Object} results - Collection results with items and quantities
 * @param {Object} skillsInfo - Skills applied for each item type
 * @param {Object} replantInfo - Optional replanting information
 * @param {Object} strings - Localized strings
 * @param {Function} getLocalizedString - String localization function
 * @returns {String} Formatted status message
 */
export function formatCollectionResults(operation, results, skillsInfo, replantInfo, strings, getLocalizedString) {
  const parts = [];
  
  // Format the main collection based on operation type
  const operationLabels = {
    'harvest': strings[469] || 'Harvest complete',
    'craft': strings[480] || 'Crafting complete',
    'animal': strings[469] || 'Animal Collect complete',
    'logging': strings[479] || 'Logging complete'
  };
  
  const label = operationLabels[operation] || strings[469] || 'Complete';
  
  // Format collected items
  if (results && Object.keys(results).length > 0) {
    const itemParts = Object.entries(results).map(([type, quantity]) => {
      const skillInfo = skillsInfo?.[type];
      const localizedName = getLocalizedString(type, strings);
      
      if (skillInfo && skillInfo.hasSkills) {
        const skillsStr = skillInfo.skills.join(', ');
        return `${quantity} ${localizedName}, ${strings[481]} ${skillsStr} ${strings[482]} (${skillInfo.multiplier}x)`;
      } else {
        return `${quantity} ${localizedName}`;
      }
    }).join(', ');
    
    parts.push(`${label} ${itemParts}`);
  }
  
  // Add replanting info if provided
  if (replantInfo && Object.keys(replantInfo).length > 0) {
    const replantParts = Object.entries(replantInfo)
      .map(([type, count]) => `${count} ${getLocalizedString(type, strings)}`)
      .join(', ');
    parts.push(`${replantParts} ${strings[483] || 'replanted'}`);
  }
  
  return parts.join(' | ');
}

/**
 * Format single item collection for status bar
 * @param {String} operation - Type of operation
 * @param {String} itemType - Type of item collected
 * @param {Number} quantity - Quantity collected
 * @param {Object} skillInfo - Skills applied
 * @param {Object} strings - Localized strings
 * @param {Function} getLocalizedString - String localization function
 * @returns {String} Formatted status message
 */
export function formatSingleCollection(operation, itemType, quantity, skillInfo, strings, getLocalizedString) {
  const results = { [itemType]: quantity };
  const skillsInfo = skillInfo ? { [itemType]: skillInfo } : {};
  return formatCollectionResults(operation, results, skillsInfo, null, strings, getLocalizedString);
}

/**
 * Format restart/replant results
 * @param {Object} restartInfo - Information about restarted operations
 * @param {String} operation - Type of operation ('craft' or 'harvest')
 * @param {Object} strings - Localized strings
 * @param {Function} getLocalizedString - String localization function
 * @returns {String} Formatted restart message
 */
export function formatRestartResults(restartInfo, operation, strings, getLocalizedString) {
  if (!restartInfo || Object.keys(restartInfo).length === 0) {
    return '';
  }
  
  const restartParts = Object.entries(restartInfo)
    .map(([type, count]) => `${count} ${getLocalizedString(type, strings)}`)
    .join(', ');
  
  const labels = {
    'craft': 'restarted',
    'harvest': 'replanted'
  };
  
  const label = labels[operation] || 'restarted';
  return `${restartParts} ${label}`;
}