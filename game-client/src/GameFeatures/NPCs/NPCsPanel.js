import API_BASE from '../../config';
import React, { useState, useEffect, useRef } from 'react';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Buttons/SharedButtons.css';
import '../Crafting/ScrollStation.css'; // Import for shared station panel styles
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford, hasRoomFor, getPlayerQuantity } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { gainIngredients, spendIngredients } from '../../Utils/InventoryManagement';
import { confirmRecipeGemSpend } from '../../UI/Modals/GemSpendConfirm';
import { QuestGiverButton } from '../../UI/Buttons/QuestButton';
import { modifyPlayerStatsInGridState, getDerivedLevel } from '../../Utils/playerManagement';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import RelationshipCard from '../Relationships/RelationshipCard';
import RelationshipMatrix from '../Relationships/RelationshipMatrix.json';
import { getRelationshipStatus, getRelationshipMultiplier } from '../Relationships/RelationshipUtils';
import '../Relationships/Relationships.css';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { checkDeveloperStatus } from '../../Utils/appUtils';
import questCache from '../../Utils/QuestCache';
import { calculateDistance, getDerivedRange } from '../../Utils/worldHelpers';
import { earnTrophy } from '../Trophies/TrophyUtils';
import HealerInteraction from './HealerInteraction';
import CitizenStatusLine from './CitizenStatusLine';
import StoryModal from '../../UI/Modals/StoryModal';
import ResourceModalSmall from '../../UI/Modals/ResourceModalSmall';
import NameDeedModal from '../../UI/Modals/NameDeedModal';
import SnugTravelModal from './SnugTravelModal';
import { STATE_GOALS, stateGoalMet, refreshStateGoals } from '../Quests/stateGoals';
import CluesModal, { cluesFor } from './CluesModal';
import NPCConnections from './NPCConnections';
import MinigameButton from '../../UI/Buttons/MinigameButton';
import RiddleMinigame from '../Minigames/RiddleMinigame';
import { MINIGAMES } from '../Minigames/minigames';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import './NPCsPanel.css';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
import FloatingTextManager from '../../UI/FloatingText';
import soundManager from '../../Sound/SoundManager';
import SaleBurst, { runCardReturn } from '../../UI/SaleBurst';
import { gameAlert } from '../../UI/Modals/GameDialog';
import { sellSection } from '../../UI/Panels/SellSection';

const NPCPanel = ({
  onClose,
  npcData,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  TILE_SIZE,
  updateStatus,
  masterResources,
  masterInteractions,
  masterTraders,
  masterTrophies,
  masterXPLevels,
  zoomLevel,
  setZoomLevel,
  centerCameraOnPlayer,
  currentGridPosition,      // Grid position within settlement for camera centering
  currentSettlementPosition, // Settlement position within frontier for camera centering
  globalTuning,
  isDeveloper,
  onSnugTravel,             // App: (gridCoord, x, y, player) => changePlayerLocation to a tile next to Snug
}) => {
  const strings = useStrings();
  const [snugTravelOpen, setSnugTravelOpen] = useState(false);
  // Travel with Snug: on Snug's panel once the player has greeted him
  const canTravelWithSnug = npcData?.type === 'Snug' && !!onSnugTravel
    && !!currentPlayer?.relationships?.some((r) => r.name === 'Snug' && r.met);
  const [questList, setQuestList] = useState([]);
  // Quest cards in motion (house rule: the card reacts on the tap, the server runs in parallel):
  // { [title]: { type: 'pop' | 'leave' | 'slidein', quest, index, id } }. A leaving card is kept on
  // screen from its snapshot until its slot has collapsed, even after the list drops it.
  const [questFx, setQuestFx] = useState({});
  // Titles taken off the list on the tap (a quest accepted, a one-time reward collected), hidden
  // until the server-driven list no longer has them (or the action fails and they come back)
  const [goneQuests, setGoneQuests] = useState(() => new Set());
  // A trader's offer in motion after a trade (runCardReturn, UI/SaleBurst.js): { slot, id, phase }
  const [tradeFx, setTradeFx] = useState(null);
  const [healRecipes, setHealRecipes] = useState([]);
  const [tradeRecipes, setTradeRecipes] = useState([]);
  const [infoResource, setInfoResource] = useState(null); // ResourceModalSmall: tap a requirement on a trade you cannot afford
  const [activeMinigame, setActiveMinigame] = useState(null); // an offer won in a minigame (Prospero's riddle)
  const [pendingDeedTrade, setPendingDeedTrade] = useState(null); // a silent account names itself before the Home Deed trade runs
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [canQuest, setCanQuest] = useState(false);
  const [hasHiddenQuests, setHasHiddenQuests] = useState(false);
  const [questThreshold, setQuestThreshold] = useState(0);
  const [canTrade, setCanTrade] = useState(false);
  const [tradeThreshold, setTradeThreshold] = useState(0);
  const [hasHiddenTrades, setHasHiddenTrades] = useState(false);
  // Note: Spam-click protection is now handled by ResourceButton's isTransactionMode
  // isHealingAnimation is only used to trigger the prayer bubble visual effect
  const [isHealingAnimation, setIsHealingAnimation] = useState(false);

  // StoryModal state for relationship milestone dialogs
  const [storyModalOpen, setStoryModalOpen] = useState(false);
  const [storyRelationshipType, setStoryRelationshipType] = useState(null);
  const [storyDialogKey, setStoryDialogKey] = useState(null); // a story quest's ask (quest storyKey), shown on accept
  const [cluesOpen, setCluesOpen] = useState(false); // CluesModal: the story dialogs shown so far, to read again

  // Tapping another NPC while this panel is open re-renders it with new npcData instead of
  // remounting it, so everything held for the previous NPC must go: otherwise a quest giver who
  // does not trade (Cassio) showed the trader's offers left from the last panel (Juliet). Reset
  // during render (React's reset-on-prop-change pattern), so not one frame shows stale lists;
  // the load effects below then fill them for the new NPC.
  const npcKey = `${npcData?.id ?? ''}:${npcData?.type ?? ''}`;
  const [shownNpcKey, setShownNpcKey] = useState(npcKey);
  if (shownNpcKey !== npcKey) {
    setShownNpcKey(npcKey);
    setQuestList([]);
    setQuestFx({});
    setGoneQuests(new Set());
    setTradeFx(null);
    setHealRecipes([]);
    setTradeRecipes([]);
    setInfoResource(null);
    setActiveMinigame(null);
    setStatusMessage('');
    setErrorMessage('');
    setCanQuest(false);
    setHasHiddenQuests(false);
    setCanTrade(false);
    setHasHiddenTrades(false);
    setCluesOpen(false);
    setSnugTravelOpen(false);
  }

  // Ref to track relationship status before an interaction
  const preInteractionRelationshipRef = useRef(null);

  // Hide relationship UI for FTUE users interacting with Constable Elbow
  // This simplifies the UI during the tutorial to focus on trading for the Home Deed
  const hideFTUERelationshipUI = currentPlayer?.firsttimeuser && npcData?.type === 'Constable Elbow';

  // Hide relationship UI permanently for The Shepherd (no relationship system for this NPC)
  const hideRelationshipUI = hideFTUERelationshipUI || npcData?.type === 'The Shepherd';

  // Ensure npcData has default values
  if (!npcData) {
    console.warn("NPCPanel was opened with missing npcData.");
    npcData = { type: "Unknown NPC", symbol: "❓" }; // Provide default fallback values
  }

  // Check if player has required skill for a trade recipe
  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };

  // Check if player meets the level requirement for a trade recipe
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const meetsLevelRequirement = (resourceLevel) => {
    if (!resourceLevel) return true; // No level requirement
    return playerLevel >= resourceLevel;
  };

  // Check if player can quest based on relationship
  useEffect(() => {
    if (masterInteractions && npcData && npcData.action === 'quest') {
      // Find the quest interaction threshold
      const questInteraction = masterInteractions.find(interaction => 
        interaction.interaction === 'Quest' || interaction.interaction === 'quest'
      );
      
      if (questInteraction) {
        setQuestThreshold(questInteraction.relscoremin || 0);
        
        // Get current relationship status
        const relationship = getRelationshipStatus(currentPlayer, npcData.type);
        const currentScore = relationship?.relscore || 0;
        
        setCanQuest(currentScore >= questInteraction.relscoremin);
      } else {
        // If no quest threshold defined, allow questing
        setCanQuest(true);
      }
    }
    
    // Check if player can trade based on relationship (traders, and quest givers who also trade)
    if (npcData && (npcData.action === 'trade' || masterTraders?.some(t => t.trader === npcData.type))) {
      const tradeInteraction = masterInteractions.find(interaction => 
        interaction.interaction === 'Trade' || interaction.interaction === 'trade'
      );
      
      if (tradeInteraction) {
        setTradeThreshold(tradeInteraction.relscoremin || 0);
        
        // Get current relationship status
        const relationship = getRelationshipStatus(currentPlayer, npcData.type);
        const currentScore = relationship?.relscore || 0;
        
        setCanTrade(currentScore >= tradeInteraction.relscoremin);
      } else {
        // If no trade threshold defined, allow trading
        setCanTrade(true);
      }
    }
  }, [masterInteractions, npcData, currentPlayer, masterTraders]);

  // Handle quests or healing logic
  useEffect(() => {
    if (!npcData || !npcData.type) return;

    // Trader offers (traders.json): a trader's, and a quest giver's who also trades (Prospero)
    const loadTrades = () => {
      // Find all trades for this trader in masterTraders (new flat format)
      const traderOffers = masterTraders?.filter(t => t.trader === npcData.type);

      if (traderOffers && traderOffers.length > 0) {
        // Get player's relationship with this NPC
        const relationship = currentPlayer.relationships?.find(rel => rel.name === npcData.type);

        // Check if any trades are hidden due to relationship requirements
        const tradesHiddenByRelationship = traderOffers.some((offer) => {
          if (offer.rel || offer.relscore) {
            // If no relationship exists with this NPC, trade is hidden
            if (!relationship) return true;
            // Check relationship status requirement (e.g., "friend", "met", "love")
            if (offer.rel && relationship[offer.rel] !== true) return true;
            // Check relationship score requirement
            if (offer.relscore && (relationship.relscore || 0) < offer.relscore) return true;
          }
          return false;
        });
        setHasHiddenTrades(tradesHiddenByRelationship);

        // Filter offers by relationship requirements, then transform
        const filteredOffers = traderOffers.filter((offer) => {
          if (offer.rel || offer.relscore) {
            // If no relationship exists with this NPC, exclude the trade
            if (!relationship) return false;
            // Check relationship status requirement
            if (offer.rel && relationship[offer.rel] !== true) return false;
            // Check relationship score requirement
            if (offer.relscore && (relationship.relscore || 0) < offer.relscore) return false;
          }
          return true;
        });

        // Transform each offer into the format expected by the rest of the component
        const filteredRecipes = filteredOffers.map(offer => {
          // Get the symbol from masterResources
          const resourceDef = masterResources.find(r => r.type === offer.gives);

          const recipe = {
            type: offer.gives,
            symbol: resourceDef?.symbol || '?',
            tradeqty: offer.givesqty || 1,
            source: npcData.type,
            gemcost: resourceDef?.gemcost || null,
            index: offer.index, // Keep track of which offer this is
            repeat: offer.repeat, // Store the repeat flag from trader offer
            level: resourceDef?.level, // Level requirement from resource definition
            requires: resourceDef?.requires, // Skill requirement from resource definition
            xp: offer.xp, // XP reward for this specific trade (from traders.json)
            minigame: offer.minigame || null, // won in a minigame instead of paid for (Minigames/minigames.js)
          };

          // Collect all requires fields into ingredient format
          let ingredientCount = 1;
          for (let i = 1; i <= 7; i++) { // Support up to 7 ingredients like Oracle
            const requiresField = `requires${i}`;
            const requiresQtyField = `requires${i}qty`;

            if (offer[requiresField]) {
              recipe[`ingredient${ingredientCount}`] = offer[requiresField];
              recipe[`ingredient${ingredientCount}qty`] = offer[requiresQtyField] || 1;
              ingredientCount++;
            }
          }

          return recipe;
        });

        setTradeRecipes(filteredRecipes);
      } else {
        // Fallback to old method if masterTraders is not available
        const filteredRecipes = masterResources.filter((resource) => resource.source === npcData.type);
        setTradeRecipes(filteredRecipes);
        setHasHiddenTrades(false);
      }
    };

    if (npcData.action === 'quest') {
      // Add a small delay to debounce rapid changes
      const timeoutId = setTimeout(() => {
        fetchQuests();
      }, 100);
      if (masterTraders?.some(t => t.trader === npcData.type)) loadTrades();
      
      return () => clearTimeout(timeoutId);
    } else if (npcData.action === 'heal') {
      const filteredRecipes = masterResources.filter((resource) => resource.type === npcData.type);
      setHealRecipes(filteredRecipes);
    } else if (npcData.action === 'trade') {
      loadTrades();
    }
  }, [npcData, currentPlayer?.activeQuests, currentPlayer?.completedQuests, currentPlayer?.relationships, masterResources, masterTraders]);

  
  ////////////////////////////////////////////////////////////
  ////////////////////// Fetch QUESTS for QUEST NPCs
  const fetchQuests = async () => {
    try {
      // Meet / Find / Acquire goals done since the quest was accepted count now, so the giver's
      // panel offers the reward without the To Do panel being opened first
      await refreshStateGoals(currentPlayer, setCurrentPlayer);
      // Use cached quests instead of direct API call
      const allQuests = await questCache.getQuests();

      // Use new quest filtering logic
      let npcQuests = allQuests
        .filter((quest) => quest.giver === npcData.type)
        .filter((quest) => {
          const activeQuest = currentPlayer.activeQuests.find(q => q.questId === quest.title);
          const isInCompleted = currentPlayer.completedQuests.some(q => q.questId === quest.title);        
          if (activeQuest) {
            const shouldShow = activeQuest.completed && !activeQuest.rewardCollected;
            return shouldShow;
          }          
          // only quests open now or one level away; further ones are hidden (owner 2026-10-24)
          if (Number(quest.level) > playerLevel + 1) return false;
          // a quest with a prereq is offered only once that quest is done (quest chains)
          if (quest.prereq && !currentPlayer.completedQuests.some(q => q.questId === quest.prereq)) return false;
          const shouldShow = (quest.repeatable === true || quest.repeatable === 'true') || !isInCompleted;
          return shouldShow;
        });

      // Check if any quests exist that are hidden due to relationship requirements
      const relationship = currentPlayer.relationships?.find(rel => rel.name === npcData.type);
      const questsHiddenByRelationship = npcQuests.some((quest) => {
        // Check if quest has relationship requirements that aren't met
        if (quest.rel || quest.relscore) {
          // If no relationship exists with this NPC, quest is hidden
          if (!relationship) return true;
          // Check relationship status requirement
          if (quest.rel && relationship[quest.rel] !== true) return true;
          // Check relationship score requirement
          if (quest.relscore && (relationship.relscore || 0) < quest.relscore) return true;
        }
        return false;
      });

      // Filter by relationship requirements (existing logic)
      npcQuests = npcQuests.filter((quest) => {
        // Check if quest has relationship requirements
        if (quest.rel || quest.relscore) {
          // If no relationship exists with this NPC, exclude the quest
          if (!relationship) return false;
          // Check relationship status requirement
          if (quest.rel && relationship[quest.rel] !== true) { return false; }
          // Check relationship score requirement
          if (quest.relscore && (relationship.relscore || 0) < quest.relscore) { return false; }
        }
        return true;
      });

      setQuestList(npcQuests);
      setHasHiddenQuests(questsHiddenByRelationship);
    } catch (error) {
      console.error('Error fetching quests:', error);
    }
  };

  // ---------- quest card motion (UI/SaleBurst.css .card-fx-*) ----------
  const setQuestCardFx = (title, fx) => setQuestFx((prev) => {
    const next = { ...prev };
    if (fx) next[title] = { ...fx, id: Date.now() + Math.random() }; else delete next[title];
    return next;
  });
  const setQuestGone = (title, gone) => setGoneQuests((prev) => {
    const next = new Set(prev);
    if (gone) next.add(title); else next.delete(title);
    return next;
  });
  // The slot shrinks to nothing so the cards below glide up into the gap, then the card is gone
  const collapseQuestSlot = (title) => {
    const finish = () => setQuestCardFx(title, null);
    const el = document.querySelector(`[data-quest-slot="${CSS.escape(title)}"]`);
    if (!el || typeof el.animate !== 'function') { finish(); return; }
    const h = el.offsetHeight;
    const anim = el.animate(
      [{ height: `${h}px`, paddingTop: '4px', paddingBottom: '4px' }, { height: '0px', paddingTop: '0px', paddingBottom: '0px' }],
      { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
    );
    anim.onfinish = finish;
  };
  // A card leaves the list: `pop` (reward collected: burst + sparkles) or `leave` (accepted). A
  // repeatable reward slides straight back in as a fresh card; anything else collapses its slot.
  // Returns a revert for a failed server call.
  const sendQuestCardAway = (quest, kind, comesBack) => {
    const title = quest.title;
    const index = Math.max(0, questList.findIndex((q) => q.title === title));
    setQuestCardFx(title, { type: kind, quest, index });
    if (!comesBack) setQuestGone(title, true);
    const outMs = kind === 'pop' ? 300 : 220;
    const timer = setTimeout(() => {
      if (comesBack) setQuestCardFx(title, { type: 'slidein', quest, index });
      else collapseQuestSlot(title);
    }, outMs);
    return () => { clearTimeout(timer); setQuestCardFx(title, null); setQuestGone(title, false); };
  };
  // the list no longer has a hidden title: the server has caught up, stop hiding it
  useEffect(() => {
    if (!goneQuests.size) return;
    const listed = new Set(questList.map((q) => q.title));
    const stale = [...goneQuests].filter((t) => !listed.has(t));
    if (stale.length) setGoneQuests((prev) => { const next = new Set(prev); stale.forEach((t) => next.delete(t)); return next; });
  }, [questList]); // eslint-disable-line react-hooks/exhaustive-deps
  // What the panel shows: the list minus titles taken away on the tap, plus any leaving card the
  // list has already dropped (kept at its old place until its slot has collapsed)
  const displayQuests = (() => {
    const list = questList.filter((q) => !goneQuests.has(q.title) || questFx[q.title]);
    Object.entries(questFx).forEach(([title, fx]) => {
      if (fx.quest && !list.some((q) => q.title === title)) list.splice(Math.min(fx.index, list.length), 0, fx.quest);
    });
    return list;
  })();

  const handleAcceptQuest = async (transactionId, transactionKey, questTitle) => {
    console.log(`🔒 [PROTECTED QUEST] Starting accept quest for ${questTitle}`);
    if (!questTitle) return;
    // Find the accepted quest in questList
    const acceptedQuest = questList.find(q => q.title === questTitle);
    if (!acceptedQuest) {
        console.error(`Quest "${questTitle}" not found in available quests.`);
        return;
    }
    // Prepare progress tracking for skill-based goals
    let initialProgress = { goal1: 0, goal2: 0, goal3: 0 }; // Explicitly initialize
    let goalsCompleted = 0;
    let totalGoals = 0;

    for (let i = 1; i <= 3; i++) {
      const goalAction = acceptedQuest[`goal${i}action`];
      const goalItem = acceptedQuest[`goal${i}item`];
      const goalQty = acceptedQuest[`goal${i}qty`];

      if (!goalAction || !goalItem || !goalQty) continue; // Skip undefined goals
      totalGoals++; // Count valid goals

      if (STATE_GOALS.includes(goalAction)) {
          // Already true of the player (owns the skill, has met them, holds or found the item)
          if (stateGoalMet(goalAction, goalItem, { ...currentPlayer, inventory: inventory || currentPlayer.inventory, backpack: backpack || currentPlayer.backpack })) {
              initialProgress[`goal${i}`] = 1; // Pre-mark as completed
              goalsCompleted++;
          } else {
              initialProgress[`goal${i}`] = 0; // Start at 0
          }
      } else if (goalAction === "Craft") {
          // Check if crafted item already exists as an NPC on the homestead (e.g., Rancher, Farm Hand)
          const homesteadNPCs = Object.values(NPCsInGridManager.getNPCsInGrid(currentPlayer.gridId) || {});
          const itemExistsOnHomestead = homesteadNPCs.some(npc => npc.type === goalItem);
          if (itemExistsOnHomestead) {
              initialProgress[`goal${i}`] = 1; // Pre-mark as completed
              goalsCompleted++;
          } else {
              initialProgress[`goal${i}`] = 0; // Start at 0
          }
      } else {
          initialProgress[`goal${i}`] = 0; // Default progress for other goals
      }
    }
    // If all goals are completed before even accepting, mark the quest as completed
    const isQuestCompleted = totalGoals > 0 && goalsCompleted === totalGoals;

    // On the tap: a scroll rises from the card and flies into the To Do button on the HUD
    // (data-fly-target="quests"), and the card leaves the list (the cards below glide up)
    const acceptCardRect = document.querySelector(`[data-quest-card="${CSS.escape(questTitle)}"]`)?.getBoundingClientRect();
    if (acceptCardRect) {
      FloatingTextManager.addFloatingTextAt('📜', acceptCardRect.left + acceptCardRect.width / 2, acceptCardRect.top + acceptCardRect.height / 2, { flyTo: 'quests' });
    }
    const revertAccept = sendQuestCardAway(acceptedQuest, 'leave', false);
    // A story quest (Constable Elbow's chain, docs/narrative-pass.md P3.4) says why it matters,
    // in the giver's own StoryModal, on the tap
    if (acceptedQuest.storyKey) {
      setStoryDialogKey(acceptedQuest.storyKey);
      setStoryRelationshipType('story');
      setStoryModalOpen(true);
    }

    try {
      const response = await axios.post(`${API_BASE}/api/add-player-quest`, {
        playerId: currentPlayer.playerId,
        questId: questTitle,
        startTime: Date.now(),
        progress: initialProgress, // Send pre-computed progress
        completed: isQuestCompleted, // If all goals are done, mark it completed
      });

      if (response.data.success) {
        setCurrentPlayer(response.data.player); // Update player after quest is added
        updateStatus(202);
        // No need to invalidate cache when accepting quests
      } else {
        revertAccept();
        setStatusMessage(`Failed to accept quest: ${response.data.error}`);
      }
    } catch (error) {
      revertAccept();
      console.error('Error accepting quest:', error);
      setStatusMessage('Error accepting quest. Check console.');
    }
  };

// Helper to get NPC position for FloatingText
const getQuestNPCPosition = () => {
  const gridId = currentPlayer?.location?.g;
  if (!gridId) return null;
  const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
  if (!npcsInGrid || !npcData?.id) return null;
  const npcInGrid = npcsInGrid[npcData.id];
  return npcInGrid?.position || null;
};

// Show floating text for quest reward collection: the reward and its XP rise from the quest card
// that was tapped (cardRect, taken on the tap) and fly into the header (UI/FlyToTarget.js): Money /
// Gems to their counters, a skill to Skills, a power to Combat, anything else to Inventory, XP to the
// Level bar. Without the card (it was not found) they rise from the quest giver on the map.
const questRewardFlyTo = (item, resource) => (
  item === 'Money' ? 'money' : item === 'Gem' ? 'gems' : item === 'XP' ? 'xp'
    : resource?.category === 'skill' ? 'skills' : resource?.category === 'power' ? 'combat'
    : resource?.category === 'npc' ? null : 'inventory');
const showQuestRewardFloatingText = (rewardSymbol, rewardName, rewardQuantity, xpAmount, cardRect, rewardFlyTo) => {
  const at = (text, flyTo, dy) => {
    if (cardRect) {
      FloatingTextManager.addFloatingTextAt(text, cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2 + dy, { flyTo });
      return;
    }
    const npcPos = getQuestNPCPosition();
    if (npcPos) FloatingTextManager.addFloatingText(text, npcPos.x, npcPos.y, TILE_SIZE, { flyTo });
  };
  // Show reward item first (emoji + localized name)
  at(`+${rewardQuantity} ${rewardSymbol} ${rewardName}`, rewardFlyTo, -8);
  // Then the XP, a little below, so the two never sit on top of each other
  setTimeout(() => at(`+${xpAmount} 🔷 XP`, 'xp', 14), 260);
};

const handleGetReward = async (transactionId, transactionKey, quest) => {
  playersInGridManager.flushAfterTransaction(); // quest reward: save the position with it
    // the card's place, on the tap: the panel may redraw before the server answers
    const questCardRect = document.querySelector(`[data-quest-card="${CSS.escape(quest.title)}"]`)?.getBoundingClientRect() || null;
    console.log(`🔒 [PROTECTED QUEST] Starting get reward for ${quest.title}`);
    let revertReward = () => {};
    try {
      // Get relationship-based multiplier from RelationshipMatrix data
      const { multiplier, bonusMessage } = getRelationshipMultiplier(npcData.type, currentPlayer, strings);
      const rewardQuantity = Math.floor((quest.rewardqty || 1) * multiplier);

      // On the tap (house rule): the reward and its XP rise from the card and fly home, the card
      // bursts into sparkles, and either slides back in fresh (a repeatable quest) or its slot
      // collapses so the cards below glide up. The server runs in parallel; a failure brings the
      // card back.
      const rewardResource = masterResources.find(r => r.type === quest.reward);
      const rewardSymbol = rewardResource?.symbol || '🎁';
      const rewardName = getLocalizedString(quest.reward, strings);
      const npcResourceForXP = masterResources.find(res => res.type === npcData.type && res.category === 'npc');
      const xpForFloatingText = quest.xp ?? npcResourceForXP?.xp ?? 1;
      const repeatable = quest.repeatable === true || quest.repeatable === 'true';
      revertReward = sendQuestCardAway(quest, 'pop', repeatable);
      showQuestRewardFloatingText(rewardSymbol, rewardName, rewardQuantity, xpForFloatingText, questCardRect, questRewardFlyTo(quest.reward, rewardResource));
      soundManager.playSFX('skill_earned');
      try { navigator.vibrate?.(35); } catch (_) { /* no haptics here */ }

      // Ensure inventory and backpack are valid arrays
      const safeInventory = Array.isArray(inventory) ? inventory : [];
      const safeBackpack = Array.isArray(backpack) ? backpack : [];
      
      const success = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: quest.reward,
        quantity: rewardQuantity,
        inventory: safeInventory,
        backpack: safeBackpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
        globalTuning,
      });
      // Check if gainIngredients failed (returns object with success: false, or falsy value)
      if (success !== true && (!success || success.success === false)) { revertReward(); return; }

      // Award trophies for specific quest rewards
      try {
        if (quest.reward === "Prospero's Orb") {
          console.log(`🏆 Awarding Prospero's Orb trophy for collecting ${rewardQuantity} orb(s)`);
          
          // Award the Count-type trophy for each orb collected
          for (let i = 0; i < rewardQuantity; i++) {
            await earnTrophy(currentPlayer.playerId, "Prospero's Orb", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          }
          
          console.log(`✅ Successfully awarded ${rewardQuantity} Prospero's Orb trophy instance(s)`);
        } else if (quest.reward === "Skeleton Key") {
          console.log(`🏆 Awarding Skeleton Key trophy for collecting ${rewardQuantity} key(s)`);
          
          // Award the Count-type trophy for each key collected
          for (let i = 0; i < rewardQuantity; i++) {
            await earnTrophy(currentPlayer.playerId, "Skeleton Key", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          }
          
          console.log(`✅ Successfully awarded ${rewardQuantity} Skeleton Key trophy instance(s)`);
        } else if (quest.reward === "Golden Key") {
          console.log(`🏆 Awarding Golden Key trophy for collecting ${rewardQuantity} key(s)`);
          
          // Award the Count-type trophy for each key collected
          for (let i = 0; i < rewardQuantity; i++) {
            await earnTrophy(currentPlayer.playerId, "Golden Key", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          }
          
          console.log(`✅ Successfully awarded ${rewardQuantity} Golden Key trophy instance(s)`);
        }
        
      } catch (error) {
        console.error('❌ Error awarding quest reward trophy:', error);
        // Don't fail the quest completion if trophy awarding fails
      }

      // Track quest progress for "Collect" type quests (use multiplied quantity)
      await trackQuestProgress(currentPlayer, 'Collect', quest.reward, rewardQuantity, setCurrentPlayer);

      // Award XP for completing quest (reuses xpForFloatingText calculated above)
      const xpToAward = xpForFloatingText;
      try {
        const xpResponse = await axios.post(`${API_BASE}/api/addXP`, {
          playerId: currentPlayer.playerId,
          xpAmount: xpToAward
        });

        if (xpResponse.data.success) {
          // Update current player's XP locally
          setCurrentPlayer(prev => ({
            ...prev,
            xp: xpResponse.data.newXP
          }));
        }
      } catch (error) {
        console.error('❌ Error awarding XP for quest completion:', error);
        // Don't fail the quest completion if XP award fails, just log it
      }

      let updatedCompletedQuests = currentPlayer.completedQuests.map((q) =>
        q.questId === quest.title ? { ...q, rewardCollected: true } : q
      );
      const alreadyCompleted = updatedCompletedQuests.some(q => q.questId === quest.title);
      if (!alreadyCompleted) {
        updatedCompletedQuests.push({
          questId: quest.title,
          rewardCollected: true,
          timestamp: Date.now(),
        });
      }

      // Remove the quest from activeQuests
      const updatedActiveQuests = currentPlayer.activeQuests.filter(q => q.questId !== quest.title);

      const updatedPlayer = {
        ...currentPlayer,
        completedQuests: updatedCompletedQuests,
        activeQuests: updatedActiveQuests,
      };
      await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: {
          completedQuests: updatedPlayer.completedQuests,
          activeQuests: updatedActiveQuests,
        },
      }).then((result) => {
      });
      // Don't call refreshPlayerAfterInventoryUpdate here - gainIngredients already updated the state
      // and calling refresh would overwrite the local updates with potentially stale server data
      // Update player with quest progress but preserve the inventory that was just updated
      setCurrentPlayer(prev => ({
        ...prev,
        completedQuests: updatedPlayer.completedQuests,
        activeQuests: updatedActiveQuests,
      }));
      // a one-time quest leaves the list (its card already has); a repeatable one stays, fresh
      if (!repeatable) setQuestList((prevList) => prevList.filter((q) => q.title !== quest.title));
      // the slid-back card shows "accept" from its fx until here; now the player data agrees
      if (repeatable) setTimeout(() => setQuestCardFx(quest.title, null), 480);

      // FTUE: Trigger CollectedQuest when player collects their first quest reward
      await tryAdvanceFTUEByTrigger('CollectedQuest', currentPlayer.playerId, currentPlayer, setCurrentPlayer);

      // Show quest complete message with bonus if applicable
      if (bonusMessage) {
        updateStatus(`Action item complete! Received ${rewardQuantity} ${getLocalizedString(quest.reward, strings)}. ${bonusMessage}`);
      } else {
        updateStatus(201);
      }

    } catch (error) {
      console.error('Error collecting quest reward:', error);
      revertReward();
      gameAlert({ message: strings[2038] || "Couldn't collect the quest reward. Please try again." });
    }
  };


const handleGemPurchase = async (modifiedRecipe, actionType) => {
    // This is called by the gem button with a recipe modified to include gems
    // Route to the appropriate handler based on action type
    // Generate a transaction ID for gem purchases (these bypass the normal transaction mode)
    const gemTransactionId = `gem-${actionType}-${Date.now()}`;
    const gemTransactionKey = `gem-${actionType}-${modifiedRecipe.type}`;
    if (actionType === 'heal') {
      return handleHeal(gemTransactionId, gemTransactionKey, modifiedRecipe);
    } else if (actionType === 'trade') {
      return handleTrade(gemTransactionId, gemTransactionKey, modifiedRecipe);
    }
  };

// Protected function to execute healing using transaction system
  const handleHeal = async (transactionId, transactionKey, recipe) => {
    playersInGridManager.flushAfterTransaction();
    console.log(`🔒 [PROTECTED HEAL] Starting protected heal for ${recipe.type}`);
    setErrorMessage('');

    // Trigger prayer bubble animation
    setIsHealingAnimation(true);
    setTimeout(() => setIsHealingAnimation(false), 1500);

    if (!recipe) {
      setErrorMessage('Invalid healing recipe selected.');
      return;
    }

    // Fetch current HP and Max HP from playersInGridManager
    const gridId = currentPlayer?.location?.g;
    const playerId = currentPlayer._id?.toString();
    const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
    if (!playerInGridState) {
      console.error(`Player ${currentPlayer.username} not found in grid state.`);
      return;
    }
    const currentHp = playerInGridState.hp;
    const maxHp = playerInGridState.maxhp;

    // Check if healer has HP remaining
    const healerInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
    if (healerInGrid && healerInGrid.hp !== undefined && healerInGrid.hp <= 0) {
      updateStatus(`${getLocalizedString(npcData.type, strings)} has no heals remaining.`);
      return;
    }

    // Healing logic with NPCsInGrid HP
    if (npcData.output === 'hp') {
      if (currentHp >= maxHp) {
        updateStatus(401);  // Player is already at full HP
        return;
      }
    }

    const spendResult = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });
    if (!spendResult) {
      return;
    }

    // Refresh player to update money display
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

    const healAmount = npcData.qtycollected;
    const statToMod = 'hp';
    const amountToMod = Math.min(healAmount, maxHp - currentHp);  // Ensure it doesn't exceed max HP

    try {
      await modifyPlayerStatsInGridState(statToMod, amountToMod, currentPlayer._id, gridId);
      setCurrentPlayer((prev) => ({
        ...prev,
        hp: Math.min(prev.maxhp, prev.hp + amountToMod),
      }));
      soundManager.playSFX('heal');
      updateStatus(`${strings[405]}${amountToMod}`);

      // Deduct 1 HP from the healer NPC
      const currentHealerInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
      if (currentHealerInGrid && currentHealerInGrid.hp !== undefined) {
        const newHealerHP = currentHealerInGrid.hp - 1;

        if (newHealerHP <= 0) {
          // Remove the healer from the grid when HP reaches 0
          await NPCsInGridManager.removeNPC(gridId, npcData.id);
          updateStatus(`${getLocalizedString(npcData.type, strings)} has been exhausted and disappeared.`);
          onClose(); // Close the panel since the NPC is gone
        } else {
          // Update the healer's HP in the grid
          await NPCsInGridManager.updateNPC(gridId, npcData.id, { hp: newHealerHP });
        }
      }

      console.log(`✅ Heal completed: +${amountToMod} HP`);
    } catch (error) {
      console.error('Error applying healing:', error);
    }
  };

  // A minigame offer's outcome: a win pays the offer through the ordinary trade path (it costs
  // nothing), a loss runs the game's onLose (Prospero's riddle: three Dragons beside the player)
  const handleMinigameResult = async (recipe, correct) => {
    const game = MINIGAMES[recipe.minigame];
    setActiveMinigame(null);
    if (correct) {
      updateStatus(strings[game.winKey] || game.win);
      await handleTrade(`${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, `npc-minigame-${npcData.type}-${recipe.index}`, recipe);
      return;
    }
    updateStatus(strings[game.loseKey] || game.lose);
    const spawn = game.onLose?.spawn;
    if (!spawn) return;
    const gridId = currentPlayer.location?.g;
    const me = playersInGridManager.getPlayerPosition(gridId, String(currentPlayer._id || currentPlayer.playerId)) || { x: currentPlayer.location?.x, y: currentPlayer.location?.y };
    const tiles = GlobalGridStateTilesAndResources.getTiles() || [];
    const taken = new Set((GlobalGridStateTilesAndResources.getResources() || []).map(r => `${r.x},${r.y}`));
    const spot = [];
    for (let r = 2; r <= 5 && spot.length < (game.onLose.count || 1); r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
        const x = Math.round(me.x) + dx, y = Math.round(me.y) + dy;
        if (spot.length >= (game.onLose.count || 1)) break;
        if (x < 0 || y < 0 || !tiles[y] || tiles[y][x] === undefined || tiles[y][x] === 'w' || taken.has(`${x},${y}`)) continue;
        taken.add(`${x},${y}`);
        spot.push({ x, y });
      }
    }
    for (const pos of spot) await NPCsInGridManager.spawnNPC(gridId, spawn, pos);
    onClose?.(); // out of the panel: the dragons are on the board
  };

  // Protected function to execute trades using transaction system
  const handleTrade = async (transactionId, transactionKey, recipe, { named = false } = {}) => {
    // Silent account (docs/onboarding-plan.md §4.2): the Home Deed is where the player picks a name.
    // The modal re-runs this trade with `named` once /player/name has succeeded.
    if (recipe?.type === 'Home Deed' && currentPlayer?.named === false && !named) {
      setPendingDeedTrade({ transactionId, transactionKey, recipe });
      return;
    }
    playersInGridManager.flushAfterTransaction(); // NPC trade: save the position with it
    // the card's place, on the tap: the gain rises from it and flies into the header
    const tradeCardRect = recipe?.type
      ? document.querySelector(`[data-resource-type="${CSS.escape(recipe.type)}"] .resource-button`)?.getBoundingClientRect() || null
      : null;
    console.log(`🔒 [PROTECTED TRADE] Starting protected trade for ${recipe.type}`);
    setErrorMessage('');
    if (!recipe) {
      setErrorMessage('Invalid recipe selected.');
      return;
    }

    let quantityToGive = recipe.tradeqty || 1;
    // A trade can pay a skill (Hecate's Toil and Trouble): it joins player.skills, takes no room
    const gainsSkill = masterResources.find(res => res.type === recipe.type)?.category === 'skill';
    
    // Get relationship-based multiplier from RelationshipMatrix data
    const { multiplier, bonusMessage } = getRelationshipMultiplier(npcData.type, currentPlayer, strings);
    quantityToGive = Math.floor(quantityToGive * multiplier);
    
    // Check if we have room for the trade reward BEFORE spending ingredients
    const hasRoom = hasRoomFor({
      resource: recipe.type,
      quantity: quantityToGive,
      currentPlayer,
      inventory: inventory,  // Use current prop
      backpack: backpack,    // Use current prop
      masterResources,
      globalTuning
    });
    
    // Create safe copies after the capacity check
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];
    
    if (!hasRoom && !gainsSkill) {
      const isHomestead = currentPlayer?.location?.gtype === 'homestead';
      const isMoney = recipe.type === "Money";
      const isGem = recipe.type === "Gem";
      
      if (!isMoney && !isGem && !isHomestead) {
        // Check if player has backpack skill
        const hasBackpackSkill = currentPlayer?.skills?.some((item) => item.type === 'Backpack' && item.quantity > 0);
        if (!hasBackpackSkill) {
          updateStatus(19); // Missing backpack
        } else {
          updateStatus(21); // Backpack full
        }
      } else {
        updateStatus(20); // Warehouse full
      }
      return;
    }

    // On the tap (house rule), the Bank's motion: the offer pops away under a burst of sparkles,
    // the gain and its XP rise from it and fly home, and after a beat the same offer slides back
    // in from the left (trader offers are repeatable). A failed trade brings the card back at once.
    // 10+ Gem trades ask before the card animates (spendIngredients then uses this Yes)
    if (!(await confirmRecipeGemSpend(recipe, { leaveToken: true }))) return;
    const tradeSlot = `${recipe.source}-${recipe.index}`;
    const revertTradeCard = runCardReturn(setTradeFx, tradeSlot);
    soundManager.playSFX('skill_earned');
    try { navigator.vibrate?.(35); } catch (_) { /* no haptics here */ }
    const gainedResource = masterResources.find(res => res.type === recipe.type);
    const tradeXP = recipe.xp ?? masterResources.find(res => res.type === npcData.type && res.category === 'npc')?.xp ?? 1;
    showQuestRewardFloatingText(gainedResource?.symbol || '', getLocalizedString(recipe.type, strings), quantityToGive,
      tradeXP, tradeCardRect, questRewardFlyTo(recipe.type, gainedResource));

    const spendResult = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });

    if (!spendResult || (spendResult.success !== undefined && !spendResult.success)) {
      revertTradeCard();
      setErrorMessage('Not enough ingredients.');
      return;
    }
    
    if (gainsSkill) {
      const owned = currentPlayer.skills || [];
      const updatedSkills = owned.some(sk => sk.type === recipe.type) ? owned : [...owned, { type: recipe.type, category: 'skill', quantity: 1 }];
      try {
        await axios.post(`${API_BASE}/api/update-skills`, { playerId: currentPlayer.playerId, skills: updatedSkills });
        setCurrentPlayer(prev => ({ ...prev, skills: updatedSkills }));
        await trackQuestProgress(currentPlayer, 'Acquire', recipe.type, 1, setCurrentPlayer);
        await earnTrophy(currentPlayer.playerId, 'Skill Builder', 1, currentPlayer, null, setCurrentPlayer);
        updateStatus(`💪 ${getLocalizedString(recipe.type, strings)} skill acquired.`);
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
      } catch (error) {
        console.error('Skill trade failed:', error);
        revertTradeCard();
        setErrorMessage('Failed to complete trade.');
      }
      return;
    }

    // Use the updated inventory and backpack from spendIngredients
    const gained = await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: recipe.type,
      quantity: quantityToGive,
      inventory: spendResult.updatedInventory,  // Use the updated inventory
      backpack: spendResult.updatedBackpack,   // Use the updated backpack
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
      masterResources,
      globalTuning,
    });
    
    if (!gained) {
      revertTradeCard();
      setErrorMessage('Failed to complete trade.');
      return;
    }

    // Track quest progress for trading (using 'Collect' action to match quest system)
    await trackQuestProgress(currentPlayer, 'Collect', recipe.type, quantityToGive, setCurrentPlayer);

    // Award trophies for specific trade rewards
    try {
      if (recipe.type === "Home Deed") {
        // Create homestead if player doesn't have one yet
        if (!currentPlayer.gridId) {
          console.log(`🏠 Creating homestead for player ${currentPlayer.playerId}`);
          try {
            const homesteadResponse = await axios.post(`${API_BASE}/api/create-homestead`, {
              playerId: currentPlayer.playerId
            });

            if (homesteadResponse.data.success) {
              console.log(`✅ Homestead created: gridId=${homesteadResponse.data.gridId}, settlementId=${homesteadResponse.data.settlementId}`);
              // Update local player state with new homestead info
              setCurrentPlayer(prev => ({
                ...prev,
                gridId: homesteadResponse.data.gridId,
                settlementId: homesteadResponse.data.settlementId,
                homesteadGridCoord: homesteadResponse.data.homesteadGridCoord
              }));
            } else {
              console.error('❌ Homestead creation failed:', homesteadResponse.data);
              updateStatus('Failed to create homestead. Please try again.');
            }
          } catch (homesteadError) {
            console.error('❌ Error creating homestead:', homesteadError);
            updateStatus('Failed to create homestead. Please try again.');
            // Don't return - still award trophy and advance FTUE even if homestead fails
          }
        }

        console.log(`🏆 Awarding Homesteader trophy for trading Home Deed`);
        await earnTrophy(currentPlayer.playerId, "Homesteader", 1, currentPlayer, masterTrophies, setCurrentPlayer);
        // Try to advance FTUE if this is the player's first Home Deed purchase
        await tryAdvanceFTUEByTrigger('BoughtHomeDeed', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
      } else if (recipe.type === "Brass Bell") {
        console.log(`🏆 Awarding Brass Bell trophy for trading Brass Bell`);
        await earnTrophy(currentPlayer.playerId, "Brass Bell", 1, currentPlayer, masterTrophies, setCurrentPlayer);
      } else if (recipe.type === "Hope") {
        console.log(`🏆 Awarding Hope trophy for trading Hope`);
        await earnTrophy(currentPlayer.playerId, "Hope", 1, currentPlayer, masterTrophies, setCurrentPlayer);
      } else if (recipe.type === "Town Key") {
        // Try to advance FTUE when acquiring Town Key from Constable Elbow
        await tryAdvanceFTUEByTrigger('AcquiredTownKey', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
      }
    } catch (error) {
      console.error('❌ Error awarding trade trophy:', error);
      // Don't fail the trade if trophy awarding fails
    }

    // Award XP for trading with NPC (use trade-specific XP if available, else fall back to NPC's XP)
    const npcResourceForXP = masterResources.find(res => res.type === npcData.type && res.category === 'npc');
    const xpToAward = recipe.xp ?? npcResourceForXP?.xp ?? 1;
    try {
      const xpResponse = await axios.post(`${API_BASE}/api/addXP`, {
        playerId: currentPlayer.playerId,
        xpAmount: xpToAward
      });

      if (xpResponse.data.success) {
        // Update current player's XP locally
        setCurrentPlayer(prev => ({
          ...prev,
          xp: xpResponse.data.newXP
        }));
      }
    } catch (error) {
      console.error('❌ Error awarding XP for NPC trade:', error);
      // Don't fail the trade if XP award fails, just log it
    }

    // Build ingredient list for status message
    const ingredientList = [];
    
    // Check if using new format with requiresArray
    if (recipe.requiresArray && Array.isArray(recipe.requiresArray)) {
      recipe.requiresArray.forEach(req => {
        if (req.type && req.quantity) {
          ingredientList.push(`${req.quantity} ${req.type}`);
        }
      });
    } else {
      // Legacy format - check all numbered ingredients
      for (let i = 1; i <= 10; i++) {
        const ingredientType = recipe[`ingredient${i}`];
        const ingredientQty = recipe[`ingredient${i}qty`];
        if (ingredientType && ingredientQty) {
          ingredientList.push(`${ingredientQty} ${ingredientType}`);
        }
      }
    }
    const ingredientString = ingredientList.join(', ');
    
    // Show success message with bonus if applicable
    updateStatus(`Exchanged ${ingredientString} for ${quantityToGive} ${getLocalizedString(recipe.type, strings)}.${bonusMessage}`);
  };

  const handleSellNPC = async () => {
    // Verify developer status before executing
    const isStillDeveloper = await checkDeveloperStatus(currentPlayer?.username);
    if (!isStillDeveloper) {
      updateStatus('❌ Developer access required.');
      return;
    }

    if (!npcData || !npcData.id) {
      console.error('Cannot sell NPC: Missing NPC data or ID');
      return;
    }

    try {
      const gridId = currentPlayer.location.g;
      await NPCsInGridManager.removeNPC(gridId, npcData.id);
      updateStatus(`${getLocalizedString(npcData.type, strings)} has been removed from the grid.`);
      onClose(); // Close the panel after selling
    } catch (error) {
      console.error('Error selling NPC:', error);
      updateStatus(`❌ Failed to remove ${getLocalizedString(npcData.type, strings)}.`);
    }
  };


  // Look up the full NPC resource definition to get filename if available
  const npcResourceDef = masterResources.find(r => r.type === npcData.type && r.category === 'npc');

  // Build the title with either SVG image or emoji
  const panelTitle = npcResourceDef?.filename ? (
    <>
      <img
        src={`/assets/resources/${npcResourceDef.filename}`}
        alt={npcData.type}
        style={{ width: '24px', height: '24px', verticalAlign: 'middle', marginRight: '6px' }}
      />
      {getLocalizedString(npcData.type, strings)}
    </>
  ) : (
    getLocalizedString(npcData.type, strings)
  );

  // Sell section (UI/Panels/SellSection.js), developers only: removing a citizen refunds nothing
  // ("Sell (💰0)"); a citizen walks about, so no Move
  const sellFooter = sellSection({
    canSell: false,
    isDeveloper,
    resourceType: npcData.type,
    masterResources,
    refund: [],
    onSell: handleSellNPC,
    transactionKey: `sell-npc-${npcData.id}`,
  });

  // the trade list: its own section for traders, inside the quest section for a giver who also trades
  const tradeSection = (npcData.action === 'trade' || (npcData.action === 'quest' && tradeRecipes.length > 0)) && (
      <div className="trade-options">

        {/* Relationship Card - only show if NPC doesn't have output='noRel' */}
        {/* Hidden during FTUE for Constable Elbow to simplify the tutorial UI; a quest giver
            already shows it in its quest section */}
        {!hideRelationshipUI && npcData.action !== 'quest' && (() => {
          const npcResource = masterResources.find(r => r.type === npcData.type && r.category === 'npc');
          const shouldHideRelationship = npcResource?.output === 'noRel';

          if (shouldHideRelationship) {
            return null;
          }

          return (
            <RelationshipCard
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          targetName={npcData.type}
          targetType="npc"
          targetEmoji={npcData.symbol}
          showActions={true}
          compact={false}
          masterInteractions={masterInteractions}
          updateStatus={updateStatus}
          masterResources={masterResources}
          playerPosition={(() => {
            const gridId = currentPlayer?.location?.g;
            const playerId = currentPlayer._id?.toString();
            const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
            return playerInGridState?.position || null;
          })()}
          targetPosition={(() => {
            const gridId = currentPlayer?.location?.g;
            const npcInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
            return npcInGrid?.position || null;
          })()}
          TILE_SIZE={TILE_SIZE}
          checkDistance={() => {
            // No range restriction on own homestead
            const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
            if (isOnOwnHomestead) return true;

            // Get player position
            const gridId = currentPlayer?.location?.g;
            const playerId = currentPlayer._id?.toString();
            const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
            if (!playerInGridState?.position) return false;

            // Get NPC position
            const npcInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
            if (!npcInGrid?.position) return false;

            // Calculate distance
            const distance = calculateDistance(playerInGridState.position, npcInGrid.position);
            const playerRange = getDerivedRange(currentPlayer, masterResources);

            return distance <= playerRange;
          }}
          onInteractionClick={() => {
            return new Promise((resolve) => {
              // Capture relationship state before interaction for StoryModal check
              const rel = currentPlayer.relationships?.find(r => r.name === npcData.type);
              preInteractionRelationshipRef.current = rel ? { ...rel } : null;

              // Just center camera on player using current zoom level
              // Pass grid and settlement positions for unified world model
              const gridId = currentPlayer?.location?.g;
              const playerId = currentPlayer._id?.toString();
              const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
              if (playerInGridState?.position) {
                centerCameraOnPlayer(
                  playerInGridState.position,
                  TILE_SIZE,
                  1, // zoomScale
                  0, // retryCount
                  currentGridPosition,
                  currentSettlementPosition
                );
              }
              resolve();
            });
          }}
          onRelationshipChange={(interaction, success) => {
            // Check if a new relationship status was added
            if (success && interaction.relbitadd) {
              const statusKey = interaction.relbitadd.toLowerCase();
              const preRel = preInteractionRelationshipRef.current;

              // If status wasn't present before, show StoryModal
              if (!preRel || !preRel[statusKey]) {
                // Check if this NPC has dialog for this relationship type
                const npcMatrix = RelationshipMatrix.find(r => r.type === npcData.type);
                const dialogKeyMap = {
                  met: 'dialogOnMet',
                  friend: 'dialogOnFriend',
                  married: 'dialogOnMarried',
                  love: 'dialogOnLove',
                  rival: 'dialogOnRival',
                };
                const dialogKey = dialogKeyMap[statusKey];

                if (npcMatrix && dialogKey && npcMatrix[dialogKey]) {
                  setStoryRelationshipType(statusKey);
                  setStoryModalOpen(true);
                }
              }
            }
          }}
          isDeveloper={isDeveloper}
        />
          );
        })()}


        {/* Show message if trade interaction is not available due to relationship */}
        {!canTrade && (
          <div className="text-hint" style={{
            padding: '10px',
            backgroundColor: 'var(--color-bg-light)',
            borderRadius: 'var(--radius-sm)',
            marginTop: '10px',
            textAlign: 'center'
          }}>
            {strings[626]}{npcData.type}.
          </div>
        )}

        {/* Show message if some trades are hidden due to relationship requirements */}
        {/* Hidden during FTUE for Constable Elbow to simplify the tutorial UI */}
        {!hideRelationshipUI && canTrade && hasHiddenTrades && (
          <div className="text-hint" style={{
            padding: '10px',
            backgroundColor: 'var(--color-bg-light)',
            borderRadius: 'var(--radius-sm)',
            marginTop: '10px',
            textAlign: 'center'
          }}>
            {strings[628]?.replace('{npc}', npcData?.type || '')}
          </div>
        )}

        {canTrade && (
          <>
            <h3>{strings[420]}</h3>
            {tradeRecipes.length > 0 ? (
              (() => {
                const filteredRecipes = tradeRecipes.filter((recipe) => {
                  // Check the trader offer's repeat flag (from traders.json)
                  // If repeat is false and player already has it, filter it out
                  if (recipe.repeat === false) {
                    // Check if player has this item in inventory or backpack
                    const hasInInventory = inventory?.some(item => item.type === recipe.type);
                    const hasInBackpack = backpack?.some(item => item.type === recipe.type);
                    const hasAsSkill = currentPlayer?.skills?.some(item => item.type === recipe.type);

                    if (hasInInventory || hasInBackpack || hasAsSkill) {
                      return false; // Don't show this offer
                    }
                  }

                  return true; // Show all other offers
                });
                
                // If all trades were filtered out, show a message
                if (filteredRecipes.length === 0) {
                  return <p>{strings[423]}</p>;
                }
                
                return filteredRecipes.map((recipe) => {
                const affordable = canAfford(recipe, inventory, backpack, 1);
                // For traders, treat 'devonly' as no skill requirement (devonly is used to hide from FarmHand, not traders)
                const meetsSkillRequirement = recipe.requires === 'devonly' ? true : hasRequiredSkill(recipe.requires);
                const meetsLevel = meetsLevelRequirement(recipe.level);
                const requirementsMet = meetsSkillRequirement && meetsLevel;
                const quantityToGive = recipe.tradeqty || 1;

                // Format costs with color per ingredient (matching CraftingStation.js style)
                // Support dynamic number of ingredients based on whether data comes from masterTraders or legacy format
                let formattedCosts = '';

                // Check if this recipe has a 'requiresArray' array (from masterTraders)
                if (recipe.requiresArray && Array.isArray(recipe.requiresArray)) {
                  // New format from masterTraders - dynamic number of ingredients
                  formattedCosts = recipe.requiresArray.map((req) => {
                    const type = req.type;
                    const qty = req.quantity;
                    if (!type || !qty) return '';

                    const playerQty = getPlayerQuantity(type, inventory, backpack); // backpack + warehouse
                    const color = playerQty >= qty ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                    const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                    return `<span data-resource="${type}" data-short="${playerQty < qty ? 1 : 0}" style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
                  }).join('');
                } else {
                  // Legacy format - check ingredient1 through ingredientN
                  const ingredientsList = [];
                  for (let i = 1; i <= 10; i++) { // Check up to 10 ingredients for safety
                    const type = recipe[`ingredient${i}`];
                    const qty = recipe[`ingredient${i}qty`];
                    if (!type || !qty) continue;

                    const playerQty = getPlayerQuantity(type, inventory, backpack); // backpack + warehouse
                    const color = playerQty >= qty ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                    const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                    ingredientsList.push(`<span data-resource="${type}" data-short="${playerQty < qty ? 1 : 0}" style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`);
                  }
                  formattedCosts = ingredientsList.join('');
                }

                // Get XP for this trade (use trade-specific XP if available, else fall back to NPC's XP)
                const npcResourceForXP = masterResources.find(res => res.type === npcData.type && res.category === 'npc');
                const xpToAward = recipe.xp ?? npcResourceForXP?.xp ?? 1;

                const levelColor = meetsLevel ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                const details =
                  (recipe.level ? `<span style="color: ${levelColor};">${strings[10149] || 'Level'} ${recipe.level}</span>` : '') +
                  `${strings[461]}<div>${formattedCosts}</div><div style="margin-top: 8px; color: var(--color-text-positive);">🔷 +${xpToAward} XP</div>`;

                const isDisabled = !affordable || !requirementsMet;

                return (
                  <div
                    key={`${recipe.source}-${recipe.index}`}
                    className="trader-offer-wrap"
                    onClick={(e) => {
                      // A tap anywhere on an offer the player cannot afford opens ResourceModalSmall
                      // for the first requirement they are short of (NPCsPanel.css lets the tap through).
                      if (affordable || !isDisabled) return;
                      const line = e.currentTarget.querySelector('[data-resource][data-short="1"]') || e.currentTarget.querySelector('[data-resource]');
                      if (line) setInfoResource(line.dataset.resource);
                    }}
                  >
                  <div className={tradeFx?.slot === `${recipe.source}-${recipe.index}` ? `card-fx-${tradeFx.phase}` : ''}>
                  {recipe.minigame && MINIGAMES[recipe.minigame] ? (
                  <MinigameButton
                    recipe={recipe}
                    quantity={quantityToGive}
                    disabled={!requirementsMet}
                    onStart={(r) => setActiveMinigame({ recipe: r })}
                    meetsLevelRequirement={meetsLevel}
                  />
                  ) : (
                  <ResourceButton
                    resourceType={recipe.type}
                    symbol={recipe.symbol}
                    name={`${quantityToGive} ${getLocalizedString(recipe.type, strings)}`}
                    details={details}
                    disabled={isDisabled}
                    onClick={undefined}
                    isTransactionMode={true}
                    transactionKey={`npc-trade-${npcData.type}-${recipe.type}-${recipe.index}`}
                    onTransactionAction={(transactionId, transactionKey) => handleTrade(transactionId, transactionKey, recipe)}
                    meetsLevelRequirement={meetsLevel}
                    resource={recipe}
                    inventory={inventory}
                    backpack={backpack}
                    masterResources={masterResources}
                    currentPlayer={currentPlayer}
                    devOnly={false}
                  />
                  )}
                  </div>
                  {tradeFx?.slot === `${recipe.source}-${recipe.index}` && <SaleBurst key={tradeFx.id} />}
                  </div>
                );
                });
              })()
            ) : (
              <p>{strings[423]}</p>
            )}
            
          </>
        )}

        {/* The "when you met" story is now the first entry in Clues (CluesModal.js) */}
      </div>
  );

  return (
    <>
    <Panel footer={sellFooter} onClose={onClose} descriptionKey="1013" title={panelTitle} panelName="NPCPanel">
      <div className="station-panel-container">
        <div className="station-panel-content">
          {/* Travel with Snug: first thing on Snug's panel, once the player has greeted him */}
          {canTravelWithSnug && (
            <div className="shared-buttons">
              <button className="btn-basic btn-success" onClick={() => setSnugTravelOpen(true)}>
                {strings[10191] || 'Travel with Snug'}
              </button>
            </div>
          )}
          <CitizenStatusLine npc={npcData} gridId={currentPlayer?.location?.g} />

          {/* Clues, then who and what this NPC cares about (one compact row): first after the status line */}
          {!hideRelationshipUI && (() => {
            const rel = currentPlayer.relationships?.find(r => r.name === npcData.type);
            const count = cluesFor(npcData.type, rel, strings, currentPlayer?.username).length;
            return (
              <>
                {count > 0 && (
                  <div className="shared-buttons">
                    <button className="btn-basic btn-neutral" onClick={() => setCluesOpen(true)}>
                      🔍 {strings[2100] || 'Clues'} ({count})
                    </button>
                  </div>
                )}
                <NPCConnections npcType={npcData.type} relationship={rel} masterResources={masterResources} strings={strings} />
              </>
            );
          })()}

{/* //////////////////// QUESTS //////////////////////// */}

      {npcData.action === 'quest' && (
        <div className="quest-options">

          {/* Relationship Card - only show if NPC doesn't have output='noRel' */}
          {(() => {
            // Hide for NPCs without relationship system (e.g., The Shepherd)
            if (hideRelationshipUI) return null;

            const npcResource = masterResources.find(r => r.type === npcData.type && r.category === 'npc');
            const shouldHideRelationship = npcResource?.output === 'noRel';

            if (shouldHideRelationship) {
              return null;
            }

            return (
              <RelationshipCard
            currentPlayer={currentPlayer}
            setCurrentPlayer={setCurrentPlayer}
            targetName={npcData.type}
            targetType="npc"
            targetEmoji={npcData.symbol}
            showActions={true}
            compact={false}
            masterInteractions={masterInteractions}
            updateStatus={updateStatus}
            masterResources={masterResources}
            playerPosition={(() => {
              const gridId = currentPlayer?.location?.g;
              const playerId = currentPlayer._id?.toString();
              const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
              return playerInGridState?.position || null;
            })()}
            targetPosition={(() => {
              const gridId = currentPlayer?.location?.g;
              const npcInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
              return npcInGrid?.position || null;
            })()}
            TILE_SIZE={TILE_SIZE}
            checkDistance={() => {
              // No range restriction on own homestead
              const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
              if (isOnOwnHomestead) return true;

              // Get player position
              const gridId = currentPlayer?.location?.g;
              const playerId = currentPlayer._id?.toString();
              const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
              if (!playerInGridState?.position) return false;

              // Get NPC position
              const npcInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
              if (!npcInGrid?.position) return false;

              // Calculate distance
              const distance = calculateDistance(playerInGridState.position, npcInGrid.position);
              const playerRange = getDerivedRange(currentPlayer, masterResources);

              return distance <= playerRange;
            }}
            onInteractionClick={() => {
              return new Promise((resolve) => {
                // Capture relationship state before interaction for StoryModal check
                const rel = currentPlayer.relationships?.find(r => r.name === npcData.type);
                preInteractionRelationshipRef.current = rel ? { ...rel } : null;

                // Just center camera on player using current zoom level
                // Pass grid and settlement positions for unified world model
                const gridId = currentPlayer?.location?.g;
                const playerId = currentPlayer._id?.toString();
                const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
                if (playerInGridState?.position) {
                  centerCameraOnPlayer(
                    playerInGridState.position,
                    TILE_SIZE,
                    1, // zoomScale
                    0, // retryCount
                    currentGridPosition,
                    currentSettlementPosition
                  );
                }
                resolve();
              });
            }}
            onRelationshipChange={(interaction, success) => {
              // Check if a new relationship status was added
              if (success && interaction.relbitadd) {
                const statusKey = interaction.relbitadd.toLowerCase();
                const preRel = preInteractionRelationshipRef.current;

                // If status wasn't present before, show StoryModal
                if (!preRel || !preRel[statusKey]) {
                  // Check if this NPC has dialog for this relationship type
                  const npcMatrix = RelationshipMatrix.find(r => r.type === npcData.type);
                  const dialogKeyMap = {
                    met: 'dialogOnMet',
                    friend: 'dialogOnFriend',
                    married: 'dialogOnMarried',
                    love: 'dialogOnLove',
                    rival: 'dialogOnRival',
                  };
                  const dialogKey = dialogKeyMap[statusKey];

                  if (npcMatrix && dialogKey && npcMatrix[dialogKey]) {
                    setStoryRelationshipType(statusKey);
                    setStoryModalOpen(true);
                  }
                }
              }
            }}
            isDeveloper={isDeveloper}
          />
            );
          })()}


          {/* a giver who also trades (Constable Elbow): trades first, then quests (owner 2026-10-24) */}
          {tradeSection}

          {/* Show message if quest interaction is not available due to relationship */}
          {!canQuest && (
            <div className="text-hint" style={{
              padding: '10px',
              backgroundColor: 'var(--color-bg-light)',
              borderRadius: 'var(--radius-sm)',
              marginTop: '10px',
              textAlign: 'center'
            }}>
              {strings[625]}{npcData.type}.
            </div>
          )}

          {canQuest && hasHiddenQuests && (
            <div className="text-hint" style={{
              padding: '10px',
              backgroundColor: 'var(--color-bg-light)',
              borderRadius: 'var(--radius-sm)',
              marginTop: '10px',
              textAlign: 'center'
            }}>
              {strings[627]?.replace('{npc}', npcData?.type || '')}
            </div>
          )}

          {canQuest && displayQuests.length === 0 && !hasHiddenQuests && (
            <div className="text-empty" style={{
              padding: '10px',
              backgroundColor: 'var(--color-bg-light)',
              borderRadius: 'var(--radius-sm)',
              marginTop: '10px',
              textAlign: 'center',
              whiteSpace: 'pre-line' // the string's two sentences sit on two lines
            }}>
              {strings[205]}
            </div>
          )}

          {canQuest && (
            <>
              {displayQuests.length > 0 && (
                <h3>{strings[204]}</h3>
              )}
              {displayQuests.map((quest) => {
            const fx = questFx[quest.title];
            const isRewardable = currentPlayer.activeQuests.some(
              (q) => q.questId === quest.title && q.completed && !q.rewardCollected
            );

            // a repeatable quest that has just been collected slides back in as a fresh offer
            const state = fx?.type === 'slidein' ? 'accept' : isRewardable ? 'reward' : 'accept';
            // a quest already held and done is always claimable: the FTUE hands over Elbow's L3
            // story step at L2 (FTUEsteps addQuests), and its reward is what lifts the player to L3
            const questMeetsLevel = state === 'reward' || meetsLevelRequirement(quest.level);

            // Get XP for this quest (use quest-specific XP if available, else fall back to NPC's XP)
            const npcResourceForXP = masterResources.find(res => res.type === npcData.type && res.category === 'npc');
            const xpToAward = quest.xp ?? npcResourceForXP?.xp ?? 1;

            // Transaction key for spam-click protection
            const transactionKey = state === 'reward'
              ? `quest-reward-${npcData.type}-${quest.title}`
              : `quest-accept-${npcData.type}-${quest.title}`;

            return (
              <div key={quest.title} className="quest-slot" data-quest-slot={quest.title}>
                {/* not keyed by the fx: remounting would drop the button's transaction lock mid-call;
                    a class change restarts the animation */}
                <div className={`quest-slot-card ${fx ? `card-fx-${fx.type}` : ''}`}>
                  <QuestGiverButton
                    quest={{
                      symbol: quest.symbol,
                      title: quest.title,
                      textbody: quest.textbody,
                      goals: [
                        { action: quest.goal1action, item: quest.goal1item, qty: quest.goal1qty },
                        { action: quest.goal2action, item: quest.goal2item, qty: quest.goal2qty },
                        { action: quest.goal3action, item: quest.goal3item, qty: quest.goal3qty },
                      ],
                      reward: quest.reward,
                      rewardqty: quest.rewardqty,
                    }}
                    state={state}
                    isTransactionMode={true}
                    transactionKey={transactionKey}
                    onTransactionAction={(txId, txKey) =>
                      state === 'reward'
                        ? handleGetReward(txId, txKey, quest)
                        : handleAcceptQuest(txId, txKey, quest.title)
                    }
                    xpReward={xpToAward}
                    level={quest.level}
                    meetsLevelRequirement={questMeetsLevel}
                    noClickSfx={state === 'reward'}
                    masterResources={masterResources}
                  />
                </div>
                {fx?.type === 'pop' && <SaleBurst key={`burst-${fx.id}`} />}
              </div>
            );
              })}
            </>
          )}
          
        </div>
      )}


{/* //////////////////// HEALING //////////////////////// */}

      {npcData.action === 'heal' && healRecipes.length > 0 && (
        <div className="heal-options">
          {/* Render healer interaction animation when healing */}
          <HealerInteraction
            isHealing={isHealingAnimation}
            currentPlayer={currentPlayer}
            TILE_SIZE={TILE_SIZE}
            healAmount={npcData.qtycollected}
            onHealingComplete={() => setIsHealingAnimation(false)}
          />
<br />
          {/* Fetch and display player's HP from playersInGridManager */}
          {(() => {
            const gridId = currentPlayer?.location?.g;
            const playerId = currentPlayer._id?.toString();
            const playerInGridState = playersInGridManager.getPlayersInGrid(gridId)?.[playerId];
<br />
            if (playerInGridState) {
              return (
                <>
                  <h3>{strings[511]} <br />{playerInGridState.hp} / {playerInGridState.maxhp}</h3>
                </>
              );
            } else {
              return <h4>{strings[512]}</h4>;
            }
          })()}
<br />
          {healRecipes.map((recipe) => {
            const ingredients = getIngredientDetails(recipe, masterResources);
            const affordable = canAfford(recipe, inventory, 1);
            const healAmount = recipe.qtycollected; // Healing value

            // Check if healer has HP remaining
            const gridId = currentPlayer?.location?.g;
            const healerInGrid = NPCsInGridManager.getNPCsInGrid(gridId)?.[npcData.id];
            const healerOutOfHP = healerInGrid && healerInGrid.hp !== undefined && healerInGrid.hp <= 0;

            // Get the NPC template from masterResources to find maxhp
            const npcTemplate = masterResources.find(res => res.type === npcData.type && res.category === 'npc');
            const totalHeals = npcTemplate?.maxhp || 'Unknown';

            return (
              <div key={recipe.type}>
                <ResourceButton
                  symbol={recipe.symbol}
                  name={getLocalizedString(recipe.type, strings)}
                  details={`${strings[463]} ❤️‍🩹 +${healAmount}<br>${strings[461]} ${ingredients.join(', ') || 'None'}`}
                  info={`${strings[51]}${totalHeals}`}
                  disabled={!affordable || healerOutOfHP}
                  onClick={undefined}
                  isTransactionMode={true}
                  transactionKey={`npc-heal-${npcData.type}-${recipe.type}`}
                  onTransactionAction={(transactionId, transactionKey) => handleHeal(transactionId, transactionKey, recipe)}
                  // Gem purchase props - gemCost=null so dynamic calculation is used for missing ingredients
                  gemCost={null}
                  onGemPurchase={(recipe.gemcost && !affordable && !healerOutOfHP) ? (modifiedRecipe) => handleGemPurchase(modifiedRecipe, 'heal') : null}
                  resource={recipe}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources}
                  currentPlayer={currentPlayer}
                />
                {/* Display healer's HP below the ResourceButton */}
                {healerInGrid && healerInGrid.hp !== undefined && (
                  <div className="healer-hp-text">
                    {strings[49]} {healerInGrid.hp}
                  </div>
                )}
              </div>
            );
          })}
          {errorMessage && <p className="error-message">{errorMessage}</p>}
        </div>
      )}

{/* //////////////////// TRADING //////////////////////// */}

      {npcData.action !== 'quest' && tradeSection}

        </div>
        
      </div>

      {cluesOpen && (
        <CluesModal
          npcType={npcData?.type}
          relationship={currentPlayer.relationships?.find(r => r.name === npcData?.type)}
          username={currentPlayer?.username}
          onClose={() => setCluesOpen(false)}
        />
      )}

      {/* Story Modal for relationship milestone dialogs */}
      <StoryModal
        isOpen={storyModalOpen}
        onClose={() => {
          setStoryModalOpen(false);
          setStoryDialogKey(null);
          // Greeting Sebastian for the first time: Viola rises from the lake and the twins meet
          if (npcData?.type === 'Sebastian' && storyRelationshipType === 'met') {
            import('../Story/violaReunion').then(({ startViolaReunion }) => startViolaReunion({
              currentPlayer, setCurrentPlayer, setInventory, setBackpack, updateStatus, TILE_SIZE, masterResources, strings,
            }));
          }
          // Advance FTUE when first meeting Constable Elbow
          if (npcData?.type === 'Constable Elbow' && storyRelationshipType === 'met') {
            tryAdvanceFTUEByTrigger('MetConstableElbow', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
          }
        }}
        npcName={npcData?.type}
        relationshipType={storyRelationshipType}
        dialogKey={storyDialogKey || undefined}
        username={currentPlayer?.username}
        npcFilename={npcData?.filename}
      />
    </Panel>
    {snugTravelOpen && (
      <SnugTravelModal
        currentPlayer={currentPlayer}
        inventory={inventory}
        backpack={backpack}
        setInventory={setInventory}
        setBackpack={setBackpack}
        setCurrentPlayer={setCurrentPlayer}
        masterResources={masterResources}
        updateStatus={updateStatus}
        onTravel={onSnugTravel}
        onClose={() => setSnugTravelOpen(false)}
      />
    )}
    {activeMinigame && MINIGAMES[activeMinigame.recipe.minigame]?.kind === 'riddle' && (
      <RiddleMinigame
        game={MINIGAMES[activeMinigame.recipe.minigame]}
        onClose={() => setActiveMinigame(null)}
        onAnswer={(correct) => handleMinigameResult(activeMinigame.recipe, correct)}
      />
    )}
    {infoResource && <ResourceModalSmall resourceType={infoResource} masterResources={masterResources} onClose={() => setInfoResource(null)} />}
    {pendingDeedTrade && (
      <NameDeedModal
        currentPlayer={currentPlayer}
        setCurrentPlayer={setCurrentPlayer}
        onCancel={() => setPendingDeedTrade(null)}
        onNamed={async () => {
          const t = pendingDeedTrade;
          setPendingDeedTrade(null);
          await handleTrade(t.transactionId, t.transactionKey, t.recipe, { named: true });
        }}
      />
    )}
    </>
  );
};

export default React.memo(NPCPanel);
