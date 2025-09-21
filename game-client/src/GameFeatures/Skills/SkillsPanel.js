import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { canAfford } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import { spendIngredients } from '../../Utils/InventoryManagement';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/TransactionButton';
import { incrementFTUEStep } from '../FTUE/FTUE';
import { earnTrophy } from '../Trophies/TrophyUtils';

const SkillsAndUpgradesPanel = ({ 
    onClose,
    inventory,
    setInventory,
    backpack,
    setBackpack,
    currentPlayer,
    setCurrentPlayer,
    stationType, 
    currentStationPosition,
    gridId,
    isDeveloper,
    TILE_SIZE,
    updateStatus,
    masterSkills,
    setResources,
    masterResources,
}) => {
  const strings = useStrings();
  const [entryPoint, setEntryPoint] = useState(stationType || "Skills Panel"); 
  const [allResources, setAllResources] = useState([]);
  const [skillsToAcquire, setSkillsToAcquire] = useState([]);
  const [upgradesToAcquire, setUpgradesToAcquire] = useState([]);
  const [ownedSkills, setOwnedSkills] = useState([]);
  const [ownedUpgrades, setOwnedUpgrades] = useState([]);
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

        // ✅ Separate skills and upgrades
        const ownedSkills = serverSkills.filter(skill =>
          allResourcesData.some(res => res.type === skill.type && res.category === 'skill')
        );
        setOwnedSkills(ownedSkills);

        const ownedUpgrades = serverSkills.filter(skill =>
          allResourcesData.some(res => res.type === skill.type && res.category === 'upgrade')
        );
        setOwnedUpgrades(ownedUpgrades);

        // ✅ Filter skills & upgrades based on `entryPoint`
        let availableSkills = allResourcesData.filter(
          res => res.category === 'skill' &&
          res.source === entryPoint && 
          !ownedSkills.some(owned => owned.type === res.type)
        );

        let availableUpgrades = allResourcesData.filter(
          res => res.category === 'upgrade' &&
          res.source === entryPoint && 
          !ownedUpgrades.some(owned => owned.type === res.type)
        );

        // ✅ Additional filter for first-time users
        if (currentPlayer?.firsttimeuser === true) {
          // Helper function to check if skill can be acquired
          const canAcquireSkill = (skill) => {
            // Check if skill has requirements
            if (skill.requires) {
              // Check if the player owns the required skill
              const hasRequirement = ownedSkills.some(owned => owned.type === skill.requires) ||
                                   ownedUpgrades.some(owned => owned.type === skill.requires);
              if (!hasRequirement) return false;
            }
            
            // Check if skill level is appropriate for FTUE step
            if (currentPlayer.ftuestep != null && skill.level != null) {
              return skill.level <= currentPlayer.ftuestep;
            }
            
            // If no FTUE step or skill level, can acquire
            return true;
          };

          availableSkills = availableSkills.filter(canAcquireSkill);
          availableUpgrades = availableUpgrades.filter(canAcquireSkill);
        }

        setSkillsToAcquire(availableSkills);
        setUpgradesToAcquire(availableUpgrades);
      } catch (error) {
        console.error('Error fetching resources, inventory, or skills:', error);
      } finally {
        setIsContentLoading(false);
      }
    };

    fetchResourcesAndInventory();
  }, [entryPoint]); // ✅ Re-fetch when `entryPoint` changes


  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || 
        ownedSkills.some((owned) => owned.type === requiredSkill) || 
        ownedUpgrades.some((owned) => owned.type === requiredSkill); // ✅ Now checks upgrades too
  };


const handleGemPurchase = async (modifiedRecipe) => {
  // This is called by the gem button with a recipe modified to include gems
  return handlePurchase(modifiedRecipe.type, modifiedRecipe);
};

const handlePurchase = async (resourceType, customRecipe = null) => {
  const resource = [...skillsToAcquire, ...upgradesToAcquire].find((item) => item.type === resourceType);
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
  const updatedUpgrades = [...ownedUpgrades];

  // ✅ Check category before adding
  if (resource.category === "skill") {
    updatedSkills.push({ type: resource.type, category: resource.category, quantity: 1 });
  } else if (resource.category === "upgrade") {
    updatedUpgrades.push({ type: resource.type, category: resource.category, quantity: 1 });
  }
  setOwnedSkills(updatedSkills);
  setOwnedUpgrades(updatedUpgrades);
  updateStatus(`💪 ${getLocalizedString(resource.type, strings)} skill acquired.`);
  
  try { 
    await axios.post(`${API_BASE}/api/update-skills`, {
      playerId: currentPlayer.playerId,
      skills: [...updatedSkills, ...updatedUpgrades], // ✅ Ensure all are sent to the server
    });
    await trackQuestProgress(currentPlayer, 'Gain skill with', resource.type, 1, setCurrentPlayer);
    
    // Award Skill Builder trophy for acquiring skills
    await earnTrophy(currentPlayer.playerId, 'Skill Builder', 1);
    
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    
    // Check if the player is a first-time user and just acquired the Axe or Grower skill
    if (currentPlayer.firsttimeuser === true && resource.type === 'Axe') {
      console.log('🎓 First-time user acquired Axe skill, advancing FTUE step');
      await incrementFTUEStep(currentPlayer.playerId, currentPlayer, setCurrentPlayer);
    }
    
    if (currentPlayer.firsttimeuser === true && resource.type === 'Grower' && currentPlayer.ftuestep === 4) {
      console.log('🎓 First-time user at step 4 acquired Grower skill, advancing FTUE step');
      await incrementFTUEStep(currentPlayer.playerId, currentPlayer, setCurrentPlayer);
    }

    // Instead of re-fetching, update the acquire lists locally
    if (resource.category === "skill") {
      setSkillsToAcquire(prev => prev.filter(skill => skill.type !== resource.type));
    } else if (resource.category === "upgrade") {
      setUpgradesToAcquire(prev => prev.filter(upg => upg.type !== resource.type));
    }

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
  const showSellButton = isDeveloper && 
    ["Warehouse", "Adventure Camp", "Laboratory", "School", "Guild"].includes(entryPoint) &&
    currentStationPosition && gridId;

  return (
    <Panel onClose={onClose} descriptionKey="1005" title={`${stationEmoji} ${entryPoint}`} panelName="SkillsAndUpgradesPanel">
      <div className="standard-panel">
      
      {showSellButton && (
        <div className="standard-buttons">
          <TransactionButton 
            className="btn-danger" 
            onAction={handleSellStation}
            transactionKey={`sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
          >
            {strings[490]}
          </TransactionButton>
        </div>
      )}
      
      {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {!["Warehouse", "Adventure Camp", "Laboratory", "School", "Guild"].includes(entryPoint) && (
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

            {!["Warehouse", "Adventure Camp", "Laboratory", "School", "Guild"].includes(entryPoint) && (
              <div className="upgrades-owned">
                <h3>{strings[1304]}</h3>
                {ownedUpgrades.length > 0 ? (
                  ownedUpgrades.map((upgrade, index) => (
                    <div key={index}>
                      {upgrade.type} 
                    </div>
                  ))
                ) : (
                  <p>{strings[1306]}</p>
                )}
              </div>
            )}

            <div className="skills-to-acquire">
              {skillsToAcquire.length > 0 && <h3>{strings[1301]}</h3>}
              <div className="skills-options">
                {skillsToAcquire.map((resource) => {
                  const affordable = canAfford(resource, inventory, backpack, 1);
                  const meetsRequirement = hasRequiredSkill(resource.requires, ownedSkills);

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

                  const skillColor = meetsRequirement ? 'green' : 'red';
                  const details =
                    (resource.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(resource.requires, strings)}</span><br>` : '') +
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
                      disabled={!affordable || !meetsRequirement}
                      onClick={() => handlePurchase(resource.type)}
                      gemCost={resource.gemcost || null}
                      onGemPurchase={(resource.gemcost && (!affordable || !meetsRequirement)) ? handleGemPurchase : null}
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

            <div className="upgrades-to-acquire">
              {upgradesToAcquire.length > 0 && <h3>{strings[1302]}</h3>}
              <div className="skills-options">
                {upgradesToAcquire.map((resource) => {
                  const affordable = canAfford(resource, inventory, backpack, 1);
                  const meetsRequirement = hasRequiredSkill(resource.requires, ownedSkills);

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

                  const skillColor = meetsRequirement ? 'green' : 'red';
                  const details =
                    (resource.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(resource.requires, strings)}</span><br>` : '') +
                    `${strings[461]}<div>${formattedCosts}</div>`;

                  // ✅ Check for attribute modifiers
                  const attributeModifier = resource.output
                    ? `+${resource.qtycollected || 1} to ${strings[resource.output] || resource.output}`
                    : null;

                  // ✅ Check if this upgrade provides a collection buff
                  let buffText = '';
                  const buffedItems = masterSkills[resource.type];
                  if (buffedItems && typeof buffedItems === 'object') {
                    const items = Object.keys(buffedItems);
                    if (items.length > 0) {
                      const prettyList = items.slice(0, 10).join(', ');
                      const plural = items.length > 1 ? 'resources' : 'resource';
                      buffText = `Collection multiplied on ${items.length} ${plural} (${prettyList}${items.length > 10 ? ', ...' : ''}).`;
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
                      disabled={!affordable || !meetsRequirement}
                      onClick={() => handlePurchase(resource.type)}
                      gemCost={resource.gemcost || null}
                      onGemPurchase={(resource.gemcost && (!affordable || !meetsRequirement)) ? handleGemPurchase : null}
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
          </>
        )}
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>
    </Panel>
  );
};

export default React.memo(SkillsAndUpgradesPanel);