import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import ResourceIcon, { resourceIconHtml } from '../../UI/Icons/ResourceIcon';
import { getPlayerQuantity } from '../../Utils/InventoryManagement';
import { canAfford } from '../../Utils/InventoryManagement';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import { hasRoomFor } from '../../Utils/InventoryManagement';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import { showNotification } from '../../UI/Notifications/Notifications';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import { updateGridResource } from '../../Utils/GridManagement';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { createCollectEffect } from '../../VFX/VFX';
import { getDerivedLevel } from '../../Utils/playerManagement';
import soundManager from '../../Sound/SoundManager';
import FloatingTextManager from '../../UI/FloatingText';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';
import { loadMasterResources } from '../../Utils/TuningManager';

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
          loadMasterResources(), // cached at boot: no round trip
        ]);

        const serverInventory = inventoryResponse.data.inventory || [];
        const serverBackpack = inventoryResponse.data.backpack || [];
        const serverSkills = skillsResponse.data.skills || [];
        const allResourcesData = resourcesResponse;

        setInventory(serverInventory);
        setBackpack(serverBackpack);
        setAllResources(allResourcesData);

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
  // where the bought card is, taken on the tap: "+Grower Skill" rises from it (UI/FlyToTarget.js)
  const cardRect = document.querySelector(`.skills-to-acquire [data-resource-type="${CSS.escape(resourceType)}"]`)?.getBoundingClientRect() || null;
  const floatFromCard = (text, flyTo) => {
    if (cardRect) FloatingTextManager.addFloatingTextAt(text, cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2, { flyTo });
  };

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

  // ONE request each (game-server routes/actionRoutes.js): /action/buy-item for an item,
  // /action/buy-skill for a skill; the price is resources.json's, gems for what is missing when
  // the gem button sent us here (customRecipe).
  const deltaSetters = { setCurrentPlayer, setInventory, setBackpack };
  const useGems = !!customRecipe;
  if (isItem) {
    const answer = await postAction('/api/action/buy-item', { playerId: currentPlayer.playerId, itemType: resource.type, useGems });
    applyPlayerDelta(answer.data, deltaSetters);
    if (!answer.ok) {
      if (answer.reason === 'no-backpack') updateStatus(19);
      else if (answer.reason === 'backpack-full') updateStatus(21);
      else if (answer.reason === 'warehouse-full') updateStatus(20);
      else updateStatus(4);
      return;
    }
    // a bought item goes to the warehouse / backpack: it flies into Inventory
    floatFromCard(`+${answer.data.collected.qty} ${getLocalizedString(resource.type, strings)}`, 'inventory'); // a skill has no picture (emoji audit pass 4)
    updateStatus(`${strings[80]} ${getLocalizedString(resource.type, strings)}.`);
    return;
  }

  // A skill: shown on the tap, put back if the server refuses
  setOwnedSkills((prev) => [...prev, { type: resource.type, category: resource.category, quantity: 1 }]);
  setSkillsToAcquire(prev => prev.filter(skill => skill.type !== resource.type));
  // "+Grower Skill" rises from the card and flies into the Skills button on the nav bar
  floatFromCard((strings[10201] || '+{skill} Skill').replace('{skill}', getLocalizedString(resource.type, strings)), 'skills');
  updateStatus(`💪 ${getLocalizedString(resource.type, strings)} skill acquired.`);
  soundManager.playSFX('skill_earned');
  const answer = await postAction('/api/action/buy-skill', { playerId: currentPlayer.playerId, skillType: resource.type, useGems });
  applyPlayerDelta(answer.data, deltaSetters);
  if (!answer.ok) {
    setOwnedSkills((prev) => prev.filter((sk) => sk.type !== resource.type));
    setSkillsToAcquire((prev) => (prev.some((sk) => sk.type === resource.type) ? prev : [...prev, resource]));
    setErrorMessage('Error updating player on server.');
    updateStatus(4);
    return;
  }
  for (const t of answer.data.trophies || []) if (t.isNewMilestone) showNotification('Trophy', t.trophy);
  // FTUE: Trigger AcquiredGrower when player acquires the Grower skill
  if (resource.type === 'Grower') {
    await tryAdvanceFTUEByTrigger('AcquiredGrower', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
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
          if (soldResource && soldResource.size && soldResource.size > 1 && res.type === 'shadow') {
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

  // Sell section, pinned under the panel (UI/Panels/SellSection.js): a training building is only
  // removed (no refund: "Sell (💰0)"), any other building sells for its recipe; both can Move.
  // Opened from the nav (Basic Skills) there is no building, so no footer.
  const sellFooter = currentStationPosition && sellSection({
    canSell: false,
    isDeveloper: !!showSellButton,
    resourceType: stationType,
    masterResources,
    refund: isTrainingBuilding ? [] : undefined,
    onSell: isTrainingBuilding ? handleRemoveTrainingBuilding : handleSellStation,
    transactionKey: `${isTrainingBuilding ? 'remove' : 'sell-refund'}-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`,
    onMove: () => requestMove({ type: stationType, x: currentStationPosition.x, y: currentStationPosition.y }),
  });

  return (
    <Panel footer={sellFooter} onClose={onClose} descriptionKey="1005" title={getLocalizedString(entryPoint, strings)} panelName="SkillsPanel">
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

                  const unlocks = allResources.filter((res) => res.requires === resource.type);

                  const info = (
                    <div className="info-content">
                      {attributeModifier && <div>{attributeModifier}</div>}
                      {unlocks.length > 0 && (
                        <div style={{ display: 'block', marginBottom: '3px' }}>
                          <strong>Unlocks:</strong> {unlocks.map((res, i) => <React.Fragment key={res.type}>{i > 0 ? ', ' : ''}<ResourceIcon resource={res} /> {getLocalizedString(res.type, strings)}</React.Fragment>)}
                        </div>
                      )}
                      {buffText && <div style={{ color: 'var(--color-text-link)' }}>{buffText}</div>}
                    </div>
                  );

                  // If already owned, show as mini disabled button
                  if (isOwned) {
                    return (
                      <ResourceButton
                        key={resource.type}
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

                    const playerQty = getPlayerQuantity(type, inventory, backpack); // backpack + warehouse
                    const color = playerQty >= qty ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                    return `<span style="color: ${color}; display: block;">${resourceIconHtml(type, allResources)} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
                  }).join('');

                  const skillColor = meetsSkillRequirement ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                  const levelColor = meetsLevel ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                  const details =
                    (resource.level ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${resource.level}</span>` : '') +
                    (resource.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(resource.requires, strings)}</span>` : '') +
                    `${strings[461]}<div>${formattedCosts}</div>`;

                  return (
                    <ResourceButton
                      key={resource.type}
                      name={getLocalizedString(resource.type, strings)}
                      resourceType={resource.type}
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
                <h3>{strings[1303]}</h3>
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

                    const unlocks = allResources.filter((res) => res.requires === resource.type);

                    const info = (
                      <div className="info-content">
                        {attributeModifier && <div>{attributeModifier}</div>}
                        {unlocks.length > 0 && (
                          <div style={{ display: 'block', marginBottom: '3px' }}>
                            <strong>Unlocks:</strong> {unlocks.map((res, i) => <React.Fragment key={res.type}>{i > 0 ? ', ' : ''}<ResourceIcon resource={res} /> {getLocalizedString(res.type, strings)}</React.Fragment>)}
                          </div>
                        )}
                        {buffText && <div style={{ color: 'var(--color-text-link)' }}>{buffText}</div>}
                      </div>
                    );

                    return (
                      <ResourceButton
                        key={skill.type}
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


          </>
        )}
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>
    </Panel>
  );
};

export default React.memo(SkillsPanel);