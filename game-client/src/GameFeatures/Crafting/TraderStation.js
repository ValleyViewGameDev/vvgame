import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import '../../UI/ResourceButton.css';
import ResourceButton from '../../UI/ResourceButton';
import { canAfford } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate, gainIngredients, spendIngredients } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import RelationshipCard from '../Relationships/RelationshipCard';
import { getRelationshipStatus } from '../Relationships/RelationshipUtils';
import '../Relationships/Relationships.css';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { calculateDistance, getDerivedRange } from '../../Utils/worldHelpers';

const TraderStation = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
  TILE_SIZE,
  updateStatus,
  masterResources,
  masterInteractions,
  zoomLevel,
  setZoomLevel,
  centerCameraOnPlayer,
}) => {
  const strings = useStrings();
  const [recipes, setRecipes] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const [stationDetails, setStationDetails] = useState(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [canTrade, setCanTrade] = useState(false);
  const [tradeThreshold, setTradeThreshold] = useState(0);

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
    setIsContentLoading(true);
    try {
      const filteredRecipes = masterResources.filter((resource) => resource.source === stationType);
      setRecipes(filteredRecipes);
      console.log('Filtered recipes:', filteredRecipes);
      console.log('recipes:', recipes);

      const stationResource = masterResources.find((resource) => resource.type === stationType);
      setStationEmoji(stationResource?.symbol || '🛖');
      setStationDetails(stationResource);
    } catch (error) {
      console.error('Error loading resources:', error);
    } finally {
      setIsContentLoading(false);
    }
  }, [stationType, masterResources]);

  // Check if player can trade based on relationship
  useEffect(() => {
    if (masterInteractions && stationType) {
      // Find the trade interaction threshold
      const tradeInteraction = masterInteractions.find(interaction => 
        interaction.interaction === 'Trade' || interaction.interaction === 'trade'
      );
      
      if (tradeInteraction) {
        setTradeThreshold(tradeInteraction.relscoremin || 0);
        
        // Get current relationship status
        const relationship = getRelationshipStatus(currentPlayer, stationType);
        const currentScore = relationship?.relscore || 0;
        
        setCanTrade(currentScore >= tradeInteraction.relscoremin);
      } else {
        // If no trade threshold defined, allow trading
        setCanTrade(true);
      }
    }
  }, [masterInteractions, stationType, currentPlayer]);

  const storyStringMap = {
    Iago: 1201,
    Juliet: 1202,
    Falstaff: 1203,
    Apothecary: 1204,
    Gertrude: 1205,
    Leontes: 1206,
    Caliban: 1207,
  };

  const handleTrade = async (recipe) => {
    setErrorMessage('');
    if (!recipe) {
      setErrorMessage('Invalid recipe selected.');
      return;
    }

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
      setErrorMessage('Not enough ingredients.');
      return;
    }

    const quantityToGive = recipe.tradeqty || 1;
console.log("Trading recipe:", recipe);
console.log("tradeQty in recipe:", recipe.tradeqty);

    const gained = await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: recipe.type,
      quantity: quantityToGive,
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

    await trackQuestProgress(currentPlayer, 'Collect', recipe.type, quantityToGive, setCurrentPlayer);

    updateStatus(`Exchanged ${recipe.ingredient1qty || 1} ${getLocalizedString(recipe.ingredient1, strings)} for ${quantityToGive} ${getLocalizedString(recipe.type, strings)}.`);
  };

  return (
    <Panel onClose={onClose} descriptionKey="1016" titleKey="1116" panelName="TraderStation">
      <div className="standard-panel">
        <h2> {stationEmoji} {getLocalizedString(stationType, strings)} </h2>
        
        {/* Relationship Card */}
        <RelationshipCard
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          targetName={stationType}
          targetType="npc"
          targetEmoji={stationEmoji}
          showActions={true}
          compact={false}
          masterInteractions={masterInteractions}
          updateStatus={updateStatus}
          playerPosition={(() => {
            const gridId = currentPlayer?.location?.g;
            const playerId = currentPlayer._id?.toString();
            const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
            return playerInGridState?.position || null;
          })()}
          targetPosition={currentStationPosition}
          TILE_SIZE={TILE_SIZE}
          checkDistance={() => {
            // Get player position
            const gridId = currentPlayer?.location?.g;
            const playerId = currentPlayer._id?.toString();
            const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
            if (!playerInGridState?.position) return false;
            
            // Get trader station position (passed as prop)
            if (!currentStationPosition) return false;
            
            // Calculate distance
            const distance = calculateDistance(playerInGridState.position, currentStationPosition);
            const playerRange = getDerivedRange(currentPlayer, masterResources);
            
            return distance <= playerRange;
          }}
          onInteractionClick={() => {
            const wasZoomedOut = zoomLevel !== 'closer';
            
            // Zoom to closer if not already
            if (wasZoomedOut) {
              setZoomLevel('closer');
            }
            
            // Center camera on player
            const gridId = currentPlayer?.location?.g;
            const playerId = currentPlayer._id?.toString();
            const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
            if (playerInGridState?.position) {
              // If we just zoomed in, we need to wait for the zoom to take effect
              if (wasZoomedOut) {
                // Use setTimeout to ensure zoom has taken effect
                setTimeout(() => {
                  // Get the TILE_SIZE for 'closer' zoom from masterResources
                  const globalTuning = masterResources?.find(r => r.type === 'globalTuning');
                  const closerTileSize = globalTuning?.closerZoom || 50;
                  centerCameraOnPlayer(playerInGridState.position, closerTileSize);
                }, 100);
              } else {
                // Already at closer zoom, use current TILE_SIZE
                centerCameraOnPlayer(playerInGridState.position, TILE_SIZE);
              }
            }
          }}
          onRelationshipChange={(interaction, success) => {
            // Additional handling if needed after interaction completes
          }}
        />
        
        {!canTrade ? (
          <div> </div>
        ) : (
          <>
            <h3>{strings[420]}</h3>

      {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>

          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const affordable = canAfford(recipe, inventory, backpack, 1);
              const meetsRequirement = recipe.requires
                ? currentPlayer?.skills?.some(skill => skill.type === recipe.requires)
                : true;
 

              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = recipe[`ingredient${i}`];
                const qty = recipe[`ingredient${i}qty`];
                if (!type || !qty) return '';
                const playerQty = (inventory.find((item) => item.type === type)?.quantity || 0) +
                                  (backpack.find((item) => item.type === type)?.quantity || 0);
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = meetsRequirement ? 'green' : 'red';
              const skillReq = recipe.requires ? `<br><span style="color: ${skillColor};">${strings[460]}${getLocalizedString(recipe.requires, strings)}</span>` : '';

              const outputQty = recipe.tradeqty || 1;
              const details = `${strings[461]}<div>${formattedCosts}</div>${skillReq}<br>${strings[462]} ${outputQty} ${getLocalizedString(recipe.type, strings)}`;

              const info = (
                <div className="info-content">
                  <div><strong>{strings[422]}</strong> 💰 {recipe.minprice || 'n/a'}</div>
                </div>
              );
 
              return (
                <ResourceButton
                  key={recipe.type}
                  symbol={recipe.symbol}
                  name={getLocalizedString(recipe.type, strings)}
                  className="resource-button"
                  details={details}
                  info={info}
                  disabled={!affordable || !meetsRequirement}
                  onClick={() => handleTrade(recipe)}
                />
              );
            })
          ) : <p>{strings[423]}</p>}

          {storyStringMap[stationType] && (
            <div className="trader-story">
              <p>{strings[storyStringMap[stationType]]}</p>
            </div>
          )}

        {errorMessage && <p className="error-message">{errorMessage}</p>}
        
          </>
        )}
          </>
        )}

      </div>
    </Panel>
  );
};

export default React.memo(TraderStation);