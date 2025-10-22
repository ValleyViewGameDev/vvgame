import React from 'react';
import Modal from '../../UI/Modal';
import { getLocalizedString } from '../../Utils/stringLookup';
import '../../UI/SharedButtons.css';
import './BulkHarvestResultsModal.css';

/**
 * Modal to display results of bulk harvest operation
 * Shows harvested crops, replanted seeds, warehouse ingredients, and skills applied
 */
export function BulkHarvestResultsModal({ 
  isOpen, 
  onClose, 
  results,
  strings,
  masterResources
}) {
  if (!isOpen || !results) return null;

  const { 
    harvestResults = {}, 
    replantInfo = {}, 
    harvestSkillsInfo = {}, 
    warehouseDrops = {},
    seedsUsed = {}
  } = results;

  // Check if we have any content to show
  const hasHarvestResults = Object.keys(harvestResults).length > 0;
  const hasReplantInfo = Object.keys(replantInfo).length > 0;
  const hasWarehouseDrops = Object.keys(warehouseDrops).length > 0;
  const hasSkillsApplied = Object.keys(harvestSkillsInfo).length > 0;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={strings[356] || "Bulk Harvest Results"} 
      size="medium"
      className="bulk-harvest-results-modal"
    >
      <div className="bulk-harvest-results-content">
        
        {/* Harvested Crops Section */}
        {hasHarvestResults && (
          <div className="results-section">
            <h3 className="results-section-header crops">
              🚜 {strings[357] || "Crops Harvested"}
            </h3>
            <div className="crop-rows">
              {Object.entries(harvestResults).map(([cropType, quantity]) => {
                const skillInfo = harvestSkillsInfo[cropType];
                const hasSkillBonus = skillInfo && skillInfo.hasSkills;
                
                // Find the crop symbol from masterResources
                const cropResource = masterResources?.find(r => r.type === cropType);
                const cropSymbol = cropResource?.symbol || '🌾';
                
                return (
                  <div key={cropType} className="crop-row">
                    <span className="crop-symbol">{cropSymbol}</span>
                    <span className="crop-name">{getLocalizedString(cropType, strings)}</span>
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

        {/* Replanted Seeds Section */}
        {hasReplantInfo && (
          <div className="results-section">
            <h3 className="results-section-header replanting">
              🌱 {strings[358] || "Crops Replanted"}
            </h3>
            <div className="replant-rows">
              {Object.entries(replantInfo).map(([cropType, count]) => {
                // Find the crop symbol from masterResources
                const cropResource = masterResources?.find(r => r.type === cropType);
                const cropSymbol = cropResource?.symbol || '🌱';
                const seedsUsedForCrop = seedsUsed[cropType];
                
                return (
                  <div key={cropType} className="replant-row">
                    <span className="replant-symbol">{cropSymbol}</span>
                    <span className="replant-name">{getLocalizedString(cropType, strings)}</span>
                    <span className="replant-quantity">{count} plots</span>
                    {seedsUsedForCrop && (
                      <span className="replant-seeds-used">
                        {strings[361] || "Seeds used"}: -{seedsUsedForCrop}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Warehouse Ingredients Section */}
        {hasWarehouseDrops && (
          <div className="results-section">
            <h3 className="results-section-header warehouse">
              📦 {strings[359] || "Warehouse Ingredients Found"}
            </h3>
            <div className="results-grid-warehouse">
              {Object.entries(warehouseDrops).map(([ingredientType, data]) => (
                <div key={ingredientType} className="result-item warehouse">
                  <div className="result-item-label">
                    <span className="result-item-name">
                      {data.symbol} {getLocalizedString(ingredientType, strings)}
                    </span>
                  </div>
                  <span className="result-item-quantity warehouse">+{data.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Close Button - using shared button styles */}
        <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
          <button 
            onClick={onClose}
            className="btn-success"
            style={{ fontSize: '16px', padding: '10px 20px' }}
          >
            {strings[360] || "Continue"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default BulkHarvestResultsModal;