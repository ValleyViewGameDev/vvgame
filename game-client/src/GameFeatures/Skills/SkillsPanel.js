import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { canAfford } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import { spendIngredients } from '../../Utils/InventoryManagement';

const SkillsAndUpgradesPanel = ({ 
    onClose,
    inventory,
    setInventory,
    backpack,
    setBackpack,
    currentPlayer,
    setCurrentPlayer,
    stationType, 
    TILE_SIZE,
    updateStatus,
    masterSkills,
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
        const availableSkills = allResourcesData.filter(
          res => res.category === 'skill' &&
          res.source === entryPoint && 
          !ownedSkills.some(owned => owned.type === res.type)
        );

        const availableUpgrades = allResourcesData.filter(
          res => res.category === 'upgrade' &&
          res.source === entryPoint && 
          !ownedUpgrades.some(owned => owned.type === res.type)
        );

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


const handlePurchase = async (resourceType) => {
  const resource = [...skillsToAcquire, ...upgradesToAcquire].find((item) => item.type === resourceType);
  const spendSuccess = await spendIngredients({
    playerId: currentPlayer.playerId,
    recipe: resource,
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
  updateStatus(`✅ ${resource.type} skill acquired.`);
  
  try { 
    await axios.post(`${API_BASE}/api/update-skills`, {
      playerId: currentPlayer.playerId,
      skills: [...updatedSkills, ...updatedUpgrades], // ✅ Ensure all are sent to the server
    });
    await trackQuestProgress(currentPlayer, 'Gain skill with', resource.type, 1, setCurrentPlayer);
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

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

  return (
    <Panel onClose={onClose} descriptionKey="1005" titleKey="1105" panelName="SkillsAndUpgradesPanel">
      <div className="standard-panel">
      <h2>{stationEmoji} {entryPoint}</h2> {/* ✅ Display emoji before entry point */}
      {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {!["Warehouse", "Adventure Camp", "Laboratory", "School"].includes(entryPoint) && (
              <div className="skills-owned">
                <h3>{strings[1303]}</h3>
                {ownedSkills.length > 0 ? (
                  ownedSkills.map((skill, index) => (
                    <div key={index}>
                      {skill.type} 
                    </div>
                  ))
                ) : (
                  <p>{strings[1305]}</p>
                )}
              </div>
            )}

            {!["Warehouse", "Adventure Camp", "Laboratory", "School"].includes(entryPoint) && (
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
                    return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
                  }).join('');

                  const skillColor = meetsRequirement ? 'green' : 'red';
                  const details =
                    `Costs:<div>${formattedCosts}</div>` +
                    (resource.requires ? `<br><span style="color: ${skillColor};">Requires: ${resource.requires}</span>` : '');

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
                      const prettyList = items.slice(0, 10).join(', ');
                      const plural = items.length > 1 ? 'resources' : 'resource';
                      buffText = `Collection multiplied on ${items.length} ${plural} (${prettyList}${items.length > 10 ? ', ...' : ''}).`;
                    }
                  }

                  const unlocks = allResources
                    .filter((res) => res.requires === resource.type)
                    .map((res) => `${res.symbol || ''} ${res.type}`)
                    .join(', ') || 'None';

                    const info = (
                      <div className="info-content">
                        {attributeModifier && <div>{attributeModifier}</div>}
                        {buffText && <div style={{ color: 'blue' }}>{buffText}</div>}
                        {unlocks !== 'None' && (
                          <div style={{ display: 'block', marginBottom: '3px' }}>
                            <strong>Unlocks:</strong> {unlocks}
                          </div>
                        )}
                      </div>
                    );

                  return (
                    <ResourceButton
                      key={resource.type}
                      symbol={resource.symbol}
                      name={resource.type}
                      details={details}
                      info={info}
                      disabled={!affordable || !meetsRequirement}
                      onClick={() => handlePurchase(resource.type)}
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
                    return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
                  }).join('');

                  const skillColor = meetsRequirement ? 'green' : 'red';
                  const details =
                    `Costs:<div>${formattedCosts}</div>` +
                    (resource.requires ? `<br><span style="color: ${skillColor};">Requires: ${resource.requires}</span>` : '');

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
                    .map((res) => `${res.symbol || ''} ${res.type}`)
                    .join(', ') || 'None';

                    const info = (
                      <div className="info-content">
                        {attributeModifier && <div>{attributeModifier}</div>}
                        {buffText && <div style={{ color: 'blue' }}>{buffText}</div>}
                        {unlocks !== 'None' && (
                          <div style={{ display: 'block', marginBottom: '3px' }}>
                            <strong>Unlocks:</strong> {unlocks}
                          </div>
                        )}
                      </div>
                    );

                  return (
                    <ResourceButton
                      key={resource.type}
                      symbol={resource.symbol}
                      name={resource.type}
                      details={details}
                      info={info}
                      disabled={!affordable || !meetsRequirement}
                      onClick={() => handlePurchase(resource.type)}
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