import React from 'react';
import { useStrings } from '../StringsContext';
import { getDerivedLevel } from '../../Utils/playerManagement';
import './LevelLock.css';

/**
 * LevelLock Component
 *
 * A reusable component that checks if a player meets a level requirement.
 * If not met, displays a locked message. If met, renders children.
 *
 * Usage:
 *   <LevelLock
 *     currentPlayer={currentPlayer}
 *     masterXPLevels={masterXPLevels}
 *     requiredLevel={9}
 *     featureName="Train"
 *   >
 *     <YourPanelContent />
 *   </LevelLock>
 *
 * @param {Object} currentPlayer - The player object with xp field
 * @param {Array} masterXPLevels - Array of XP thresholds for each level
 * @param {number} requiredLevel - The minimum level required to access the content
 * @param {React.ReactNode} children - Content to render if level requirement is met
 * @param {string} featureName - Name of the feature being locked (e.g., "Train", "Windmill")
 */
const LevelLock = ({
  currentPlayer,
  masterXPLevels,
  requiredLevel,
  children,
  featureName
}) => {
  const strings = useStrings();

  // Calculate player's current level
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);

  // Check if player meets the level requirement
  const meetsRequirement = playerLevel >= requiredLevel;

  if (meetsRequirement) {
    return <>{children}</>;
  }

  // Render locked state
  // String 814: "The {feature} unlocks at level {level}."
  // String 815: "Your current level: {level}"
  return (
    <div className="level-lock-container">
      <div className="level-lock-icon">🔒</div>
      <div className="level-lock-message">
        {(strings[814] || 'The {feature} unlocks at level {level}.')
          .replace('{feature}', featureName || 'feature')
          .replace('{level}', requiredLevel)}
      </div>
      <div className="level-lock-current">
        {(strings[815] || 'Your current level: {level}').replace('{level}', playerLevel)}
      </div>
    </div>
  );
};

export default LevelLock;
