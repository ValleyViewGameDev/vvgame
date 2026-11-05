import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import '../../UI/Buttons/ResourceButton.css';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import SaleBurst, { runCardReturn } from '../../UI/SaleBurst';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import '../../UI/Buttons/SharedButtons.css';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { canAffordReveal } from './ScrollReveal';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import { settingsWearingNewMagic } from '../Combat/combatGear';
import { showNotification } from '../../UI/Notifications/Notifications';
import './ScrollStation.css';
import { sellSection } from '../../UI/Panels/SellSection';
import { requestMove } from '../Move/moveMode';
import { canCollect, reportRefusal } from '../../Utils/noRoom';

const ScrollStation = ({
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
  masterResources,
  masterSkills,
  masterTrophies,
  TILE_SIZE,
  isDeveloper,
  globalTuning,
}) => {
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const strings = useStrings();
  const [allResources, setAllResources] = useState([]);
  const { updateStatus } = useContext(StatusBarContext);
  const [stationDetails, setStationDetails] = useState(null);
  const [activeTimer, setActiveTimer] = useState(false);
  const [craftedItem, setCraftedItem] = useState(null);
  const [craftingCountdown, setCraftingCountdown] = useState(null);
  const [isCrafting, setIsCrafting] = useState(false);
  const [isReadyToCollect, setIsReadyToCollect] = useState(false);
  // The panel's one card in motion (runCardReturn, UI/SaleBurst.js): a collected reveal pops away
  // with the sparkles, starting a reveal shrinks the card away, and after a beat the next card
  // (the countdown, or Reveal Scroll again) slides in from the left
  const [cardFx, setCardFx] = useState(null);
  const [scrollCount, setScrollCount] = useState(0);
  const [revealedItemQty, setRevealedItemQty] = useState(1);
  const [isCollecting, setIsCollecting] = useState(false);

   // ✅ Check for active crafting timers or revealed items
   // Updated to support slots-based crafting (uses slot 0 for scroll reveals)
   useEffect(() => {
    if (!stationType || !currentStationPosition) return;

    const checkStation = () => {
      const station = GlobalGridStateTilesAndResources.getResources()?.find(
        (res) => res.x === currentStationPosition.x && res.y === currentStationPosition.y
      );

      // Check for crafting data - support both slots array (new) and legacy fields
      let craftEndValue = null;
      let craftedItemValue = null;
      let qty = 1;

      if (station) {
        // Check slots array first (new format)
        if (station.slots && station.slots[0] && station.slots[0].craftedItem) {
          craftEndValue = station.slots[0].craftEnd;
          craftedItemValue = station.slots[0].craftedItem;
          qty = station.slots[0].qty || 1;
        }
        // Fallback to legacy fields
        else if (station.craftEnd && station.craftedItem) {
          craftEndValue = station.craftEnd;
          craftedItemValue = station.craftedItem;
          qty = station.qty || 1;
        }
      }

      if (craftEndValue && craftedItemValue) {
          // Check if this is a revealed item (craftEnd in the past)
          const now = Date.now();
          const isRevealed = craftEndValue < now;

          setCraftedItem(craftedItemValue);
          setRevealedItemQty(qty);

          if (isRevealed) {
              setIsCrafting(false);
              setIsReadyToCollect(true);
              setCraftingCountdown(0);
              setActiveTimer(false);
          } else {
              // Normal crafting timer
              setIsCrafting(true);
              setActiveTimer(true);

              const remainingTime = Math.max(0, Math.floor((craftEndValue - now) / 1000));
              setCraftingCountdown(remainingTime);

              if (remainingTime === 0) {
                  setIsCrafting(false);
                  setIsReadyToCollect(true);
              }
          }
      } else {
          // Only reset if we actually had something before
          if (craftedItem || isCrafting || isReadyToCollect) {
            setCraftedItem(null);
            setIsCrafting(false);
            setIsReadyToCollect(false);
            setCraftingCountdown(null);
            setActiveTimer(false);
            setRevealedItemQty(1);
          }
      }
    };

    // Initial check
    checkStation();

    // Set up interval to check for updates
    const timer = setInterval(checkStation, 1000);
    return () => clearInterval(timer);
  }, [stationType, currentStationPosition, craftedItem, isCrafting, isReadyToCollect]); // Include state to ensure fresh closures


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

  // Calculate scroll count from inventory and backpack
  useEffect(() => {
    const allItems = [...(inventory || []), ...(backpack || [])];
    const scrolls = allItems.find(item => item.type === 'Scroll');
    setScrollCount(scrolls?.quantity || 0);
  }, [inventory, backpack]);

  // Fetch station details and resources
  // Note: ScrollStation doesn't display recipes - scroll reveals are random
  useEffect(() => {
    try {
      const stationResource = masterResources.find((resource) => resource.type === stationType);
      setStationDetails(stationResource);
      setAllResources(masterResources || []);
    } catch (error) {
      console.error('Error processing masterResources:', error);
    }
  }, [stationType, masterResources]);

  const handleSellStation = async (transactionId, transactionKey) => {
    await handleProtectedSelling({
      currentPlayer,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      setResources,
      stationType,
      currentStationPosition,
      gridId,
      TILE_SIZE,
      updateStatus,
      onClose,
      devOnly: !isHomestead, // Only verify developer status when NOT on homestead
    });
  };
  
  // Generate skill bonus message
  const getSkillBonusMessage = () => {
    // Find all skills that apply to this station
    const applicableSkills = Object.entries(masterSkills || {})
      .filter(([skillName, stations]) => {
        return stations && typeof stations === 'object' && stations[stationType] > 1;
      })
      .map(([skillName, stations]) => ({
        skillName,
        multiplier: stations[stationType],
        hasSkill: currentPlayer.skills?.some(item => item.type === skillName)
      }));
    
    if (applicableSkills.length === 0) return null;
    
    // Separate owned and unowned skills
    const ownedSkills = applicableSkills.filter(skill => skill.hasSkill);
    const unownedSkills = applicableSkills.filter(skill => !skill.hasSkill);
    
    // Calculate combined multiplier for owned skills
    const combinedMultiplier = ownedSkills.reduce((total, skill) => total * skill.multiplier, 1);
    
    let messages = [];
    
    // Message for owned skills
    if (ownedSkills.length > 0) {
      if (ownedSkills.length === 1) {
        // Single skill: "Your [skill] Skill increases the base output of this station by [X]."
        messages.push(`${strings[805]}${getLocalizedString(ownedSkills[0].skillName, strings)}${strings[806]}${ownedSkills[0].multiplier}x.`);
      } else {
        // Multiple skills: list them with their multipliers and show combined effect
        const skillsList = ownedSkills
          .map(skill => `${getLocalizedString(skill.skillName, strings)} (${skill.multiplier}x)`)
          .join(' & ');
        messages.push(`Your ${skillsList} skills combine to increase output by ${combinedMultiplier}x.`);
      }
    }
    
    // Message for unowned skills
    if (unownedSkills.length > 0) {
      unownedSkills.forEach(skill => {
        const skillResource = allResources.find(res => res.type === skill.skillName);
        const skillSource = skillResource?.source || 'Skill Shop';
        // "Acquire the [skill] Skill at the [source] to increase the output of this station by [X]x."
        messages.push(`${strings[801]}${getLocalizedString(skill.skillName, strings)}${strings[802]}${getLocalizedString(skillSource, strings)}${strings[803]}${skill.multiplier}x.`);
      });
    }
    
    return messages.join(' ');
  };

  const skillMessage = getSkillBonusMessage();


  // Handle reveal scroll - spend scroll and start crafting random item
  // The temple's floating texts rise from the card that was tapped, not from the building on the
  // map, and goods fly into the header (UI/FlyToTarget.js). The card's place is taken on the tap:
  // the panel changes once the server answers.
  const cardRect = React.useRef(null);
  const rememberCard = (selector) => { cardRect.current = document.querySelector(selector)?.getBoundingClientRect() || null; };
  const floatFromCard = (text, flyTo = null) => {
    const r = cardRect.current;
    if (!r) { FloatingTextManager.addFloatingText(text, currentStationPosition.x, currentStationPosition.y, TILE_SIZE, { flyTo }); return; }
    FloatingTextManager.addFloatingTextAt(text, r.left + r.width / 2, r.top + r.height / 2, { flyTo });
  };
  const flyTargetFor = (item, resource) => (item === 'Money' ? 'money' : resource?.category === 'doober' ? 'inventory' : null);

  const handleRevealScroll = async (transactionId, transactionKey) => {
    let revertCard = () => {};

    if (scrollCount === 0) {
      updateStatus(strings[820] || 'You need at least 1 scroll to reveal');
      return;
    }

    revertCard = runCardReturn(setCardFx, 'temple', { out: 'leave', returnMs: 700 });
    // ONE request (game-server routes/actionRoutes.js /action/scroll-reveal): the server spends
    // the Scroll, rolls the find and starts it in slot 0, then answers with the player delta.
    const answer = await postAction('/api/action/scroll-reveal', {
      playerId: currentPlayer.playerId,
      gridId,
      stationX: currentStationPosition.x,
      stationY: currentStationPosition.y,
    });
    if (!answer.ok) {
      revertCard();
      applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
      updateStatus(answer.reason === 'short-Scroll' ? (strings[820] || 'You need at least 1 scroll to reveal') : strings[830]);
      return;
    }
    const { reveal, craftEnd, slots } = answer.data;
    applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
    const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
      res.x === currentStationPosition.x && res.y === currentStationPosition.y ? { ...res, slots } : res
    );
    GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
    setResources(updatedGlobalResources);
    setCraftedItem(reveal.type);
    setRevealedItemQty(reveal.qty);
    setCraftingCountdown(Math.max(0, Math.floor((craftEnd - Date.now()) / 1000)));
    setActiveTimer(true);
    setIsCrafting(true);
    setIsReadyToCollect(false);
  };

  // Handle collection of revealed items (reuse standard collect logic)
  const handleCollectReveal = async () => {
    if (!craftedItem || isCollecting) {
      console.error("❌ No revealed item to collect or already collecting.");
      return;
    }
    // Room FIRST for goods (a skill, a power or an NPC takes none), before the card moves
    rememberCard('.scroll-collect-button');
    const roomFeedback = { at: cardRect.current ? { rect: cardRect.current } : { col: currentStationPosition.x, row: currentStationPosition.y, TILE_SIZE }, strings, updateStatus };
    const foundDef = allResources.find((r) => r.type === craftedItem);
    if (foundDef && !['skill', 'power', 'npc'].includes(foundDef.category) && !canCollect({
      resource: craftedItem, quantity: revealedItemQty || 1, currentPlayer, inventory: currentPlayer.inventory, backpack: currentPlayer.backpack, masterResources, globalTuning, ...roomFeedback,
    })) return;
    setIsCollecting(true);
    const revertCard = runCardReturn(setCardFx, 'temple');
    const deltaSetters = { setCurrentPlayer, setInventory, setBackpack };

    try {
      // ONE request (game-server routes/actionRoutes.js /action/scroll-collect): the server gives
      // the find (goods with room checked, a skill or power unless owned), advances Collect quests
      // and the Scroll Revealer trophy, and clears slot 0. An NPC is spawned here.
      const answer = await postAction('/api/action/scroll-collect', {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
      });
      if (!answer.ok) {
        revertCard();
        applyPlayerDelta(answer.data, deltaSetters);
        if (!reportRefusal(answer.reason, roomFeedback)) updateStatus('❌ Failed to collect item');
        setIsCollecting(false);
        return;
      }

      const { collected, isNPC, alreadyOwned, trophies, slots } = answer.data;
      applyPlayerDelta(answer.data, deltaSetters);
      const collectedItem = collected.type;
      const collectedQty = collected.qty;
      const revealedResource = allResources.find(res => res.type === collectedItem);
      const isSkillOrPower = revealedResource && (revealedResource.category === 'skill' || revealedResource.category === 'power');

      if (isNPC) {
        if (revealedResource) NPCsInGridManager.spawnNPC(gridId, revealedResource, { x: currentStationPosition.x, y: currentStationPosition.y });
        floatFromCard(`+${collectedQty} ${getLocalizedString(collectedItem, strings)}`);   // an NPC walks out: nothing to fly
      } else if (isSkillOrPower) {
        const displayName = getLocalizedString(collectedItem, strings);
        const categoryEmoji = revealedResource.category === 'skill' ? '💪' : '⚡';
        if (alreadyOwned) {
          updateStatus(strings[828] || 'You already have this');
          floatFromCard(`${categoryEmoji} ${displayName} (Already Owned)`);
        } else {
          floatFromCard(`${categoryEmoji} ${displayName}`);
          // A magic item goes on at once when a slot is free (combatGear.js); gear waits for
          // the Combat panel, where the player chooses what to wear
          const owner = { ...currentPlayer, powers: answer.data.player?.powers || currentPlayer.powers };
          if (revealedResource.category === 'power') {
            const wearing = settingsWearingNewMagic(owner, revealedResource.type, masterResources, globalTuning);
            if (wearing) {
              setCurrentPlayer((prev) => ({ ...prev, settings: wearing }));
              axios.post(`${API_BASE}/api/update-profile`, { playerId: currentPlayer.playerId, updates: { settings: wearing } }).catch((e) => console.error('Error wearing new magic item:', e));
            } else {
              showNotification('Message', {
                title: strings[7001] || 'Tip',
                message: strings[7017] || 'Equip in Combat Panel to use'
              });
            }
            playersInGridManager.refreshCombatStats(wearing ? { ...owner, settings: wearing } : owner);
          }
        }
      } else {
        floatFromCard(`+${collectedQty} ${revealedResource?.symbol || ''} ${getLocalizedString(collectedItem, strings)}`, flyTargetFor(collectedItem, revealedResource));
      }

      for (const t of trophies || []) {
        if (!t.isNewMilestone) continue;
        const def = (masterTrophies || []).find((d) => d.name === t.name);
        if (def && def.visible === false) continue;
        showNotification('Trophy', t.trophy);
      }

      const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
        res.x === currentStationPosition.x && res.y === currentStationPosition.y ? { ...res, slots } : res
      );
      GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
      setResources(updatedGlobalResources);

      setActiveTimer(false);
      setCraftedItem(null);
      setCraftingCountdown(null);
      setIsReadyToCollect(false);
      setRevealedItemQty(1);
      if (!(isSkillOrPower && alreadyOwned)) {
        updateStatus(`${strings[469] || 'Collected'} ${collectedQty}x ${getLocalizedString(collectedItem, strings)}`);
      }
      setTimeout(() => setIsCollecting(false), 100);
    } catch (error) {
      revertCard();
      console.error('Error collecting revealed item:', error);
      updateStatus('❌ Failed to collect item');
      setIsCollecting(false);
    }
  };

  // Sell section, pinned under the panel (UI/Panels/SellSection.js): Sell (the refund) and Move
  const sellFooter = sellSection({
    canSell: currentPlayer?.location?.gtype === 'homestead',
    isDeveloper,
    resourceType: stationType,
    masterResources,
    onSell: handleSellStation,
    transactionKey: `sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`,
    onMove: () => requestMove({ type: stationType, x: currentStationPosition.x, y: currentStationPosition.y }),
  });

  return (
    <Panel footer={sellFooter} onClose={onClose} descriptionKey="1036" title={strings[1136] || 'Ancient Temple'} panelName="ScrollStation">
      <div className="station-panel-container">
        <div className="station-panel-content">

        {/* Scroll count display */}

        <div style={{
          padding: '10px',
          textAlign: 'center',
          fontSize: 'var(--text-lg)',
          fontWeight: 'bold',
         }}>
          {strings[825]}: <br></br>{scrollCount} 📜 {scrollCount > 1 ? strings[826] : strings[827]}
        </div>


        {skillMessage && (
          <div className="text-hint" style={{
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: 'var(--color-bg-light)',
            borderRadius: 'var(--radius-sm)',
          }}>
            {skillMessage}
          </div>
        )}

        {/* Show crafting item if active, otherwise show Reveal Scroll button: one card slot, animated by cardFx */}
        <div className="card-fx-slot">
        <div className={cardFx ? `card-fx-${cardFx.phase}` : ''}>

        {craftedItem && (isCrafting || isReadyToCollect) ? (
          // Show animated scroll reveal or dramatic collect interface
          isCrafting ? (
            // Animated scroll emoji during crafting
            <div className="scroll-reveal-animation">
              <div className="scroll-emoji">📜</div>
              <div className="scroll-revealing-text">Revealing Scroll...</div>
              <div className="scroll-countdown-text">{formatCountdown(Date.now() + craftingCountdown * 1000, Date.now())}</div>
            </div>
          ) : (
            // Use standard ResourceButton for collect state
            (() => {
              const revealedResource = masterResources.find(r => r.type === craftedItem);
              const rarity = revealedResource?.scrollchance || 'common';
              const rarityText = typeof rarity === 'string' ? rarity.toUpperCase() : 'COMMON';
              
              return (
                <ResourceButton
                  symbol={revealedResource?.symbol || '📦'}
                  name={`\n${getLocalizedString(craftedItem, strings)}${revealedItemQty > 1 ? ` (${revealedItemQty})` : ''}`}
                  className={`resource-button scroll-collect-button rarity-${typeof rarity === 'string' ? rarity : 'common'} ${isCollecting ? 'collecting' : 'ready'}`}
                  details={rarityText} 
                  disabled={!isReadyToCollect || isCollecting}
                  isTransactionMode={isReadyToCollect && !isCollecting}
                  transactionKey={isReadyToCollect ? `scroll-collect-${craftedItem}-${currentStationPosition.x}-${currentStationPosition.y}` : undefined}
                  onTransactionAction={isReadyToCollect ? handleCollectReveal : undefined}
                />
              );
            })()
          )
        ) : scrollCount > 0 && !isCollecting ? (
          // Show reveal scroll button when not crafting and not collecting
          <ResourceButton
            name={strings[831]}
            className="resource-button"
            details={`${strings[461]} 1x 📜 ${strings[827]}`}
            disabled={false}
            isTransactionMode={true}
            transactionKey={`scroll-reveal-${currentStationPosition.x}-${currentStationPosition.y}`}
            onTransactionAction={handleRevealScroll}
          />
        ) : null}
        </div>
        {cardFx?.phase === 'pop' && <SaleBurst key={cardFx.id} />}
        </div>
        
        {/* Show message when no scrolls */}
        {scrollCount === 0 && !craftedItem && (
          <p className="text-empty" style={{ textAlign: 'center', padding: '20px' }}>
            {strings[832]}
          </p>
        )}

        </div>
        

      </div>
    </Panel>
  );
};

export default React.memo(ScrollStation);