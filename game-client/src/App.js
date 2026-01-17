import './UI/Styles/theme.css';  /* Import theme variables first */
import './App.css';
import './GameFeatures/Chat/Chat.css';
import './VFX/VFX.css';
import './UI/Buttons/SharedButtons.css';
import './Render/Tooltip.css';
import axios from 'axios';
import API_BASE from './config.js';
import Chat from './GameFeatures/Chat/Chat';
import React, { useContext, useState, useEffect, useLayoutEffect, memo, useMemo, useCallback, useRef, act } from 'react';
import { registerNotificationClickHandler } from './UI/Notifications/Notifications';
import { initializeGrid } from './AppInit';
import { loadMasterSkills, loadMasterResources, loadMasterInteractions, loadGlobalTuning, loadMasterTraders, loadMasterTrophies, loadMasterWarehouse, loadMasterXPLevels, loadFTUEsteps } from './Utils/TuningManager';
import { RenderTilesCanvas } from './Render/RenderTilesCanvas';
import { RenderTilesCanvasV2 } from './Render/RenderTilesCanvasV2';
import { RenderResources } from './Render/RenderResources';
import { RenderNPCs } from './Render/RenderNPCs';
import { RenderPCs } from './Render/RenderPCs';
import { RenderDynamicElements, checkQuestNPCStatus, checkTradeNPCStatus, checkKentNPCStatus, generateResourceTooltip, generateNPCTooltip, generatePCTooltip } from './Render/RenderDynamicElements';
import CursorTileHighlight from './Render/CursorTileHighlight';
import { handleResourceClick } from './ResourceClicking';
import { isMobile } from './Utils/appUtils';
import { useUILock } from './UI/UILockContext';
import questCache from './Utils/QuestCache';

import socket from './socketManager';
import {
  socketListenForPCJoinAndLeave,
  socketListenForPCstateChanges,
  socketListenForNPCStateChanges,
  socketListenForResourceChanges,
  socketListenForTileChanges,
  socketListenForNPCControllerStatus,
  socketListenForSeasonReset,
  socketListenForPlayerConnectedAndDisconnected,
  socketListenForConnectAndDisconnect,
  socketListenForChatMessages,
  socketListenForBadgeUpdates,
  socketListenForStoreBadgeUpdates,
} from './socketManager';

import farmState from './FarmState';
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import FTUE from './GameFeatures/FTUE/FTUE';
import FTUEDoinker from './GameFeatures/FTUE/FTUEDoinker';

import playersInGridManager from './GridState/PlayersInGrid';
import { usePlayersInGrid, useGridStatePCUpdate } from './GridState/GridStatePCContext';
import NPCsInGridManager from './GridState/GridStateNPCs.js';
import { useGridState, useGridStateUpdate } from './GridState/GridStateContext';
import npcController from './GridState/NPCController';

import SettlementView from './ZoomedOut/SettlementView';
import FrontierView from './ZoomedOut/FrontierView';
import FrontierMiniMap from './ZoomedOut/FrontierMiniMap';

import Modal from './UI/Modals/Modal';
import RevivalModal from './UI/Modals/RevivalModal';
import LevelUpModal from './UI/Modals/LevelUpModal';
import LanguagePickerModal from './UI/Modals/LanguagePickerModal';
import { useStrings } from './UI/StringsContext';
import LANGUAGE_OPTIONS from './UI/Languages.json';
import { getMayorUsername } from './GameFeatures/Government/GovUtils';
import { getDerivedLevel } from './Utils/playerManagement';

import ProfilePanel from './Authentication/ProfilePanel';
import LoginPanel from './Authentication/LoginPanel';
import DebugPanel from './Utils/debug';
import InventoryPanel from './GameFeatures/Inventory/InventoryPanel';
import WarehousePanel from './GameFeatures/Inventory/WarehousePanel';
import TrophyPanel from './GameFeatures/Trophies/TrophyPanel.js';
import HowToPanel from './UI/Panels/HowToPanel';
import HowToMoneyPanel from './UI/Panels/HowToMoneyPanel';
import HowToGemsPanel from './UI/Panels/HowToGemsPanel';
import QuestPanel from './GameFeatures/Quests/QuestPanel';
import NPCPanel from './GameFeatures/NPCs/NPCsPanel.js';
import BuildPanel from './GameFeatures/Build/BuildPanel';
import BuyPanel from './GameFeatures/Buy/BuyPanel';
import PetsPanel from './GameFeatures/Pets/PetsPanel';
import BuyDecoPanel from './GameFeatures/Deco/BuyDecoPanel';
import FarmingPanel from './GameFeatures/Farming/FarmingPanel';
import ToolsPanel from './GameFeatures/Farming/ToolsPanel';
import SkillsPanel from './GameFeatures/Skills/SkillsPanel';
import GovPanel from './GameFeatures/Government/GovPanel';
import LeaderboardPanel from './GameFeatures/Leaderboard/Leaderboard';
import BankPanel from './GameFeatures/Trading/Bank';
import KentPanel from './GameFeatures/Trading/Kent';
import NewTrainPanel from './GameFeatures/Trading/NewTrain';
import CarnivalPanel from './GameFeatures/Carnival/Carnival';
import CourthousePanel from './GameFeatures/Government/Courthouse';

import CraftingStation from './GameFeatures/Crafting/CraftingStation';
import FarmHouse from './GameFeatures/Crafting/FarmHouse';
import FarmHandPanel from './GameFeatures/FarmHands/FarmHand.js';
import ShopStation from './GameFeatures/Crafting/ShopStation';
import ScrollStation from './GameFeatures/Crafting/ScrollStation';
import PetPanel from './GameFeatures/Pets/PetPanel';
import AnimalStall from './GameFeatures/FarmAnimals/AnimalStall';
import AnimalPanel from './GameFeatures/FarmAnimals/FarmAnimals.js';
import CropPanel from './GameFeatures/Farming/CropPanel.js';
import DecoPanel from './GameFeatures/Deco/DecoPanel';
import TradeStall from './GameFeatures/Trading/TradeStall';
import Outpost from './GameFeatures/Trading/Outpost';
import Mailbox from './GameFeatures/Mailbox/Mailbox';
import Store from './Store/Store';
import OffSeasonModal from './GameFeatures/Seasons/OffSeasonModal.js';
import TownNews from './UI/Modals/TownNews.js';
import SeasonPanel from './GameFeatures/Seasons/SeasonPanel';
import SocialPanel from './GameFeatures/Social/SocialPanel';
import CombatPanel from './GameFeatures/Combat/CombatPanel';
import GoldBenefitsPanel from './UI/Panels/GoldBenefitsPanel';
import ShareModal from './UI/Modals/ShareModal';

import { usePanelContext } from './UI/Panels/PanelContext';
import { useModalContext } from './UI/ModalContext';
import { checkDeveloperStatus, updateBadge, getBadgeState } from './Utils/appUtils';
import { useBulkOperation } from './UI/BulkOperationContext';
import FloatingTextManager from './UI/FloatingText';
import StatusBar from './UI/StatusBar/StatusBar';
import { StatusBarContext } from './UI/StatusBar/StatusBar';
import { formatCountdown } from './UI/Timers';
import StartScreenAnimation from './UI/StartScreenAnimation';
import TransitionOverlay from './UI/TransitionOverlay';
import { useTransitionFade } from './UI/useTransitionFade';

import { fetchGridData, updateGridStatus, isWallBlocking, getLineOfSightTiles } from './Utils/GridManagement';
import { handleKeyMovement, handleKeyDown as handleMovementKeyDown, handleKeyUp as handleMovementKeyUp, centerCameraOnPlayer, centerCameraOnPlayerFast } from './PlayerMovement';
import { mergeResources, mergeTiles, enrichResourceFromMaster } from './Utils/ResourceHelpers.js';
import { fetchHomesteadOwner, calculateDistance } from './Utils/worldHelpers.js';
import { getDerivedRange } from './Utils/worldHelpers';
import { handlePlayerDeath } from './Utils/playerManagement';
import Redirect, { shouldRedirect } from './Redirect';

// FTUE Cave dungeon grid ID - this dungeon doesn't use the normal timer system
const FTUE_CAVE_GRID_ID = '695bd5b76545a9be8a36ee22';

function App() {
  // Check if we should redirect (must be before hooks for consistent evaluation)
  const showRedirect = shouldRedirect();

  const appInstanceId = Math.floor(Math.random() * 10000);
//console.log(`🧩 App mounted. Instance ID: ${appInstanceId}`);

useEffect(() => {
  const id = Math.floor(Math.random() * 10000);
  console.log(`🧩 App mounted. Instance ID: ${id}`);
  console.trace();
}, []);

useEffect(() => {
  const appEl = document.getElementById('root');
  console.log("📦 App mounted. Parent contents:", appEl?.innerHTML?.slice(0, 200));
  return () => {
    console.log("💥 App unmounted.");
  };
}, []);


  const strings = useStrings();
  const { uiLocked } = useUILock();
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [isMayor, setIsMayor] = useState(false);
  // Canvas rendering mode variables removed - now forced to Canvas mode
  const { activeModal, setActiveModal, openModal, closeModal } = useModalContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', message: '', message2: '' });
  const [isRevivalModalOpen, setIsRevivalModalOpen] = useState(false);
  const [revivalPending, setRevivalPending] = useState(false);
  const { updateStatus } = useContext(StatusBarContext);
  
  // Level-up detection state
  const [currentLevel, setCurrentLevel] = useState(null);
  const [isLevelUpModalOpen, setIsLevelUpModalOpen] = useState(false);
  const [levelUpData, setLevelUpData] = useState({ currentLevel: 0, previousLevel: 0 });
  const bulkOperationContext = useBulkOperation();
  
  // Initialize transition fade functionality
  const { isTransitioning, startTransition, endTransition } = useTransitionFade();
  const transitionFadeControl = {
    startTransition,
    endTransition,
    isTransitioning: () => isTransitioning
  };

  // Mobile device detection: Show modal if on mobile
  useEffect(() => {
    if (isMobile()) {
      setModalContent({
        title: 'Unsupported Device',
        size: 'small',
        children: (
          <div style={{ fontSize: '1rem', textAlign: 'center', padding: '1rem' }}>
            🚫 This game is intended for desktop browsers only.<br /><br />
            Please revisit on a laptop or desktop computer.
          </div>
        ),
        onClose: () => {},
      });
      setIsModalOpen(true);
    }
  }, []);
  const openMailbox = () => openModal && openModal('Mailbox');

  // Store purchase fulfillment effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseSuccess = params.get("purchase");
    const playerId = params.get("playerId");
    const offerId = params.get("offerId");

    if (purchaseSuccess === "success" && playerId && offerId) {
      console.log("🧾 Processing store purchase via App.js effect:", { playerId, offerId });

      axios.post(`${API_BASE}/api/purchase-store-offer`, {
        playerId, offerId
      }).then(() => {
        console.log("📬 Purchase reward sent successfully.");

        /// If Gold Pass was purchased, show modal and panel
        if (String(offerId) === "1") {
          updateStatus && updateStatus("🎉 Congratulations on purchasing a Gold Pass!");
          // Re-fetch player to get updated accountStatus
          axios.get(`${API_BASE}/api/player/${playerId}`).then((playerResponse) => {            
          openPanel('GoldBenefitsPanel');
          setModalContent({
              title: strings["5060"],
              message: strings["5061"],
              message2: strings["5062"],
              size: "small",
            });
          setIsModalOpen(true);
          }).catch((err) => {
            console.error("❌ Failed to refresh player data after Gold purchase:", err);
          });
        /// If anything else was purchased, open Mailbox
        } else {
          updateStatus && updateStatus("✅ Purchase successful! Check your Inbox.");
          openMailbox && openMailbox();
        }
      }).catch((err) => {
        console.error("❌ Failed to fulfill purchase:", err);
        updateStatus && updateStatus("⚠️ Purchase may not have been fulfilled. Contact support if missing.");
      });

      // Clean up the URL to remove query params
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, document.title, url.toString());
    }
  }, []);

  // Server connectivity check: periodically ping server and show modal if down
  useEffect(() => {
    let interval;
    let serverPreviouslyDown = false;
    const checkServer = async () => {
      try {
        // await axios.get(`${API_BASE}/api/ping`);
        // Always close modal if server is reachable
        if (modalContent?.title === strings[10000]) {
          setIsModalOpen(false);
        }
        // If it was previously down, reload the page
        if (serverPreviouslyDown) { window.location.reload(); }
      } catch (err) {
        console.warn("❌ Server unreachable:", err.message);
        if (!serverPreviouslyDown) {
          setModalContent({
            title: strings[10000],
            message: strings[10001],
            message2: strings[10002],
          });
          setIsModalOpen(true);
          serverPreviouslyDown = true;
        }
      }
    };
    interval = setInterval(checkServer, 2000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    const checkInitialSeasonPhase = async () => {
      console.log("Checking for on or off Season on app start");
      const raw = localStorage.getItem("timers");
      if (!raw) { console.warn("No timers in localStorage yet."); return; }
      let storedTimers = null;
      try {
        storedTimers = JSON.parse(raw);
      } catch (err) {
        console.warn("Malformed timers in localStorage:", err);
        return;
      }
      if (storedTimers?.seasons?.phase === "offSeason") {
        console.log("🕵️ Initial local phase is offSeason, confirming with server...");
        try {
          const res = await axios.get(`${API_BASE}/api/get-global-season-phase`);
          const serverPhase = res.data?.phase;
          setIsOffSeason(serverPhase === "offSeason");
          console.log(serverPhase === "offSeason" ? "✅ Server confirms offSeason" : "❌ Server says it's not offSeason");
        } catch (error) {
          console.error("❌ Error confirming season with server:", error);
        }
      }
    };
    checkInitialSeasonPhase();
  }, []);

    // ✅ Fetch season data from local storage
  const getSeasonData = () => {
    const storedTimers = JSON.parse(localStorage.getItem("timers"));
    return storedTimers?.seasons || { type: "Unknown", phase: "Unknown", endTime: null };
  };
  const seasonData = getSeasonData();
  const [currentPlayer, setCurrentPlayer] = useState(null); // Ensure this is defined

  // Canvas settings migration removed - now forced to Canvas mode always

  // Initialize gridId with localStorage (do not depend on currentPlayer here)
  const [gridId, setGridId] = useState(() => {
    const storedGridId = localStorage.getItem('gridId');
    return storedGridId || null;
  });
  const [resources, setResources] = useState([]);
  const [tileTypes, setTileTypes] = useState([]);
  const [grid, setGrid] = useState([]);
  const [masterResources, setMasterResources] = useState([]);
  const [isMasterResourcesReady, setIsMasterResourcesReady] = useState([]);
  const [masterSkills, setMasterSkills] = useState([]);
  const [masterWarehouse, setMasterWarehouse] = useState([]);
  const [globalTuning, setGlobalTuning] = useState(null);
  const [masterInteractions, setMasterInteractions] = useState([]);
  const [masterTraders, setMasterTraders] = useState([]);
  const [masterTrophies, setMasterTrophies] = useState([]);
  const [masterXPLevels, setMasterXPLevels] = useState([]);
  const [masterFTUEsteps, setMasterFTUEsteps] = useState([]);

  // Check if player is mayor for authoritative mayor display
  useEffect(() => {
    const checkMayorStatus = async () => {
      let isPlayerMayor = false;
      if (currentPlayer?.location?.gtype === 'town' && currentPlayer?.location?.s) {
        try {
          const mayorUsername = await getMayorUsername(currentPlayer.location.s);
          isPlayerMayor = mayorUsername === currentPlayer.username;
        } catch (error) {
          console.error('Error checking mayor status in App.js:', error);
        }
      }
      setIsMayor(isPlayerMayor);
    };

    if (currentPlayer) {
      checkMayorStatus();
    }
  }, [currentPlayer?.location?.s, currentPlayer?.username]);

// Synchronize tiles with GlobalGridStateTilesAndResources -- i did this so NPCs have knowledge of tiles and resources as they change
useEffect(() => {
  // Always update, even if tileTypes is empty array
  if (tileTypes !== undefined && tileTypes !== null) {
    GlobalGridStateTilesAndResources.setTiles(tileTypes);
    console.log('GlobalGridStateTilesAndResources tiles updated:', tileTypes);
  }
}, [tileTypes]);
// Synchronize resources with GlobalGridStateTilesAndResources -- i did this so NPCs have knowledge of tiles and resources as they change
useEffect(() => {
  // Always update, even if resources is empty array (important for grid transitions!)
  if (resources !== undefined && resources !== null) {
    // Defensive cleanup: Check for crops with invalid growEnd fields
    let cleanedResources = resources;
    const invalidCrops = resources.filter(res => {
      // Check if this is a crop (output of a farmplot) with growEnd
      if (res.growEnd && masterResources) {
        const isCrop = masterResources.some(mr => 
          mr.category === 'farmplot' && mr.output === res.type
        );
        return isCrop;
      }
      return false;
    });
    
    if (invalidCrops.length > 0) {
      console.warn(`🧹 Found ${invalidCrops.length} crops with invalid growEnd fields, cleaning up...`);
      invalidCrops.forEach(crop => {
        console.log(`  - ${crop.type} at (${crop.x}, ${crop.y}) has growEnd=${crop.growEnd}`);
      });
      cleanedResources = resources.map(res => {
        // If this is one of the invalid crops, remove growEnd
        const needsCleanup = invalidCrops.some(ic => ic.x === res.x && ic.y === res.y);
        if (needsCleanup) {
          const { growEnd, ...cleanedRes } = res;
          console.log(`🌾 Cleaned crop ${res.type} at (${res.x}, ${res.y})`);
          return cleanedRes;
        }
        return res;
      });
      setResources(cleanedResources);
    }
    
    GlobalGridStateTilesAndResources.setResources(cleanedResources);
    //console.log('GlobalGridStateTilesAndResources resources updated:', cleanedResources);
  }
}, [resources, masterResources]);

const [zoomLevel, setZoomLevel] = useState('close'); // Default zoom level

// V2 Tile Renderer toggle - always defaults to V2 (true)
// Only respect stored 'false' if user explicitly toggled it off after this update
const [useV2Tiles, setUseV2Tiles] = useState(() => {
  const hasExplicitChoice = localStorage.getItem('useV2TilesExplicit') === 'true';
  if (hasExplicitChoice) {
    return localStorage.getItem('useV2Tiles') === 'true';
  }
  return true; // Default to V2 for all users
});

// Listen for V2 tile renderer toggle changes from DebugPanel
useEffect(() => {
  const handleTileRendererChange = (e) => setUseV2Tiles(e.detail);
  window.addEventListener('tileRendererChange', handleTileRendererChange);
  return () => window.removeEventListener('tileRendererChange', handleTileRendererChange);
}, []);
const TILE_SIZES = useMemo(() => globalTuning?.closerZoom ? {
  closer: globalTuning.closerZoom,
  close: globalTuning.closeZoom,
  far: globalTuning.farZoom
} : { closer: 50, close: 30, far: 16 }, [globalTuning]); // Update when globalTuning loads
const activeTileSize = TILE_SIZES[zoomLevel]; // Get the active TILE_SIZE
const [isRelocating, setIsRelocating] = useState(null);

const [visibleSettlementId, setVisibleSettlementId] = useState(null);
useEffect(() => {
  // currentPlayer may be null on first render, so initialize only when available
  if (currentPlayer?.location?.s) {
    setVisibleSettlementId(currentPlayer.location.s);
  }
}, [currentPlayer]);

// Persist zoom level on page unload so camera centers correctly after refresh
useEffect(() => {
  const saveZoomLevel = () => {
    if (zoomLevel && zoomLevel !== 'settlement' && zoomLevel !== 'frontier') {
      localStorage.setItem("initialZoomLevel", zoomLevel);
    }
  };
  window.addEventListener('beforeunload', saveZoomLevel);
  return () => window.removeEventListener('beforeunload', saveZoomLevel);
}, [zoomLevel]);

// Track the last shown FTUE step to detect changes
const [lastShownFTUEStep, setLastShownFTUEStep] = useState(null);

const [inventory, setInventory]  = useState({});
const [backpack, setBackpack] = useState({});
const [playerPosition, setPlayerPosition] = useState(null);

const NPCsInGrid = useGridState();
const setGridState = useGridStateUpdate();
useEffect(() => {
  NPCsInGridManager.registerSetGridState(setGridState);
}, [setGridState]);

const playersInGrid = usePlayersInGrid();
const setPlayersInGrid = useGridStatePCUpdate();
useEffect(() => {
  playersInGridManager.registerSetPlayersInGrid(setPlayersInGrid);
}, [setPlayersInGrid]);
useEffect(() => {
  playersInGridManager.registerTileSize(activeTileSize);
}, [activeTileSize]);

// Track previous zoom level to detect actual zoom changes
const prevZoomRef = useRef(zoomLevel);

// Maintain camera position during zoom transitions (only when zoom actually changes)
useLayoutEffect(() => {
  // Only center camera if zoomLevel actually changed (not on playersInGrid updates during movement)
  if (prevZoomRef.current === zoomLevel) {
    return;
  }
  prevZoomRef.current = zoomLevel;

  if (zoomLevel && zoomLevel !== 'settlement' && zoomLevel !== 'frontier' && currentPlayer?.location?.g && currentPlayer?._id) {
    const gridId = currentPlayer.location.g;
    const playerIdStr = String(currentPlayer._id);
    const playerPos = playersInGrid?.[gridId]?.pcs?.[playerIdStr]?.position;

    console.log(`📷 [ZOOM TRANSITION] zoomLevel changed to: ${zoomLevel}, activeTileSize: ${activeTileSize}`);
    console.log(`📷 [ZOOM TRANSITION] playerPos from playersInGrid:`, playerPos);

    if (playerPos && activeTileSize) {
      centerCameraOnPlayerFast(playerPos, activeTileSize);
    } else {
      console.warn(`📷 [ZOOM TRANSITION] Cannot center - missing playerPos or activeTileSize`);
    }
  }
}, [zoomLevel, activeTileSize, playersInGrid, currentPlayer]);

const [isLoginPanelOpen, setisLoginPanelOpen] = useState(false);
const [isOffSeason, setIsOffSeason] = useState(false); // Track if it's off-season
const { activePanel, openPanel, closePanel } = usePanelContext();
const { closeAllPanels } = usePanelContext(); 
const [activeQuestGiver, setActiveQuestGiver] = useState(null);
const [activeSocialPC, setActiveSocialPC] = useState(null);
const [activeStation, setActiveStation] = useState(null);
const [showShareModal, setShowShareModal] = useState(false);
const [showFTUE, setShowFTUE] = useState(false);
const [doinkerTargets, setDoinkerTargets] = useState(null); // Resource type string or array of strings to point doinkers at
const [cursorMode, setCursorMode] = useState(null); // { type: 'plant', item: {...}, emoji: '🌾' }
const [hoveredTile, setHoveredTile] = useState(null); // { row, col } - tile under cursor for placement highlight

// Clear cursor mode when panel changes (except when staying on panels that support cursor placement)
useEffect(() => {
  const cursorModePanels = ['FarmingPanel', 'ToolsPanel', 'BuildPanel', 'BuyPanel', 'BuyDecoPanel', 'PetsPanel'];
  if (!cursorModePanels.includes(activePanel)) {
    setCursorMode(null);
  }
}, [activePanel]);

// Apply emoji or SVG cursor when in cursor mode
useEffect(() => {
  if (cursorMode?.emoji || cursorMode?.filename) {
    // Scale cursor based on resource size (multi-tile resources get larger cursors)
    const tileSpan = cursorMode.size || 1;
    const baseSize = 32;
    const canvasSize = baseSize * tileSpan;
    const center = canvasSize / 2;

    // Helper to apply cursor style
    const applyCursor = (cursorUrl) => {
      const styleEl = document.createElement('style');
      styleEl.id = 'cursor-mode-style';
      styleEl.textContent = `
        body.cursor-mode-active,
        body.cursor-mode-active * {
          cursor: url(${cursorUrl}) ${center} ${center}, crosshair !important;
        }
      `;
      document.head.appendChild(styleEl);
      document.body.classList.add('cursor-mode-active');
    };

    if (cursorMode.filename) {
      // Load SVG and render to canvas for cursor
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
        const cursorUrl = canvas.toDataURL();
        applyCursor(cursorUrl);
      };
      img.onerror = () => {
        // Fall back to emoji if SVG fails to load
        if (cursorMode.emoji) {
          const canvas = document.createElement('canvas');
          canvas.width = canvasSize;
          canvas.height = canvasSize;
          const ctx = canvas.getContext('2d');
          const fontSize = 24 * tileSpan;
          ctx.font = `${fontSize}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cursorMode.emoji, center, center);
          const cursorUrl = canvas.toDataURL();
          applyCursor(cursorUrl);
        }
      };
      img.src = `/assets/resources/${cursorMode.filename}`;
    } else {
      // Use emoji cursor
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');
      const fontSize = 24 * tileSpan;
      ctx.font = `${fontSize}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cursorMode.emoji, center, center);
      const cursorUrl = canvas.toDataURL();
      applyCursor(cursorUrl);
    }

    return () => {
      document.body.classList.remove('cursor-mode-active');
      const existingStyle = document.getElementById('cursor-mode-style');
      if (existingStyle) existingStyle.remove();
    };
  } else {
    document.body.classList.remove('cursor-mode-active');
    const existingStyle = document.getElementById('cursor-mode-style');
    if (existingStyle) existingStyle.remove();
  }
}, [cursorMode]);

// Register notification click handlers
useEffect(() => {
  registerNotificationClickHandler('Trophy', (data) => {
    openPanel('TrophyPanel');
  });
  
  registerNotificationClickHandler('To Do', (data) => {
    openPanel('QuestPanel');
  });
}, [openPanel]);

useEffect(() => {
  const storedPlayer = localStorage.getItem('player');
  if (!storedPlayer) {
    console.log('[Watcher] No stored player found — showing login panel.');
    setisLoginPanelOpen(true);
    openPanel("LoginPanel");
    setShowKeyArt(true);
  }
}, [activePanel]);

const handleNPCPanel = (npc) => {
  console.log('App.js: Handling an NPC Panel:', npc, npc.action);
  switch (npc.action) {
    case 'quest':
    case 'trade':
    case 'heal': {
      setActiveQuestGiver(npc);  // Set the active quest giver globally
      if (npc.type==='Kent') {
        openPanel('KentPanel');  
      } else {
        openPanel('NPCPanel');  
      }
      break;
    }
    case 'worker': {
      setActiveQuestGiver(npc);  // Set the active quest giver globally
      // Set activeStation data for NPC-based access to ensure gridId is available
      setActiveStation({
        type: npc.type, // Use the actual NPC type (Farmer, Farm Hand, Rancher, Lumberjack)
        position: npc.position,
        gridId: currentPlayer.location?.g
      });
      openPanel('FarmHandPanel');  
      break;
    }
    default: { break; }
  }
};

const handlePCClick = (pc) => {
  console.log('App.js: Opening SocialPanel for PC:', pc);
  setActiveSocialPC(pc);  // Set the active clicked PC globally
  openPanel('SocialPanel');  // Open the panel
};

const [hoverTooltip, setHoverTooltip] = useState(null);


const [controllerUsername, setControllerUsername] = useState(null); // Add state for controller username
const [isSocketConnected, setIsSocketConnected] = useState(false);
const [connectedPlayers, setConnectedPlayers] = useState(() => new Set());
const [chatMessages, setChatMessages] = useState({});
const [badgeState, setBadgeState] = useState({ chat: false, store: false, mailbox: false });

//Forgot why we did this:
const memoizedGrid = useMemo(() => grid, [grid]);
const memoizedTileTypes = useMemo(() => tileTypes, [tileTypes]);

const memoizedResources = useMemo(() => resources, [resources]);

const [showKeyArt, setShowKeyArt] = useState(false);


/////////// APP INITIALIZATION /////////////////////////

// Flags to track initialization
let isInitializing = false; // Declare inside useEffect to avoid global persistence
const [isAppInitialized, setIsAppInitialized] = useState(false);

// Central INITIALIZATION for player and grid data //////////////////////////////////////////////////////

// --- SOCKET "connect" LISTENER: Register before other listeners
// This effect runs once at mount to set up socket.on('connect') as early as possible
useEffect(() => {
  if (!socket) return;
  // Remove any previous connect listeners to avoid duplicate logs
  socket.off('connect', socket.__vvgame_connect_listener);
  const connectListener = () => {
    console.log('📡 Socket connected!');
    if (currentPlayer?.playerId) {
      console.log('📡 Rejoining playerId room:', currentPlayer.playerId);
      socket.emit('join-player-room', currentPlayer.playerId);
    }
  };
  socket.on('connect', connectListener);
  // Save a reference for cleanup
  socket.__vvgame_connect_listener = connectListener;
  return () => {
    socket.off('connect', connectListener);
    delete socket.__vvgame_connect_listener;
  };
  // Depend on currentPlayer so we can re-emit join-player-room if playerId changes
}, [socket, currentPlayer]);

useEffect(() => {
  let cleanupBadges = null;

  const initializeAppWrapper = async () => {
    console.log('🏁🏁🏁 App initialization begun.');
    if (isInitializing) {
      console.log('Initialization is already in progress. Skipping.');
      return;
    }
    isInitializing = true;

    try {
      // Step 1. Load tuning data
      console.log('🏁✅ 1 InitAppWrapper; Merging player data and initializing inventory...');
      const [skills, resources, globalTuningData, interactions, traders, trophies, warehouse, xpLevels, ftueSteps] = await Promise.all([loadMasterSkills(), loadMasterResources(), loadGlobalTuning(), loadMasterInteractions(), loadMasterTraders(), loadMasterTrophies(), loadMasterWarehouse(), loadMasterXPLevels(), loadFTUEsteps()]);
      setMasterResources(resources);
      setMasterSkills(skills);
      setGlobalTuning(globalTuningData);
      setMasterInteractions(interactions);
      setMasterTraders(traders);
      setMasterTrophies(trophies);
      setMasterWarehouse(warehouse);
      setMasterXPLevels(xpLevels);
      setMasterFTUEsteps(ftueSteps);
      setIsMasterResourcesReady(true); // ✅ Mark ready
      // Step 2. Fetch stored player from localStorage
      console.log('🏁✅ 2 InitAppWrapper; getting local player...');
      const storedPlayer = localStorage.getItem('player');

      if (!storedPlayer) {
        console.log('No stored player found, showing login screen.');
        setisLoginPanelOpen(true);    
        openPanel("LoginPanel");  
        setShowKeyArt(true);  // 👈 NEW STATE FLAG TO TRIGGER IMAGE
        return;
      }
      const parsedPlayer = JSON.parse(storedPlayer);

      // 2.1 Fetch the full player data from the server
      console.log('🏁✅ 2.1 InitAppWrapper; fetching player from server...');
      const response = await axios.get(`${API_BASE}/api/player/${parsedPlayer.playerId}`);
      const DBPlayerData = response.data;
      if (!DBPlayerData || !DBPlayerData.playerId) {
        console.error('Invalid full player data from server:', DBPlayerData);
        setisLoginPanelOpen(true);
        return;
      }
      
      // 2.2 Update lastActive timestamp for app initialization
      console.log('🏁✅ 2.2 InitAppWrapper; updating lastActive timestamp...');
      try {
        await axios.post(`${API_BASE}/api/update-last-active`, {
          playerId: parsedPlayer.playerId
        });
      } catch (error) {
        console.warn('Failed to update lastActive:', error);
        // Don't block app initialization if this fails
      }

      // Step 2.5: Check for stale gridId (e.g. after offSeason relocation)
      console.log('🏁✅ 2.5 InitAppWrapper; checking for stale gridId after relocation...');
      const storedGridId = localStorage.getItem("gridId");
      const resolvedGridId = DBPlayerData.location?.g;
      if (storedGridId && resolvedGridId && storedGridId !== resolvedGridId) {
        console.warn("🌪️ Detected stale gridId from localStorage. Updating to new home grid.");
        localStorage.setItem("gridId", resolvedGridId);
        setGridId(resolvedGridId); // ✅ Use setter to update React state
      }

      // Step 3. Combine local and server data, prioritizing newer info from the server
      console.log('🏁✅ 3 InitAppWrapper; Merging player data and initializing inventory...');
      let updatedPlayerData = { ...parsedPlayer, ...DBPlayerData };
      setCurrentPlayer(updatedPlayerData);
      if (updatedPlayerData?.username) {
        console.log(`🔍 [APP] About to check developer status for: "${updatedPlayerData.username}"`);
        const isDev = await checkDeveloperStatus(updatedPlayerData.username);
        console.log(`🔍 [APP] isDev result: ${isDev}, calling setIsDeveloper(${isDev})`);
        setIsDeveloper(isDev);
      } else {
        console.log(`🔍 [APP] No username found in updatedPlayerData:`, updatedPlayerData);
      }
      setInventory(DBPlayerData.inventory || []);  // Initialize inventory properly
      setBackpack(DBPlayerData.backpack || []);

      // Step 4. Determine initial gridId from player or storage
      // Use fresh server data (resolvedGridId) first, then fall back to cached data
      console.log('🏁✅ 4. Determining local gridId...');
      const initialGridId = resolvedGridId || parsedPlayer?.location?.g || localStorage.getItem('gridId');
      if (!initialGridId) {
        console.error('No gridId found. Unable to initialize grid.');
        return;
      }
      setGridId(initialGridId);
      localStorage.setItem('gridId', initialGridId); // Save to local storage

      // 4.5. Open the socket and wait for connection before emitting
      socket.connect();

      // Wait for socket to be connected before emitting join events
      const waitForConnection = () => new Promise((resolve) => {
        if (socket.connected) {
          resolve();
        } else {
          socket.once('connect', resolve);
        }
      });

      await waitForConnection();
      console.log("📡 Socket connected, now joining rooms...");

      // Join the grid for grid-based updates
      socket.emit('join-grid', { gridId: initialGridId, playerId: DBPlayerData.playerId });
      console.log("📡 Emitted join-grid for grid:", initialGridId);

      // Format playerData correctly for socket sync (matching PlayersInGrid schema)
      // DBPlayerData uses different field names (baseHp, location.x) than PC schema (hp, position.x)
      const formattedPlayerData = {
        playerId: DBPlayerData.playerId || DBPlayerData._id?.toString(),
        username: DBPlayerData.username,
        type: 'pc',
        icon: DBPlayerData.icon || '😀',
        position: {
          x: DBPlayerData.location?.x ?? 0,
          y: DBPlayerData.location?.y ?? 0
        },
        hp: DBPlayerData.baseHp ?? 25,
        maxhp: DBPlayerData.baseMaxhp ?? 25,
        armorclass: DBPlayerData.baseArmorclass ?? 10,
        attackbonus: DBPlayerData.baseAttackbonus ?? 0,
        damage: DBPlayerData.baseDamage ?? 1,
        attackrange: DBPlayerData.baseAttackrange ?? 1,
        speed: DBPlayerData.baseSpeed ?? 1,
        iscamping: DBPlayerData.iscamping ?? false,
        isinboat: DBPlayerData.isinboat ?? false,
        lastUpdated: Date.now(),
      };

      socket.emit('player-joined-grid', {
        gridId: initialGridId,
        playerId: DBPlayerData.playerId,
        username: DBPlayerData.username,
        playerData: formattedPlayerData,
      });
      // Join the player room for personal updates
      socket.emit('join-player-room', { playerId: DBPlayerData.playerId });
      console.log(`📡 Joined socket room for playerId: ${DBPlayerData.playerId}`);
      socket.emit('set-username', { username: DBPlayerData.username });

      // Request current NPCController status to clear any stale controller data
      console.log(`🎮 Requesting current NPCController for grid: ${initialGridId}`);
      socket.emit('request-npc-controller', { gridId: initialGridId });

      // Step 5. Initialize grid tiles, resources
      console.log('🏁✅ 5 InitAppWrapper; Initializing grid tiles and resources...');
      await initializeGrid(
        activeTileSize,
        initialGridId,
        setGrid,
        setResources,
        setTileTypes,
        updateStatus,
        DBPlayerData,
        masterResources
      );

      // Step 6. Initialize NPCs
      console.log('🏁✅ 6 InitAppWrapper; Initializing NPC NPCsInGrid...');
      await NPCsInGridManager.initializeGridState(initialGridId);
      const freshNPCState = NPCsInGridManager.getNPCsInGrid(initialGridId);
      console.log('initializedState (NPCs): ',freshNPCState);

      // Step 7. Initialize PCs
      console.log('🏁✅ 7 InitAppWrapper; Initializing playersInGrid...');
      await playersInGridManager.initializePlayersInGrid(initialGridId);
      const freshPCState = playersInGridManager.getPlayersInGrid(initialGridId);
      const playerId = String(parsedPlayer.playerId);
      console.log('🔍 [DEBUG] playerId:', playerId);
      console.log('🔍 [DEBUG] freshPCState keys:', Object.keys(freshPCState || {}));
      console.log('🔍 [DEBUG] freshPCState full:', JSON.stringify(freshPCState, null, 2));
      const playerPositionFromGrid = freshPCState?.[playerId]?.position;
      // Use playersInGrid as primary source (real-time position), fallback to DBPlayerData.location
      const playerPosition = (playerPositionFromGrid?.x != null && playerPositionFromGrid?.y != null)
        ? playerPositionFromGrid
        : (DBPlayerData.location?.x != null && DBPlayerData.location?.y != null)
          ? { x: DBPlayerData.location.x, y: DBPlayerData.location.y }
          : null;
      console.log('📍 Player position for centering:', playerPosition, '(from grid:', playerPositionFromGrid, ', from DB:', DBPlayerData.location, ')');
      if (playerPosition) {
        // Check for stored zoom level to use correct TILE_SIZE for initial centering
        // Use globalTuningData directly since React state hasn't updated yet
        const storedZoom = localStorage.getItem("initialZoomLevel") || 'close';
        const tileSizesFromTuning = {
          closer: globalTuningData?.closerZoom || 50,
          close: globalTuningData?.closeZoom || 30,
          far: globalTuningData?.farZoom || 16
        };
        const initialTileSize = tileSizesFromTuning[storedZoom] || tileSizesFromTuning.close;
        console.log(`📷 Centering camera on (${playerPosition.x}, ${playerPosition.y}) with TILE_SIZE: ${initialTileSize} (zoom: ${storedZoom}, from globalTuning: ${JSON.stringify(tileSizesFromTuning)})`);
        centerCameraOnPlayer(playerPosition, initialTileSize);
      }

      // Step 8. Resolve player location 
      console.log('🏁✅ 8 InitAppWrapper; Resolving player location...');
      const playerIdStr = DBPlayerData._id.toString();
      let gridPlayer = freshPCState?.[playerIdStr];

      // Step A: Detect location mismatch or missing from NPCsInGrid
      const isLocationMismatch = DBPlayerData.location?.g !== initialGridId;
      const isMissingFromGrid = !gridPlayer;

      console.log('isLocationMismatch = ', isLocationMismatch);
      console.log('isMissingFromGrid = ', isMissingFromGrid);

      if (isMissingFromGrid && gridId === DBPlayerData.location.g) {
        console.warn("🧭 Player not in correct NPCsInGrid or missing entirely. Repositioning...");
        const targetPosition = { x: 0, y: 0 };
        console.warn('InitAppWrapper: adding PC to NPCsInGrid');
        await playersInGridManager.addPlayer(gridId, DBPlayerData.playerId, DBPlayerData);
        // Refresh the NPCsInGrid and React state
        console.warn('InitAppWrapper: refreshing NPCsInGrid');
        setPlayersInGrid((prev) => ({
          ...prev,
          [gridId]: playersInGridManager.getPlayersInGrid(gridId),
        }));
        const gridPlayer = playersInGridManager.getPlayersInGrid(gridId)?.[playerIdStr];
        console.log('Refreshed gridPlayer:', gridPlayer);
        // Update gridId and storage to match actual grid
        console.warn('InitAppWrapper: adding PC to NPCsInGrid');
        setGridId(gridId);
        localStorage.setItem("gridId", gridId);
        // Update player's in-memory and stored location
        DBPlayerData.location = {
          ...DBPlayerData.location,
          x: targetPosition.x,
          y: targetPosition.y,
          g: gridId,
        };

        console.log("✅ Player repositioned into NPCsInGrid:", gridPlayer);
      } else {
        console.log('✅ Player found in local NPCsInGrid.');
      }

      // Step 11: Update local storage with final player state
      console.log('🏁✅ 11 InitAppWrapper: updating localStorage with player data');
      updatedPlayerData = {
        ...DBPlayerData,
        location: {
          ...DBPlayerData.location,
          x: gridPlayer?.position?.x || 3,
          y: gridPlayer?.position?.y || 3,
          g: DBPlayerData.location.g,
        },
      };

      // Step 11a: Lookup homestead gridCoord if not already stored
      if (updatedPlayerData.gridId && !updatedPlayerData.homesteadGridCoord) {
        try {
          console.log('🏠 Looking up homestead gridCoord for gridId:', updatedPlayerData.gridId);
          const homesteadResponse = await axios.get(`${API_BASE}/api/homestead-gridcoord/${updatedPlayerData.gridId}`);
          if (homesteadResponse.data.gridCoord) {
            updatedPlayerData.homesteadGridCoord = homesteadResponse.data.gridCoord;
            console.log('🏠✅ Homestead gridCoord found and stored:', homesteadResponse.data.gridCoord);
          }
        } catch (error) {
          console.warn('🏠❌ Could not find homestead gridCoord:', error.response?.data?.error || error.message);
        }
      }

      setCurrentPlayer(updatedPlayerData);
      localStorage.setItem('player', JSON.stringify(updatedPlayerData));
      console.log(`✅ LocalStorage updated with combat stats:`, updatedPlayerData);

      // Step 11b: Mark current grid as visited (initial load)
      const currentGridCoord = updatedPlayerData.location?.gridCoord;
      if (typeof currentGridCoord === 'number' && currentGridCoord >= 0) {
        try {
          const { isGridVisited } = await import('./Utils/gridsVisitedUtils');
          if (!isGridVisited(updatedPlayerData.gridsVisited, currentGridCoord)) {
            console.log(`📍 [GRIDS_VISITED] Marking initial grid ${currentGridCoord} as visited`);
            const visitResponse = await axios.post(`${API_BASE}/api/mark-grid-visited`, {
              playerId: updatedPlayerData.playerId,
              gridCoord: currentGridCoord
            });
            if (visitResponse.data.success && visitResponse.data.gridsVisited) {
              updatedPlayerData.gridsVisited = visitResponse.data.gridsVisited;
              setCurrentPlayer({ ...updatedPlayerData });
              localStorage.setItem('player', JSON.stringify(updatedPlayerData));
              console.log(`📍 [GRIDS_VISITED] ✅ Initial grid marked as visited`);
            }
          }
        } catch (err) {
          console.warn('📍 [GRIDS_VISITED] Could not mark initial grid as visited:', err);
        }
      }

      // Step 12: Check for death flag and show modal if needed
      if (updatedPlayerData.settings?.hasDied) {
        console.log("☠️ Player died last session. Showing death modal.");
        setModalContent({
          title: strings["5001"],
          message: strings["5002"],
          message2: strings["5003"],
          size: "small",
        });
        setIsModalOpen(true);

        // Clear the flag in DB
        await axios.post(`${API_BASE}/api/update-profile`, {
          playerId: updatedPlayerData.playerId,
          updates: { "settings.hasDied": false },
        });

        // Clear the flag in localStorage
        updatedPlayerData.settings.hasDied = false;
        localStorage.setItem('player', JSON.stringify(updatedPlayerData));
      }

      // Step 13: Check for buttons that need to be badged
      const storedBadges = getBadgeState(updatedPlayerData);
      setBadgeState(storedBadges); // ✅ apply localStorage state to UI immediately

      // 🔍 Badge the mailbox if any messages are unread
      const hasUnreadMail = (updatedPlayerData.messages || []).some(msg => !msg.read);
      if (hasUnreadMail) {
        updateBadge(updatedPlayerData, setBadgeState, 'mailbox', true); // ✅ Use your helper
      }

      cleanupBadges = socketListenForBadgeUpdates(updatedPlayerData, setBadgeState, updateBadge);

      console.log('✅🏁✅🏁✅🏁✅ App initialization complete.');

      //setShowTimers(true);    // default "Happening In Town" details open (true) or closed (flase)

      const zoom = localStorage.getItem("initialZoomLevel");
      if (zoom) {
        setZoomLevel(zoom);
        localStorage.removeItem("initialZoomLevel");
      }

      setIsAppInitialized(true);
      
      // Store FTUE info but don't show yet - wait for grid to load
      if (updatedPlayerData.firsttimeuser === true && updatedPlayerData.ftuestep !== undefined && updatedPlayerData.ftuestep >= 0) {
        console.log('🎓 FTUE step detected for first-time user:', updatedPlayerData.ftuestep, ', will show after grid loads');
        // Don't show FTUE yet - let the grid load first
      }

    } catch (error) {
      console.error('Error during app initialization:', error);
      
      // If player not found (404), clear local storage and show login panel
      if (error.response?.status === 404) {
        console.log('Player not found (possibly deleted). Clearing local storage and showing login panel.');
        localStorage.removeItem("player");
        localStorage.removeItem("playerId");
        setCurrentPlayer(null);
        setisLoginPanelOpen(true);
      } else {
        updateStatus(error.code === 'ERR_NETWORK' ? 1 : 0);  // Handle other errors
      }
    }
  };


  initializeAppWrapper();

  return () => {
    cleanupBadges?.();
  };
}, []);  // Only run once when the component mounts

// Revival state handlers
const handleAcceptDeath = async () => {
  console.log("☠️ Player accepted death");
  setIsRevivalModalOpen(false);
  setRevivalPending(false);
  localStorage.removeItem('revivalState');
  
  // Execute normal death flow
  await handlePlayerDeath(
    currentPlayer,
    setCurrentPlayer,
    setGridId,
    setGrid,
    setResources,
    setTileTypes,
    activeTileSize,
    updateStatus,
    setModalContent,
    setIsModalOpen,
    closeAllPanels,
    false // offerRevival = false
  );
  
  // Show normal death modal
  setModalContent({
    title: strings["5001"],
    message: strings["5002"],
    message2: strings["5003"],
    size: "small",
  });
  setIsModalOpen(true);
};

const handleRevive = async () => {
  console.log("💎 Player attempting to revive");
  const reviveCost = globalTuning?.costToRevive || 50;
  
  // Get player's gem count from inventory
  const playerGems = inventory.find(item => item.type === 'Gem')?.quantity || 0;
  console.log(`Player has ${playerGems} gems, needs ${reviveCost}`);
  
  // Check if player has enough gems
  if (playerGems >= reviveCost) {
    console.log("✅ Player has enough gems, reviving...");
    
    // Calculate HP to restore
    const percentageToRevive = globalTuning?.percentageToRevive || 0.25;
    // Calculate proper maxHP from base stats and equipment (don't let it get corrupted)
    const properMaxHp = (currentPlayer.baseMaxhp || 25) + (currentPlayer.maxhpModifier || 0);
    const restoredHp = Math.floor(properMaxHp * percentageToRevive);
    
    try {
      // Update inventory to deduct gems
      const updatedInventory = inventory.map(item => {
        if (item.type === 'Gem') {
          return { ...item, quantity: item.quantity - reviveCost };
        }
        return item;
      });
      
      // Update player stats in database (only inventory, not HP which belongs in grid state)
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer._id,
        updates: {
          inventory: updatedInventory
        }
      });
      
      // Update local player state (HP doesn't belong here, it's in grid state)
      const updatedPlayer = {
        ...currentPlayer,
        inventory: updatedInventory
      };
      setCurrentPlayer(updatedPlayer);
      localStorage.setItem('player', JSON.stringify(updatedPlayer));
      setInventory(updatedInventory);
      
      // Update grid state - this is the critical part for HP to show correctly
      const playerId = String(currentPlayer._id);
      console.log(`🏥 Updating player ${playerId} HP to ${restoredHp} in grid ${gridId}`);
      playersInGridManager.updatePC(gridId, playerId, { hp: restoredHp });
      
      // Force update the players in grid state to trigger re-render
      const updatedPCs = playersInGridManager.getPlayersInGrid(gridId);
      console.log(`✅ Player HP in grid state:`, updatedPCs[playerId]?.hp);
      
      // Clear revival state
      setIsRevivalModalOpen(false);
      setRevivalPending(false);
      localStorage.removeItem('revivalState');
      
      console.log(`✅ Player revived with ${restoredHp} HP`);
      updateStatus(`Revived with ${restoredHp} HP! 💎 -${reviveCost} Gems`);
      
    } catch (error) {
      console.error("❌ Error during revival:", error);
      updateStatus("Revival failed - please try again");
    }
  }
  // Note: Insufficient gems case is now handled directly in RevivalModal with embedded purchase buttons
};

// Auto-exit from dungeon when phase changes to resetting
const handleDungeonAutoExit = async () => {
  // Prevent multiple simultaneous exit attempts
  if (isDungeonExitInProgress.current) {
    console.log("⏸️ Dungeon exit already in progress, skipping duplicate attempt");
    return;
  }
  
  isDungeonExitInProgress.current = true;
  
  try {
    console.log("🚨 Auto-exiting dungeon due to reset phase");
    
    // Show warning message
    updateStatus("Dungeon is resetting! Teleporting you to safety...");
    
    // First attempt: Try normal dungeon exit
    try {
      const { handleDungeonExit } = await import('./GameFeatures/Dungeon/Dungeon');
      await handleDungeonExit(
        currentPlayerRef.current,
        setCurrentPlayer,
        setGridId,
        setGrid,
        setTileTypes,
        setResources,
        updateStatus,
        activeTileSize,
        closeAllPanels,
        bulkOperationContext,
        masterResources,
        strings,
        masterTrophies,
        transitionFadeControl
      );
      updateStatus("You have been safely returned to the surface as the dungeon resets.");
      isDungeonExitInProgress.current = false; // Reset flag on success
      return; // Success, exit early
    } catch (exitError) {
      console.warn("⚠️ Normal dungeon exit failed, attempting fallback...", exitError);
    }
    
    // Fallback: If no source grid found, teleport to homestead
    console.log("📍 Fallback: Teleporting to player's homestead");
    const { handleTransitSignpost } = await import('./GameFeatures/Transit/Transit');
    await handleTransitSignpost(
      currentPlayerRef.current,
      "Signpost Home",
      setCurrentPlayer,
      setGridId,
      setGrid,
      setTileTypes,
      setResources,
      updateStatus,
      activeTileSize,
      currentPlayerRef.current.skills,
      closeAllPanels,
      bulkOperationContext,
      masterResources,
      strings,
      masterTrophies,
      transitionFadeControl
    );
    
    updateStatus("Dungeon reset - you've been returned to your homestead.");
  } catch (error) {
    console.error("❌ Error auto-exiting dungeon:", error);
    updateStatus("Error returning to surface. The dungeon will reset when you manually exit.");
  } finally {
    // Reset the flag after completion
    isDungeonExitInProgress.current = false;
  }
};

// Check for saved revival state on mount
useEffect(() => {
  const savedRevivalState = localStorage.getItem('revivalState');
  if (savedRevivalState && currentPlayer) {
    try {
      const revivalData = JSON.parse(savedRevivalState);
      // Check if it's for the current player
      if (revivalData.playerId === currentPlayer._id && revivalData.isRevivalPending) {
        console.log("🔄 Restoring revival state after refresh");
        setRevivalPending(true);
        setIsRevivalModalOpen(true);
      } else {
        localStorage.removeItem('revivalState');
      }
    } catch (error) {
      console.error("Error parsing revival state:", error);
      localStorage.removeItem('revivalState');
    }
  }
}, [currentPlayer]);

// Establish UI BADGING (Chat, Mailbox, Store) //////////////////////////////////////////////////////
useEffect(() => {
  if (!currentPlayer?.username) return;
  // Load badge state from localStorage
  const stored = localStorage.getItem(`badges_${currentPlayer.username}`);
  if (stored) {
    setBadgeState(JSON.parse(stored));
  }
  // Set up badge socket listener
  const cleanupBadges = socketListenForBadgeUpdates(currentPlayer, setBadgeState, updateBadge);
  // Clean up on unmount or player change
  return () => {
    cleanupBadges?.();
  };
}, [currentPlayer, socket]);

// Watch for ftuestep changes to show FTUE modal
useEffect(() => {
  // Only process FTUE if player is explicitly a first-time user
  if (currentPlayer?.firsttimeuser === true && currentPlayer?.ftuestep !== undefined && currentPlayer.ftuestep >= 0) {
    // Only show modal if this is a different step than last shown AND it's a forward progression
    if (currentPlayer.ftuestep !== lastShownFTUEStep && 
        (lastShownFTUEStep === null || currentPlayer.ftuestep > lastShownFTUEStep)) {
      
      // Check if app is initialized and grid has loaded
      const gridLoaded = isAppInitialized && tileTypes.length > 0 && resources.length > 0;
      
      if (gridLoaded) {
        console.log('🎓 FTUE step changed to:', currentPlayer.ftuestep, ', showing FTUE (grid loaded)');
        // Only close panels if the FTUE step will actually show a modal
        const stepData = masterFTUEsteps.find(step => step.step === currentPlayer.ftuestep);
        if (stepData?.showModal !== false) {
          // Close any open panels before showing FTUE modal to ensure clean state
          closePanel();
          setActiveStation(null); // Clear active station to prevent panels from re-opening
        }
        setShowFTUE(true);
        setLastShownFTUEStep(currentPlayer.ftuestep);
      } else {
        console.log('🎓 FTUE step changed to:', currentPlayer.ftuestep, ', but waiting for grid to load');
      }
    }
  }
}, [currentPlayer?.ftuestep, lastShownFTUEStep, isAppInitialized, tileTypes.length, resources.length, closePanel]);

// Also check when grid loads to show pending FTUE
useEffect(() => {
  if (currentPlayer?.firsttimeuser === true && 
      currentPlayer?.ftuestep !== undefined && 
      currentPlayer.ftuestep >= 0 &&
      !showFTUE &&
      isAppInitialized && 
      tileTypes.length > 0 && 
      resources.length > 0) {
    
    // If we have a pending FTUE step that hasn't been shown yet
    if (currentPlayer.ftuestep !== lastShownFTUEStep) {
      console.log('🎓 Grid loaded, showing pending FTUE step:', currentPlayer.ftuestep);
      // Only close panels if the FTUE step will actually show a modal
      const stepData = masterFTUEsteps.find(step => step.step === currentPlayer.ftuestep);
      if (stepData?.showModal !== false) {
        // Close any open panels before showing FTUE modal to ensure clean state
        closePanel();
        setActiveStation(null); // Clear active station to prevent panels from re-opening
      }
      setShowFTUE(true);
      setLastShownFTUEStep(currentPlayer.ftuestep);
    }
  }
}, [isAppInitialized, tileTypes.length, resources.length, currentPlayer, lastShownFTUEStep, showFTUE, closePanel]);

// FTUE Doinker - Update doinker targets based on current FTUE step
useEffect(() => {
  console.log(`👆 Doinker useEffect: ftuestep=${currentPlayer?.ftuestep}, firsttimeuser=${currentPlayer?.firsttimeuser}`);

  if (!currentPlayer?.firsttimeuser || currentPlayer?.ftuestep === undefined) {
    console.log('👆 Doinker: Clearing - player not firsttimeuser or ftuestep undefined');
    setDoinkerTargets(null);
    return;
  }

  const stepData = masterFTUEsteps.find(step => step.step === currentPlayer.ftuestep);
  console.log(`👆 Doinker: Step ${currentPlayer.ftuestep} data:`, stepData ? { doinker: stepData.doinker, doinkerTarget: stepData.doinkerTarget } : 'not found');

  if (stepData?.doinker && stepData?.doinkerTarget) {
    // doinkerTarget can be a string or an array of strings
    const targets = stepData.doinkerTarget;
    console.log(`👆 Doinker: Showing arrow(s) pointing to ${Array.isArray(targets) ? targets.join(', ') : targets} for FTUE step ${currentPlayer.ftuestep}`);
    setDoinkerTargets(targets);
  } else {
    console.log(`👆 Doinker: Clearing - step ${currentPlayer.ftuestep} has no doinker config`);
    setDoinkerTargets(null);
  }
}, [currentPlayer?.ftuestep, currentPlayer?.firsttimeuser]);

// Level-up detection: Watch for XP changes and show level-up modal
useEffect(() => {
  if (currentPlayer?.xp !== undefined && masterXPLevels && masterXPLevels.length > 0) {
    const newLevel = getDerivedLevel(currentPlayer, masterXPLevels);
    
    // If we have a previous level and the new level is higher, show level-up modal
    if (currentLevel !== null && newLevel > currentLevel) {
      setLevelUpData({
        currentLevel: newLevel,
        previousLevel: currentLevel
      });
      setIsLevelUpModalOpen(true);
    }
    
    // Update the tracked level
    setCurrentLevel(newLevel);
  }
}, [currentPlayer?.xp, masterXPLevels, currentLevel]);

// FARM STATE - Farming Seed Timer Management //////////////////////////////////////////////////////
useEffect(() => {
  if (gridId && masterResources) {
    farmState.initializeFarmState(resources); // ✅ Works for seeds
    farmState.startSeedTimer({gridId,setResources,masterResources});
  }
  return () => { farmState.stopSeedTimer(); };
}, [gridId, resources, masterResources]);  



// 🔄 NPC Management Loop
useEffect(() => {
  if (!isAppInitialized) { console.log('App not initialized. Skipping NPC management.'); return; }
  //console.log('🔄 NPC Management Loop started for gridId:', gridId);

  const interval = setInterval(() => {
    const currentGridNPCs = NPCsInGrid?.[gridId]?.npcs;
    if (!currentGridNPCs) {
      console.warn('No NPCs in NPCsInGrid for gridId:', gridId);
      return;
    }
    const isController = controllerUsername === currentPlayer?.username;

    if (isController) {
      Object.values(currentGridNPCs).forEach((npc) => {
        if (typeof npc.update !== 'function') {
          console.warn(`🛑 Skipping NPC without update() method:`, npc);
          return;
        }
        
        // Verify NPC belongs to current grid before updating
        if (npc.gridId && npc.gridId !== gridId) {
          console.warn(`⚠️ NPC ${npc.id} (${npc.type}) has gridId ${npc.gridId} but is being updated in grid ${gridId}. Skipping.`);
          return;
        }
        
        //console.log(`[🐮 NPC LOOP] Controller running update() for NPC ${npc.id}, state=${npc.state}`);
        npc.update(Date.now(), NPCsInGrid[gridId], gridId, activeTileSize);
      });
      
      // Trigger React state update after all NPCs have been updated
      // This ensures Canvas mode re-renders with new positions
      const updatedGridState = NPCsInGridManager.getNPCsInGrid(gridId);
      if (updatedGridState?.npcs) {
        NPCsInGridManager.setAllNPCs(gridId, updatedGridState.npcs);
        console.log('🔄 NPC update loop: Triggered state update, sample NPC:', 
          Object.values(updatedGridState.npcs)[0] ? {
            id: Object.values(updatedGridState.npcs)[0].id,
            pos: `${Object.values(updatedGridState.npcs)[0].position?.x},${Object.values(updatedGridState.npcs)[0].position?.y}`
          } : 'none'
        );
      }
    } else {
      //console.log('🛑 Not the NPC controller. Skipping NPC updates.');
    }
  }, 1000);

  return () => clearInterval(interval);
}, [isAppInitialized, gridId, NPCsInGrid, currentPlayer, activeTileSize, controllerUsername]);


/////////////////////////////////////////////////////////////////////////////////////////////////////////////
// 🔄 PC Management Loop: Check for player death & lava //////////////////////////////////////////////////////
useEffect(() => {
  if (!isAppInitialized) { console.log('App not initialized. Skipping PC management.'); return; }

  const interval = setInterval(async () => {
    if (playersInGrid && gridId && currentPlayer?._id) {
      const playerId = String(currentPlayer._id);
      const playerPC = playersInGrid?.[gridId]?.pcs?.[playerId];
      const col = playerPC?.position?.x;
      const row = playerPC?.position?.y;
      const onTileType = tileTypes?.[row]?.[col];

      if (playerPC?.hp <= 0 && currentPlayer && !revivalPending) {
        console.log("💀 Player is dead. Showing revival option...");
        
        // Set revival pending state and show revival modal
        setRevivalPending(true);
        setIsRevivalModalOpen(true);
        
        // Store revival state in localStorage for refresh handling
        const revivalState = {
          isRevivalPending: true,
          deathTimestamp: Date.now(),
          playerId: currentPlayer._id
        };
        localStorage.setItem('revivalState', JSON.stringify(revivalState));

      } else {
        // 🔥 Check for lava tile
        if (onTileType === "l") {
          const lavaDamage = 2;
          playersInGrid[gridId].pcs[playerId].hp -= lavaDamage;
          FloatingTextManager.addFloatingText(`- ${lavaDamage} ❤️‍🩹 HP`, col, row, activeTileSize);
          console.log("🔥 Player is standing on lava. Applying 2 damage.");
        }

      }
    }
  }, 1000);
  return () => clearInterval(interval);
// Add dependencies for resources, setResources, setInventory, setBackpack, inventory, backpack, masterResources, masterSkills
}, [
  isAppInitialized,
  gridId,
  playersInGrid,
  currentPlayer,
  activeTileSize,
  resources,
  setResources,
  setInventory,
  setBackpack,
  inventory,
  backpack,
  masterResources,
  masterSkills,
]);

// 🔄 PC Management Loop: Check for low health //////////////////////////////////////////////////////
useEffect(() => {
  if (!isAppInitialized) { console.log('App not initialized. Skipping PC Health Check.'); return; }

  const interval = setInterval(async () => {
      if (playersInGrid && gridId && currentPlayer?._id) {
        const playerId = String(currentPlayer._id);
        const playerPC = playersInGrid?.[gridId]?.pcs?.[playerId];
        const col = playerPC?.position?.x;
        const row = playerPC?.position?.y;

      if (playerPC?.hp <= (currentPlayer.baseMaxhp/2) && currentPlayer.location.gtype === 'homestead') {
          const healing = 2;
          playersInGrid[gridId].pcs[playerId].hp += healing;
          FloatingTextManager.addFloatingText(`+ ${healing} ❤️‍🩹 HP`, col, row, activeTileSize);
        }
    }
  }, 10000);
  return () => clearInterval(interval);
}, [
  isAppInitialized,
  gridId,
  playersInGrid,
  currentPlayer,
  activeTileSize,
  resources,
  setResources,
  setInventory,
  setBackpack,
  inventory,
  backpack,
  masterResources,
  masterSkills,
]);

/////// TIMERS & SEASONS //////////////////////////////////////////////////////

// TIMERS Step 1: Global State for Timers
const [timers, setTimers] = useState(() => {
  // Load from local storage (if available)
  const storedTimers = JSON.parse(localStorage.getItem("timers"));
  return storedTimers || {
    seasons: { phase: "", endTime: null, type: "" },
    elections: { phase: "", endTime: null },
    train: { phase: "", endTime: null },
    carnival: { phase: "", endTime: null },
    taxes: { phase: "", endTime: null },  
    bank: { phase: "", endTime: null },  
    dungeon: { phase: "", endTime: null },  
  }; 
});
const [countdowns, setCountdowns] = useState({ seasons: "", elections: "", train: "", carnival: "", taxes: "", bank: "", dungeon: "" });

// TIMERS Step 2: Initialize Timers on app start/refresh; run once
useEffect(() => {
  //console.log("🔄 currentPlayer = ",currentPlayer);

  if (!currentPlayer?.settlementId) return;
  const initializeTimers = async () => {
      await fetchTimersData();
      console.log("✅ Timers initialized:", timers);
  };
  initializeTimers();
  const interval = setInterval(fetchTimersData, 60 * 1000); // ✅ Refresh every 60s; DO WE NEED THIS??
  return () => clearInterval(interval);
}, [currentPlayer]); // ✅ Runs when currentPlayer is updated

// TIMERS Step 3: Fetch initial timers from the server
const fetchTimersData = async () => {
  //console.log("🔄 Fetching initial timers from the server...");
  
  if (!currentPlayer) { console.warn("⛔ No player loaded — skipping fetchTimersData."); return; }
  if (!currentPlayer?.settlementId || !currentPlayer?.frontierId) return;

  try {
    const res = await axios.get(`${API_BASE}/api/get-frontier/${currentPlayer.frontierId}`);
    const frontierData = res.data;
    
    // Check for season override from player settings
    let seasonType = frontierData.seasons?.seasonType || "Unknown";
    if (currentPlayer?.settings?.seasonOverride && currentPlayer.settings.seasonOverride !== "None") {
      console.log(`🌸 Applying season override: ${currentPlayer.settings.seasonOverride} (original: ${seasonType})`);
      seasonType = currentPlayer.settings.seasonOverride;
    }
    
    const updatedTimers = {
      seasons: {
        type: seasonType,
        phase: frontierData.seasons?.phase || "Unknown",
        endTime: frontierData.seasons?.endTime ? new Date(frontierData.seasons.endTime).getTime() : null,
      },
      elections: {
        phase: frontierData.elections?.phase || "Unknown",
        endTime: frontierData.elections?.endTime ? new Date(frontierData.elections.endTime).getTime() : null,
      },
      train: {
        phase: frontierData.train?.phase || "Unknown",
        endTime: frontierData.train?.endTime ? new Date(frontierData.train.endTime).getTime() : null,
      },
      carnival: {
        phase: frontierData.carnival?.phase || "Unknown",
        endTime: frontierData.carnival?.endTime ? new Date(frontierData.carnival.endTime).getTime() : null,
      },
      taxes: {
        phase: frontierData.taxes?.phase || "Unknown",
        endTime: frontierData.taxes?.endTime ? new Date(frontierData.taxes.endTime).getTime() : null,
      },
      bank: {
        phase: frontierData.bank?.phase || "Unknown",
        endTime: frontierData.bank?.endTime ? new Date(frontierData.bank.endTime).getTime() : null,
      },
      dungeon: {
        phase: frontierData.dungeon?.phase || "Unknown",
        endTime: frontierData.dungeon?.endTime ? new Date(frontierData.dungeon.endTime).getTime() : null,
      }
    };

    setTimers(updatedTimers);
    localStorage.setItem("timers", JSON.stringify(updatedTimers)); // Save to local storage
    console.log("✅ Current Time:", Date.now());
    
  } catch (error) {
    console.error("❌ Error fetching timers data:", error);
  }
};

// TIMERS Step 4: Update countdown timers
useEffect(() => {
  const updateCountdowns = () => {
    // Guard against uninitialized timers
    if (!timers || !timers.carnival) {
      console.log("Timers not yet initialized, skipping countdown update");
      return;
    }
    
    const now = Date.now(); // Get current timestamp

    setCountdowns({
      seasons: timers.seasons?.endTime ? formatCountdown(timers.seasons.endTime, now) : "--:--:--",
      elections: timers.elections?.endTime ? formatCountdown(timers.elections.endTime, now) : "--:--:--",
      train: timers.train?.endTime ? formatCountdown(timers.train.endTime, now) : "--:--:--",
      carnival: timers.carnival?.endTime ? formatCountdown(timers.carnival.endTime, now) : "--:--:--",
      taxes: timers.taxes?.endTime ? formatCountdown(timers.taxes.endTime, now) : "--:--:--",
      bank: timers.bank?.endTime ? formatCountdown(timers.bank.endTime, now) : "--:--:--",
      dungeon: timers.dungeon?.endTime ? formatCountdown(timers.dungeon.endTime, now) : "--:--:--",
    });
  };

  updateCountdowns(); // Run immediately
  const interval = setInterval(updateCountdowns, 1000); // Update UI every second

  return () => clearInterval(interval); // Cleanup on unmount
}, [timers]); // Runs when timers update


// TIMERS Step 5: Check Phase Transitions (LOCAL)
useEffect(() => {
  const checkPhaseTransitions = async () => {
    //console.log("🔍checkPhaseTransitions;  season = ",timers.seasons.phase);
    const now = Date.now();
    let shouldFetchNewTimers = false;
    // console.log("🕰️ Checking season timer... now =", new Date(now).toLocaleTimeString(), 
    //   "| endTime =", new Date(timers.seasons.endTime).toLocaleTimeString()
    // );
    if (timers.seasons.endTime && now >= timers.seasons.endTime) {
      console.log("🌱 Season phase ended.");
      shouldFetchNewTimers = true;
    }
    if (timers.elections.endTime && now >= timers.elections.endTime) {
      console.log("🏛️ Election phase ended. Fetching new election data...");
      shouldFetchNewTimers = true;
    }
    if (timers.train.endTime && now >= timers.train.endTime) {
      console.log("🚂 Train cycle ended. Fetching new train data...");
      shouldFetchNewTimers = true;
    }
    if (timers.carnival.endTime && now >= timers.carnival.endTime) {
      console.log("🎡 Carnival cycle ended. Fetching new carnival data...");
      shouldFetchNewTimers = true;
    }
    if (timers.taxes.endTime && now >= timers.taxes.endTime) {
      console.log("💰 Tax cycle ended. Fetching new tax data...");
      shouldFetchNewTimers = true;
    }
    if (timers.bank.endTime && now >= timers.bank.endTime) {
      console.log("💰 Bank cycle ended. Fetching new bank timer...");
      shouldFetchNewTimers = true;
    }
    if (timers.dungeon.endTime && now >= timers.dungeon.endTime) {
      console.log("⚔️ Dungeon phase ended. Transitioning phase...");
      
      // Toggle dungeon phase locally for immediate UI update
      const newDungeonPhase = timers.dungeon.phase === "open" ? "resetting" : "open";
      setTimers(prev => ({
        ...prev,
        dungeon: {
          ...prev.dungeon,
          phase: newDungeonPhase,
          endTime: null // Will be updated by fetchTimersData
        }
      }));
      
      // Check if player is in a dungeon and needs to be teleported out
      // Skip FTUE Cave dungeon - it doesn't use the normal timer system
      const isInFTUECave = currentPlayerRef.current?.location?.g?.toString() === FTUE_CAVE_GRID_ID;
      if (newDungeonPhase === "resetting" && currentPlayerRef.current?.location?.gtype === "dungeon" && !isInFTUECave) {
        console.log("🚨 Player is in dungeon during reset phase - teleporting out!", {
          timestamp: Date.now(),
          playerId: currentPlayerRef.current._id,
          sourceGrid: currentPlayerRef.current.sourceGridBeforeDungeon
        });
        handleDungeonAutoExit();
      }
      
      shouldFetchNewTimers = true;
    }
    if (shouldFetchNewTimers) {
      console.log("⏳ A phase has ended! Fetching updated timers...");
      await fetchTimersData();
      const updatedPhase = JSON.parse(localStorage.getItem("timers"))?.seasons?.phase;
      if (updatedPhase === "offSeason") {
        setIsOffSeason(true);
        console.log("🕓 OffSeason detected immediately after fetch.");
      }
    }
  };

  if (timers.seasons.phase === "offSeason") { 
    setIsOffSeason(true);
  } else {
    setIsOffSeason(false); 
  }

  const interval = setInterval(checkPhaseTransitions, 1000); // ✅ Check every 1s
  return () => clearInterval(interval);
}, [timers]); // Runs when timers update


const previousPhaseRef = useRef(timers.seasons?.phase);

// 🔄 Refresh client when offSeason ends
useEffect(() => {
  const currentPhase = timers.seasons?.phase;
  if (
    previousPhaseRef.current === "offSeason" &&
    currentPhase === "onSeason"
  ) {
    console.warn("🔁 offSeason ended — forcing full app reload.");
    window.location.reload();
  }
  previousPhaseRef.current = currentPhase;
}, [timers.seasons?.phase]);



/////////// SOCKET LISTENERS /////////////////////////

// 🔄 SOCKET LISTENER: Real-time updates for PC join and leave
useEffect(() => {
  socketListenForPCJoinAndLeave(gridId, currentPlayer, isMasterResourcesReady, setPlayersInGrid, controllerUsername, setControllerUsername);
}, [socket, gridId, isMasterResourcesReady, currentPlayer, controllerUsername]);

// 🔄 SOCKET LISTENER: PCs: Real-time updates for GridState (PC sync)
useEffect(() => {
  if (!isAppInitialized) { console.log('App not initialized. Skipping PC socket changes.'); return; }
  socketListenForPCstateChanges(activeTileSize, gridId, currentPlayer, setPlayersInGrid, localPlayerMoveTimestampRef, setConnectedPlayers);
}, [socket, gridId, currentPlayer]);

// 🔄 SOCKET LISTENER: NPCs:  Real-time updates for GridStateNPC snc
useEffect(() => {
  if (!isAppInitialized) { console.log('App not initialized. Skipping NPC socket changes.'); return; }  
  socketListenForNPCStateChanges(activeTileSize, gridId, setGridState, npcController);
}, [socket, gridId, isAppInitialized]);

// 🔄 SOCKET LISTENER: Real-time updates for resources
useEffect(() => {
  socketListenForResourceChanges(activeTileSize, gridId, isMasterResourcesReady, setResources, masterResources, enrichResourceFromMaster);
}, [socket, gridId, isMasterResourcesReady]); // ← Add isMasterResourcesReady as a dependency

// 🔄 SOCKET LISTENER: Real-time updates for tiles
useEffect(() => {
  socketListenForTileChanges(gridId, setTileTypes, mergeTiles);
}, [socket, gridId]);

// Add socket event listeners for NPC controller status
useEffect(() => {
  socketListenForNPCControllerStatus(gridId, currentPlayer, setControllerUsername);
}, [socket, gridId, currentPlayer]);

// 🔄 SOCKET LISTENER: Force refresh on season reset
useEffect(() => {
  socketListenForSeasonReset();
}, [socket]);

useEffect(() => {
  if (!socket || !currentPlayer || !gridId) return;
  socketListenForConnectAndDisconnect(gridId, currentPlayer, setIsSocketConnected);
}, [socket, currentPlayer, gridId]);

useEffect(() => {
  if (!socket || !gridId) return;
  const cleanup = socketListenForPlayerConnectedAndDisconnected(gridId, setConnectedPlayers);
  return cleanup;
}, [socket, gridId]);

// 🔄 SOCKET LISTENER: Real-time updates for mailbox badge
useEffect(() => {
  if (!socket || !currentPlayer?.playerId) return;
  const cleanup = socketListenForBadgeUpdates(currentPlayer, setBadgeState, updateBadge);
  return cleanup;
}, [socket, currentPlayer]);

// 🔄 SOCKET LISTENER: Real-time chat messages
useEffect(() => {
  if (!socket || !currentPlayer) return;
  const cleanup = socketListenForChatMessages(setChatMessages); // ✅ Must pass correct setter
  return cleanup;
}, [socket, currentPlayer]);


/////////// HANDLE ZOOMING & RESIZING /////////////////////////

const zoomIn = async () => {
  const gridId = currentPlayer?.location?.g;
  if (!gridId || !currentPlayer?._id) { console.warn("No valid gridId or playerId found for currentPlayer."); return; }
  if (currentPlayer.iscamping) { updateStatus(32); return; }
  
  if (zoomLevel === 'frontier') {
    setZoomLevel('settlement'); // Zoom into the settlement view
    updateStatus(12); // "Settlement view."
  } else if (zoomLevel === 'settlement') {
    setZoomLevel('far'); // Zoom into the grid view - useLayoutEffect will center camera
    const { username, gridType } = await fetchHomesteadOwner(gridId);

    if (gridType === 'town') {
      updateStatus(14);
    } else if (["valley0", 'valley1', 'valley2', 'valley3'].includes(gridType)) {
      updateStatus(16);
    } else if (gridType === 'homestead') {
      if (username) {
        await updateGridStatus(gridType, username, updateStatus, currentPlayer, currentPlayer.location.g);
      } else {
        updateStatus('This homestead is unoccupied.');
      }
    } else {
      console.warn(`Unexpected gridType: ${gridType}`);
      updateStatus('Unknown location.');
    }

  } else if (zoomLevel === 'far') {
    setZoomLevel('close'); // Zoom into a detailed view - useLayoutEffect will center camera
  } else if (zoomLevel === 'close') {
    setZoomLevel('closer'); // useLayoutEffect will center camera
  }
};

const zoomOut = () => {
  if (!currentPlayer?.location?.g || !currentPlayer?._id) { console.warn("No valid gridId or playerId found for currentPlayer."); return; }
  if (currentPlayer.iscamping) { updateStatus(32); return; }

  if (zoomLevel === 'closer') {
    setZoomLevel('close'); // useLayoutEffect will center camera
  } else if (zoomLevel === 'close') {
    setZoomLevel('far'); // useLayoutEffect will center camera
  } else if (zoomLevel === 'far') {
    setZoomLevel('settlement'); // Zoom out to settlement view
    updateStatus(12); // "Settlement view."
  } else if (zoomLevel === 'settlement') {
    setZoomLevel('frontier'); // Zoom out to frontier view
    updateStatus(13); // "Frontier view."
  }
};

/////////// HANDLE KEY MOVEMENT /////////////////////////

const localPlayerMoveTimestampRef = useRef(0);
const currentPlayerRef = useRef(currentPlayer);
const isDungeonExitInProgress = useRef(false);

// Keep currentPlayerRef updated
useEffect(() => {
  currentPlayerRef.current = currentPlayer;
  if (currentPlayer?.sourceGridBeforeDungeon) {
    console.log("📍 Player sourceGridBeforeDungeon updated:", currentPlayer.sourceGridBeforeDungeon);
  }
}, [currentPlayer]);

useEffect(() => {
  const handleKeyDown = (event) => {
    if (activeModal) { return; } // Keyboard input disabled while modal is open
    if (isOffSeason) { return; } // Keyboard input disabled while offseason

    // Handle zoom shortcuts (work at any zoom level)
    if (event.key === '-' || event.key === '_') {
      zoomOut();
      event.preventDefault();
      return;
    }
    if (event.key === '=' || event.key === '+') {
      zoomIn();
      event.preventDefault();
      return;
    }

    // Handle Escape key to clear cursor mode (plant/terraform with cursor)
    if (event.key === 'Escape') {
      setCursorMode(null);
      event.preventDefault();
      return;
    }

    if (zoomLevel === 'frontier' || zoomLevel === 'settlement') { return; }  // Prevent input if zoomed out
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) { return; } // Prevent movement if a text input is focused
    
    // Handle inventory shortcut
    if (event.key === 'i' || event.key === 'I') {
      if (currentPlayer) {
        openPanel('InventoryPanel');
        event.preventDefault();
      }
      return;
    }
    
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); }  // Prevent the browser from scrolling when using arrow keys

    handleMovementKeyDown(event, currentPlayer, activeTileSize, masterResources,
        setCurrentPlayer, 
        setGridId, 
        setGrid, 
        setTileTypes, 
        setResources, 
        updateStatus, 
        closeAllPanels,
        localPlayerMoveTimestampRef,
        bulkOperationContext,
        strings,
        transitionFadeControl
    );
  };
  
  const handleKeyUp = (event) => {
    // Handle key release for diagonal movement
    handleMovementKeyUp(event);
  };
  
  window.addEventListener('keydown', handleKeyDown); 
  window.addEventListener('keyup', handleKeyUp);
  return () => {
    window.removeEventListener('keydown', handleKeyDown); 
    window.removeEventListener('keyup', handleKeyUp);
  };
}, [currentPlayer, masterResources, activeTileSize, activeModal, zoomLevel]);



//////////// HANDLE CLICKING /////////////////////////

let isProcessing = false; // Guard against duplicate clicks

const handleTileClick = useCallback(async (rowIndex, colIndex) => {
  if (isProcessing) return; // Skip if still processing
  isProcessing = true;

  // Check if player is on their own homestead (no range restrictions there)
  const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;

  // Get player position for range checks
  const playerPos = playersInGridManager.getPlayerPosition(gridId, String(currentPlayer?._id));
  const targetPos = { x: colIndex, y: rowIndex };

  // Helper to check if target is in range (used by cursor mode handlers)
  const isInRange = () => {
    if (isOnOwnHomestead) return true; // No range restriction on own homestead
    if (!playerPos) return false;
    const distance = calculateDistance(playerPos, targetPos);
    const playerRange = getDerivedRange(currentPlayer, masterResources);
    return distance <= playerRange;
  };

  // Handle cursor mode (e.g., planting with cursor)
  if (cursorMode?.type === 'plant' && cursorMode.item) {
    // Range check for cursor placement (skipped on own homestead)
    if (!isInRange()) {
      FloatingTextManager.addFloatingText(24, targetPos.x, targetPos.y, activeTileSize);
      isProcessing = false;
      return;
    }
    const { handleFarmPlotPlacement } = await import('./GameFeatures/Farming/Farming');
    await handleFarmPlotPlacement({
      selectedItem: cursorMode.item,
      TILE_SIZE: activeTileSize,
      resources,
      setResources,
      currentPlayer,
      setCurrentPlayer,
      inventory,
      setInventory,
      backpack,
      setBackpack,
      gridId,
      masterResources,
      masterSkills,
      updateStatus,
      overridePosition: { x: colIndex, y: rowIndex }, // Plant at clicked tile, not player position
    });
    isProcessing = false;
    return;
  }

  // Handle terraform cursor mode (supports both tileType and legacy actionType)
  if (cursorMode?.type === 'terraform' && (cursorMode.tileType || cursorMode.actionType)) {
    // Range check for cursor placement (skipped on own homestead)
    if (!isInRange()) {
      FloatingTextManager.addFloatingText(24, targetPos.x, targetPos.y, activeTileSize);
      isProcessing = false;
      return;
    }
    const { handleTerraform } = await import('./GameFeatures/Farming/Farming');
    await handleTerraform({
      TILE_SIZE: activeTileSize,
      tileType: cursorMode.tileType, // New: direct tile type
      actionType: cursorMode.actionType, // Legacy: action type mapping
      gridId,
      currentPlayer,
      tileTypes,
      setTileTypes,
      overridePosition: { x: colIndex, y: rowIndex }, // Terraform at clicked tile
      isDeveloper,
    });
    isProcessing = false;
    return;
  }

  // Handle build cursor mode (Build, Buy, BuyDeco, and Pets panels)
  if (cursorMode?.type === 'build' && cursorMode.item && cursorMode.buildOptions) {
    // Range check for cursor placement (skipped on own homestead)
    if (!isInRange()) {
      FloatingTextManager.addFloatingText(24, targetPos.x, targetPos.y, activeTileSize);
      isProcessing = false;
      return;
    }
    const { handleConstruction } = await import('./GameFeatures/BuildAndBuy');
    await handleConstruction({
      TILE_SIZE: activeTileSize,
      selectedItem: cursorMode.item,
      buildOptions: cursorMode.buildOptions,
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
      overridePosition: { x: colIndex, y: rowIndex }, // Build at clicked tile
    });
    isProcessing = false;
    return;
  }

  // Find resource including multi-tile resources
  const resource = resources.find((res) => {
    const tileSpan = res.size || 1;
    // Check if the clicked tile falls within the resource's size
    // Resource is anchored at lower-left (res.x, res.y)
    return colIndex >= res.x && colIndex < res.x + tileSpan &&
           rowIndex <= res.y && rowIndex > res.y - tileSpan;
  });
  console.log('⬆️ handleTileClick invoked with:', { rowIndex, colIndex, resource });

  // 🛡️ Prevent interaction on another player's homestead
  if (resource && currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead && !isDeveloper) {
    const isFriend = false; // 🧪 Future: replace with actual friend-checking logic
    const alwaysBlocked = ['Mailbox', 'Trade Stall', 'Warehouse'];
    const isForbiddenStation = resource?.category === 'station' && alwaysBlocked.includes(resource?.type);
    const isSafe = resource?.category === 'npc' || resource?.category === 'travel'; // Expand as needed
    if (isForbiddenStation || (!isSafe && !isFriend)) {
      console.warn("🚫 Blocked interaction on another player's homestead.");
      updateStatus(90);
      isProcessing = false;
      return;
    }
  }

  // Validate `gridId` and `username`
  if (!gridId || typeof gridId !== 'string') { console.error('Invalid gridId:', gridId); return; }
  if (!currentPlayer?.username || typeof currentPlayer.username !== 'string') { console.error('Invalid username:', currentPlayer?.username); return; }
  if (!currentPlayer?._id) { console.error('No player ID found'); return; }
  if (!playerPos || typeof playerPos.x === 'undefined' || typeof playerPos.y === 'undefined') {
      console.error("⚠️ Player position is invalid in NPCsInGrid; playerPos: ", playerPos);
      isProcessing = false;
      return;
  }
  // If clicking a resource, check range before interacting (except NPCs, and skip on own homestead)
  if (resource && resource.category !== 'npc' && !isOnOwnHomestead) {
    const distance = calculateDistance(playerPos, targetPos);
    const playerRange = getDerivedRange(currentPlayer, masterResources);
    if (distance > playerRange) {
      FloatingTextManager.addFloatingText(24, targetPos.x, targetPos.y, activeTileSize);
      isProcessing = false;
      return;
    }
    
    // Check for walls blocking line of sight
    if (isWallBlocking(playerPos, targetPos)) {
      FloatingTextManager.addFloatingText(40, targetPos.x, targetPos.y, activeTileSize); // string[40] for wall blocking
      console.log('Wall blocking interaction from player to resource');
      isProcessing = false;
      return;
    }
  }
  if (resource) {
    console.log('App.js: Resource clicked:', resource);
    if (resource.category === 'npc') { } // handled in RenderDynamic
    else if (resource.category === 'travel') {
      // Check if any bulk operation is active
      if (bulkOperationContext?.isAnyBulkOperationActive?.()) {
        const activeOps = bulkOperationContext.getActiveBulkOperations();
        updateStatus(470);
        return;
      }
      
      // Handle dungeon-related signposts specially
      if (resource.type === 'Dungeon Entrance') {
        console.log('🚪 Dungeon entrance clicked in App.js');
        
        // Check if we have dungeon phase data
        if (!timers?.dungeon) {
          console.warn('No dungeon phase data available');
          updateStatus("Unable to access dungeon information");
          return;
        }
        
        // Determine actual phase based on whether timer has expired
        let actualPhase = timers.dungeon.phase;
        if (timers.dungeon.endTime) {
          const now = Date.now();
          const endTime = timers.dungeon.endTime;
          
          // If current time is past the end time, phase has switched
          if (now >= endTime) {
            // Timer expired - phase should switch
            actualPhase = timers.dungeon.phase === 'open' ? 'resetting' : 'open';
            console.log(`⏰ Timer expired - actual phase is ${actualPhase} (server still shows ${timers.dungeon.phase})`);
          }
        }
        
        const { handleDungeonEntrance } = await import('./GameFeatures/Dungeon/Dungeon');
        await handleDungeonEntrance(
          currentPlayer,
          actualPhase,
          setCurrentPlayer,
          setGridId,
          setGrid,
          setTileTypes,
          setResources,
          updateStatus,
          activeTileSize,
          closeAllPanels,
          bulkOperationContext,
          masterResources,
          strings,
          masterTrophies,
          transitionFadeControl,
          { x: resource.x * activeTileSize, y: resource.y * activeTileSize }
        );
      } else if (resource.type === 'Dungeon Exit') {
        console.log('🚪 Dungeon exit clicked in App.js');
        
        const { handleDungeonExit } = await import('./GameFeatures/Dungeon/Dungeon');
        await handleDungeonExit(
          currentPlayer,
          setCurrentPlayer,
          setGridId,
          setGrid,
          setTileTypes,
          setResources,
          updateStatus,
          activeTileSize,
          closeAllPanels,
          bulkOperationContext,
          masterResources,
          strings,
          masterTrophies,
          transitionFadeControl
        );
      } else {
        // Handle regular signposts
        const { handleTransitSignpost } = await import('./GameFeatures/Transit/Transit');
        await handleTransitSignpost(
          currentPlayer,
          resource.type,
          setCurrentPlayer,
          setGridId,
          setGrid,
          setTileTypes,
          setResources,
          updateStatus,
          activeTileSize,
          currentPlayer.skills,
          closeAllPanels,
          bulkOperationContext,
          masterResources,
          strings,
          masterTrophies,
          transitionFadeControl
        );
      }
    }
    else if (resource.category === 'training' || resource.category === 'trainingAndShop') {
      setActiveStation({type: resource.type, position: { x: resource.x, y: resource.y }, gridId: gridId, category: resource.category });
      openPanel('SkillsPanel');
    }
    else if (resource.category === 'crafting') {
      setActiveStation({type: resource.type,position: { x: resource.x, y: resource.y }, gridId: gridId, });
      switch (resource.type) {
        case 'Ancient Temple':
          openPanel('ScrollStation'); 
          break;
        default:
          openPanel('CraftingStation');
          break;
      }
    } 
    else if (resource.category === 'farmhouse') {
      setActiveStation({type: resource.type,position: { x: resource.x, y: resource.y }, gridId: gridId, });
      openPanel('FarmHouse');
    } 
    else if (resource.category === 'shop') {
      setActiveStation({type: resource.type,position: { x: resource.x, y: resource.y }, gridId: gridId, });
      openPanel('ShopStation');
    } 
    else if (resource.category === 'stall') {
      setActiveStation({type: resource.type, position: { x: resource.x, y: resource.y }, gridId: gridId, });
      openPanel('AnimalStall');
    } 
    else if (resource.category === 'farmplot') {
      setActiveStation({type: resource.type, position: { x: resource.x, y: resource.y }, gridId: gridId, resource: resource });
      openPanel('CropPanel');
    } 
    else if (resource.category === 'deco') {
      // If it's a door, also show access feedback
      if (resource.action === 'door') {
        const { handleDoorClick } = await import('./GameFeatures/Doors/Doors');
        handleDoorClick(resource, currentPlayer, activeTileSize, updateStatus, strings);
      }
      
      setActiveStation({type: resource.type, position: { x: resource.x, y: resource.y }, gridId: gridId, });
      openPanel('DecoPanel');
    } 
    else if (resource.category === 'pet') {
      setActiveStation({type: resource.type, position: { x: resource.x, y: resource.y }, gridId: gridId, });
      openPanel('PetPanel');
    } 
    else if (resource.category === 'station') {
      setActiveStation({type: resource.type, position: { x: resource.x, y: resource.y }, gridId: gridId, });
      switch (resource.type) {
        case 'Courthouse':
          openPanel('Courthouse'); break;
        case 'Trade Stall':
        case 'Trade':
        case 'Trading Post':
          openPanel('TradeStall'); 
          break;
        case 'Outpost':
          openPanel('OutpostPanel'); 
          break;
        case 'Mailbox':
          openModal('Mailbox'); break;
        case 'Warehouse':
          openPanel('WarehousePanel'); break;
        case 'Train':
//          openPanel('TrainPanel'); break;
          openPanel('NewTrainPanel'); break;
        case 'Carnival':
          openPanel('CarnivalPanel'); break;
        case 'Bank':
          openPanel('BankPanel'); break;
        case 'Worker Slot':
          // Find the Farm House on the grid
          const farmHouse = resources.find(res => res.type === 'Farm House' && res.category === 'farmhouse');
          if (farmHouse) {
            // Set the Farm House as the active station
            setActiveStation({
              type: 'Farm House', 
              position: { x: farmHouse.x, y: farmHouse.y }, 
              gridId: gridId
            });
            openPanel('FarmHouse');
          } else {
            console.warn('Farm House not found on grid');
            updateStatus('Farm House not found');
          }
          break;
        default:
          console.warn(`Unhandled station type: ${resource.type}`);
      }
    } else {
      // Pass to handleResourceClick for all other resources
      // Use resource's anchor position for multi-tile resources
      handleResourceClick(
        resource,
        resource.y,  // Use resource's actual y position
        resource.x,  // Use resource's actual x position
        resources,
        setResources,
        setInventory,
        setBackpack,
        inventory,
        backpack,
        FloatingTextManager.addFloatingText,
        gridId,
        activeTileSize,
        tileTypes,
        currentPlayer,
        setCurrentPlayer,
        setGridId,
        setGrid,
        setTileTypes,
        updateStatus,
        masterResources,
        masterSkills,
        setModalContent,
        setIsModalOpen,
        closeAllPanels,
        strings,
        bulkOperationContext,
        openPanel,
        masterTrophies,
        globalTuning,
        transitionFadeControl,
        timers
      ).finally(() => {
        isProcessing = false; // Reset flag after processing
      });
    }
  } else {
    console.log('isTeleportEnabled:', currentPlayer?.settings?.isTeleportEnabled);
  
    if (currentPlayer?.settings?.isTeleportEnabled) {
      const targetPosition = { x: colIndex, y: rowIndex };
      console.log('📍 Player teleporting to grid position:', targetPosition);
  
      // Update currentPlayer state
      const updatedPlayer = {
        ...currentPlayer,
        position: targetPosition
      };
      setCurrentPlayer(updatedPlayer);
      localStorage.setItem('player', JSON.stringify(updatedPlayer));
  
      // Multiplayer sync — update PC in grid
      if (currentPlayer?._id) {
        playersInGridManager.updatePC(gridId, currentPlayer._id, {
          position: targetPosition
        });
      }
    }
  }
  isProcessing = false; // Reset flag here

}, [resources, gridId, inventory, currentPlayer, playerPosition, activeTileSize, cursorMode]);
  

  
//////////// HANDLE LOGIN and LOGOUT /////////////////////////

const handleLogout = () => {
  console.log('Logging out user...');
  NPCsInGridManager.stopGridStateUpdates();  // Clear all states
  setCurrentPlayer(null);
  setInventory({});
  setPlayerPosition({ x: 0, y: 0 });
  setGrid([]); // Clear the grid
  setResources([]); // Clear resources
  setTileTypes([]); // Clear tile types
  setGridId(null); // Clear gridId
  localStorage.removeItem('gridId'); // Remove gridId from local storage
  localStorage.removeItem('player');  // Remove player data from local storage
  window.location.reload();  // Force a state reset by triggering the login modal
  console.log('Player has logged out, and state has been reset.');
};

const handleLoginSuccess = async (player) => {
  console.log('Handling login success for player:', player);  // Store player data in localStorage
  localStorage.setItem('player', JSON.stringify(player));  // Reload the app (triggers full initialization)
  window.location.reload();
};


  /////////////// HANDLE INACTIVITY for controller relinquishment and refresh //////////////

  useEffect(() => {
    let lastActivity = Date.now();
    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes
    const REFRESH_TIMEOUT = 20 * 60 * 1000; // 20 minutes
    const updateActivity = () => { lastActivity = Date.now(); };

    const checkStaleness = () => {
      const now = Date.now();
      const inactiveTime = now - lastActivity;
      if (inactiveTime >= REFRESH_TIMEOUT) {
        console.warn('🔁 Inactive too long. Showing refresh modal.');
        setModalContent({
          title: strings["70"],
          message: strings["71"],
          message2: strings["72"],
          size: "small",
          onClose: () => setIsModalOpen(false),
          children: (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
              <div className="shared-buttons">
                <button
                  className="btn-basic btn-success"
                  onClick={() => {
                    setIsModalOpen(false);
                    window.location.reload();
                  }}
                >
                  {strings["73"]}
                </button>
              </div>
            </div>
          ),
        });
        setIsModalOpen(true);

        // Set a backup auto-refresh after 30 seconds
        setTimeout(() => {
          console.warn("🔁 Auto-refreshing due to inactivity...");
          window.location.reload();
        }, 30000);

      } else if (inactiveTime >= INACTIVITY_LIMIT) {
        console.warn('👋 Inactive for a while. Releasing controller role.');
        if (controllerUsername === currentPlayer?.username) {
          socket.emit('relinquish-npc-controller', { gridId });
        }
      }
    };

    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // When tab becomes visible, check if we've been inactive too long BEFORE updating activity
        const now = Date.now();
        const inactiveTime = now - lastActivity;
        console.log(`👀 Tab became visible. Inactive for ${Math.floor(inactiveTime / 60000)} minutes`);
        
        // Check staleness FIRST before updating activity
        if (inactiveTime >= REFRESH_TIMEOUT) {
          console.warn('🔁 Was inactive too long while tab was hidden. Showing refresh modal.');
          checkStaleness();
          // Don't update activity - let the modal show
          return;
        }
        
        // Only update activity if we haven't exceeded timeout
        updateActivity();
      }
    });

    const interval = setInterval(checkStaleness, 60000); // check every minute

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      clearInterval(interval);
    };
  }, [currentPlayer, controllerUsername, gridId]);


  ///////////////// FOR THE PANELS:

  const [showTimers, setShowTimers] = useState(false);
  const [showStats, setShowStats] = useState(false); // Toggle for combat stats UI
  const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;

  // Chat panel slideout state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatClosing, setIsChatClosing] = useState(false);
  
  const handleCloseChat = () => {
    setIsChatClosing(true);
    setTimeout(() => {
      setIsChatOpen(false);
      setIsChatClosing(false);
    }, 300); // Match the animation duration
  };


  ///////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////
  /////////////// RENDERING THE APP /////////////////////////
  ///////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////

  // Extract NPCs and PCs for the current grid (only when rendering game board)
  const npcs = React.useMemo(() => {
    if (zoomLevel === 'far' || zoomLevel === 'closer' || zoomLevel === 'close') {
      const npcArray = Object.values(NPCsInGrid?.[gridId]?.npcs || {});
      return npcArray;
    }
    return [];
  }, [NPCsInGrid, gridId, zoomLevel]);
  
  const pcs = Object.values(playersInGrid?.[gridId]?.pcs || {});


return (
    <>
    {showRedirect && <Redirect />}
    <FloatingTextManager />

{/* //////////////////////  Header  //////////////////////// */}

    <header className="app-header">

        <div className="header-title">
          <h1>{strings[0]}</h1>
        </div>

        <div className="header-controls-left header-grid">
          {/* Grid layout: 3 columns x 2 rows */}
          {/* Row 1 */}
          <button className="header-link" onClick={() => {
            if (currentPlayer) {
              const currentPC = {
                playerId: currentPlayer._id,
                username: currentPlayer.username,
                icon: currentPlayer.icon,
                hp: currentPlayer.hp || 100,
                position: { x: 0, y: 0 },
                iscamping: currentPlayer.iscamping,
                isinboat: currentPlayer.isinboat
              };
              handlePCClick(currentPC);
            }
          }}>
            {currentPlayer?.icon || '😊'} {currentPlayer?.username || 'Loading...'}
          </button>


          <span className="header-link" style={{ textDecoration: 'none', cursor: 'default' }}>
            {strings[10150]} {getDerivedLevel(currentPlayer, masterXPLevels)}
          </span>
          <button className="header-link" disabled={!currentPlayer} onClick={() => openPanel('InventoryPanel')}>
            {strings[10103]}
          </button>
          {/* Row 2 */}
          <span></span>
          <span className="header-link" style={{ textDecoration: 'none', cursor: 'default' }}>
            {strings[10112]} {currentPlayer?._id ? playersInGrid?.[gridId]?.pcs?.[String(currentPlayer._id)]?.hp ?? "?" : "?"}/{currentPlayer?._id ? playersInGrid?.[gridId]?.pcs?.[String(currentPlayer._id)]?.maxhp ?? "?" : "?"}
          </span>
          <div className="header-currency-group">
            <button className="header-link" onClick={() => openPanel('HowToGemsPanel')}>
              💎 {Array.isArray(currentPlayer?.inventory)
                ? (currentPlayer.inventory.find((item) => item.type === "Gem")?.quantity || 0).toLocaleString()
                : "..."}
            </button>
            <button className="header-link" onClick={() => openPanel('HowToMoneyPanel')}>
              💰 {Array.isArray(currentPlayer?.inventory)
                ? (currentPlayer.inventory.find((item) => item.type === "Money")?.quantity || 0).toLocaleString()
                : "..."}
            </button>
          </div>
        </div>

        <div className="header-controls-center">
          {/* Row 1: Store */}
          <div className="header-row">
            <div className="header-link-wrapper">
              <button className="header-link" disabled={!currentPlayer} onClick={() => setActiveModal("Store")}>
                {strings[10104]}
              </button>
              {badgeState.store && <div className="badge-dot" />}
            </div>
          </div>
          {/* Row 2: Inbox */}
          <div className="header-row">
            <div className="header-link-wrapper">
              {badgeState.mailbox && <div className="badge-dot badge-dot-left" />}
              <button className="header-link" disabled={!currentPlayer} onClick={() => openModal('Mailbox')}>
                {strings[10105]}
              </button>
            </div>
          </div>
        </div>

        <div className="header-controls-right header-grid-right">
          {/* Grid layout: 3 columns x 2 rows */}
          {/* Row 1: Settings, Chat, (empty) */}
          <button className="header-link" onClick={() => openPanel('ProfilePanel')}>
            {strings[1190]}
          </button>
          <div className="header-link-wrapper">
            <button className="header-link" disabled={!currentPlayer} onClick={() => setIsChatOpen(prev => !prev)}>
              {strings[10107]}
            </button>
            {badgeState.chat && <div className="badge-dot" />}
          </div>
          <span></span>
          {/* Row 2: Leaders, Language, Share */}
          <button className="header-link" disabled={!currentPlayer} onClick={() => openPanel('LeaderboardPanel')}>
            {strings[1140]}
          </button>
          <button className="header-link" disabled={!currentPlayer} onClick={() => setActiveModal('LanguagePicker')}>
            🌐 {LANGUAGE_OPTIONS.find(l => l.code === currentPlayer?.language)?.label || 'Language'}
          </button>
          <button className="header-link" onClick={() => setShowShareModal(true)}>
            {strings[10106]}
          </button>
        </div>
    </header>
    
    <div className="status-bar-wrapper"> <StatusBar /> </div>

    {/* Chat Slideout Panel */}
    {isChatOpen && currentPlayer && (
      <div className={`chat-panel-slideout ${isChatClosing ? 'closing' : ''}`}>
        <Chat
          currentGridId={currentPlayer.location?.g}
          currentSettlementId={currentPlayer.location?.s}
          currentFrontierId={currentPlayer.frontierId}
          currentPlayer={currentPlayer}
          onClose={handleCloseChat}
        />
      </div>
    )}


{/* //////////////// Left Side Navigation Column ///////////////// */}

    <div className="nav-column">

        <div className="zoom-controls">
          <div className="zoom-button-container">
            <button className="zoom-button zoom-in" disabled={!currentPlayer} onClick={zoomIn}><span>+</span></button>
            <button className="zoom-button zoom-out" disabled={!currentPlayer} onClick={zoomOut}><span>−</span></button>
          </div>
        </div>

      <button className={`nav-button ${!activePanel ? 'selected' : ''}`} title={strings[12009]} onClick={() => closePanel()}>👸</button>
      <button 
        className={`nav-button ${activePanel === 'SocialPanel' ? 'selected' : ''}`} 
        title="My Profile" 
        disabled={!currentPlayer} 
        onClick={() => {
          if (currentPlayer) {
            // Create PC data structure for current player to pass to SocialPanel
            const currentPC = {
              playerId: currentPlayer._id,
              username: currentPlayer.username,
              icon: currentPlayer.icon,
              hp: currentPlayer.hp || 100,
              position: { x: 0, y: 0 }, // Position not needed for own profile
              iscamping: currentPlayer.iscamping,
              isinboat: currentPlayer.isinboat
            };
            handlePCClick(currentPC);
          }
        }}
      >{currentPlayer?.icon || '😊'}</button>
      <button className={`nav-button ${activePanel === 'QuestPanel' ? 'selected' : ''}`} title={strings[12004]} disabled={!currentPlayer} onClick={() => openPanel('QuestPanel')}>✅</button>

      {/* Hide these panels during early FTUE steps (1-2) */}
      {!(currentPlayer?.firsttimeuser && currentPlayer?.ftuestep <= 2) && (
        <>
          <button
            className={`nav-button ${activePanel === 'FarmingPanel' ? 'selected' : ''}`} title={strings[12001]} disabled={!currentPlayer}
            onClick={() => {
              if (currentPlayer.iscamping || currentPlayer.isinboat) {updateStatus(340);return;}
              if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead && !isDeveloper) {updateStatus(90);return;}
              openPanel('FarmingPanel');
            }}
          >🌽</button>
          <button
            className={`nav-button ${activePanel === 'ToolsPanel' ? 'selected' : ''}`} title={strings[12012]} disabled={!currentPlayer}
            onClick={() => {
              if (currentPlayer.iscamping || currentPlayer.isinboat) {updateStatus(340);return;}
              if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead) {updateStatus(90);return;}
              openPanel('ToolsPanel');
            }}
          >⛏️</button>
          <button
            className={`nav-button ${activePanel === 'BuyPanel' ? 'selected' : ''}`} title={strings[12003]} disabled={!currentPlayer}
            onClick={() => {
              if (currentPlayer.iscamping || currentPlayer.isinboat) {updateStatus(340);return;}
              if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead && !isDeveloper) {updateStatus(90);return;}
              openPanel('BuyPanel');
            }}
          >🐮</button>
          <button
            className={`nav-button ${activePanel === 'BuildPanel' ? 'selected' : ''}`} title={strings[12002]} disabled={!currentPlayer}
            onClick={() => {
              if (currentPlayer.iscamping || currentPlayer.isinboat) {updateStatus(340);return;}
              if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead && !isDeveloper) {updateStatus(90);return;}
              openPanel('BuildPanel');
            }}
          >🛖</button>
          <button className={`nav-button ${activePanel === 'SkillsPanel' ? 'selected' : ''}`} title={strings[12005]} disabled={!currentPlayer} onClick={() => {
              setActiveStation(null); // ✅ Reset activeStation
              openPanel("SkillsPanel"); // ✅ Open the panel normally
            }}>💪</button>
        </>
      )}

      {!currentPlayer?.firsttimeuser && isOnOwnHomestead && (
        <button 
          className={`nav-button ${activePanel === 'PetsPanel' ? 'selected' : ''}`} title={strings[12014]} disabled={!currentPlayer} 
          onClick={() => {
            if (currentPlayer.iscamping || currentPlayer.isinboat) {updateStatus(340);return;}
            if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead && !isDeveloper) {updateStatus(90);return;}
            openPanel('PetsPanel');
          }}
        >🐒</button>
      )}

      {!currentPlayer?.firsttimeuser && (
        <button 
          className={`nav-button ${activePanel === 'BuyDecoPanel' ? 'selected' : ''}`} title={strings[12011]} disabled={!currentPlayer} 
          onClick={() => {
            if (currentPlayer.iscamping || currentPlayer.isinboat) {updateStatus(340);return;}
            // Check if on another player's homestead
            if (currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead && !isDeveloper) {updateStatus(90);return;}
            openPanel('BuyDecoPanel');
          }}
        >🪴</button>
      )}

      {!(currentPlayer?.firsttimeuser && currentPlayer?.ftuestep <= 2) && (
        <button className={`nav-button ${activePanel === 'CombatPanel' ? 'selected' : ''}`} title={strings[12006]} disabled={!currentPlayer} onClick={() => openPanel('CombatPanel')}>⚔️</button>
      )}

      {!currentPlayer?.firsttimeuser && (
        <button className={`nav-button ${activePanel === 'GovPanel' ? 'selected' : ''}`} title={strings[12007]} onClick={() => openPanel('GovPanel')}>🏛️</button>
      )}

      {!(currentPlayer?.firsttimeuser && currentPlayer?.ftuestep <= 2) && (
        <button className={`nav-button ${activePanel === 'TrophyPanel' ? 'selected' : ''}`} title={strings[12013]} onClick={() => openPanel('TrophyPanel')}>🏆</button>
      )}

      {isDeveloper && (
        <button className={`nav-button ${activePanel === 'DebugPanel' ? 'selected' : ''}`} title="Debug" onClick={() => openPanel('DebugPanel')}>
          🐞
        </button>
      )}
    </div>

    <div className="app-container">


{/* ///////////////////  Base Panel  ///////////////////// */}

    <div className="base-panel">
      <div className="base-panel-content">

      {/* Frontier Mini Map */}
      <FrontierMiniMap 
        currentPlayer={currentPlayer} 
        strings={strings}
        setCurrentPlayer={setCurrentPlayer}
        setGridId={setGridId}
        setGrid={setGrid}
        setTileTypes={setTileTypes}
        setResources={setResources}
        updateStatus={updateStatus}
        TILE_SIZE={activeTileSize}
        closeAllPanels={closeAllPanels}
        bulkOperationContext={bulkOperationContext}
        masterResources={masterResources}
        masterTrophies={masterTrophies}
        transitionFadeControl={transitionFadeControl}
        timers={timers}
        countdowns={countdowns}
      />
 
      <h2 style={{ textAlign: 'center' }}>{strings[10109]}</h2>
      <h3 style={{ textAlign: 'center' }}>{strings[10135]}</h3>
      <h3 style={{ textAlign: 'center' }}>{strings[10136]}</h3>
      <h3 style={{ textAlign: 'center' }}>{strings[10137]}</h3>
      <h3 style={{ textAlign: 'center' }}>{isOnOwnHomestead ? strings[10140] : strings[10141]}</h3>

      <br />

      {/* Season */}
      <h2 style={{ textAlign: 'center', fontFamily: 'Berkshire Swash', color: 'var(--color-primary-green-dark)', margin: '0 0 4px 0' }}>
        {strings[10113]} {seasonData?.type || "[Season unknown]"}
      </h2>
      <h2 style={{ margin: '0 0 8px 0', textAlign: 'center' }}>
        <span
          onClick={() => openPanel('SeasonPanel')}
          style={{ textDecoration: 'underline', cursor: 'pointer' }}
        >
          {timers.seasons.phase === "onSeason" ? strings[10114] : strings[10115]}
        </span>
      </h2>
      <h2 className="countdown-timer" style={{ textAlign: 'center' }}>{countdowns.seasons}</h2>

      <br />

      <div className="shared-buttons">
        <button className="btn-basic" onClick={() => openModal('TownNews')}>{strings[10125]}</button>
      </div>

      <div className="shared-buttons">
        <button className="btn-basic" onClick={() => openPanel('HowToPanel')}>{strings[10110]}</button>
      </div>
      
      <br />
      <h2 style={{ textAlign: 'center' }}>{strings[96]}</h2>

      <div className="shared-buttons">
        <button
          className="btn-basic"
          onClick={() => window.open('https://discord.gg/SZMw4vpUJV', '_blank')}
        >
          Join Discord Server
        </button>
      </div>
      
      <div className="shared-buttons">
        <button
          className="btn-basic"
          onClick={() => window.location.href = 'mailto:valleyviewgamedev@gmail.com'}
        >
          {strings[97]}
        </button>
      </div>

      <br />
      <h3>{strings[10126]}</h3>
      <div>
      {playersInGrid?.[gridId]?.pcs && typeof playersInGrid[gridId].pcs === 'object' ? (
          Object.entries(playersInGrid[gridId].pcs).length === 0 ? (
            <h4>{strings[10127]}</h4>
          ) : (
            Object.entries(playersInGrid[gridId].pcs).map(([playerId, pc]) => (
              <p key={playerId}>
                {connectedPlayers.has(playerId) && '📡 '}
                <strong>{pc.username}</strong>
              </p>
            ))
          )
        ) : (
          <h4>{strings[10127]}</h4>
        )}
        <h4>
          {controllerUsername
            ? `🐮 ${controllerUsername}`
            : "There is no NPCController"}
        </h4>
      </div>
      <br />
      </div>
      <div className="base-panel-buffer"></div>
    </div>


{/* //////////////////// Game Board //////////////////// */}

    <div className="homestead">

      {showKeyArt && (
        <div className="keyart-wrapper">
          <img
            src="/assets/images/ValleyViewLoadScreen.png"
            alt="Valley View Key Art"
            className="keyart-image"
          />
          <StartScreenAnimation />
        </div>
      )}

      {zoomLevel === 'far' || zoomLevel === 'closer' || zoomLevel === 'close' ? (
      <>
        {/* Layer 1: Tiles - conditionally use V1 or V2 renderer */}
        {useV2Tiles ? (
          <RenderTilesCanvasV2
            grid={memoizedGrid}
            tileTypes={memoizedTileTypes}
            TILE_SIZE={activeTileSize}
            zoomLevel={zoomLevel}
            handleTileClick={handleTileClick}
          />
        ) : (
          <RenderTilesCanvas
            grid={memoizedGrid}
            tileTypes={memoizedTileTypes}
            TILE_SIZE={activeTileSize}
            zoomLevel={zoomLevel}
            handleTileClick={handleTileClick}
          />
        )}

        {/* Layer 1.5: Cursor Tile Highlight (only when in cursor placement mode) */}
        {cursorMode && (
          <CursorTileHighlight
            hoveredTile={hoveredTile}
            cursorMode={cursorMode}
            TILE_SIZE={activeTileSize}
            gridWidth={memoizedGrid?.[0]?.length || 0}
            gridHeight={memoizedGrid?.length || 0}
          />
        )}

        {/* Layer 2: Resources */}
        <RenderResources
          resources={memoizedResources}
          masterResources={masterResources}
          globalTuning={globalTuning}
          TILE_SIZE={activeTileSize}
          handleTileClick={handleTileClick}
          currentPlayer={currentPlayer}
          badgeState={badgeState}
          electionPhase={timers.elections.phase}
        />
        
        {/* Layer 3: NPCs */}
        <RenderNPCs
          npcs={npcs}
          TILE_SIZE={activeTileSize}
          currentPlayer={currentPlayer}
          globalTuning={globalTuning}
          gridId={currentPlayer?.location?.g}
          onNPCClick={handleNPCPanel}
          checkQuestNPCStatus={(npc) => checkQuestNPCStatus(npc, currentPlayer)}
          checkTradeNPCStatus={(npc) => checkTradeNPCStatus(npc, masterResources)}
          checkKentNPCStatus={(npc) => checkKentNPCStatus(npc, currentPlayer)}
          strings={strings}
          masterResources={masterResources}
          playersInGrid={playersInGrid}
          setInventory={setInventory}
          setBackpack={setBackpack}
          setResources={setResources}
          setCurrentPlayer={setCurrentPlayer}
          masterSkills={masterSkills}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
          updateStatus={updateStatus}
          openPanel={openPanel}
          setActiveStation={setActiveStation}
          masterTrophies={masterTrophies}
          setHoverTooltip={setHoverTooltip}
        />
        
        {/* Layer 4: PCs */}
        <RenderPCs
          pcs={pcs}
          TILE_SIZE={activeTileSize}
          currentPlayer={currentPlayer}
          onPCClick={handlePCClick}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          setBackpack={setBackpack}
          masterResources={masterResources}
          strings={strings}
          connectedPlayers={connectedPlayers}
        />
        
        {/* Layer 5: Dynamic Elements (tooltips, overlays, VFX) */}
        <RenderDynamicElements
          TILE_SIZE={activeTileSize}
          openPanel={openPanel}
          setActiveStation={setActiveStation}
          setInventory={setInventory}
          setBackpack={setBackpack}
          setResources={setResources}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          onNPCClick={handleNPCPanel}  // Pass the callback
          onPCClick={handlePCClick}  // Pass the callback
          handleTileClick={handleTileClick}  // Pass tile click handler
          masterResources={masterResources}
          masterSkills={masterSkills}
          masterTrophies={masterTrophies}
          hoverTooltip={hoverTooltip}
          setHoverTooltip={setHoverTooltip}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
          updateStatus={updateStatus}
          strings={strings}
          gridId={gridId}
          globalTuning={globalTuning}
          timers={timers}
          resources={memoizedResources}
          npcs={npcs}
          pcs={pcs}
          grid={memoizedGrid}
          tileTypes={memoizedTileTypes}
          onTileHover={setHoveredTile}
          cursorModeActive={!!cursorMode}
        />
        
        {/* Hover Tooltip - render at top level */}
        {hoverTooltip && (
          <div
            className="HoverTooltip"
            style={{
              bottom: `calc(100vh - ${hoverTooltip.y}px + 10px)`,
              left: hoverTooltip.x,
              transform: 'translateX(-50%)',
            }}
            dangerouslySetInnerHTML={{ __html: hoverTooltip.content }}
          />
        )}
        
        {/* <RenderVFX
          toggleVFX={currentPlayer?.settings?.toggleVFX}
          // Placeholder for VFX
          TILE_SIZE={activeTileSize}
        /> */}

        {/* FTUE Doinker - Bouncing arrow(s) pointing at target resource(s) or NPC(s) */}
        <FTUEDoinker
          doinkerTargets={doinkerTargets}
          TILE_SIZE={activeTileSize}
          visible={!!doinkerTargets}
          gridId={gridId}
        />

        </>
      ) : null}

{/* //////////////////  ZOOM OUTS  ///////////////////*/}

    {/* Settlement zoom view */}
    {zoomLevel === 'settlement' && (
      <SettlementView
        currentPlayer={currentPlayer}
        isDeveloper={isDeveloper}
        setZoomLevel={setZoomLevel}
        isRelocating={isRelocating}
        setIsRelocating={setIsRelocating}
        setCurrentPlayer={setCurrentPlayer}
        setGridId={setGridId}
        setGrid={setGrid}
        setResources={setResources}
        setTileTypes={setTileTypes}
        TILE_SIZE={activeTileSize}
        masterResources={masterResources}
        closeAllPanels={closeAllPanels}
        visibleSettlementId={visibleSettlementId}
        setVisibleSettlementId={setVisibleSettlementId}
        onClose={() => setZoomLevel('far')}
      />
    )}
    {zoomLevel === 'frontier' && (
      <FrontierView
        currentPlayer={currentPlayer}
        isDeveloper={isDeveloper}
        setZoomLevel={setZoomLevel} 
        isRelocating={isRelocating}
        setIsRelocating={setIsRelocating}
        setCurrentPlayer={setCurrentPlayer}
        setGridId={setGridId}              
        setGrid={setGrid}            
        setResources={setResources}  
        setTileTypes={setTileTypes}
        masterResources={masterResources}
        masterTrophies={masterTrophies}
        TILE_SIZE={activeTileSize}
        closeAllPanels={closeAllPanels}
        visibleSettlementId={visibleSettlementId}
        setVisibleSettlementId={setVisibleSettlementId}
        onClose={() => setZoomLevel('settlement')}
      />
    )}
    </div>

{/* ///////////////////// MODALS ////////////////////// */}

      {showShareModal && (
        <ShareModal onClose={() => setShowShareModal(false)} />
      )}
      
      {showFTUE && (
        <FTUE
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          onClose={() => setShowFTUE(false)}
          openPanel={openPanel}
          setActiveQuestGiver={setActiveQuestGiver}
          gridId={gridId}
          setActiveStation={setActiveStation}
          masterResources={masterResources}
          masterFTUEsteps={masterFTUEsteps}
          setResources={setResources}
          TILE_SIZE={activeTileSize}
        />
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          if (modalContent?.onClose) {
            modalContent.onClose();
          } else {
            setIsModalOpen(false);
          }
        }} 
        title={modalContent.title} 
        message={modalContent.message} 
        message2={modalContent.message2} 
        size={modalContent.size || "standard"}
      >
        {modalContent.children}
        {modalContent.custom}
      </Modal>
 
      <RevivalModal
        isOpen={isRevivalModalOpen}
        onAcceptDeath={handleAcceptDeath}
        onRevive={handleRevive}
        reviveCost={globalTuning?.costToRevive || 50}
        strings={strings}
        currentPlayer={currentPlayer}
        inventory={inventory}
        updateStatus={updateStatus}
      />
 
      {activeModal === 'Mailbox' && (
        <Mailbox
          onClose={closeModal}  // ✅ This sets activeModal = null
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          resources={masterResources}
          updateStatus={updateStatus}
          masterResources={masterResources}
        />
      )}
      {activeModal === 'TownNews' && (
        <TownNews
          onClose={closeModal}  // ✅ This sets activeModal = null
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          resources={masterResources}
        />
      )}
      {activeModal === 'LanguagePicker' && (
        <LanguagePickerModal
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          updateStatus={updateStatus}
          onClose={() => setActiveModal(null)}
          onSave={() => setActiveModal(null)}
        />
      )}
      {activeModal === "Store" && (
        <Store
          onClose={({ openMailbox } = {}) => {
            setActiveModal(null);
            if (openMailbox) {
              setTimeout(() => setActiveModal("Mailbox"), 100);
            }
          }}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          resources={masterResources}
          setModalContent={setModalContent}
 	        setIsModalOpen={setIsModalOpen}
        />
      )}
      {isOffSeason && (
        <OffSeasonModal
          currentPlayer={currentPlayer}
          timers={timers}
        />
      )}

{/* ///////////////////// PANELS ////////////////////// */}

      {activePanel === 'ProfilePanel' && (
        <ProfilePanel
        onClose={closePanel}
        currentPlayer={currentPlayer}
        setCurrentPlayer={setCurrentPlayer}
        handleLogout={handleLogout}
        isRelocating={isRelocating}
        setIsRelocating={setIsRelocating}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        handlePCClick={handlePCClick}
        isDeveloper={isDeveloper}
       />
      )}
      {activePanel === 'LoginPanel' && (
        <LoginPanel
          onClose={closePanel}
          setCurrentPlayer={(player) => {
            setCurrentPlayer(player);
            closePanel(); 
          }}
          zoomLevel={zoomLevel}
          setZoomLevel={setZoomLevel} 
          onLoginSuccess={async (username, password) => {
            await handleLoginSuccess(username, password);
          }}
        />
      )}
      {activePanel === 'DebugPanel' && (
        <DebugPanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          setResources={setResources}
          currentGridId={currentPlayer?.location?.g}
          updateStatus={updateStatus}
          TILE_SIZE={activeTileSize}
          setGrid={setGrid}
          setGridId={setGridId}
          setTileTypes={setTileTypes}
          closeAllPanels={closeAllPanels}
        />
      )}
      {activePanel === 'InventoryPanel' && (
        <InventoryPanel
          onClose={closePanel} 
          masterResources={masterResources}
          globalTuning={globalTuning}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          setBackpack={setBackpack}
          updateStatus={updateStatus}
          openPanel={openPanel}
          setActiveStation={setActiveStation}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
        />
      )}
      {activePanel === 'WarehousePanel' && (
        <WarehousePanel
          onClose={() => openPanel('InventoryPanel')} 
          masterResources={masterResources}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          stationType={activeStation?.type} 
          globalTuning={globalTuning}
          masterWarehouse={masterWarehouse}
          updateStatus={updateStatus}
        />
      )}
      {activePanel === 'TrophyPanel' && (
        <TrophyPanel
          onClose={closePanel} 
          masterResources={masterResources}
          masterTrophies={masterTrophies}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          updateStatus={updateStatus}
          openPanel={openPanel}
          setActiveStation={setActiveStation}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
        />
      )}
      {activePanel === 'BankPanel' && (
        <BankPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          updateStatus={updateStatus}
          masterResources={masterResources}
          masterXPLevels={masterXPLevels}
          globalTuning={globalTuning}
          setResources={setResources}
          currentStationPosition={activeStation?.position}
          gridId={gridId}
          TILE_SIZE={activeTileSize}
          isDeveloper={isDeveloper}
        />
      )}
      {activePanel === 'KentPanel' && (
        <KentPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          updateStatus={updateStatus}
          masterResources={masterResources}
          globalTuning={globalTuning}
          currentSeason={timers.seasons?.type || "Unknown"}
          masterXPLevels={masterXPLevels}
        />
      )}
     {activePanel === 'NewTrainPanel' && (
        <NewTrainPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          updateStatus={updateStatus}
          masterResources={masterResources}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
          globalTuning={globalTuning}
          currentSeason={timers.seasons?.type || "Unknown"}
          masterXPLevels={masterXPLevels}
        />
      )}
      {activePanel === 'CarnivalPanel' && (
        <CarnivalPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          updateStatus={updateStatus}
          masterResources={masterResources}
          masterXPLevels={masterXPLevels}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
        />
      )}
      {activePanel === 'HowToPanel' && (
        <HowToPanel 
          onOpen={openPanel}
          onClose={closePanel}
        />
      )}
      {activePanel === 'HowToMoneyPanel' && (
        <HowToMoneyPanel 
          onOpen={openPanel}
          onClose={closePanel}
        />
      )}
      {activePanel === 'HowToGemsPanel' && (
        <HowToGemsPanel 
          currentPlayer={currentPlayer}
          updateStatus={updateStatus}
          onOpen={openPanel}
          onClose={closePanel}
        />
      )}
      {activePanel === 'GoldBenefitsPanel' && (
        <GoldBenefitsPanel 
          currentPlayer={currentPlayer}
          updateStatus={updateStatus}
          onOpen={openPanel}
          onClose={closePanel}
        />
      )}
      {activePanel === 'GovPanel' && (
        <GovPanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
        />
      )}
      {activePanel === 'LeaderboardPanel' && (
        <LeaderboardPanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
          masterResources={masterResources}
          masterTraders={masterTraders}
          masterXPLevels={masterXPLevels}
        />
      )}
      {activePanel === 'Courthouse' && (
        <CourthousePanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          setResources={setResources}
          currentStationPosition={activeStation?.position}
          gridId={gridId}
          TILE_SIZE={activeTileSize}
          isDeveloper={isDeveloper}
          masterResources={masterResources}
          masterXPLevels={masterXPLevels}
          masterSkills={masterSkills}
        />
      )}
      {activePanel === 'QuestPanel' && (
        <QuestPanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
        />
      )}
      {activePanel === 'SkillsPanel' && (
        <SkillsPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          stationType={activeStation?.type}
          stationCategory={activeStation?.category}
          currentStationPosition={activeStation?.position}
          gridId={activeStation?.gridId}
          isDeveloper={isDeveloper}
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterSkills={masterSkills}
          setResources={setResources}
          masterResources={masterResources}
          masterXPLevels={masterXPLevels}
        />
      )}
      {activePanel === 'CombatPanel' && (
        <CombatPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          masterResources={masterResources} 
          masterSkills={masterSkills} 
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
        />
      )}
      {activePanel === 'CraftingStation' && (
        <CraftingStation
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          resources={resources}
          setResources={setResources}
          stationType={activeStation?.type} 
          currentStationPosition={activeStation?.position} 
          gridId={activeStation?.gridId} 
          masterResources={masterResources} 
          masterSkills={masterSkills} 
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          isDeveloper={isDeveloper}
          currentSeason={seasonData?.type}
          globalTuning={globalTuning}
        />
      )}
      {activePanel === 'FarmHouse' && (
        <FarmHouse
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          stationType={activeStation?.type} 
          currentStationPosition={activeStation?.position} 
          gridId={activeStation?.gridId} 
          masterResources={masterResources} 
          masterSkills={masterSkills} 
          masterTrophies={masterTrophies}
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          isDeveloper={isDeveloper}
        />
      )}
      {activePanel === 'ShopStation' && (
        <ShopStation
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          stationType={activeStation?.type}
          currentStationPosition={activeStation?.position}
          gridId={activeStation?.gridId}
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterResources={masterResources}
          masterTraders={masterTraders}
          masterTrophies={masterTrophies}
          isDeveloper={isDeveloper}
          globalTuning={globalTuning}
          masterXPLevels={masterXPLevels}
        />
      )}
      {activePanel === 'ScrollStation' && (
        <ScrollStation
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          stationType={activeStation?.type} 
          currentStationPosition={activeStation?.position} 
          gridId={activeStation?.gridId}
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterResources={masterResources}
          masterTrophies={masterTrophies}
          isDeveloper={isDeveloper}
        />
      )}
      {activePanel === 'FarmingPanel' && (
        <FarmingPanel
          onClose={closePanel}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          resources={resources}
          setResources={setResources}
          tiles={grid}
          tileTypes={tileTypes}
          setTileTypes={setTileTypes}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          gridId={gridId}
          masterResources={masterResources}
          masterSkills={masterSkills}
          updateStatus={updateStatus}
          currentSeason={seasonData?.type}
          isDeveloper={isDeveloper}
          cursorMode={cursorMode}
          setCursorMode={setCursorMode}
        />
      )}
      {activePanel === 'ToolsPanel' && (
        <ToolsPanel
          onClose={closePanel}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          resources={resources}
          setResources={setResources}
          tiles={grid}
          tileTypes={tileTypes}
          setTileTypes={setTileTypes}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          gridId={gridId}
          masterResources={masterResources}
          masterSkills={masterSkills}
          masterXPLevels={masterXPLevels}
          updateStatus={updateStatus}
          isDeveloper={isDeveloper}
          cursorMode={cursorMode}
          setCursorMode={setCursorMode}
        />
      )}
      {activePanel === 'BuildPanel' && (
        <BuildPanel
          onClose={closePanel}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          resources={resources}
          setResources={setResources}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          gridId={gridId}
          masterResources={masterResources}
          masterSkills={masterSkills}
          updateStatus={updateStatus}
          isDeveloper={isDeveloper}
          currentSeason={seasonData?.type}
          globalTuning={globalTuning}
          masterXPLevels={masterXPLevels}
          cursorMode={cursorMode}
          setCursorMode={setCursorMode}
        />
      )}
      {activePanel === 'BuyPanel' && (
        <BuyPanel
          onClose={closePanel}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          resources={resources}
          setResources={setResources}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          gridId={gridId}
          masterResources={masterResources}
          masterSkills={masterSkills}
          updateStatus={updateStatus}
          isDeveloper={isDeveloper}
          currentSeason={seasonData?.type}
          NPCsInGrid={NPCsInGrid}
          globalTuning={globalTuning}
          masterXPLevels={masterXPLevels}
          cursorMode={cursorMode}
          setCursorMode={setCursorMode}
        />
      )}
      {activePanel === 'PetsPanel' && (
        <PetsPanel
          onClose={closePanel}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          resources={resources}
          setResources={setResources}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          gridId={gridId}
          masterResources={masterResources}
          masterSkills={masterSkills}
          updateStatus={updateStatus}
          isDeveloper={isDeveloper}
          currentSeason={seasonData?.type}
          cursorMode={cursorMode}
          setCursorMode={setCursorMode}
        />
      )}
      {activePanel === 'BuyDecoPanel' && (
        <BuyDecoPanel
          onClose={closePanel}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          resources={resources}
          setResources={setResources}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          gridId={gridId}
          masterResources={masterResources}
          masterSkills={masterSkills}
          updateStatus={updateStatus}
          isDeveloper={isDeveloper}
          currentSeason={seasonData?.type}
          cursorMode={cursorMode}
          setCursorMode={setCursorMode}
        />
      )}
      {activePanel === 'NPCPanel' && (
        <NPCPanel
          onClose={closePanel}
          npcData={activeQuestGiver}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterResources={masterResources}
          masterInteractions={masterInteractions}
          masterTraders={masterTraders}
          masterTrophies={masterTrophies}
          masterXPLevels={masterXPLevels}
          zoomLevel={zoomLevel}
          setZoomLevel={setZoomLevel}
          centerCameraOnPlayer={centerCameraOnPlayer}
          globalTuning={globalTuning}
          isDeveloper={isDeveloper}
        />
      )}
      {activePanel === 'FarmHandPanel' && (
        <FarmHandPanel
          onClose={closePanel}
          npc={activeQuestGiver}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          resources={resources}
          setResources={setResources}
          stationType={activeStation?.type}
          currentStationPosition={activeStation?.position}
          gridId={activeStation?.gridId}
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterResources={masterResources}
          masterSkills={masterSkills}
          currentSeason={seasonData?.type}
          isDeveloper={isDeveloper}
          globalTuning={globalTuning}
          masterXPLevels={masterXPLevels}
        />
      )}
      {activePanel === 'SocialPanel' && (
        <SocialPanel
          onClose={closePanel}
          pcData={activeSocialPC}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          updateStatus={updateStatus}
          masterInteractions={masterInteractions}
          masterTrophies={masterTrophies}
          masterResources={masterResources}
          masterXPLevels={masterXPLevels}
          masterTraders={masterTraders}
          isDeveloper={isDeveloper}
          controllerUsername={controllerUsername}
          setControllerUsername={setControllerUsername}
          openPanel={openPanel}
        />
      )}
      {activePanel === 'AnimalStall' && (
        <AnimalStall
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          stationType={activeStation?.type} 
          currentStationPosition={activeStation?.position} 
          gridId={activeStation?.gridId} 
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterResources={masterResources}
          isDeveloper={isDeveloper}
        />
      )}
      {activePanel === 'AnimalPanel' && (
        <AnimalPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          stationType={activeStation?.type} 
          currentStationPosition={activeStation?.position} 
          gridId={activeStation?.gridId} 
          npcId={activeStation?.npcId}
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterResources={masterResources}
        />
      )}
      {activePanel === 'CropPanel' && (
        <CropPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          stationType={activeStation?.type} 
          currentStationPosition={activeStation?.position} 
          gridId={activeStation?.gridId} 
          currentResource={activeStation?.resource}
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterResources={masterResources}
        />
      )}
      {activePanel === 'DecoPanel' && (
        <DecoPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          stationType={activeStation?.type} 
          currentStationPosition={activeStation?.position} 
          gridId={activeStation?.gridId} 
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterResources={masterResources}
          isDeveloper={isDeveloper}
        />
      )}
      {activePanel === 'PetPanel' && (
        <PetPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          petResource={resources.find(r => r.x === activeStation?.position?.x && r.y === activeStation?.position?.y)}
          currentPetPosition={activeStation?.position}
          gridId={activeStation?.gridId}
          masterResources={masterResources}
          masterSkills={masterSkills}
          masterTrophies={masterTrophies}
          TILE_SIZE={activeTileSize}
          isDeveloper={isDeveloper}
        />
      )}
      {activePanel === 'TradeStall' && (
        <TradeStall
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          updateStatus={updateStatus}
          globalTuning={globalTuning}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
        />
      )}
      {activePanel === 'OutpostPanel' && (
        <Outpost
          onClose={closePanel}
          backpack={backpack}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          gridId={activeStation?.gridId}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
          isDeveloper={isDeveloper}
          stationType={activeStation?.type}
          currentStationPosition={activeStation?.position}
          setResources={setResources}
          setInventory={setInventory}
          TILE_SIZE={activeTileSize}
          globalTuning={globalTuning}
        />
      )}
      {activePanel === 'SeasonPanel' && (
        <SeasonPanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen}
        />
      )}

      {/* Tooltip rendering is handled by RenderDynamicElements */}
      </div>

      {uiLocked && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.0)', // transparent blocker
            cursor: 'wait',
          }}
        />
      )}

      {/* Location transition overlay */}
      <TransitionOverlay 
        isTransitioning={isTransitioning}
        // onTransitionComplete={() => {
        //   //console.log('🌟 [TRANSITION] Fade transition completed');
        // }}
      />

      {/* Level Up Modal */}
      <LevelUpModal
        isOpen={isLevelUpModalOpen}
        onClose={() => setIsLevelUpModalOpen(false)}
        currentLevel={levelUpData.currentLevel}
        previousLevel={levelUpData.previousLevel}
        updateStatus={updateStatus}
        masterResources={masterResources}
      />

    </>
  );
}

export default App;