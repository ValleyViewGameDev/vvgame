import './CombatPanel.css';
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
import playersInGridManager from '../../GridState/PlayersInGrid';
import strings from '../../UI/strings.json';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path

const CombatPanel = ({ onClose, currentPlayer, setCurrentPlayer, stationType, masterResources, masterSkills, TILE_SIZE }) => {
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
  const [fetchTrigger, setFetchTrigger] = useState(0);

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
  }, [entryPoint, fetchTrigger]); // ✅ Re-fetch when `entryPoint` OR `fetchTrigger` changes


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

      // ✅ Instead of calling fetchResourcesAndInventory, we trigger a refresh
      setFetchTrigger((prev) => prev + 1); // 🔥 Increment `fetchTrigger` to force re-fetch

    } catch (error) {
      console.error('Error updating player on server:', error);
      setErrorMessage('Error updating player on server.');
    }
  };

  // --- Stat helpers ---
  const getStatModifier = (stat) => {
    return currentPlayer.powers?.reduce((sum, item) => {
      const res = masterResources.find(r => r.type === item.type);
      return res?.output === stat ? sum + ((item.quantity || 0) * (res.qtycollected || 1)) : sum;
    }, 0) || 0;
  };

  const getPlayerStats = () => {
    return playersInGridManager.getAllPCs(currentPlayer.location.g)?.[currentPlayer._id] || {};
  };
  const getStatBreakdown = (stat) => {
    const total = getPlayerStats()[stat] || 0;
    const base = currentPlayer[`base${stat.charAt(0).toUpperCase() + stat.slice(1)}`] || 0;
    const modifier = total - base;
    return { base, modifier, total };
  };

  const hp = getStatBreakdown('hp');
  const maxhp = getStatBreakdown('maxhp');
  const damage = getStatBreakdown('damage');
  const armorclass = getStatBreakdown('armorclass');
  const attackbonus = getStatBreakdown('attackbonus');
  const attackrange = getStatBreakdown('attackrange');
  const speed = getStatBreakdown('speed');

  return (
    <Panel onClose={onClose} descriptionKey="1024" titleKey="1124" panelName="CombatPanel">
      <div className="standard-panel">
      {isContentLoading ? (
          <p>Loading...</p>
        ) : (
          <>
            <div className="combat-stats">
              <h3>Your Stats:</h3>
              <br />
              <h3>❤️‍🩹 HP: <span className="stat-total">{hp.total}</span></h3>
              <br />
              <h4>
                ❤️‍🩹 Max HP: {maxhp.base} + <span className="stat-total blue-text">{maxhp.modifier}</span> ={" "}
                <span className="stat-total blue-text">{maxhp.modifier !== 0 ? maxhp.total : maxhp.base}</span>
              </h4>
              <h4>
                🛡️ Armor Class: {armorclass.base} + <span className="stat-total blue-text">{armorclass.modifier}</span> ={" "}
                <span className="stat-total blue-text">{armorclass.modifier !== 0 ? armorclass.total : armorclass.base}</span>
              </h4>
              <br />
              <h4>
                ⚔️ Attack Bonus: {attackbonus.base} + <span className="stat-total blue-text">{attackbonus.modifier}</span> ={" "}
                <span className="stat-total blue-text">{attackbonus.modifier !== 0 ? attackbonus.total : attackbonus.base}</span>
              </h4>
              <h4>
                ⚔️ Damage: {damage.base} + <span className="stat-total blue-text">{damage.modifier}</span> ={" "}
                <span className="stat-total blue-text">{damage.modifier !== 0 ? damage.total : damage.base}</span>
              </h4>
              <h4>
                🔭 Attack Range: {attackrange.base} + <span className="stat-total blue-text">{attackrange.modifier}</span> ={" "}
                <span className="stat-total blue-text">{attackrange.modifier !== 0 ? attackrange.total : attackrange.base}</span>
              </h4>
              <h4>
                🎯 Speed: {speed.base} + <span className="stat-total blue-text">{speed.modifier}</span> ={" "}
                <span className="stat-total blue-text">{speed.modifier !== 0 ? speed.total : speed.base}</span>
              </h4>
              <h4>⛺️ Is Camping: {currentPlayer.iscamping ? "Yes" : "No"}</h4>
            </div>

            <div className="combat-powers">
              <h3>Weapons & Abilities:</h3>
              <br></br>
              {currentPlayer.powers?.length ? (
                currentPlayer.powers.map((power, index) => {
                  const resource = masterResources.find(r => r.type === power.type);
                  if (!resource) return null;

                  const value = (resource.qtycollected || 1) * (power.quantity || 0);
                  const outputLabel = resource.output ? (strings[resource.output] || resource.output) : 'Unknown';
                  return (
                    <p key={index}>
                      {resource.type} {value > 0 ? '+' : ''}{value} for {outputLabel}
                    </p>
                  );
                })
              ) : (
                <p>No combat powers acquired.</p>
              )}
            </div>
          </>
        )}
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>
    </Panel>
  );
};

export default React.memo(CombatPanel);