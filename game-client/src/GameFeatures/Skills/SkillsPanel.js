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
import { spendIngredients, gainIngredients, hasRoomFor } from '../../Utils/InventoryManagement';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import { updateGridResource } from '../../Utils/GridManagement';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { createCollectEffect } from '../../VFX/VFX';
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
        // Include ALL skills from this station (owned ones will be shown differently)
        const validCategories = stationCategory === 'trainingAndShop'
          ? ['skill', 'special']
          : ['skill'];
        const availableSkills = allResourcesData.filter(
          res => validCategories.includes(res.category) &&
          res.source === entryPoint
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

  // Check if this is an item (special category) vs a skill
  const isItem = resource.category === 'special';

  // For items, check if there's room before spending money
  if (isItem) {
    const quantity = resource.qtycollected || 1;
    const hasRoom = hasRoomFor({
      resource: resource.type,
      quantity: quantity,
      currentPlayer,
      inventory: inventory,
      backpack: backpack,
      masterResources: allResources,
      globalTuning: null
    });

    if (!hasRoom) {
      const isHomestead = currentPlayer?.location?.gtype === 'homestead';
      if (!isHomestead) {
        const hasBackpackSkill = currentPlayer?.skills?.some((item) => item.type === 'Backpack' && item.quantity > 0);
        if (!hasBackpackSkill) {
          updateStatus(19); // Missing backpack
        } else {
          updateStatus(21); // Backpack full
        }
      } else {
        updateStatus(20); // Warehouse full
      }
      return;
    }
  }

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

  if (isItem) {
    // Handle as an item - add to inventory
    const gainSuccess = await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: resource.type,
      quantity: resource.qtycollected || 1,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
      masterResources: allResources,
      globalTuning: null,
    });

    if (!gainSuccess) {
      console.warn(`Failed to gain ${resource.type}`);
      return;
    }

    await trackQuestProgress(currentPlayer, 'Buy', resource.type, 1, setCurrentPlayer);
    updateStatus(`${strings[80]} ${getLocalizedString(resource.type, strings)}.`);
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
  } else {
    // Handle as a skill
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

  // Handler for removing training buildings (no refund)
  const handleRemoveTrainingBuilding = async () => {
    try {
      // Find the resource to check if it has shadows (for multi-tile resources)
      const soldResource = GlobalGridStateTilesAndResources.getResources().find(
        (res) => res.x === currentStationPosition.x && res.y === currentStationPosition.y
      );

      // Remove the resource from database
      await updateGridResource(gridId, {
        x: currentStationPosition.x,
        y: currentStationPosition.y,
        type: null
      }, true);

      // Update local state to reflect removal of station and shadows
      const filteredResources = GlobalGridStateTilesAndResources.getResources().filter(
        (res) => {
          // Remove the station
          if (res.x === currentStationPosition.x && res.y === currentStationPosition.y) return false;

          // Remove any shadows belonging to this station
          if (soldResource && soldResource.range && soldResource.range > 1 && res.type === 'shadow') {
            const anchorKey = soldResource.anchorKey || `${soldResource.type}-${soldResource.x}-${soldResource.y}`;
            if (res.parentAnchorKey === anchorKey) {
              return false;
            }
          }
          return true;
        }
      );
      GlobalGridStateTilesAndResources.setResources(filteredResources);
      setResources(filteredResources);

      // Visual feedback
      createCollectEffect(currentStationPosition.x, currentStationPosition.y, TILE_SIZE);

      updateStatus(`${getLocalizedString(stationType, strings)} ${strings[438]?.toLowerCase() || 'removed'}.`);
      onClose();
    } catch (error) {
      console.error('Error removing training building:', error);
      updateStatus('Failed to remove training building');
    }
  };

  // Check if we should show the sell button
  const showSellButton = isDeveloper && entryPoint !== "Basic Skills" && currentStationPosition && gridId;

  // Check if this is a training building (no refund, just remove)
  const stationResource = allResources.find(r => r.type === stationType);
  const isTrainingBuilding = stationResource?.category === 'training';

  return (
    <Panel onClose={onClose} descriptionKey="1005" title={`${stationEmoji} ${entryPoint}`} panelName="SkillsPanel">
      <div className="standard-panel">
            
      {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            <div className="skills-to-acquire">
              <div className="skills-options">
                {skillsToAcquire.map((resource) => {
                  // Check if this skill is already owned
                  const isOwned = ownedSkills.some(owned => owned.type === resource.type);

                  // Build info tooltip (used for both owned and unowned)
                  const attributeModifier = resource.output
                    ? `+${resource.qtycollected || 1} to ${strings[resource.output] || resource.output}`
                    : null;

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

                  // If already owned, show as mini disabled button
                  if (isOwned) {
                    return (
                      <ResourceButton
                        key={resource.type}
                        symbol={resource.symbol}
                        name={getLocalizedString(resource.type, strings)}
                        className="mini"
                        info={info}
                        disabled={true}
                        hideGem={true}
                      />
                    );
                  }

                  // Not owned - show full ResourceButton for purchase
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
                      devOnly={resource.requires === 'devonly'}
                    />
                  );
                })}
              </div>
            </div>

          <h3>{strings[10175]}</h3>

            {(entryPoint === "Basic Skills") && (
              <div className="skills-owned">
                <br></br>
                <h2>{strings[1303]}</h2>
                {ownedSkills.length > 0 ? (
                  ownedSkills.map((skill) => {
                    // Look up full resource data for this skill
                    const resource = allResources.find(r => r.type === skill.type);
                    if (!resource) return null;

                    // Build info tooltip (same logic as skills to acquire)
                    const attributeModifier = resource.output
                      ? `+${resource.qtycollected || 1} to ${strings[resource.output] || resource.output}`
                      : null;

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
                        key={skill.type}
                        symbol={resource.symbol}
                        name={getLocalizedString(skill.type, strings)}
                        className="mini"
                        info={info}
                        disabled={true}
                        hideGem={true}
                      />
                    );
                  })
                ) : (
                  <p>{strings[1305]}</p>
                )}
              </div>
            )}

      {showSellButton && (
        <div className="shared-buttons">
          <TransactionButton
            className="btn-basic btn-danger"
            onAction={isTrainingBuilding ? handleRemoveTrainingBuilding : handleSellStation}
            transactionKey={`${isTrainingBuilding ? 'remove' : 'sell-refund'}-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
          >
            {isTrainingBuilding ? strings[438] : strings[490]}
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