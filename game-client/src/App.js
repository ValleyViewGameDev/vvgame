import './App.css';
import './GameFeatures/Chat/Chat.css';
import './VFX/VFX.css';
import axios from 'axios';
import API_BASE from './config.js';
import Chat from './GameFeatures/Chat/Chat';
import React, { useContext, useState, useEffect, memo, useMemo, useCallback, useRef } from 'react';
import { initializeGrid } from './AppInit';
import { loadMasterSkills, loadMasterResources } from './Utils/TuningManager';
import { RenderGrid } from './Render/Render';
import DynamicRenderer from './Render/RenderDynamic.js';
import { handleResourceClick } from './ResourceClicking';
import { isMobile } from './Utils/appUtils';
import { useUILock } from './UI/UILockContext';

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

import playersInGridManager from './GridState/PlayersInGrid';
import { usePlayersInGrid, useGridStatePCUpdate } from './GridState/GridStatePCContext';
import NPCsInGridManager from './GridState/GridStateNPCs.js';
import { useGridState, useGridStateUpdate } from './GridState/GridStateContext';
import npcController from './GridState/NPCController';

import SettlementView from './ZoomedOut/SettlementView';
import FrontierView from './ZoomedOut/FrontierView';

import Modal from './UI/Modal';
import LanguagePickerModal from './UI/LanguagePickerModal';
import { useStrings } from './UI/StringsContext';
import LANGUAGE_OPTIONS from './UI/Languages.json';
import ProfilePanel from './Authentication/ProfilePanel';
import LoginPanel from './Authentication/LoginPanel';
import DebugPanel from './Utils/debug';
import InventoryPanel from './GameFeatures/Inventory/InventoryPanel';
import BuildPanel from './GameFeatures/Build/BuildPanel';
import BuyPanel from './GameFeatures/Buy/BuyPanel';
import SkillsAndUpgradesPanel from './GameFeatures/Skills/SkillsPanel';
import FarmingPanel from './GameFeatures/Farming/FarmingPanel';
import HowToPanel from './UI/HowToPanel';
import HowToMoneyPanel from './UI/HowToMoneyPanel';
import GovPanel from './GameFeatures/Government/GovPanel';
import BankPanel from './GameFeatures/Trading/Bank';
import TrainPanel from './GameFeatures/Trading/Train';
import CourthousePanel from './GameFeatures/Government/Courthouse';
import QuestPanel from './GameFeatures/Quests/QuestPanel';
import QuestGiverPanel from './GameFeatures/NPCs/NPCsPanel.js';
import CraftingStation from './GameFeatures/Crafting/CraftingStation';
import FarmHandPanel from './GameFeatures/FarmHands/FarmHand.js';
import TradingStation from './GameFeatures/Crafting/TradingStation';
import ShopStation from './GameFeatures/Crafting/ShopStation';
import AnimalStall from './GameFeatures/FarmAnimals/AnimalStall';
import DecoPanel from './GameFeatures/Deco/DecoPanel';
import TradeStall from './GameFeatures/Trading/TradeStall';
import Mailbox from './GameFeatures/Mailbox/Mailbox';
import Store from './Store/Store';
import OffSeasonModal from './GameFeatures/Seasons/OffSeasonModal.js';
import TownNews from './UI/TownNews.js';
import SeasonPanel from './GameFeatures/Seasons/SeasonPanel';
import SocialPanel from './GameFeatures/Social/SocialPanel';
import CombatPanel from './GameFeatures/Combat/CombatPanel';
import GoldBenefitsPanel from './UI/GoldBenefitsPanel';
import ShareModal from './UI/ShareModal';

import { usePanelContext } from './UI/PanelContext';
import { useModalContext } from './UI/ModalContext';
import { checkDeveloperStatus, updateBadge, getBadgeState } from './Utils/appUtils';
import FloatingTextManager from './UI/FloatingText';
import StatusBar from './UI/StatusBar';
import { StatusBarContext } from './UI/StatusBar';
import { formatCountdown } from './UI/Timers';

import { fetchGridData, updateGridStatus } from './Utils/GridManagement';
import { handleKeyMovement, centerCameraOnPlayer } from './PlayerMovement';
import { mergeResources, mergeTiles, enrichResourceFromMaster } from './Utils/ResourceHelpers.js';
import { fetchHomesteadOwner, calculateDistance } from './Utils/worldHelpers.js';
import { getDerivedRange } from './Utils/worldHelpers';
import { handlePlayerDeath } from './Utils/playerManagement';

function App() {

  const appInstanceId = Math.floor(Math.random() * 10000);
console.log(`🧩 App mounted. Instance ID: ${appInstanceId}`);

useEffect(() => {
  const id = Math.floor(Math.random() * 10000);
  console.log(`🧩 App mounted. Instance ID: ${id}`);
  console.trace();
}, []);


  const strings = useStrings();
  const { uiLocked } = useUILock();
  const [isDeveloper, setIsDeveloper] = useState(false);
  const { activeModal, setActiveModal, openModal, closeModal } = useModalContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', message: '', message2: '' });
  const { updateStatus } = useContext(StatusBarContext);
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
    
// Synchronize tiles with GlobalGridStateTilesAndResources -- i did this so NPCs have knowledge of tiles and resources as they change
useEffect(() => {
  if (tileTypes?.length) {
    GlobalGridStateTilesAndResources.setTiles(tileTypes);
    console.log('GlobalGridStateTilesAndResources tiles updated:', tileTypes);
  }
}, [tileTypes]);
// Synchronize resources with GlobalGridStateTilesAndResources -- i did this so NPCs have knowledge of tiles and resources as they change
useEffect(() => {
  if (resources?.length) {
    GlobalGridStateTilesAndResources.setResources(resources);
    console.log('GlobalGridStateTilesAndResources resources updated:', resources);
  }
}, [resources]);

const [zoomLevel, setZoomLevel] = useState('close'); // Default zoom level
const TILE_SIZES = { closer: 50, close: 30, far: 16 }; // Rename for clarity
const activeTileSize = TILE_SIZES[zoomLevel]; // Get the active TILE_SIZE
const [isRelocating, setIsRelocating] = useState(null);

const [visibleSettlementId, setVisibleSettlementId] = useState(null);
useEffect(() => {
  // currentPlayer may be null on first render, so initialize only when available
  if (currentPlayer?.location?.s) {
    setVisibleSettlementId(currentPlayer.location.s);
  }
}, [currentPlayer]);

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

const [isLoginPanelOpen, setisLoginPanelOpen] = useState(false);
const [isOffSeason, setIsOffSeason] = useState(false); // Track if it's off-season
const { activePanel, openPanel, closePanel } = usePanelContext();
const { closeAllPanels } = usePanelContext(); 
const [activeQuestGiver, setActiveQuestGiver] = useState(null);
const [activeSocialPC, setActiveSocialPC] = useState(null);
const [activeStation, setActiveStation] = useState(null);
const [showShareModal, setShowShareModal] = useState(false);

useEffect(() => {
  const storedPlayer = localStorage.getItem('player');
  if (!storedPlayer) {
    console.log('[Watcher] No stored player found — showing login panel.');
    setisLoginPanelOpen(true);
    openPanel("LoginPanel");
    setShowKeyArt(true);
  }
}, [activePanel]);

const handleQuestNPCClick = (npc) => {
  console.log('App.js: Opening QuestGiverPanel for NPC:', npc);
  setActiveQuestGiver(npc);  // Set the active quest giver globally
  openPanel('QuestGiverPanel');  // Open the panel
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
      const [skills, resources] = await Promise.all([loadMasterSkills(), loadMasterResources()]);
      setMasterResources(resources);
      setMasterSkills(skills);
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
        const isDev = await checkDeveloperStatus(updatedPlayerData.username);
        setIsDeveloper(isDev);
      }
      setInventory(DBPlayerData.inventory || []);  // Initialize inventory properly
      setBackpack(DBPlayerData.backpack || []);

      // Step 4. Determine initial gridId from player or storage
      console.log('🏁✅ 4. Determining local gridId...');
      const initialGridId = parsedPlayer?.location?.g || localStorage.getItem('gridId');
      if (!initialGridId) {
        console.error('No gridId found. Unable to initialize grid.');
        return;
      }
      setGridId(initialGridId);
      localStorage.setItem('gridId', initialGridId); // Save to local storage

      // 4.5. Open the socket
      socket.connect();
      // Join the grid for grid-based updates
      socket.emit('join-grid', { gridId: initialGridId, playerId: DBPlayerData.playerId });
      console.log("📡 Connected to socket and joined grid:", initialGridId);
      socket.emit('player-joined-grid', {
        gridId: initialGridId,
        playerId: DBPlayerData.playerId,
        username: DBPlayerData.username,
        playerData: DBPlayerData,
      });
      // Join the player room for personal updates
      socket.emit('join-player-room', { playerId: DBPlayerData.playerId });
      console.log(`📡 Joined socket room for playerId: ${DBPlayerData.playerId}`);
      socket.emit('set-username', { username: DBPlayerData.username });

      // Step 5. Initialize grid tiles, resources
      console.log('🏁✅ 5 InitAppWrapper; Initializing grid tiles and resources...');
      await initializeGrid(
        activeTileSize,
        initialGridId,
        setGrid,
        setResources,
        setTileTypes,
        updateStatus,
        DBPlayerData
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
      const playerPosition = freshPCState?.[playerId]?.position;
      console.log('Player position from playersInGrid:', playerPosition);
      if (playerPosition) {
        centerCameraOnPlayer(playerPosition, activeTileSize);
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

      setCurrentPlayer(updatedPlayerData);
      localStorage.setItem('player', JSON.stringify(updatedPlayerData));
      console.log(`✅ LocalStorage updated with combat stats:`, updatedPlayerData);

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
          updates: { settings: { ...updatedPlayerData.settings, hasDied: false } },
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
      setShowTimers(true);

      const zoom = localStorage.getItem("initialZoomLevel");
      if (zoom) {
        setZoomLevel(zoom);
        localStorage.removeItem("initialZoomLevel");
      }

      setIsAppInitialized(true);

    } catch (error) {
      console.error('Error during app initialization:', error);
      updateStatus(error.code === 'ERR_NETWORK' ? 1 : 0);  // Handle errors
    }
  };


  initializeAppWrapper();

  return () => {
    cleanupBadges?.();
  };
}, []);  // Only run once when the component mounts


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


// FARM STATE - Farming Seed Timer Management //////////////////////////////////////////////////////
useEffect(() => {
  if (gridId) {
    farmState.initializeFarmState(resources); // ✅ Works for seeds
    farmState.startSeedTimer({gridId,setResources,activeTileSize,currentPlayer,setCurrentPlayer,});
  }
  return () => { farmState.stopSeedTimer(); };
}, [gridId, resources]);  



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
    //console.log("🧑‍🌾 NPC Controller Username =", controllerUsername, "; currentPlayer =", currentPlayer?.username, "; isController =", isController);

    if (isController) {
      Object.values(currentGridNPCs).forEach((npc) => {
        if (typeof npc.update !== 'function') {
          console.warn(`🛑 Skipping NPC without update() method:`, npc);
          return;
        }
        //console.log(`[🐮🐮 NPC LOOP] Controller running update() for NPC ${npc.id}, state=${npc.state}`);
        npc.update(Date.now(), NPCsInGrid[gridId], gridId, activeTileSize);
      });
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
      // 🔥 Check for lava tile
      const col = playerPC?.position?.x;
      const row = playerPC?.position?.y;
      const onTileType = tileTypes?.[row]?.[col];
      // 🪧 Check for Signpost resource (based on exact x/y match)
      const onResource = resources?.flat().find(r => r?.x === col && r?.y === row);
      const onResourceType = onResource?.type;

      // if (playerPC?.hp <= (currentPlayer.baseMaxhp/4) && currentPlayer.location.gtype === 'homestead') {
      //     const healing = 2;
      //     playersInGrid[gridId].pcs[playerId].hp += healing;
      //     FloatingTextManager.addFloatingText(`+ ${healing} ❤️‍🩹 HP`, col, row, activeTileSize);
      //   }

      if (playerPC?.hp <= 0 && currentPlayer) {
        console.log("💀 Player is dead. Handling death...");
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
          closeAllPanels
        );
        setModalContent({
          title: strings["5001"],
          message: strings["5002"],
          message2: strings["5003"],
          size: "small",
        });
        setIsModalOpen(true);

      } else {
        if (onTileType === "l") {
          const lavaDamage = 2;
          playersInGrid[gridId].pcs[playerId].hp -= lavaDamage;
          FloatingTextManager.addFloatingText(`- ${lavaDamage} ❤️‍🩹 HP`, col, row, activeTileSize);
          console.log("🔥 Player is standing on lava. Applying 2 damage.");
        }

        if (onResourceType?.startsWith("Signpost")) {
          console.log("📍 Player is standing on a Signpost. Triggering click behavior.");
          await handleResourceClick(
            onResource,
            row,
            col,
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
            strings
          );
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

      if (playerPC?.hp <= (currentPlayer.baseMaxhp/4) && currentPlayer.location.gtype === 'homestead') {
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
    taxes: { phase: "", endTime: null },  
    bank: { phase: "", endTime: null },  
  }; 
});
const [countdowns, setCountdowns] = useState({ seasons: "", elections: "", train: "", taxes: "", bank: "" });

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
    const updatedTimers = {
      seasons: {
        type: frontierData.seasons?.seasonType || "Unknown",
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
      taxes: {
        phase: frontierData.taxes?.phase || "Unknown",
        endTime: frontierData.taxes?.endTime ? new Date(frontierData.taxes.endTime).getTime() : null,
      },
      bank: {
        phase: frontierData.bank?.phase || "Unknown",
        endTime: frontierData.bank?.endTime ? new Date(frontierData.bank.endTime).getTime() : null,
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
    const now = Date.now(); // Get current timestamp

    setCountdowns({
      seasons: formatCountdown(timers.seasons.endTime, now),
      elections: formatCountdown(timers.elections.endTime, now),
      train: formatCountdown(timers.train.endTime, now),
      taxes: formatCountdown(timers.taxes.endTime, now),
      bank: formatCountdown(timers.bank.endTime, now),
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
    if (timers.taxes.endTime && now >= timers.taxes.endTime) {
      console.log("💰 Tax cycle ended. Fetching new tax data...");
      shouldFetchNewTimers = true;
    }
    if (timers.bank.endTime && now >= timers.bank.endTime) {
      console.log("💰 Bank cycle ended. Fetching new bank timer...");
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
  socketListenForPCJoinAndLeave(gridId, currentPlayer, isMasterResourcesReady, setPlayersInGrid);
}, [socket, gridId, isMasterResourcesReady, currentPlayer]);

// 🔄 SOCKET LISTENER: PCs: Real-time updates for GridState (PC sync)
useEffect(() => {
  if (!isAppInitialized) { console.log('App not initialized. Skipping PC socket changes.'); return; }  
  socketListenForPCstateChanges(activeTileSize, gridId, currentPlayer, setPlayersInGrid, localPlayerMoveTimestampRef);
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
  const playerIdStr = String(currentPlayer._id);
  const playerPos = playersInGrid?.[gridId]?.pcs?.[playerIdStr]?.position;
  if (!gridId) { console.warn("No valid gridId found for currentPlayer."); return; }
  if (currentPlayer.iscamping) { updateStatus(32); return; }
  
  if (zoomLevel === 'frontier') {
    setZoomLevel('settlement'); // Zoom into the settlement view
    updateStatus(12); // "Settlement view."
  } else if (zoomLevel === 'settlement') {
    setZoomLevel('far'); // Zoom into the grid view
    const { username, gridType } = await fetchHomesteadOwner(gridId);
    // New logic to center camera on player using PlayersInGrid
    centerCameraOnPlayer(playerPos, TILE_SIZES.far); // <- hardcode the *target* zoom level

    if (gridType === 'town') {
      updateStatus(14);
    } else if (["valley0", 'valley1', 'valley2', 'valley3'].includes(gridType)) {
      updateStatus(16);
    } else if (gridType === 'homestead') {
      if (username) {
        if (username === currentPlayer.username) {
          updateStatus(112);
        } else {
          updateGridStatus(gridType, username, updateStatus);
        }
      } else {
        updateStatus('This homestead is unoccupied.');
      }
    } else {
      console.warn(`Unexpected gridType: ${gridType}`);
      updateStatus('Unknown location.');
    }

  } else if (zoomLevel === 'far') {
    setZoomLevel('close'); // Zoom into a detailed view
    setTimeout(() => {
      centerCameraOnPlayer(playerPos, TILE_SIZES.close);
    }, 50); // Allow brief render before scrolling
  } else if (zoomLevel === 'close') {
    setZoomLevel('closer');
    setTimeout(() => {
      centerCameraOnPlayer(playerPos, TILE_SIZES.closer);
    }, 50); // Allow brief render before scrolling
  }
};

const zoomOut = () => {
  const gridId = currentPlayer?.location?.g;
  const playerIdStr = String(currentPlayer._id);
  const playerPos = playersInGrid?.[gridId]?.pcs?.[playerIdStr]?.position;

  if (currentPlayer.iscamping) { updateStatus(32); return; }
  if (zoomLevel === 'closer') {
    setZoomLevel('close');
    setTimeout(() => {
      centerCameraOnPlayer(playerPos, TILE_SIZES.close);
    }, 50); // Allow brief render before scrolling
  } else if (zoomLevel === 'close') {
    setZoomLevel('far'); // Zoom out to grid view
    setTimeout(() => {
      centerCameraOnPlayer(playerPos, TILE_SIZES.far);
    }, 50); // Allow brief render before scrolling
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

useEffect(() => {
  const handleKeyDown = (event) => {
    if (activeModal) { return; } // Keyboard input disabled while modal is open
    if (isOffSeason) { return; } // Keyboard input disabled while offseason
    if (zoomLevel === 'frontier' || zoomLevel === 'settlement') { return; }  // Prevent input if zoomed out
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) { return; } // Prevent movement if a text input is focused
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); }  // Prevent the browser from scrolling when using arrow keys

    handleKeyMovement(event, currentPlayer, activeTileSize, masterResources,
        setCurrentPlayer, 
        setGridId, 
        setGrid, 
        setTileTypes, 
        setResources, 
        updateStatus, 
        closeAllPanels,
    );
  };
  window.addEventListener('keydown', handleKeyDown); 
  return () => {
    window.removeEventListener('keydown', handleKeyDown); 
  };
}, [currentPlayer, masterResources, activeTileSize, activeModal, zoomLevel]);



//////////// HANDLE CLICKING /////////////////////////

let isProcessing = false; // Guard against duplicate clicks

const handleTileClick = useCallback((rowIndex, colIndex) => {
  if (isProcessing) return; // Skip if still processing
  isProcessing = true;

  const resource = resources.find((res) => res.x === colIndex && res.y === rowIndex);
  console.log('⬆️ handleTileClick invoked with:', { rowIndex, colIndex, resource });

  // 🛡️ Prevent interaction on another player's homestead
  const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
  if (resource && currentPlayer?.location?.gtype === 'homestead' && !isOnOwnHomestead) {
    const isFriend = false; // 🧪 Future: replace with actual friend-checking logic
    const alwaysBlocked = ['Mailbox', 'Trade Stall', 'Warehouse'];
    const isForbiddenStation = resource?.category === 'station' && alwaysBlocked.includes(resource?.type);
    const isSafe = resource?.category === 'npc'; // Expand as needed
    if (isForbiddenStation || (!isSafe && !isFriend)) {
      console.warn("🚫 Blocked interaction on another player’s homestead.");
      updateStatus(90);
      isProcessing = false;
      return;
    }
  }

  // Validate `gridId` and `username`
  if (!gridId || typeof gridId !== 'string') { console.error('Invalid gridId:', gridId); return; }
  if (!currentPlayer?.username || typeof currentPlayer.username !== 'string') { console.error('Invalid username:', currentPlayer?.username); return; }
  // ✅ Get player position from playersInGrid
  const playerPos = playersInGridManager.getPlayerPosition(gridId, String(currentPlayer._id));
  const targetPos = { x: colIndex, y: rowIndex };
  if (!playerPos || typeof playerPos.x === 'undefined' || typeof playerPos.y === 'undefined') {
      console.error("⚠️ Player position is invalid in NPCsInGrid; playerPos: ", playerPos);
      isProcessing = false;
      return;
  }
  // If clicking a resource, check range before interacting (except NPCs)
  if (resource && resource.category !== 'npc') {
    const distance = calculateDistance(playerPos, targetPos);
    const playerRange = getDerivedRange(currentPlayer, masterResources);    
    if (distance > playerRange) {
      FloatingTextManager.addFloatingText(24, targetPos.x, targetPos.y, activeTileSize);
      isProcessing = false;
      return;
    }
  }
  if (resource) {
    console.log('App.js: Resource clicked:', resource);
    if (resource.category === 'npc') { } // handled in RenderDynamic
    else if (resource.category === 'travel') {
      // Signpost clicking ignored; you have to walk onto them; 
      updateStatus(110); // "You have to walk onto a signpost to travel."
    }
    else if (resource.category === 'training') {
      setActiveStation({type: resource.type, position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      openPanel('SkillsAndUpgradesPanel'); 
    }
    else if (resource.category === 'crafting') {
      setActiveStation({type: resource.type,position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      openPanel('CraftingStation');
    } 
    else if (resource.category === 'trading') {
      setActiveStation({type: resource.type,position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      openPanel('TradingStation');
    } 
    else if (resource.category === 'farm hand') {
      setActiveStation({type: resource.type,position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      openPanel('FarmHandPanel');
    } 
    else if (resource.category === 'shop') {
      setActiveStation({type: resource.type,position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      openPanel('ShopStation');
    } 
    else if (resource.category === 'stall') {
      setActiveStation({type: resource.type, position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      openPanel('AnimalStall');
    } 
    else if (resource.category === 'deco') {
      setActiveStation({type: resource.type, position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      openPanel('DecoPanel');
    } 
    else if (resource.category === 'station') {
      setActiveStation({type: resource.type, position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      switch (resource.type) {
        case 'Courthouse':
          openPanel('Courthouse'); break;
        case 'Trade Stall':
          openPanel('TradeStall'); break;
        case 'Mailbox':
          openModal('Mailbox'); break;
        case 'Train':
          openPanel('TrainPanel'); break;
        case 'Bank':
          openPanel('BankPanel'); break;
        default:
          console.warn(`Unhandled station type: ${resource.type}`);
      }
    } else {
      // Pass to handleResourceClick for all other resources
      handleResourceClick(
        resource,
        rowIndex,
        colIndex,
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
      playersInGridManager.updatePC(gridId, currentPlayer._id, {
        position: targetPosition
      });
    }
  }
  isProcessing = false; // Reset flag here

}, [resources, gridId, inventory, currentPlayer, playerPosition, activeTileSize]);
  

  
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
              <button
                className="btn-success"
                onClick={() => {
                  setIsModalOpen(false);
                  window.location.reload();
                }}
              >
                {strings["73"]}
              </button>
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
      if (document.visibilityState === 'visible') updateActivity();
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
  const combatStats = currentPlayer?.location?.g
    ? playersInGrid?.[currentPlayer.location.g]?.pcs?.[String(currentPlayer?._id)] || {}
    : {};
  const gridStats = currentPlayer?.location
    ? { gridCoord: currentPlayer.location.gridCoord,
        gridType: currentPlayer.location.gtype,
      }
    : { gridCoord: 'Not loaded',
        gridType: 'Not loaded',
      };
  
  // Chat panel slideout state
  const [isChatOpen, setIsChatOpen] = useState(false);


  /////////////// RENDERING THE APP /////////////////////////

return (
    <>
    <FloatingTextManager />

{/* //////////////////////  Header  //////////////////////// */}

    <header className="app-header">
      <div className="header-controls-left">
        
        <button className="shared-button"
          onClick={() => openPanel('HowToMoneyPanel')}
        >
          💰 {Array.isArray(currentPlayer?.inventory)
            ? (currentPlayer.inventory.find((item) => item.type === "Money")?.quantity || 0).toLocaleString()
            : "..."}
        </button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openPanel('InventoryPanel')}>{strings[10103]} </button>
        <div className="nav-button-wrapper">
          <button className="shared-button" disabled={!currentPlayer} onClick={() => setActiveModal("Store")}>{strings[10104]}</button>
          {badgeState.store && <div className="badge-dot" />}
        </div>
        <div className="nav-button-wrapper">
          <button className="shared-button" disabled={!currentPlayer} onClick={() => openModal('Mailbox')}>{strings[10105]}</button>
          {badgeState.mailbox && <div className="badge-dot" />}
        </div>

      </div>
        <div className="header-controls-right">
            <button className="shared-button" onClick={() => setShowShareModal(true)}>{strings[10106]}</button>
            <button className="shared-button" disabled={!currentPlayer} onClick={() => setActiveModal('LanguagePicker')}>
              🌎 {LANGUAGE_OPTIONS.find(l => l.code === currentPlayer?.language)?.label || 'Language'}
            </button>
            <div className="nav-button-wrapper">
              <button className="shared-button" disabled={!currentPlayer} onClick={() => setIsChatOpen(prev => !prev)}>{strings[10107]}</button>
              {badgeState.chat && <div className="badge-dot" />}
            </div>
        </div>
    </header>
    
    <div className="status-bar-wrapper"> <StatusBar /> </div>

    {/* Chat Slideout Panel */}
    {isChatOpen && currentPlayer && (
      <div className="chat-panel-slideout">
        <Chat
          currentGridId={currentPlayer.location?.g}
          currentSettlementId={currentPlayer.location?.s}
          currentFrontierId={currentPlayer.frontierId}
          currentPlayer={currentPlayer}
          onClose={() => setIsChatOpen(false)}
        />
      </div>
    )}


{/* //////////////// Left Side Navigation Column ///////////////// */}

    <div className="nav-column">
      <button className="nav-button" title={strings[12009]} onClick={() => closePanel()}>🏡</button>
      <button className="nav-button" title={strings[12010]} 
          onClick={() => {
            if (currentPlayer?.username) { 
              openPanel('ProfilePanel');
            } else { 
              openPanel('LoginPanel');
            }
          }}
        > 😀
        </button>
      
      <button className="nav-button" title={strings[12001]} disabled={!currentPlayer} onClick={() => openPanel('FarmingPanel')}>🚜</button>
      <button className="nav-button" title={strings[12002]} disabled={!currentPlayer} onClick={() => openPanel('BuildPanel')}>⚒️</button>
      <button className="nav-button" title={strings[12003]} disabled={!currentPlayer} onClick={() => openPanel('BuyPanel')}>🐮</button>
      <button className="nav-button" title={strings[12005]} disabled={!currentPlayer} onClick={() => {
          setActiveStation(null); // ✅ Reset activeStation
          openPanel("SkillsAndUpgradesPanel"); // ✅ Open the panel normally
        }}>💪</button>
      <button className="nav-button" title={strings[12004]} disabled={!currentPlayer} onClick={() => openPanel('QuestPanel')}>❓</button>
      <button className="nav-button" title={strings[12006]} disabled={!currentPlayer} onClick={() => openPanel('CombatPanel')}>⚔️</button>
      <button className="nav-button" title={strings[12007]} onClick={() => openPanel('GovPanel')}>🏛️</button>
      <button className="nav-button" title={strings[12008]} onClick={() => openPanel('SeasonPanel')}>🗓️</button>
      {isDeveloper && (
        <button className="nav-button" title="Debug" onClick={() => openPanel('DebugPanel')}>
          🐞
        </button>
      )}
    </div>

    <div className="app-container">


{/* ///////////////////  Base Panel  ///////////////////// */}

    <div className="base-panel">
      <h1>{strings[0]}</h1>  
      <br/>
        {currentPlayer && (
          <button className="shared-button" onClick={() => openPanel('ProfilePanel')}>
            {currentPlayer.icon} Logged in: {currentPlayer.username}
          </button>
        )}
        {currentPlayer?.accountStatus === 'Gold' && (
          <button className="gold-button" onClick={() => openPanel('GoldBenefitsPanel')}>{strings[10108]}</button>
        )}

      <br/>
      <button className="shared-button" onClick={() => openPanel('HowToPanel')}>{strings[10109]} AWSD</button>
      <div className="zoom-controls">
        <button className="zoom-button" disabled={!currentPlayer} onClick={zoomOut}>−</button>
        <button className="zoom-button" disabled={!currentPlayer} onClick={zoomIn}>+</button>
        <span><h3>to Zoom</h3></span>
      </div>
      <button className="shared-button" onClick={() => openPanel('HowToPanel')}>{strings[10110]}</button>
      <br/>

      {/* Add Role display if player has one */}
      {currentPlayer?.role === "Mayor" && (
        <> <h2 className="player-role"> {strings[10111]} </h2>
          <br />
        </>
      )}

      {/* Hit Points */}
      <button className="shared-button" onClick={() => openPanel('CombatPanel')}>{strings[10112]} <strong>{playersInGrid?.[gridId]?.pcs?.[String(currentPlayer._id)]?.hp ?? "?"} / {playersInGrid?.[gridId]?.pcs?.[String(currentPlayer._id)]?.maxhp ?? "?"}</strong></button>
      <br />

      {/* Season */}
      {timers.seasons.phase === "onSeason" ? (
        <>
          <h2>{strings[10113]} {seasonData?.type || "[Season unknown]"}</h2>
          <button className="shared-button" onClick={() => openPanel('SeasonPanel')}>{strings[10114]}<br /><strong>{countdowns.seasons}</strong></button>
        </>
      ) : (
        <>
          <h2>{strings[10113]} {seasonData?.type || "[Season unknown]"}</h2>
          <button className="shared-button" onClick={() => openPanel('SeasonPanel')}>{strings[10115]}<br /><strong>{countdowns.seasons}</strong></button>
        </>
      )}
      <br />
      
      <h2>{strings[10116]}
        <span 
          onClick={() => setShowTimers(!showTimers)} 
          style={{ cursor: "pointer", fontSize: "16px", marginLeft: "5px" }}
        >
          {showTimers ? "▼" : "▶"}
        </span>
      </h2>

      {showTimers && (
        <div className="timers-panel">

      <br />

          {timers.taxes.phase === "waiting" ? (
        <>
          <h3>{strings[10117]}</h3> 
          <p>{strings[10118]}{countdowns.taxes}</p>
        </>
      ) : (
        <>
          <h4>{strings[10119]}</h4>
        </>
      )}
          <h3>{strings[10120]}{timers.elections.phase}</h3>
          <p>{strings[10121]}{countdowns.elections}</p>
          <h3>{strings[10122]}{timers.train.phase}</h3>
          <p>{strings[10121]}{countdowns.train}</p>
          <h3>{strings[10123]}{timers.bank.phase}</h3>
          <p>{strings[10124]}{countdowns.bank}</p>
          <button className="shared-button" onClick={() => openModal('TownNews')}>{strings[10125]}</button>
        </div>
      )}
      <br />

      <h2>Discord Server:</h2>
      <button
        className="shared-button"
        onClick={() => window.open('https://discord.gg/mQgRP2K9', '_blank')}
      >
        Join our Discord
      </button>

      <br />
      <h3>{strings[10126]}</h3>
      <div>
      {playersInGrid?.[gridId]?.pcs && typeof playersInGrid[gridId].pcs === 'object' ? (
          Object.entries(playersInGrid[gridId].pcs).length === 0 ? (
            <h4 style={{ color: "white" }}>{strings[10127]}</h4>
          ) : (
            Object.entries(playersInGrid[gridId].pcs).map(([playerId, pc]) => (
              <p key={playerId} style={{ color: "white" }}>
                {connectedPlayers.has(playerId) && '📡 '}
                <strong>{pc.username}</strong>
              </p>
            ))
          )
        ) : (
          <h4 style={{ color: "white" }}>{strings[10127]}</h4>
        )}
        <h4 style={{ color: "white" }}>
          {controllerUsername 
            ? `🐮 ${controllerUsername}` 
            : "There is no NPCController"}
        </h4>
      </div>
      <br />
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
        </div>
      )}

      {zoomLevel === 'far' || zoomLevel === 'closer' || zoomLevel === 'close' ? (
      <>
        <RenderGrid
          grid={memoizedGrid}
          tileTypes={memoizedTileTypes}
          resources={memoizedResources}
          handleTileClick={handleTileClick}
          TILE_SIZE={activeTileSize}
          setHoverTooltip={setHoverTooltip} 
        />
        <DynamicRenderer
          TILE_SIZE={activeTileSize}
          setInventory={setInventory}
          setResources={setResources}
          currentPlayer={currentPlayer}
          openPanel={openPanel}
          onNPCClick={handleQuestNPCClick}  // Pass the callback
          onPCClick={handlePCClick}  // Pass the callback
          masterResources={masterResources}
          masterSkills={masterSkills}
          setHoverTooltip={setHoverTooltip}
          setModalContent={setModalContent}
          setIsModalOpen={setIsModalOpen} 
          updateStatus={updateStatus}
        /> 
        {/* <RenderVFX 
          toggleVFX={currentPlayer?.settings?.toggleVFX}
          // Placeholder for VFX
          TILE_SIZE={activeTileSize}
        /> */}

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
        />
      )}
      {activePanel === 'InventoryPanel' && (
        <InventoryPanel
          onClose={closePanel} 
          masterResources={masterResources}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          updateStatus={updateStatus}
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
        />
      )}
      {activePanel === 'TrainPanel' && (
        <TrainPanel
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
      {activePanel === 'GoldBenefitsPanel' && (
        <GoldBenefitsPanel 
          currentPlayer={currentPlayer}
          updateStatus={updateStatus}
          onOpen={openPanel}
          onClose={closePanel}
          setModalContent={setModalContent}
 	        setIsModalOpen={setIsModalOpen}
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
      {activePanel === 'Courthouse' && (
        <CourthousePanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
        />
      )}
      {activePanel === 'QuestPanel' && (
        <QuestPanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
        />
      )}
      {activePanel === 'SkillsAndUpgradesPanel' && (
        <SkillsAndUpgradesPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          backpack={backpack}
          setBackpack={setBackpack} 
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          stationType={activeStation?.type} 
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterSkills={masterSkills}
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
          setResources={setResources}
          stationType={activeStation?.type} 
          currentStationPosition={activeStation?.position} 
          gridId={activeStation?.gridId} 
          masterResources={masterResources} 
          masterSkills={masterSkills} 
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
        />
      )}
      {activePanel === 'TradingStation' && (
        <TradingStation
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
        />
      )}
      {activePanel === 'FarmHandPanel' && (
        <FarmHandPanel
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
          TILE_SIZE={activeTileSize}
          updateStatus={updateStatus}
          masterResources={masterResources}
          masterSkills={masterSkills}
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
        />
      )}
      {activePanel === 'QuestGiverPanel' && (
        <QuestGiverPanel
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

      {hoverTooltip && (
        <div
          className="HoverTooltip"
          style={{
            position: 'fixed',
            zIndex: 9999,
            top: hoverTooltip.y,
            left: hoverTooltip.x,
            transform: 'translate(-50%, -100%) translateY(-8px)', // ⬅️ Center horizontally and offset upward
            pointerEvents: 'none',
          }}
          dangerouslySetInnerHTML={{ __html: hoverTooltip.content }}
        />
      )}
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

    </>
  );
}

export default App;

