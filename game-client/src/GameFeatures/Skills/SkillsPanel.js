import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { canAfford, getIngredientDetails } from '../../Utils/ResourceHelpers';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { modifyPlayerStatsInPlayer, modifyPlayerStatsInGridState } from '../../Utils/playerManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { isAGridStateStat } from '../../Utils/playerManagement';
import strings from '../../UI/strings.json';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path

const SkillsAndUpgradesPanel = ({ onClose, currentPlayer, setCurrentPlayer, stationType, TILE_SIZE }) => {
  const [entryPoint, setEntryPoint] = useState(stationType || "Skills Panel"); 
  const [allResources, setAllResources] = useState([]);
  const [skillsToAcquire, setSkillsToAcquire] = useState([]);
  const [upgradesToAcquire, setUpgradesToAcquire] = useState([]);
  const [ownedSkills, setOwnedSkills] = useState([]);
  const [ownedUpgrades, setOwnedUpgrades] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isContentLoading, setIsContentLoading] = useState(false);
  const { updateStatus } = useContext(StatusBarContext);
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
        const serverSkills = skillsResponse.data.skills || [];
        const allResourcesData = resourcesResponse.data;

        setInventory(serverInventory);
        setAllResources(allResourcesData);

        const stationResource = allResourcesData.find((resource) => resource.type === stationType);
        setStationEmoji(stationResource?.symbol || '⚙️');

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
    setErrorMessage('');
    const resource = [...skillsToAcquire, ...upgradesToAcquire].find((item) => item.type === resourceType);

    if (!canAfford(resource, inventory, 1)) {
      setErrorMessage('Not enough resources to purchase this item.');
      return;
    }
    const updatedInventory = [...inventory];
    const updatedSkills = [...ownedSkills];
    const updatedUpgrades = [...ownedUpgrades];

    for (let i = 1; i <= 3; i++) {
      const ingredientType = resource[`ingredient${i}`];
      const ingredientQty = resource[`ingredient${i}qty`];

      if (ingredientType && ingredientQty) {
        const inventoryIndex = updatedInventory.findIndex((item) => item.type === ingredientType);
        updatedInventory[inventoryIndex].quantity -= ingredientQty;

        if (updatedInventory[inventoryIndex].quantity <= 0) {
          updatedInventory.splice(inventoryIndex, 1);
        }
      }
    }
    // ✅ Check category before adding
    if (resource.category === "skill") {
      updatedSkills.push({ type: resource.type, category: resource.category, quantity: 1 });
    } else if (resource.category === "upgrade") {
      updatedUpgrades.push({ type: resource.type, category: resource.category, quantity: 1 });
    }

    setOwnedSkills(updatedSkills);
    setOwnedUpgrades(updatedUpgrades);
    setInventory(updatedInventory);
    localStorage.setItem('inventory', JSON.stringify(updatedInventory));

    FloatingTextManager.addFloatingText(
      `+1 ${resource.type}`, 
      currentPlayer.location.x, 
      currentPlayer.location.y, 
      TILE_SIZE,
    );

    try {
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
      });

      await axios.post(`${API_BASE}/api/update-skills`, {
        playerId: currentPlayer.playerId,
        skills: [...updatedSkills, ...updatedUpgrades], // ✅ Ensure all are sent to the server
      });

      if (resource.output) {
        console.log(`Upgrade ${resource.type} will modify player stat ${resource.output}.`);
        if (isAGridStateStat(resource.output)) {
          await modifyPlayerStatsInGridState(resource.output, resource.qtycollected || 1, currentPlayer.playerId, currentPlayer.location.g);
        } else {
          const updatedPlayer = await modifyPlayerStatsInPlayer(resource.output, resource.qtycollected || 1, currentPlayer.playerId);
          if (updatedPlayer) {
            setCurrentPlayer(updatedPlayer);
            localStorage.setItem('player', JSON.stringify(updatedPlayer));
          }
        }
      } 
      
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
      <h3>{stationEmoji} {entryPoint}</h3> {/* ✅ Display emoji before entry point */}
      {isContentLoading ? (
          <p>Loading...</p>
        ) : (
          <>
            <div className="skills-owned">
              <h3>Skills you have:</h3>
              {ownedSkills.length > 0 ? (
                ownedSkills.map((skill, index) => (
                  <div key={index}>
                    {skill.type} 
                  </div>
                ))
              ) : (
                <p>No skills acquired yet.</p>
              )}
            </div>

            <div className="upgrades-owned">
              <h3>Upgrades you have:</h3>
              {ownedUpgrades.length > 0 ? (
                ownedUpgrades.map((upgrade, index) => (
                  <div key={index}>
                    {upgrade.type} 
                  </div>
                ))
              ) : (
                <p>No upgrades acquired yet.</p>
              )}
            </div>

            <div className="skills-to-acquire">
              <h3>Skills to Purchase:</h3>
              <div className="skills-options">
                {skillsToAcquire.map((resource) => {
                  const ingredients = getIngredientDetails(resource, allResources);
                  const affordable = canAfford(resource, inventory, 1);
                  const meetsRequirement = hasRequiredSkill(resource.requires, ownedSkills);

                  const details = `
                    Costs: ${ingredients.join(', ') || 'None'}
                    ${resource.requires ? `<br>Requires: ${resource.requires}` : ''}
                  `;

                  // ✅ **Check if this skill modifies a player attribute**
                  const attributeModifier = resource.output
                    ? `+${resource.qtycollected || 1} to ${strings[resource.output] || resource.output}`
                    : null;

                  const unlocks = allResources
                    .filter((res) => res.requires === resource.type)
                    .map((res) => `${res.symbol || ''} ${res.type}`)
                    .join(', ') || 'None';

                    const info = (
                      <div className="info-content">
                        {attributeModifier && <div>{attributeModifier}</div>}
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
              <h3>Upgrades to Purchase:</h3>
              <div className="skills-options">
                {upgradesToAcquire.map((resource) => {
                  const ingredients = getIngredientDetails(resource, allResources);
                  const affordable = canAfford(resource, inventory, 1);
                  const meetsRequirement = hasRequiredSkill(resource.requires, ownedSkills);

                  const details = `
                    Costs: ${ingredients.join(', ') || 'None'}
                    ${resource.requires ? `<br>Requires: ${resource.requires}` : ''}
                  `;

                  // ✅ Check for attribute modifiers
                  const attributeModifier = resource.output
                    ? `+${resource.qtycollected || 1} to ${strings[resource.output] || resource.output}`
                    : null;

                  const unlocks = allResources
                    .filter((res) => res.requires === resource.type)
                    .map((res) => `${res.symbol || ''} ${res.type}`)
                    .join(', ') || 'None';

                    const info = (
                      <div className="info-content">
                        {attributeModifier && <div>{attributeModifier}</div>}
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