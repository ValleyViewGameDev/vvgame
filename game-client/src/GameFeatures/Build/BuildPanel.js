import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/ResourceButton';
import { handleConstruction, handleConstructionWithGems } from '../BuildAndBuy';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { usePanelContext } from '../../UI/PanelContext';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { getMayorUsername } from '../Government/GovUtils';
import { getDerivedLevel } from '../../Utils/playerManagement';

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
}) => {
  const { closePanel } = usePanelContext(); // Use closePanel from context
  const [buildOptions, setBuildOptions] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [isMayor, setIsMayor] = useState(false);
  const strings = useStrings();

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

  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };

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
              const isDisabled = !affordable || !requirementsMet || townBuildingLimitReached;

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
              const details =
                (townBuildingLimitReached ? `<span style="color: red;">${strings[407]}</span>` : '') +
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
                  onClick={() =>
                    !isDisabled &&
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
                      setErrorMessage: console.error, // Replace with real error handling if needed
                      currentPlayer,
                      setCurrentPlayer,
                      gridId,
                      updateStatus,
                    })
                  }
                  onGemPurchase={(item.gemcost && (!affordable || !requirementsMet) && !townBuildingLimitReached) ? handleGemPurchase : null}
                  meetsLevelRequirement={meetsLevel}
                  resource={item}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources || allResources}
                  currentPlayer={currentPlayer}
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