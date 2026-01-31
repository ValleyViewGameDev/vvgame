import React, { useEffect } from 'react';
import Modal from '../../UI/Modals/Modal';
import { getLocalizedString } from '../../Utils/stringLookup';
import soundManager from '../../Sound/SoundManager';
import '../../UI/Buttons/SharedButtons.css';
import './BulkHarvestResultsModal.css'; // Reuse harvest modal styles

/**
 * Modal to display results of bulk crafting collection
 * Shows collected items, restarted crafts, and skills applied
 */
export function BulkCraftingResultsModal({
  isOpen,
  onClose,
  results,
  strings,
  masterResources
}) {
  // Play success sound when modal opens
  useEffect(() => {
    if (isOpen && results) {
      soundManager.playSFX('success');
    }
  }, [isOpen, results]);

  if (!isOpen || !results) return null;

  const {
    collectResults = {},
    restartInfo = {},
    craftSkillsInfo = {}
  } = results;

  // Check if we have any content to show
  const hasCollectResults = Object.keys(collectResults).length > 0;
  const hasRestartInfo = Object.keys(restartInfo).length > 0;
  const hasSkillsApplied = Object.keys(craftSkillsInfo).length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={strings[479] || "Bulk Crafting Results"}
      size="medium"
      className="bulk-harvest-results-modal"
    >
      <div className="bulk-harvest-results-content">

        {/* Collected Items Section */}
        {hasCollectResults && (
          <div className="results-section">
            <h3 className="results-section-header crops">
              📦 {strings[480] || "Items Collected"}
            </h3>
            <div className="crop-rows">
              {Object.entries(collectResults).map(([itemType, quantity]) => {
                const skillInfo = craftSkillsInfo[itemType];
                const hasSkillBonus = skillInfo && skillInfo.hasSkills;

                // Find the item symbol from masterResources
                const itemResource = masterResources?.find(r => r.type === itemType);
                const itemSymbol = itemResource?.symbol || '📦';

                return (
                  <div key={itemType} className="crop-row">
                    <span className="crop-symbol">{itemSymbol}</span>
                    <span className="crop-name">{getLocalizedString(itemType, strings)}</span>
                    <span className="crop-quantity">+{quantity}</span>
                    {hasSkillBonus && (
                      <span className="crop-skills">
                        Skills applied ({skillInfo.multiplier}x): {skillInfo.skills.join(', ')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Restarted Crafts Section */}
        {hasRestartInfo && (
          <div className="results-section">
            <h3 className="results-section-header replanting">
              🔄 {strings[481] || "Crafts Restarted"}
            </h3>
            <div className="replant-rows">
              {Object.entries(restartInfo).map(([itemType, count]) => {
                // Find the item symbol from masterResources
                const itemResource = masterResources?.find(r => r.type === itemType);
                const itemSymbol = itemResource?.symbol || '🛖';

                return (
                  <div key={itemType} className="replant-row">
                    <span className="replant-symbol">{itemSymbol}</span>
                    <span className="replant-name">{getLocalizedString(itemType, strings)}</span>
                    <span className="replant-quantity">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Close Button - using shared button styles */}
        <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
          <button
            onClick={onClose}
            className="btn-basic btn-success btn-modal"
            style={{ fontSize: '16px', padding: '10px 20px' }}
          >
            {strings[360] || "Continue"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default BulkCraftingResultsModal;
