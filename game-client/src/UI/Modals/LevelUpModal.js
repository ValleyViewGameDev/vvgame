import React, { useState, useEffect } from 'react';
import './Modal.css';
import '../Buttons/SharedButtons.css';
import './LevelUpModal.css';
import { useStrings } from '../StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import questCache from '../../Utils/QuestCache';

// Categories to show in unlock list
const ALLOWED_CATEGORIES = ['farmplot', 'crafting', 'skill', 'power', 'pet', 'deco'];

// Check if resource should be shown in unlock list
const shouldShowResource = (resource) => {
  if (!resource.category) return false;

  // Direct category match
  if (ALLOWED_CATEGORIES.includes(resource.category)) {
    return true;
  }

  // NPC category with specific actions
  if (resource.category === 'npc') {
    return resource.action === 'graze' || resource.action === 'worker';
  }

  return false;
};

const LevelUpModal = ({
  isOpen,
  onClose,
  currentLevel,
  previousLevel,
  updateStatus,
  masterResources
}) => {

  const strings = useStrings();
  const [questGivers, setQuestGivers] = useState([]);

  // Fetch quests and find givers with quests at this level
  useEffect(() => {
    if (!isOpen || !currentLevel) return;

    const fetchQuestGivers = async () => {
      try {
        const allQuests = await questCache.getQuests();
        // Find quests that unlock at this level
        const questsAtLevel = allQuests.filter(quest => quest.level === currentLevel);
        // Get unique quest givers with their symbols
        const giverMap = new Map();
        questsAtLevel.forEach(quest => {
          if (quest.giver && !giverMap.has(quest.giver)) {
            giverMap.set(quest.giver, quest.symbol || '✅');
          }
        });
        setQuestGivers(Array.from(giverMap.entries()).map(([giver, symbol]) => ({ giver, symbol })));
      } catch (error) {
        console.error('Error fetching quests for level up modal:', error);
        setQuestGivers([]);
      }
    };

    fetchQuestGivers();
  }, [isOpen, currentLevel]);

  if (!isOpen) return null;

  // Find resources unlocked at this level, filtered by allowed categories
  const unlockedResources = masterResources?.filter(
    resource => resource.level === currentLevel && shouldShowResource(resource)
  ) || [];

  const handleClose = () => {
    if (updateStatus) {
      updateStatus((strings[813] || 'Level up! You are now level {level}!').replace('{level}', currentLevel));
    }
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container modal-medium level-up-modal">
        <button className="modal-close-btn" onClick={handleClose}>×</button>

        <div className="modal-title">⬆️ {strings[811] || 'Level Up!'}</div>

        <div className="modal-content">
          <div className="level-up-message">
            🎉 {(strings[812] || "Congratulations! You've reached level {level}!").replace('{level}', currentLevel)} 🎉
          </div>

          {unlockedResources.length > 0 && (
            <div className="unlocked-resources">
              <div className="unlocked-title">{strings[10138]}</div>
              <ul className="unlocked-list">
                {unlockedResources.map((resource, index) => (
                  <li key={index}>
                    {resource.symbol} {getLocalizedString(resource.type, strings)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {questGivers.length > 0 && (
            <div className="unlocked-resources">
              <div className="unlocked-title">{strings[10139]}</div>
              <ul className="unlocked-list">
                {questGivers.map((item, index) => (
                  <li key={index}>
                    {item.symbol} {getLocalizedString(item.giver, strings)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="shared-buttons">
            <button
              className="btn-basic btn-success btn-modal"
              onClick={handleClose}
            >
              {strings[360]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LevelUpModal;