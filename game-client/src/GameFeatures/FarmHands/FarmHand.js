import API_BASE from '../../config';
import { useUILock } from '../../UI/UILockContext';
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import '../Crafting/TradingStation.css';
import '../../UI/ResourceButton.css';
import ResourceButton from '../../UI/ResourceButton';
import { canAfford } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate, gainIngredients, spendIngredients } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import { handleDooberClick, handleSourceConversion } from '../../ResourceClicking'; // adjust path if necessary
import FloatingTextManager from '../../UI/FloatingText';
import NPCsInGridManager from "../../GridState/GridStateNPCs";
import { handleNPCClick } from '../NPCs/NPCHelpers';

const FarmHandPanel = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  resources,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
  TILE_SIZE,
  updateStatus,
  masterResources,
  masterSkills, // Added as prop
}) => {
  const { setUILocked } = useUILock();
  const strings = useStrings();
  const [recipes, setRecipes] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const [stationDetails, setStationDetails] = useState(null);
  const [farmhandSkills, setFarmhandSkills] = useState([]);
  const [farmhandUpgrades, setFarmhandUpgrades] = useState([]);
  const skills = currentPlayer.skills || [];
  
  // Sync inventory with local storage and server
  useEffect(() => {
    const syncInventory = async () => {
      try {
        const storedInventory = JSON.parse(localStorage.getItem('inventory')) || [];
        setInventory(storedInventory);

        const serverResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        const serverInventory = serverResponse.data.inventory || [];
        if (JSON.stringify(storedInventory) !== JSON.stringify(serverInventory)) {
          setInventory(serverInventory);
          localStorage.setItem('inventory', JSON.stringify(serverInventory));
        }
      } catch (error) {
        console.error('Error syncing inventory:', error);
      }
    };
    syncInventory();
  }, [currentPlayer]);

  useEffect(() => {
    try {
      const farmOutputs = masterResources
        .filter((res) => res.category === 'farmplot')
        .map((res) => res.output)
        .filter(Boolean);

      const filteredRecipes = masterResources.filter((res) => farmOutputs.includes(res.type));
      setRecipes(filteredRecipes);

      const stationResource = masterResources.find((res) => res.type === stationType);
      setStationEmoji(stationResource?.symbol || '🛖');
      setStationDetails(stationResource);
    } catch (error) {
      console.error('Error loading farmhand offers:', error);
    }
  }, [stationType, masterResources]);

  useEffect(() => {
    const ownedTypes = currentPlayer.skills?.map(skill => skill.type) || [];
    const skills = masterResources.filter(res =>
      (res.category === 'skill' || res.category === 'upgrade') &&
      res.source === 'Farm Hand' &&
      !ownedTypes.includes(res.type)
    );
    setFarmhandSkills(skills.filter(res => res.category === 'skill'));
    setFarmhandUpgrades(skills.filter(res => res.category === 'upgrade'));
  }, [masterResources, currentPlayer]);

  const handleTrade = async (resource) => {
    setErrorMessage('');
    const cost = (resource.maxprice || 100) * 10;

    const recipe = {
      ingredient1: 'Money',
      ingredient1qty: cost,
      type: resource.type,
    };

    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];

    const spent = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });

    if (!spent) {
      setErrorMessage('Not enough money.');
      return;
    }

    const gained = await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: resource.type,
      quantity: 1,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
      masterResources,
    });

    if (!gained) {
      setErrorMessage('Not enough space to carry that item.');
      return;
    }

    updateStatus(`✅ Bought 1 ${resource.type} for ${cost} Money.`);
  };

  const handlePurchaseSkill = async (resource) => {
    setErrorMessage('');
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];

    const spent = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe: resource,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });

    if (!spent) {
      setErrorMessage('Not enough ingredients.');
      return;
    }

    const updatedSkills = [...(currentPlayer.skills || []), { type: resource.type, category: resource.category, quantity: 1 }];
    await axios.post(`${API_BASE}/api/update-skills`, {
      playerId: currentPlayer.playerId,
      skills: updatedSkills,
    });

    await trackQuestProgress(currentPlayer, 'Gain skill with', resource.type, 1, setCurrentPlayer);
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    updateStatus(`✅ ${resource.type} acquired.`);
  };


  async function handleBulkAnimalCollect() {
    console.log('🐮 Bulk animal collect initiated');
    onClose();
    setUILocked(true);
    setErrorMessage('');

    try {
      const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
      const processingAnimals = npcs.filter(npc => npc.state === 'processing');

      if (processingAnimals.length === 0) {
        updateStatus('No animals are ready to collect.');
        setUILocked(false);
        return;
      }

      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const successfulCollects = {};

      for (const npc of processingAnimals) {
        await handleNPCClick(
          npc,
          npc.position.y,
          npc.position.x,
          setInventory,
          setResources,
          currentPlayer,
          setCurrentPlayer,
          TILE_SIZE,
          masterResources,
          masterSkills, // replace with masterSkills if available
          gridId,
          () => {}, // setModalContent (not used here)
          () => {}, // setIsModalOpen (not used here)
          updateStatus
        );

        successfulCollects[npc.type] = (successfulCollects[npc.type] || 0) + 1;
        await wait(100); // avoid overloading server
      }

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

      updateStatus(`✅ Bulk Animal Collect complete: ${Object.entries(successfulCollects).map(([t, q]) => `${q} ${t}`).join(', ')}`);
    } catch (error) {
      console.error('Bulk animal collect failed:', error);
      setErrorMessage('Failed to bulk collect animals.');
    } finally {
      setUILocked(false);
    }
  }


  async function handleLogging() {
    console.log('🪓🪓🪓🪓🪓 Logging initiated 🪓🪓🪓🪓🪓🪓');
    onClose();
    setUILocked(true);
    setErrorMessage('');

    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];

    try {
      // Step 1: Determine how many trees we can chop
      const loggingSkills = (currentPlayer.skills || []).filter(
        (skill) => ['Logging', 'Better Logging'].includes(skill.type)
      );
      const maxTrees = loggingSkills.reduce((sum, skill) => {
        const resourceDef = masterResources.find(res => res.type === skill.type);
        return sum + (resourceDef?.qtycollected || 0);
      }, 0);

      if (maxTrees === 0) {
        updateStatus("No logging skills available.");
        setUILocked(false);
        return;
      }

      // Step 2: Get all trees from resources
      const treeResources = resources.filter(res => res.type === 'Oak Tree');

      if (treeResources.length === 0) {
        updateStatus(437);
        setUILocked(false);
        return;
      }

      // Select trees in top-to-bottom, left-to-right row scan order
      const treesToChop = [];
      for (let row = 0; row < 100; row++) {
        for (let col = 0; col < 100; col++) {
          const tree = resources.find(res => res.type === 'Oak Tree' && res.y === row && res.x === col);
          if (tree) {
            treesToChop.push(tree);
            if (treesToChop.length === maxTrees) break;
          }
        }
        if (treesToChop.length === maxTrees) break;
      }
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // ---- Two-phase processing ----
      const choppedTreePositions = [];

      // Phase 1: Chop trees and remember positions
      for (const tree of treesToChop) {
        await handleSourceConversion(
          tree,
          tree.y,
          tree.x,
          resources,
          setResources,
          safeInventory,
          setInventory,
          safeBackpack,
          setBackpack,
          gridId,
          FloatingTextManager.addFloatingText,
          TILE_SIZE,
          currentPlayer,
          setCurrentPlayer,
          masterResources,
          () => {}, // setModalContent
          () => {}, // setIsModalOpen
          updateStatus,
          strings
        );
        choppedTreePositions.push({ x: tree.x, y: tree.y });
        await wait(100);
      }

      await wait(300); // give state time to update

      // Phase 2: Click doobers at chopped positions
      setTimeout(async () => {
        for (const pos of choppedTreePositions) {
          // Get the most up-to-date resources state
          const latestResources = typeof setResources === 'function'
            ? await new Promise(resolve => {
                setResources(prev => {
                  resolve(prev);
                  return prev;
                });
              })
            : resources;
          const wood = latestResources.find(
            res => res.x === pos.x && res.y === pos.y && res.category === 'doober'
          );
          console.log('🪵🪵🪵 Found wood doober at', pos, ':', wood);
          if (wood) {
            console.log('Calling handleDooberClick');
            await handleDooberClick(
              wood,
              wood.y,
              wood.x,
              resources,
              setResources,
              setInventory,
              setBackpack,
              safeInventory,
              safeBackpack,
              currentPlayer.skills,
              gridId,
              FloatingTextManager.addFloatingText,
              TILE_SIZE,
              currentPlayer,
              setCurrentPlayer,
              updateStatus,
              masterResources,
              masterSkills
            );
            await wait(100);
          } else {
            console.warn('⚠️ No doober found at position:', pos);
          }
        }
        updateStatus(`✅ Logging complete: ${treesToChop.length} trees chopped and collected.`);
      }, 50);

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    } catch (error) {
      console.error('Logging failed:', error);
      setErrorMessage('Failed to auto-chop trees.');
    } finally {
      setUILocked(false);
    }
  }


  async function handleBulkHarvest() {

    console.log('🚜 Bulk harvest initiated');
    onClose();
    setUILocked(true);

    setErrorMessage('');
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];

    try {
      // Step 1: Get farmplot outputs
      const cropTypes = masterResources
        .filter(res => res.category === 'farmplot')
        .map(res => res.output)
        .filter(Boolean);

      // Step 2: Count how many of each crop is present in the current grid
      const resourceCounts = {};
      resources?.forEach((res) => {
        if (cropTypes.includes(res.type)) {
          resourceCounts[res.type] = (resourceCounts[res.type] || 0) + 1;
        }
      });

      if (Object.keys(resourceCounts).length === 0) {
        updateStatus(429);
        setUILocked(false);
        return;
      }

      // Step 3: Visually remove each crop using handleDooberClick
      const cropsToHarvest = resources.filter(res => cropTypes.includes(res.type));
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const successfulHarvest = {};

      for (const crop of cropsToHarvest) {
        const preInventory = [...safeInventory];
        const preBackpack = [...safeBackpack];

        await handleDooberClick(
          crop,
          crop.y,
          crop.x,
          resources,
          setResources,
          setInventory,
          setBackpack,
          preInventory,
          preBackpack,
          currentPlayer.skills,
          gridId,
          FloatingTextManager.addFloatingText,
          TILE_SIZE,
          currentPlayer,
          setCurrentPlayer,
          updateStatus,
          masterResources,
          masterSkills,
        );

        successfulHarvest[crop.type] = (successfulHarvest[crop.type] || 0) + 1;
        await wait(100); // avoid hammering server
      }

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

      updateStatus(`✅ Bulk Crop Harvest complete: ${Object.entries(successfulHarvest).map(([t, q]) => `${q} ${t}`).join(', ')}`);

      // TODO: remove the successfully harvested items from the board
    } catch (error) {
      console.error('Bulk crop harvest failed:', error);
      setErrorMessage('Failed to bulk crop harvest.');
    } finally {
      setUILocked(false);
    }
  }

  const getSkillTooltip = (skillType) => {
    switch (skillType) {
      case 'Bulk Harvest':
        return strings[427]; // "Purchase the Farm Hand's Bulk Harvest skill in order to harvest all crops at once."
      case 'Bulk Animal Collect':
        return strings[431]; // Add a new string in your strings file if needed
      case 'Logging':
        return strings[432]; // Add a new string in your strings file if needed
      case 'Better Logging':
        return strings[433]; // Add a new string in your strings file if needed
      default:
        return '';
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1029" titleKey="1129" panelName="FarmHandPanel">
      <div className="standard-panel">
        <h2> {stationEmoji} {stationType} </h2>

        {skills?.some(item => item.type === 'Bulk Harvest') && (
          <div>
            <ResourceButton
              symbol="🚜"
              name="Bulk Harvest"
              className="resource-button bulk-skill"
              details={strings[428]}
              onClick={handleBulkHarvest}
            />
          </div>
        )}
        {skills?.some(item => item.type === 'Bulk Animal Collect') && (
          <div>
            <ResourceButton
              symbol="🐮"
              name="Bulk Animal Collect"
              className="resource-button bulk-skill"
              details={strings[434]}
              onClick={handleBulkAnimalCollect}
            />
          </div>
        )}
        {skills?.some(item => item.type === 'Logging') && (
          <div>
            <ResourceButton
              symbol="🪓"
              name="Logging"
              className="resource-button bulk-skill"
              details={strings[435]}
              onClick={handleLogging}
            />
          </div>
        )}

        {farmhandSkills.length > 0 && (
          <>
            <h3>{strings[430]}</h3>

            {farmhandSkills.map((resource) => {
              const affordable = canAfford(resource, inventory, 1, backpack);
              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = resource[`ingredient${i}`];
                const qty = resource[`ingredient${i}qty`];
                if (!type || !qty) return '';
                const playerQty = (inventory.find((item) => item.type === type)?.quantity || 0) +
                                  (backpack.find((item) => item.type === type)?.quantity || 0);
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
              }).join('');

              const details = `Costs:<div>${formattedCosts}</div>`;

              return (
                <ResourceButton
                  key={resource.type}
                  symbol={resource.symbol}
                  name={resource.type}
                  className="resource-button"
                  details={details}
                  onClick={() => handlePurchaseSkill(resource)}
                  disabled={!affordable}
                  info={getSkillTooltip(resource.type) ? <div>{getSkillTooltip(resource.type)}</div> : undefined}
                />
              );
            })}
          </>
        )}

        <h3>{strings[426]}</h3>
        
          {recipes?.length > 0 ? (
            recipes.map((resource) => {
              const cost = (resource.maxprice || 100) * 10;
              const playerMoney = (inventory.find((item) => item.type === 'Money')?.quantity || 0) +
                                  (backpack.find((item) => item.type === 'Money')?.quantity || 0);
              const affordable = playerMoney >= cost;

              const details = `Buy 1 for: 💰 ${cost}`;

              const info = (
                <div className="info-content">
                  <div><strong>{strings[422]}</strong> 💰 {cost}</div>
                </div>
              );

              return (
                <ResourceButton
                  key={resource.type}
                  symbol={resource.symbol}
                  name={resource.type}
                  className="resource-button"
                  details={details}
                  disabled={!affordable}
                  onClick={() => handleTrade(resource)}
                />
              );
            })
          ) : <p>{strings[423]}</p>}


        {errorMessage && <p className="error-message">{errorMessage}</p>}

      </div>
    </Panel>
  );


};

export default React.memo(FarmHandPanel);