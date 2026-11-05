
/**
 * Check if player has a specific skill, upgrade, or power
 * @param {Object} player - Player object
 * @param {string} requirementType - Type of skill/upgrade/power to check for
 * @returns {boolean}
 */
export function hasSkillOrPower(player, requirementType) {
  if (!requirementType) return true;
  
  return (
    player.skills?.some(skill => skill.type === requirementType) ||
    player.powers?.some(power => power.type === requirementType)
  );
}