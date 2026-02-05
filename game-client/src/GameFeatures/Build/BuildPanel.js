import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { handleConstruction, handleConstructionWithGems } from '../BuildAndBuy';
import { getIngredientDetails, hasRequiredSkill as checkRequiredSkill, isVisibleToPlayer } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { usePanelContext } from '../../UI/Panels/PanelContext';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { getMayorUsername } from '../Government/GovUtils';
import { getDerivedLevel } from '../../Utils/playerManagement';
import { updatePlayerSettings } from '../../settings';

const BuildPanel = ({
  TILE_SIZE,
  resources,
  setResources,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  gridId,
  masterResources, // Added for quest tracking
  masterSkills, // Uncomment if needed for skill checks
  updateStatus,
  isDeveloper,
  currentSeason,
  globalTuning,
  masterXPLevels,
  cursorMode,
  setCursorMode,
}) => {
  const { closePanel } = usePanelContext(); // Use closePanel from context
  const [buildOptions, setBuildOptions] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [isMayor, setIsMayor] = useState(false);
  const strings = useStrings();
  const [placeWithCursor, setPlaceWithCursor] = useState(
    currentPlayer?.settings?.plantWithCursor ?? false
  );

  // Toggle handler - persists to player settings
  const handleToggleChange = (checked) => {
    setPlaceWithCursor(checked);
    if (!checked) {
      setCursorMode(null);
    }
    // Persist to player settings (uses same setting as farming panel)
    updatePlayerSettings({ plantWithCursor: checked }, currentPlayer, setCurrentPlayer);
  };

  // Handle selecting an item for cursor mode
  const handleCursorModeSelect = (item) => {
    setCursorMode({
      type: 'build',
      item: item.type,
      emoji: item.symbol || '🏗️',
      filename: item.filename || null,
      size: item.size || 1,
      buildOptions: buildOptions,
    });
  };

  // Fetch inventory and build options when the panel initializes
  useEffect(() => {
    console.log('🏗️ BuildPanel opened with currentPlayer:', {
      username: currentPlayer?.username,
      role: currentPlayer?.role,
      homeSettlementId: currentPlayer?.settlementId,
      currentLocation: currentPlayer?.location,
      isDeveloper
    });
    
    const fetchData = async () => {
      //setIsContentLoading(true);
      try {
        // Check if player is mayor ONLY if we're in a town
        let isPlayerMayor = false;
        if (currentPlayer.location.gtype === 'town' && currentPlayer.location.s) {
          console.log('🏛️ In town, checking if player is mayor...');
          const mayorUsername = await getMayorUsername(currentPlayer.location.s);
          isPlayerMayor = mayorUsername === currentPlayer.username;
          console.log('🏛️ Mayor check:', { mayorUsername, playerUsername: currentPlayer.username, isPlayerMayor });
        }
        setIsMayor(isPlayerMayor);
        
        // Fetch inventory
        const inventoryResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        setInventory(inventoryResponse.data.inventory || []);
        // Fetch all resources and filter for build options
        const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
        const allResourcesData = resourcesResponse.data;
        setAllResources(allResourcesData);
        
        // Debug: Show all BuildTown resources
        const buildTownResources = allResourcesData.filter(r => r.source === 'BuildTown');
        console.log('🏢 BuildTown resources found:', buildTownResources.map(r => r.type));
        // ✅ Filter build options based on the player's location
        const validBuildOptions = allResourcesData.filter(resource => {
          // Filter out devonly resources unless player is a developer
          if (!isVisibleToPlayer(resource, isDeveloper)) return false;

          // Check if resource is a valid build option based on source and location
          // Convert to strings for comparison to handle ObjectId vs string issues
          const currentSettlementStr = String(currentPlayer.location.s || '');
          const homeSettlementStr = String(currentPlayer.settlementId || '');
          const settlementsMatch = currentSettlementStr === homeSettlementStr;
          
          if (resource.source === 'BuildTown') {
            console.log(`BuildPanel: Checking ${resource.type}:`, {
              source: resource.source,
              gtype: currentPlayer.location.gtype,
              isPlayerMayor,
              currentSettlement: currentPlayer.location.s,
              homeSettlement: currentPlayer.settlementId,
              currentSettlementStr,
              homeSettlementStr,
              settlementsMatch,
              isDeveloper
            });
          }
          
          const isValidSource = resource.source === 'Build' || 
            (resource.source === 'BuildTown' && currentPlayer.location.gtype === 'town' && (isPlayerMayor || isDeveloper) && 
             (settlementsMatch || isDeveloper)) ||
            (resource.source === 'BuildValley' && currentPlayer.location.gtype != 'homestead');
          
          if (!isValidSource) return false;
          
          // Check seasonal restriction
          if (resource.season && currentSeason && resource.season !== currentSeason) {
            return false;
          }
          
          // Pet-specific filtering
          if (resource.category === 'pet') {
            console.log(`🐾 Checking pet ${resource.type}...`);
            
            // Only allow pets on homesteads (unless isDeveloper)
            if (currentPlayer.location.gtype !== 'homestead' && !isDeveloper) {
              console.log(`🐾 Filtering out pet ${resource.type} - not on homestead`);
              return false;
            }
            
            // Check if player already has this pet type on their homestead
            // Resources on the grid use layoutkey to identify their type
            const existingPetOfType = resources.find(r => 
              r.layoutkey === resource.type || r.type === resource.type
            );
            
            if (existingPetOfType && !isDeveloper) {
              console.log(`🐾 Filtering out pet ${resource.type} - already exists on grid (layoutkey: ${existingPetOfType.layoutkey}, type: ${existingPetOfType.type})`);
              return false; // Already have one of this pet type
            }
            
            console.log(`🐾 Pet ${resource.type} is available to build`);
          }
          
          return true;
        });
        
        // Debug: Show what will be displayed
        const buildTownInFinal = validBuildOptions.filter(r => r.source === 'BuildTown');
        console.log('🏗️ Final BuildPanel options:', {
          totalOptions: validBuildOptions.length,
          buildTownIncluded: buildTownInFinal.map(r => r.type),
          shouldHaveBuildTown: currentPlayer.location.gtype === 'town' && 
                               (isPlayerMayor || isDeveloper) && 
                               (String(currentPlayer.location.s) === String(currentPlayer.settlementId) || isDeveloper)
        });
        
        setBuildOptions(validBuildOptions); 
      } catch (error) {
        console.error('Error fetching build panel data:', error);
      } finally {
        setIsContentLoading(false);
      }
    };

    fetchData();
  }, [currentPlayer, currentPlayer?.location?.s, currentPlayer?.location?.gtype, currentPlayer?.settlementId, isDeveloper, currentSeason]);

  // Local wrapper for the utility function
  const hasRequiredSkill = (requiredSkill) => checkRequiredSkill(requiredSkill, currentPlayer);

  // Check if player meets the level requirement for a resource
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => {
    if (!resourceLevel) return true; // No level requirement
    return playerLevel >= resourceLevel;
  };

  // Count BuildTown buildings on the current grid
  const countTownBuildings = () => {
    if (!resources || !allResources) return 0;
    
    return resources.filter(resource => {
      // Find the master resource to check if it's a BuildTown source
      const masterResource = allResources.find(mr => mr.type === resource.type);
      return masterResource && masterResource.source === 'BuildTown';
    }).length;
  };

  const maxTownBuildings = globalTuning?.maxTownBuildings || 500; // Default to 50 if not set
  const currentTownBuildings = countTownBuildings();

  // Count crafting stations by type on the current grid
  const maxCraftingStationsPerType = globalTuning?.maxCraftingStationsPerType || 4;
  const craftingStationCounts = {};
  if (resources && allResources) {
    resources.forEach(resource => {
      const masterResource = allResources.find(mr => mr.type === resource.type);
      if (masterResource && masterResource.category === 'crafting') {
        craftingStationCounts[resource.type] = (craftingStationCounts[resource.type] || 0) + 1;
      }
    });
  }

  const handleGemPurchase = async (modifiedRecipe) => {
    // This is called by the gem button with a recipe modified to include gems
    return handleConstructionWithGems({
      TILE_SIZE,
      selectedItem: modifiedRecipe.type,
      buildOptions,
      inventory,
      setInventory,
      backpack,
      setBackpack,
      resources,
      setResources,
      currentPlayer,
      setCurrentPlayer,
      gridId,
      updateStatus,
      modifiedRecipe, // Pass the gem-modified recipe
    });
  };


  
  return (
    <Panel onClose={closePanel} descriptionKey="1002" titleKey="1102" panelName="BuildPanel">
      <div className="standard-panel">
        {/* Place with cursor toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '8px',
          marginBottom: '10px',
          padding: '5px 0'
        }}>
          <label style={{ fontFamily: 'var(--font-title-4-family)', fontSize: 'var(--font-title-4-size)', cursor: 'pointer' }}>
            {strings[10187] || 'Place with cursor'}
          </label>
          <input
            type="checkbox"
            checked={placeWithCursor}
            onChange={(e) => handleToggleChange(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
        </div>

        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {buildOptions.map((item) => {
              const ingredients = getIngredientDetails(item, allResources);
              const affordable = canAfford(item, inventory, backpack);
              const meetsSkillRequirement = hasRequiredSkill(item.requires);
              const meetsLevel = meetsLevelRequirement(item.level);
              const requirementsMet = meetsSkillRequirement && meetsLevel;

              // Check if this is a BuildTown building and if we've hit the limit
              const isTownBuilding = item.source === 'BuildTown' && currentPlayer.location.gtype !== 'homestead';
              const townBuildingLimitReached = isTownBuilding && currentTownBuildings >= maxTownBuildings;

              // Check if this is a crafting station and if we've hit the per-type limit
              const isCraftingStation = item.category === 'crafting';
              const craftingStationLimitReached = isCraftingStation && (craftingStationCounts[item.type] || 0) >= maxCraftingStationsPerType;

              const isDisabled = !affordable || !requirementsMet || townBuildingLimitReached || craftingStationLimitReached;
              const isSelectedForCursor = cursorMode?.type === 'build' && cursorMode?.item === item.type;

              // Build className based on state
              let buttonClassName = '';
              if (isSelectedForCursor) buttonClassName += 'cursor-selected ';

              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = item[`ingredient${i}`];
                const qty = item[`ingredient${i}qty`];
                if (!type || !qty) return '';

                const inventoryQty = inventory?.find(inv => inv.type === type)?.quantity || 0;
                const backpackQty = backpack?.find(bpItem => bpItem.type === type)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = allResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = meetsSkillRequirement ? 'green' : 'red';
              const levelColor = meetsLevel ? 'green' : 'red';
              const details = craftingStationLimitReached
                ? `<span style="color: red;">${strings[407]} (${maxCraftingStationsPerType})</span>`
                : (townBuildingLimitReached ? `<span style="color: red;">${strings[407]}</span>` : '') +
                  (item.level ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${item.level}</span>` : '') +
                  (item.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(item.requires, strings)}</span>` : '') +
                  `${strings[461]}<div>${formattedCosts}</div>`;

              const info = `
                ${strings[820]}${
                  allResources
                    .filter((res) => res.source === item.type)
                    .map((res) => `${res.symbol || ''} ${getLocalizedString(res.type, strings)}`)
                    .join(', ') || 'None'
                }
              `;

              return (
                <ResourceButton
                  key={item.type}
                  symbol={item.symbol}
                  name={getLocalizedString(item.type, strings)}
                  details={details}
                  info={info}
                  disabled={isDisabled}
                  className={buttonClassName}
                  onClick={() => {
                    if (isDisabled) return;
                    if (placeWithCursor) {
                      // In cursor mode: select this item for placing via clicks
                      handleCursorModeSelect(item);
                    } else {
                      // Normal mode: build at player position immediately
                      handleConstruction({
                        TILE_SIZE,
                        selectedItem: item.type,
                        buildOptions,
                        inventory,
                        setInventory,
                        backpack,
                        setBackpack,
                        resources,
                        setResources,
                        setErrorMessage: console.error,
                        currentPlayer,
                        setCurrentPlayer,
                        gridId,
                        updateStatus,
                      });
                    }
                  }}
                  onGemPurchase={(item.gemcost && (!affordable || !requirementsMet) && !townBuildingLimitReached && !craftingStationLimitReached) ? handleGemPurchase : null}
                  meetsLevelRequirement={meetsLevel}
                  resource={item}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources || allResources}
                  currentPlayer={currentPlayer}
                  devOnly={item.requires === 'devonly'}
                  filename={item.filename}
                />
              );
            })}
          </>
        )}
      </div>   
    </Panel>
  );
};

export default React.memo(BuildPanel);