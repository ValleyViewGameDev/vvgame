import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { canAfford } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import { spendIngredients } from '../../Utils/InventoryManagement';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import { earnTrophy } from '../Trophies/TrophyUtils';
import { getDerivedLevel } from '../../Utils/playerManagement';

const SkillsPanel = ({
    onClose,
    inventory,
    setInventory,
    backpack,
    setBackpack,
    currentPlayer,
    setCurrentPlayer,
    stationType,
    stationCategory,
    currentStationPosition,
    gridId,
    isDeveloper,
    TILE_SIZE,
    updateStatus,
    masterSkills,
    setResources,
    masterResources,
    masterXPLevels,
}) => {
  const strings = useStrings();
  const [entryPoint, setEntryPoint] = useState(stationType || "Skills Panel"); 
  const [allResources, setAllResources] = useState([]);
  const [skillsToAcquire, setSkillsToAcquire] = useState([]);
  const [ownedSkills, setOwnedSkills] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [stationEmoji, setStationEmoji] = useState('📘'); // Default emoji for Skills Panel

  // ✅ Update `entryPoint` when `stationType` changes
  useEffect(() => {
    if (!stationType) {
      setEntryPoint("Basic Skills"); // ✅ Ensure default entry point when coming from the UI button
      // NOTE: This "Basic Skills" string comes from resources.json
    } else if (stationType !== entryPoint) {
      setEntryPoint(stationType);
    }
  }, [stationType]);

  // ✅ Fetch resources when `entryPoint` changes
  useEffect(() => {
    const fetchResourcesAndInventory = async () => {
      setIsContentLoading(true);
      try {
        console.log("Fetching skills and inventory for:", entryPoint);
        
        const [inventoryResponse, skillsResponse, resourcesResponse] = await Promise.all([
          axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`),
          axios.get(`${API_BASE}/api/skills/${currentPlayer.playerId}`),
          axios.get(`${API_BASE}/api/resources`),
        ]);

        const serverInventory = inventoryResponse.data.inventory || [];
        const serverBackpack = inventoryResponse.data.backpack || [];
        const serverSkills = skillsResponse.data.skills || [];
        const allResourcesData = resourcesResponse.data;

        setInventory(serverInventory);
        setBackpack(serverBackpack);
        setAllResources(allResourcesData);

        const stationResource = allResourcesData.find((resource) => resource.type === stationType);
        setStationEmoji(stationResource?.symbol || '💪');

        // ✅ Filter owned skills
        const ownedSkills = serverSkills.filter(skill =>
          allResourcesData.some(res => res.type === skill.type && res.category === 'skill')
        );
        setOwnedSkills(ownedSkills);

        // ✅ Filter available skills based on `entryPoint`
        // For trainingAndShop stations, also include 'special' category items (like Tent, Boat)
        const validCategories = stationCategory === 'trainingAndShop'
          ? ['skill', 'special']
          : ['skill'];
        const availableSkills = allResourcesData.filter(
          res => validCategories.includes(res.category) &&
          res.source === entryPoint &&
          !ownedSkills.some(owned => owned.type === res.type)
        );

        setSkillsToAcquire(availableSkills);
      } catch (error) {
        console.error('Error fetching resources, inventory, or skills:', error);
      } finally {
        setIsContentLoading(false);
      }
    };

    fetchResourcesAndInventory();
  }, [entryPoint, currentPlayer?.playerId, stationCategory]); // ✅ Re-fetch when `entryPoint`, player, or category changes


  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill ||
        ownedSkills.some((owned) => owned.type === requiredSkill);
  };

  // Check if player meets the level requirement for a resource
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => {
    if (!resourceLevel) return true; // No level requirement
    return playerLevel >= resourceLevel;
  };


const handleGemPurchase = async (modifiedRecipe) => {
  // This is called by the gem button with a recipe modified to include gems
  return handlePurchase(modifiedRecipe.type, modifiedRecipe);
};

const handlePurchase = async (resourceType, customRecipe = null) => {
  const resource = skillsToAcquire.find((item) => item.type === resourceType);
  const recipeToUse = customRecipe || resource;
  
  const spendSuccess = await spendIngredients({
    playerId: currentPlayer.playerId,
    recipe: recipeToUse,
    inventory,
    backpack,
    setInventory,
    setBackpack,
    setCurrentPlayer,
    updateStatus,
  });

  if (!spendSuccess) {
    console.warn('Failed to spend ingredients.');
    return;
  }

  const updatedSkills = [...ownedSkills];
  // Add the new skill
  updatedSkills.push({ type: resource.type, category: resource.category, quantity: 1 });
  setOwnedSkills(updatedSkills);
  updateStatus(`💪 ${getLocalizedString(resource.type, strings)} skill acquired.`);
  
  try { 
    await axios.post(`${API_BASE}/api/update-skills`, {
      playerId: currentPlayer.playerId,
      skills: updatedSkills,
    });
    await trackQuestProgress(currentPlayer, 'Acquire', resource.type, 1, setCurrentPlayer);
    await earnTrophy(currentPlayer.playerId, 'Skill Builder', 1, currentPlayer, null, setCurrentPlayer);
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

    // Instead of re-fetching, update the acquire list locally
    setSkillsToAcquire(prev => prev.filter(skill => skill.type !== resource.type));

  } catch (error) {
    console.error('Error updating player on server:', error);
    setErrorMessage('Error updating player on server.');
  }
};

  const handleSellStation = async () => {
    try {
      const success = await handleProtectedSelling({
        currentPlayer,
        stationType,
        currentStationPosition,
        gridId,
        setResources,
        setInventory,
        setCurrentPlayer,
        updateStatus,
        onClose,
        devOnly: true,
      });
      
      if (success) {
        onClose();
      }
    } catch (error) {
      console.error('Error selling station:', error);
      updateStatus('Failed to sell station');
    }
  };

  // Check if we should show the sell button
  const showSellButton = isDeveloper && entryPoint !== "Basic Skills" && currentStationPosition && gridId;

  return (
    <Panel onClose={onClose} descriptionKey="1005" title={`${stationEmoji} ${entryPoint}`} panelName="SkillsPanel">
      <div className="standard-panel">
            
      {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {(entryPoint === "Basic Skills") && (
              <div className="skills-owned">
                <h3>{strings[1303]}</h3>
                {ownedSkills.length > 0 ? (
                  ownedSkills.map((skill, index) => (
                    <div key={index}>
                      {getLocalizedString(skill.type, strings)} 
                    </div>
                  ))
                ) : (
                  <p>{strings[1305]}</p>
                )}
              </div>
            )}


            <div className="skills-to-acquire">
              <div className="skills-options">
                {skillsToAcquire.map((resource) => {
                  const affordable = canAfford(resource, inventory, backpack, 1);
                  const meetsSkillRequirement = hasRequiredSkill(resource.requires);
                  const meetsLevel = meetsLevelRequirement(resource.level);
                  const requirementsMet = meetsSkillRequirement && meetsLevel;

                  const formattedCosts = [1, 2, 3, 4].map((i) => {
                    const type = resource[`ingredient${i}`];
                    const qty = resource[`ingredient${i}qty`];
                    if (!type || !qty) return '';

                    const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
                    const backpackQty = backpack?.find(item => item.type === type)?.quantity || 0;
                    const playerQty = inventoryQty + backpackQty;
                    const color = playerQty >= qty ? 'green' : 'red';
                    const symbol = allResources.find(r => r.type === type)?.symbol || '';
                    return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
                  }).join('');

                  const skillColor = meetsSkillRequirement ? 'green' : 'red';
                  const levelColor = meetsLevel ? 'green' : 'red';
                  const details =
                    (resource.level ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${resource.level}</span>` : '') +
                    (resource.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(resource.requires, strings)}</span>` : '') +
                    `${strings[461]}<div>${formattedCosts}</div>`;

                  // ✅ **Check if this skill modifies a player attribute**
                  const attributeModifier = resource.output
                    ? `+${resource.qtycollected || 1} to ${strings[resource.output] || resource.output}`
                    : null;

                  // ✅ Check if this skill provides a collection buff
                  let buffText = '';
                  const buffedItems = masterSkills[resource.type];
                  if (buffedItems && typeof buffedItems === 'object') {
                    const items = Object.keys(buffedItems);
                    if (items.length > 0) {
                      const prettyList = items.join(', ');
                      buffText = `Collection multiplied: ${prettyList}`;
                    }
                  }

                  const unlocks = allResources
                    .filter((res) => res.requires === resource.type)
                    .map((res) => `${res.symbol || ''} ${getLocalizedString(res.type, strings)}`)
                    .join(', ') || 'None';

                    const info = (
                      <div className="info-content">
                        {attributeModifier && <div>{attributeModifier}</div>}
                        {unlocks !== 'None' && (
                          <div style={{ display: 'block', marginBottom: '3px' }}>
                            <strong>Unlocks:</strong> {unlocks}
                          </div>
                        )}
                        {buffText && <div style={{ color: 'blue' }}>{buffText}</div>}
                      </div>
                    );

                  return (
                    <ResourceButton
                      key={resource.type}
                      symbol={resource.symbol}
                      name={getLocalizedString(resource.type, strings)}
                      details={details}
                      info={info}
                      disabled={!affordable || !requirementsMet}
                      onClick={() => handlePurchase(resource.type)}
                      // Don't pass gemCost - let ResourceButton calculate it based on missing ingredients
                      onGemPurchase={(resource.gemcost && (!affordable || !requirementsMet)) ? handleGemPurchase : null}
                      meetsLevelRequirement={meetsLevel}
                      resource={resource}
                      inventory={inventory}
                      backpack={backpack}
                      masterResources={masterResources || allResources}
                      currentPlayer={currentPlayer}
                    />
                  );
                })}
              </div>
            </div>

          <br></br>
          <h3>{strings[10175]}</h3>
          
      {showSellButton && (
        <div className="shared-buttons">
          <TransactionButton 
            className="btn-basic btn-danger" 
            onAction={handleSellStation}
            transactionKey={`sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
          >
            {strings[490]}
          </TransactionButton>
        </div>
      )}

          </>
        )}
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>
    </Panel>
  );
};

export default React.memo(SkillsPanel);