/**
 * Shared utility functions for skill calculations across bulk operations
 * These functions ensure consistent skill multiplier calculations
 */

/**
 * Calculate skill multiplier for a specific resource type
 * @param {String} resourceType - The resource type to check skills for
 * @param {Array} playerSkills - Player's skills array
 * @param {Object} masterSkills - Master skills definitions
 * @returns {Object} Object containing multiplier, applicable skills, and whether skills apply
 */
export function calculateSkillMultiplier(resourceType, playerSkills, masterSkills) {
  const applicableSkills = [];
  let multiplier = 1;
  
  // Find all skills that buff this resource type
  playerSkills.forEach(skill => {
    const buffValue = masterSkills?.[skill.type]?.[resourceType];
    if (buffValue && buffValue > 1) {
      applicableSkills.push(skill.type);
      multiplier *= buffValue;
    }
  });
  
  return {
    multiplier,
    skills: applicableSkills,
    hasSkills: applicableSkills.length > 0
  };
}

/**
 * Calculate skill multipliers for multiple resource types
 * @param {Array} resourceTypes - Array of resource types
 * @param {Array} playerSkills - Player's skills array
 * @param {Object} masterSkills - Master skills definitions
 * @returns {Object} Map of resource type to skill info
 */
export function calculateMultipleSkillMultipliers(resourceTypes, playerSkills, masterSkills) {
  const skillsInfo = {};
  
  resourceTypes.forEach(resourceType => {
    const skillData = calculateSkillMultiplier(resourceType, playerSkills, masterSkills);
    if (skillData.hasSkills) {
      skillsInfo[resourceType] = skillData;
    }
  });
  
  return skillsInfo;
}

/**
 * Apply skill multiplier to a base quantity
 * @param {Number} baseQuantity - Base quantity before skills
 * @param {Number} multiplier - Skill multiplier
 * @returns {Number} Final quantity after applying skills
 */
export function applySkillMultiplier(baseQuantity, multiplier) {
  return Math.floor(baseQuantity * multiplier);
}

/**
 * Format skill information for display
 * @param {Object} skillInfo - Skill info object with skills array and multiplier
 * @param {Object} strings - Localized strings
 * @param {Function} getLocalizedString - String localization function
 * @returns {String} Formatted skill display string
 */
export function formatSkillInfo(skillInfo, strings, getLocalizedString) {
  if (!skillInfo || !skillInfo.hasSkills) {
    return '';
  }
  
  const skillsStr = skillInfo.skills.join(', ');
  return `with ${skillsStr} applied (${skillInfo.multiplier}x)`;
}