import React, { useState } from 'react';
import Modal from '../../UI/Modals/Modal';
import { handleNPCClick } from '../NPCs/NPCUtils';
import { calculateSkillMultiplier } from '../../Utils/InventoryManagement';
import { formatCollectionResults } from '../../UI/StatusBar/CollectionFormatters';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { getLocalizedString } from '../../Utils/stringLookup';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import '../../UI/Buttons/SharedButtons.css';

// Component for the bulk animal collection selection modal
export function BulkAnimalModal({ 
  isOpen, 
  onClose, 
  animals, 
  onExecute,
  strings 
}) {
  const [selectedAnimalTypes, setSelectedAnimalTypes] = useState({});

  // Initialize selections when modal opens
  React.useEffect(() => {
    if (isOpen && animals.length > 0) {
      // Select all animals by default
      const defaultSelection = {};
      animals.forEach(animal => {
        defaultSelection[animal.type] = true;
      });
      setSelectedAnimalTypes(defaultSelection);
    }
  }, [isOpen, animals]);

  const handleToggleAnimal = (animalType) => {
    setSelectedAnimalTypes(prev => ({
      ...prev,
      [animalType]: !prev[animalType]
    }));
  };

  const handleExecute = () => {
    onExecute();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={strings[319] || "Select Animals to Collect"} size="medium">
      <div style={{ padding: '20px', fontSize: '16px' }}>           
        <div className="shared-buttons" style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
          <button 
            className="btn-basic btn-success btn-modal-small"
            onClick={() => {
              const allSelected = {};
              animals.forEach(animal => {
                allSelected[animal.type] = true;
              });
              setSelectedAnimalTypes(allSelected);
            }}
          >
            {strings[316] || 'Select All'}
          </button>
          <button 
            className="btn-basic btn-danger btn-modal-small"
            onClick={() => setSelectedAnimalTypes({})}
          >
            {strings[317] || 'Deselect All'}
          </button>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          {animals.map((animal, index) => (
            <div key={animal.type} style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '10px',
              padding: '5px',
              backgroundColor: index % 2 === 0 ? 'transparent' : 'var(--color-bg-light)'
            }}>
              <input
                type="checkbox"
                checked={selectedAnimalTypes[animal.type] || false}
                onChange={(e) => {
                  setSelectedAnimalTypes(prev => ({
                    ...prev,
                    [animal.type]: e.target.checked
                  }));
                }}
                style={{ marginRight: '10px' }}
              />
              <span>{animal.symbol} {getLocalizedString(animal.type, strings)} ({animal.count})</span>
            </div>
          ))}
        </div>
        
        <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center' }}>
          <button 
            className="btn-basic btn-success btn-modal"
            onClick={handleExecute}
            disabled={Object.values(selectedAnimalTypes).every(selected => !selected)}
          >
            {strings[318] || 'Collect Selected'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Main function to execute bulk animal collection
export async function executeBulkAnimalCollect({
  selectedAnimalTypes,
  gridId,
  currentPlayer,
  setCurrentPlayer,
  setInventory,
  setBackpack,
  setResources,
  updateStatus,
  TILE_SIZE,
  masterResources,
  masterSkills,
  strings
}) {
  // Get selected animal types
  const selectedTypes = Object.keys(selectedAnimalTypes).filter(type => selectedAnimalTypes[type]);
  
  if (selectedTypes.length === 0) {
    return 'No animals selected for collection.';
  }

  const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
  const animalsToCollect = npcs.filter(npc => 
    npc.state === 'processing' && selectedTypes.includes(npc.type)
  );

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const successfulCollects = {};
  const animalSkillsInfo = {};

  // Process each animal
  for (const npc of animalsToCollect) {
    const result = await handleNPCClick(
      npc,
      npc.position.y,
      npc.position.x,
      setInventory,
      setBackpack,  
      setResources,
      currentPlayer,
      setCurrentPlayer,
      TILE_SIZE,
      masterResources,
      masterSkills,
      gridId,
      () => {}, // setModalContent (not used here)
      () => {}, // setIsModalOpen (not used here)
      updateStatus,
      () => {}, // openPanel (not used here)
      () => {}, // setActiveStation (not used here)
      strings
    );

    // Check if collection was successful
    if (result && result.type === 'success' && result.collectedItem) {
      const { collectedItem, collectedQuantity, skillsApplied } = result;
      
      // Track successful collects
      successfulCollects[collectedItem] = (successfulCollects[collectedItem] || 0) + collectedQuantity;
      
      // Track skill info for this item type - use what server provided
      if (!animalSkillsInfo[collectedItem] && skillsApplied && skillsApplied.length > 0) {
        // The server already tells us which skills were applied
        // We need to calculate the multiplier from the quantity
        // Each animal gives base 1, so multiplier = collectedQuantity / 1
        const multiplier = collectedQuantity;
        
        animalSkillsInfo[collectedItem] = {
          skills: skillsApplied,
          multiplier: multiplier,
          hasSkills: true
        };
      }
    }
    
    await wait(100); // avoid overloading server
  }

  // Small delay to ensure all state updates have propagated
  await wait(100);
  
  // Refresh player data from server, including fresh inventory
  await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer, false);

  // Use shared formatter for status message
  if (Object.keys(successfulCollects).length > 0) {
    const statusMessage = formatCollectionResults('animal', successfulCollects, animalSkillsInfo, null, strings, getLocalizedString);
    return statusMessage;
  } else {
    return 'Failed to collect from any animals.';
  }
}

// Function to prepare animal data for the modal
export function prepareBulkAnimalData(gridId, masterResources) {
  const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
  const processingAnimals = npcs.filter(npc => npc.state === 'processing');
  
  // Count how many of each animal type is ready
  const animalCounts = {};
  processingAnimals.forEach((npc) => {
    animalCounts[npc.type] = (animalCounts[npc.type] || 0) + 1;
  });

  // Create array of available animals with counts and symbols
  return Object.entries(animalCounts).map(([animalType, count]) => {
    const resourceDef = masterResources.find(res => res.type === animalType);
    return {
      type: animalType,
      count,
      symbol: resourceDef?.symbol || '🐮'
    };
  });
}