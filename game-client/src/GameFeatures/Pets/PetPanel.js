import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import SaleBurst, { runCardReturn } from '../../UI/SaleBurst';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { canAfford } from '../../Utils/InventoryManagement';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { formatCountdown } from '../../UI/Timers';
import { showNotification } from '../../UI/Notifications/Notifications';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import '../../UI/Buttons/SharedButtons.css';
import '../../UI/Buttons/ResourceButton.css'; 
import './PetPanel.css';
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';
import { canCollect, reportRefusal } from '../../Utils/noRoom';
import { XP_STAR_TOKEN, XP_STAR_HTML } from '../../UI/Icons/XpStar';

// What a fed pet finds is rolled on the server (game-server utils/playerEconomy.js rollPetReward)

const PetPanel = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  petResource, // The specific pet resource that was clicked
  currentPetPosition,
  gridId,
  masterResources,
  masterSkills,
  masterTrophies,
  TILE_SIZE,
  isDeveloper,
  globalTuning,
}) => {
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const strings = useStrings();
  const { updateStatus } = useContext(StatusBarContext);
  // The panel's one card in motion (runCardReturn, UI/SaleBurst.js): a collected reward pops away
  // with the sparkles, a feed shrinks away, and after a beat the next card slides in from the left
  const [cardFx, setCardFx] = useState(null);
  const [activeTimer, setActiveTimer] = useState(false);
  const [rewardItem, setRewardItem] = useState(null);
  const [feedingCountdown, setFeedingCountdown] = useState(null);
  const [isFeeding, setIsFeeding] = useState(false);
  const [isReadyToCollect, setIsReadyToCollect] = useState(false);
  const [revealedRewardQty, setRevealedRewardQty] = useState(1);
  const [revealedRewardRarity, setRevealedRewardRarity] = useState('common');
  const [isCollecting, setIsCollecting] = useState(false);
  const [canAffordFeeding, setCanAffordFeeding] = useState(false);

  // Get pet details from the resource
  const petName = petResource?.type || 'Pet';
  const petSymbol = petResource?.symbol || '=';
  const feedIngredient = petResource?.output || 'Milk'; // What the pet needs to be fed
  const feedQuantity = petResource?.qtycollected || 1; // How much of the ingredient is needed
  const feedingTime = petResource?.crafttime || 60; // How long the pet takes to find rewards

  // Check if we can afford to feed the pet
  useEffect(() => {
    const checkAffordability = () => {
      const affordable = canAfford(
        { ingredient1: feedIngredient, ingredient1qty: feedQuantity },
        [...(inventory || []), ...(backpack || [])]
      );
      setCanAffordFeeding(affordable);
    };
    
    checkAffordability();
  }, [inventory, backpack, feedIngredient, feedQuantity]);

  // Check for active feeding timer or ready rewards
  useEffect(() => {
    if (!petResource || !currentPetPosition) return;

    const checkPetState = () => {
      const pet = GlobalGridStateTilesAndResources.getResources()?.find(
        (res) => res.x === currentPetPosition.x && res.y === currentPetPosition.y
      );

      // Check for crafting data in either top-level fields (legacy/client-side) or slots array (server-side)
      const slot = pet?.slots?.[0];
      const craftEnd = pet?.craftEnd || slot?.craftEnd;
      const craftedItem = pet?.craftedItem || slot?.craftedItem;
      const qty = pet?.qty || slot?.qty || 1;
      const petRarity = pet?.rarity || slot?.rarity || 'common';

      if (pet && craftEnd && craftedItem) {
        // Check if this is a revealed reward (craftEnd in the past)
        const now = Date.now();
        const isRevealed = craftEnd < now;

        setRewardItem(craftedItem);
        setRevealedRewardQty(qty);
        setRevealedRewardRarity(petRarity);

        if (isRevealed) {
          setIsFeeding(false);
          setIsReadyToCollect(true);
          setFeedingCountdown(0);
          setActiveTimer(false);
        } else {
          // Pet is still searching for rewards
          setIsFeeding(true);
          setActiveTimer(true);

          const remainingTime = Math.max(0, Math.floor((craftEnd - now) / 1000));
          setFeedingCountdown(remainingTime);
          
          if (remainingTime === 0) {
            setIsFeeding(false);
            setIsReadyToCollect(true);
          }
        }
      } else {
        // Only reset if we actually had something before
        if (rewardItem || isFeeding || isReadyToCollect) {
          setRewardItem(null);
          setIsFeeding(false);
          setIsReadyToCollect(false);
          setFeedingCountdown(null);
          setActiveTimer(false);
          setRevealedRewardQty(1);
          setRevealedRewardRarity('common');
        }
      }
    };

    // Initial check
    checkPetState();

    // Set up interval to check for updates
    const timer = setInterval(checkPetState, 1000);
    return () => clearInterval(timer);
  }, [petResource, currentPetPosition, rewardItem, isFeeding, isReadyToCollect]);

  // Handle feeding the pet
  const deltaSetters = { setCurrentPlayer, setInventory, setBackpack };

  // Feed: ONE request (game-server routes/actionRoutes.js /action/pet-feed): the server spends the
  // food, rolls the find at the pet's level and starts the search, then answers with the delta.
  const handleFeedPet = async () => {
    if (!canAffordFeeding) {
      updateStatus(`You need ${feedQuantity}x ${getLocalizedString(feedIngredient, strings)} to feed ${getLocalizedString(petName, strings)}`);
      return;
    }
    const revertCard = runCardReturn(setCardFx, 'pet', { out: 'leave', returnMs: 700 });
    const answer = await postAction('/api/action/pet-feed', {
      playerId: currentPlayer.playerId, gridId,
      stationX: currentPetPosition.x, stationY: currentPetPosition.y,
    });
    applyPlayerDelta(answer.data, deltaSetters);
    if (!answer.ok) {
      revertCard();
      updateStatus(`Failed to feed ${getLocalizedString(petName, strings)}`);
      return;
    }
    const { reward, craftEnd, slots } = answer.data;
    const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
      res.x === currentPetPosition.x && res.y === currentPetPosition.y
        ? { ...res, slots, craftEnd, craftedItem: reward.type, qty: reward.qty, rarity: reward.rarity }
        : res
    );
    GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
    setResources(updatedGlobalResources);
    setRewardItem(reward.type);
    setRevealedRewardQty(reward.qty);
    setRevealedRewardRarity(reward.rarity);
    setFeedingCountdown(Math.max(0, Math.floor((craftEnd - Date.now()) / 1000)));
    setActiveTimer(true);
    setIsFeeding(true);
    setIsReadyToCollect(false);
    updateStatus(`${getLocalizedString(petName, strings)}${strings[8014] || ' is searching for treasures...'}`);
  };

  // Collect: ONE request (/action/pet-collect): the find (room first), the pet's xp, Collect quests
  const handleCollectReward = async () => {
    if (!rewardItem || isCollecting) return;
    // Room FIRST, before the card moves (Utils/noRoom.js: the board's collect response, at the card)
    const collectRect = document.querySelector('.pet-collect-button')?.getBoundingClientRect() || null;
    const roomFeedback = { at: collectRect ? { rect: collectRect } : { col: currentPetPosition.x, row: currentPetPosition.y, TILE_SIZE }, strings, updateStatus };
    if (!canCollect({
      resource: rewardItem, quantity: revealedRewardQty || 1, currentPlayer, inventory: currentPlayer.inventory, backpack: currentPlayer.backpack, masterResources, globalTuning, ...roomFeedback,
    })) return;
    setIsCollecting(true);
    const revertCard = runCardReturn(setCardFx, 'pet');
    // The reward and its XP rise from the Collect card (its place taken on the tap: the panel changes
    // once the server answers) and fly home (UI/FlyToTarget.js)
    const cardRect = document.querySelector('.pet-collect-button')?.getBoundingClientRect() || null;
    const floatFromCard = (text, flyTo, dy = 0) => {
      if (cardRect) FloatingTextManager.addFloatingTextAt(text, cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2 + dy, { flyTo });
      else FloatingTextManager.addFloatingText(text, currentPetPosition.x, currentPetPosition.y, TILE_SIZE, { flyTo });
    };
    const answer = await postAction('/api/action/pet-collect', {
      playerId: currentPlayer.playerId, gridId,
      stationX: currentPetPosition.x, stationY: currentPetPosition.y,
    });
    applyPlayerDelta(answer.data, deltaSetters);
    if (!answer.ok) {
      revertCard();
      if (!reportRefusal(answer.reason, roomFeedback)) updateStatus('❌ Failed to collect item');
      setIsCollecting(false);
      return;
    }
    const { collected, xpGained, slots } = answer.data;
    const rewardResource = masterResources.find(res => res.type === collected.type);
    const rewardFlyTo = collected.type === 'Money' ? 'money' : collected.type === 'Gem' ? 'gems' : 'inventory';
    floatFromCard(`+${collected.qty} {res:${collected.type}} ${getLocalizedString(collected.type, strings)}`, rewardFlyTo, -8);
    setTimeout(() => floatFromCard(`+${xpGained} ${XP_STAR_TOKEN} XP`, 'xp', 14), 260);

    const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
      res.x === currentPetPosition.x && res.y === currentPetPosition.y
        ? { ...res, craftEnd: undefined, craftedItem: undefined, qty: 1, rarity: undefined, slots }
        : res
    );
    GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
    setResources(updatedGlobalResources);
    setActiveTimer(false);
    setRewardItem(null);
    setFeedingCountdown(null);
    setIsReadyToCollect(false);
    setRevealedRewardQty(1);
    setRevealedRewardRarity('common');
    updateStatus(`${getLocalizedString(petName, strings)} found ${collected.qty}x ${getLocalizedString(collected.type, strings)}!`);
    setTimeout(() => setIsCollecting(false), 100);
  };

  const handleSellPet = async (transactionId, transactionKey) => {
    await handleProtectedSelling({
      currentPlayer,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      setResources,
      stationType: petResource?.type || petName, // Use pet resource type
      currentStationPosition: currentPetPosition,
      gridId,
      TILE_SIZE,
      updateStatus,
      onClose,
      devOnly: !isHomestead, // Only verify developer status when NOT on homestead
    });
  };


  // Sell section, pinned under the panel (UI/Panels/SellSection.js): Sell (the refund) and Move
  const sellFooter = sellSection({
    canSell: isHomestead,
    isDeveloper,
    resourceType: petResource?.type,
    masterResources,
    onSell: handleSellPet,
    transactionKey: `sell-refund-${petName}-${currentPetPosition.x}-${currentPetPosition.y}-${gridId}`,
    onMove: () => requestMove({ type: petResource?.type, x: currentPetPosition.x, y: currentPetPosition.y }),
  });

  return (
    <Panel footer={sellFooter} onClose={onClose} title={getLocalizedString(petName, strings)} panelName="PetPanel">
      <div className="pet-panel-container">
        <div className="pet-panel-content">

          {/* Pet display */}
          <div className="pet-display">{petSymbol}</div>

          {/* Pet info */}
          <div className="pet-info">

            <p className="pet-status">
              {isFeeding ? (
                `${getLocalizedString(petName, strings)}${strings[8014] || ' is searching for treasures...'}`
              ) : isReadyToCollect ? (
                `${getLocalizedString(petName, strings)}${strings[8016] || ' has found something!'}`
              ) : (
                <>
                  {strings[8010] || 'This pet is hungry.'}<br/>
                  {strings[8011] || 'Feed'} {feedQuantity}x {getLocalizedString(feedIngredient, strings)}{strings[8012] || ' to send it searching.'}
                </>
              )}
            </p>
          </div>

          {/* Show feeding/collection state: one card slot, animated by cardFx */}
          <div className="card-fx-slot">
          <div className={cardFx ? `card-fx-${cardFx.phase}` : ''}>
          {rewardItem && (isFeeding || isReadyToCollect) ? (
            // Show animated pet searching or reward collection interface
            isFeeding ? (
              // Animated pet searching
              <div className="pet-searching">
                <div className="pet-searching-countdown">{formatCountdown(Date.now() + feedingCountdown * 1000, Date.now())}</div>
              </div>
            ) : (
              // Use standard ResourceButton for collect state
              (() => {
                const rewardResource = masterResources.find(r => r.type === rewardItem);
                const petResourceForXP = masterResources.find(res => res.type === petName);
                const xpToAward = petResourceForXP?.xp || 1;

                return (
                  <ResourceButton
                    symbol={rewardResource?.symbol || '📦'}
                    resource={rewardResource}
                    name={`${getLocalizedString(rewardItem, strings)}${revealedRewardQty > 1 ? ` (${revealedRewardQty})` : ''}`}
                    details={`(+ ${XP_STAR_HTML}${xpToAward})`}
                    className={`resource-button pet-collect-button scroll-collect-button rarity-${revealedRewardRarity} ${isCollecting ? 'collecting' : 'ready'}`}
                    disabled={!isReadyToCollect || isCollecting}
                    isTransactionMode={isReadyToCollect && !isCollecting}
                    transactionKey={isReadyToCollect ? `pet-collect-${rewardItem}-${currentPetPosition.x}-${currentPetPosition.y}` : undefined}
                    onTransactionAction={isReadyToCollect ? handleCollectReward : undefined}
                    hideInfo={true}
                  />
                );
              })()
            )
          ) : !isCollecting ? (
            // Show feed pet button when not feeding and not collecting
            <ResourceButton
              name={`${strings[8011] || 'Feed'} ${getLocalizedString(petName, strings)}`}
              className="resource-button"
              details={`${strings[461] || 'Requires'} ${feedQuantity}x ${getLocalizedString(feedIngredient, strings)}`}
              ingredientDetails={getIngredientDetails(
                { ingredient1: feedIngredient, ingredient1qty: feedQuantity },
                masterResources
              )}
              disabled={!canAffordFeeding}
              isValid={canAffordFeeding}
              isTransactionMode={canAffordFeeding}
              transactionKey={canAffordFeeding ? `pet-feed-${petName}-${currentPetPosition.x}-${currentPetPosition.y}` : undefined}
              onTransactionAction={canAffordFeeding ? handleFeedPet : undefined}
              hideInfo={true}
            />
          ) : null}
          </div>
          {cardFx?.phase === 'pop' && <SaleBurst key={cardFx.id} />}
          </div>

        </div>
        
        {/* Sell/refund button - homesteads or developers */}

      </div>
    </Panel>
  );
};

export default React.memo(PetPanel);