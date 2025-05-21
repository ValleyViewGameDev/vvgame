import './App.css';
import './VFX/VFX.css';
import API_BASE from './config.js';  
import axios from 'axios';
import React, { useContext, useState, useEffect, memo, useMemo, useCallback, useRef } from 'react';
import NPC from './GameFeatures/NPCs/NPCs';
import { initializeGrid, postLoginInitialization } from './AppInit';
import { loadMasterSkills, loadMasterResources } from './Utils/TuningManager';
import { RenderGrid, RenderVFX, RenderTooltip } from './Render/Render';
import DynamicRenderer from './Render/RenderDynamic.js';
import { handleResourceClick } from './ResourceClicking';

import socket from './socketManager';
import { socketListenForPCJoinAndLeave,
  socketListenForPCstateChanges,
  socketListenForNPCStateChanges,
  socketListenForResourceChanges,
  socketListenForTileChanges,
  socketListenForNPCControllerStatus,
  socketListenForSeasonReset,
  socketListenForPlayerConnectedAndDisconnected,
  socketListenForConnectAndDisconnect } from './socketManager';

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
import strings from './UI/strings.json';
import ProfilePanel from './Authentication/ProfilePanel';
import LoginPanel from './Authentication/LoginPanel';
import DebugPanel from './Utils/debug';
import InventoryPanel from './GameFeatures/Inventory/InventoryPanel';
import BuildPanel from './GameFeatures/Build/BuildPanel';
import BuyPanel from './GameFeatures/Buy/BuyPanel';
import SkillsAndUpgradesPanel from './GameFeatures/Skills/SkillsPanel';
import FarmingPanel from './GameFeatures/Farming/FarmingPanel';
import HowToPanel from './UI/HowToPanel';
import GovPanel from './GameFeatures/Government/GovPanel';
import BankPanel from './GameFeatures/Trading/Bank';
import TrainPanel from './GameFeatures/Trading/Train';
import CourthousePanel from './GameFeatures/Government/Courthouse';
import QuestPanel from './GameFeatures/Quests/QuestPanel';
import QuestGiverPanel from './GameFeatures/NPCs/NPCsQuest';
import CraftingStation from './GameFeatures/Crafting/CraftingStation';
import FarmHandsPanel from './GameFeatures/FarmHands/FarmHands';
import TradingStation from './GameFeatures/Crafting/TradingStation';
import ShopStation from './GameFeatures/Crafting/ShopStation';
import AnimalStall from './GameFeatures/FarmAnimals/AnimalStall';
import TradeStall from './GameFeatures/Trading/TradeStall';
import Mailbox from './GameFeatures/Mailbox/Mailbox';
import Store from './Store/Store';
import OffSeasonModal from './GameFeatures/Seasons/OffSeasonModal.js';
import TownNews from './UI/TownNews.js';
import SeasonPanel from './GameFeatures/Seasons/SeasonPanel';
import SocialPanel from './GameFeatures/Social/SocialPanel';
import CombatPanel from './GameFeatures/Combat/CombatPanel';
import GridStateDebugPanel from './Utils/GridStateDebug.js';

import { usePanelContext } from './UI/PanelContext';
import { useModalContext } from './UI/ModalContext';
import FloatingTextManager from './UI/FloatingText';
import StatusBar from './UI/StatusBar';
import { StatusBarContext } from './UI/StatusBar';
import { formatCountdown } from './UI/Timers';

import { fetchGridData, updateGridStatus } from './Utils/GridManagement';
import { handleKeyMovement, centerCameraOnPlayer } from './PlayerMovement';
import { mergeResources, mergeTiles, enrichResourceFromMaster } from './Utils/ResourceHelpers.js';
import { fetchHomesteadOwner, calculateDistance } from './Utils/worldHelpers.js';
import { handlePlayerDeath } from './Utils/playerManagement';

function App() {

  useEffect(() => {
    const checkInitialSeasonPhase = async () => {
      console.log("Checking for on or off Season on app start");
      const storedTimers = JSON.parse(localStorage.getItem("timers"));
      console.log("Season phase = ",storedTimers.seasons.phase);
      if (storedTimers?.seasons?.phase === "offSeason") {
        console.log("🕵️ Initial local phase is offSeason, confirming with server...");
    
        try {
          const res = await axios.get(`${API_BASE}/api/get-global-season-phase`);
          const serverPhase = res.data?.phase;
          if (serverPhase === "offSeason") {
            console.log("✅ Server confirms offSeason");
            setIsOffSeason(true);
          } else {
            console.log("❌ Server says it's not offSeason");
            setIsOffSeason(false);
          }
        } catch (error) {
          console.error("❌ Error confirming season with server:", error);
        }
      }

    };
    checkInitialSeasonPhase();
  }, []);

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
const TILE_SIZES = { close: 30, far: 16 }; // Rename for clarity
const activeTileSize = TILE_SIZES[zoomLevel]; // Get the active TILE_SIZE

const [inventory, setInventory]  = useState({});
const [backpack, setBackpack] = useState({});
const [playerPosition, setPlayerPosition] = useState(null);
const [isMoving, setIsMoving] = useState(null);

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


const { updateStatus } = useContext(StatusBarContext); // Access the status bar updater
const [setStatusMessage] = useState(0); // Initial status message index
const [isLoginPanelOpen, setisLoginPanelOpen] = useState(false);
const { activeModal, setActiveModal, openModal, closeModal } = useModalContext();
const [isModalOpen, setIsModalOpen] = useState(false);
const [modalContent, setModalContent] = useState({ title: '', message: '', message2: '' });
const [isOffSeason, setIsOffSeason] = useState(false); // Track if it's off-season
const { activePanel, openPanel, closePanel } = usePanelContext();
const [activeQuestGiver, setActiveQuestGiver] = useState(null);
const [activeSocialPC, setActiveSocialPC] = useState(null);
const [activeStation, setActiveStation] = useState(null);

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

//Forgot why we did this:
const memoizedGrid = useMemo(() => grid, [grid]);
const memoizedTileTypes = useMemo(() => tileTypes, [tileTypes]);
const memoizedResources = useMemo(() => resources, [resources]);


/////////// APP INITIALIZATION /////////////////////////

// Flags to track initialization
let isInitializing = false; // Declare inside useEffect to avoid global persistence
const [isAppInitialized, setIsAppInitialized] = useState(false);

// Central INITIALIZATION for player and grid data //////////////////////////////////////////////////////
useEffect(() => {

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
        console.log('No stored player found, opening login modal.');
        setisLoginPanelOpen(true);    
        openPanel("LoginPanel");  
        setModalContent({
          title: strings["5005"],  // "Welcome"
          message: strings["5006"], 
          message2: strings["5007"], 
          size: "small"
        });
        setIsModalOpen(true);
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
      setInventory(DBPlayerData.inventory || []);  // Initialize inventory properly

      // Step 4. Determine initial gridId from player or storage
      console.log('🏁✅ Determining local gridId...');
      const initialGridId = parsedPlayer?.location?.g || localStorage.getItem('gridId');
      if (!initialGridId) {
        console.error('No gridId found. Unable to initialize grid.');
        return;
      }
      setGridId(initialGridId);
      localStorage.setItem('gridId', initialGridId); // Save to local storage

      // 4.5. Open the socket
      socket.connect();
      socket.emit('join-grid', { gridId: initialGridId, playerId: DBPlayerData.playerId });
      console.log("📡 Connected to socket and joined grid:", initialGridId);
      socket.emit('player-joined-grid', {
        gridId: initialGridId,
        playerId: DBPlayerData.playerId,
        username: DBPlayerData.username,
        playerData: DBPlayerData,
      });
      socket.emit('set-username', { username: DBPlayerData.username });

      // Step 5. Initialize grid tiles, resources
      console.log('🏁✅ 5 InitAppWrapper; Initializing grid tiles and resources...');
      await initializeGrid(
        activeTileSize,
        initialGridId,
        setGrid,
        setResources,
        setTileTypes,
        updateStatus
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
        console.log('🎯 Centering camera on player position:', playerPosition);
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
        await playersInGridManager.addPC(gridId, DBPlayerData.playerId, DBPlayerData);
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

      console.log('✅🏁✅🏁✅🏁✅ App initialization complete.');
      setIsAppInitialized(true);

    } catch (error) {
      console.error('Error during app initialization:', error);
      updateStatus(error.code === 'ERR_NETWORK' ? 1 : 0);  // Handle errors
    }
  }; 
  initializeAppWrapper();
}, []);  // Only run once when the component mounts


// FARM STATE - Farming Seed Timer & Crafting Timer Management //////////////////////////////////////////////////////
useEffect(() => {
  if (gridId) {
    farmState.initializeFarmState(resources); // ✅ Works for seeds
    farmState.startSeedTimer({gridId,setResources,activeTileSize,currentPlayer,setCurrentPlayer,});
  }
  return () => { farmState.stopSeedTimer(); };
}, [gridId]);  



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


// 🔄 PC Management Loop: Check for player death & lava
useEffect(() => {
  if (!isAppInitialized) { console.log('App not initialized. Skipping PC management.'); return; }

  const interval = setInterval(async () => {
    if (playersInGrid && gridId && currentPlayer?._id) {
      const playerId = String(currentPlayer._id);
      const playerPC = playersInGrid?.[gridId]?.pcs?.[playerId];
      if (playerPC?.hp <= 0 && currentPlayer) {
      // 💀 Check for player death
         console.log("💀 Player is dead. Handling death...");
        await handlePlayerDeath(currentPlayer,setCurrentPlayer,setGridId,setGrid,setResources,setTileTypes,activeTileSize,updateStatus,setModalContent,setIsModalOpen);
      } else {
      // 🔥 Check for lava tile
        const col = playerPC?.position?.x;
        const row = playerPC?.position?.y;
        const onTileType = tileTypes?.[row]?.[col];
        if (onTileType === "l") { 
          const lavaDamage = 2;
          playersInGrid[gridId].pcs[playerId].hp -= lavaDamage; 
          FloatingTextManager.addFloatingText(`- ${lavaDamage} ❤️‍🩹 HP`, col, row, activeTileSize);
          console.log("🔥 Player is standing on lava. Applying 2 damage."); }
      }
    }
  }, 1000);
  return () => clearInterval(interval);
}, [isAppInitialized, gridId, playersInGrid, currentPlayer, activeTileSize]);



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
    }
  };

  if (timers.seasons.phase === "offSeason") { 
    setIsOffSeason(true);
    // 🌱 New logic to force-refresh when OffSeason ends
    if (
      currentPlayer &&
      localStorage.getItem('gridId') !== currentPlayer.location?.g
    ) {
      console.warn("🌍 Grid mismatch after OffSeason reset. Forcing refresh.");
      localStorage.setItem('gridId', currentPlayer.location.g);
      window.location.reload();
    }
  } else {
    setIsOffSeason(false); 
  }

  const interval = setInterval(checkPhaseTransitions, 5000); // ✅ Check every 5s
  return () => clearInterval(interval);
}, [timers]); // Runs when timers update

const handleResetTimers = async () => {
  try {
    // ✅ Step 1: Clear local storage timers
    console.log("🧹 Local storage timer value before clearing:", localStorage.getItem("timers"));
    localStorage.removeItem("timers");
    console.log("🧼 Local storage timers cleared.");

    // ✅ Step 2: Request server to reset timers
    const response = await axios.post(`${API_BASE}/api/reset-all-timers`);
    if (response.data.success) {
      console.log("✅ Timers reset successfully from the client.");
      updateStatus("🔄 All timers reset successfully.");
      await fetchTimersData();

    } else {
      console.warn("⚠️ Timer reset failed.");
      updateStatus("❌ Failed to reset timers.");
    }
  } catch (error) {
    console.error("❌ Error resetting timers:", error);
    updateStatus("❌ Timer reset request failed.");
  }
};

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
  socketListenForNPCStateChanges(gridId, setGridState, npcController);
}, [socket, gridId]);

// 🔄 SOCKET LISTENER: Real-time updates for resources
useEffect(() => {
  socketListenForResourceChanges(gridId, isMasterResourcesReady, setResources, masterResources, enrichResourceFromMaster);
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
        updateGridStatus(gridType, username, updateStatus);
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
  }
};

const zoomOut = () => {
  if (currentPlayer.iscamping) { updateStatus(32); return; }
  if (zoomLevel === 'close') {
    setZoomLevel('far'); // Zoom out to grid view
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

    handleKeyMovement(event, currentPlayer, activeTileSize, masterResources);
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
    const playerRange = currentPlayer.range || 1; // Default range if not set
    console.log(`Checking range: Player at ${playerPos.x},${playerPos.y} | Target at ${targetPos.x},${targetPos.y} | Distance = ${distance} | Range = ${playerRange}`);
    if (distance > playerRange) {
        FloatingTextManager.addFloatingText(24, targetPos.x, targetPos.y, activeTileSize);
        isProcessing = false;
        return; 
    }
  }
  if (resource) {
    console.log('App.js: Resource clicked:', resource);
    if (resource.category === 'npc') { } // handled in RenderDynamic
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
    else if (resource.category === 'shop') {
      setActiveStation({type: resource.type,position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      openPanel('ShopStation');
    } 
    else if (resource.category === 'stall') {
      setActiveStation({type: resource.type, position: { x: colIndex, y: rowIndex }, gridId: gridId, });
      openPanel('AnimalStall');
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
        case 'Farm Hand 1':
        case 'Farm Hand 2':
        case 'Farm Hand 3':
          openPanel('FarmHandsPanel'); break;
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


// FOR THE PANELS:

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
  
return ( <>

{/* New Navigation Column */}

    <div className="nav-column">
      <button className="nav-button" title="Home" onClick={() => closePanel()}>🏡</button>
      <button className="nav-button" title="Farming" onClick={() => openPanel('FarmingPanel')}>🚜</button>
      <button className="nav-button" title="Build" onClick={() => openPanel('BuildPanel')}>⚒️</button>
      <button className="nav-button" title="Buy Animals" onClick={() => openPanel('BuyPanel')}>🐮</button>
      <button className="nav-button" title="Active Quests" onClick={() => openPanel('QuestPanel')}>❓</button>
      <button className="nav-button" title="Skills & Upgrades" disabled={!currentPlayer} onClick={() => {
          setActiveStation(null); // ✅ Reset activeStation
          openPanel("SkillsAndUpgradesPanel"); // ✅ Open the panel normally
        }}>⚙️</button>
      <button className="nav-button" title="Combat" onClick={() => openPanel('CombatPanel')}>⚔️</button>
      <button className="nav-button" title="Government" onClick={() => openPanel('GovPanel')}>🏛️</button>
      <button className="nav-button" title="Seasons" onClick={() => openPanel('SeasonPanel')}>🗓️</button>
      <button className="nav-button" onClick={() => openPanel('DebugPanel')}>🐞</button>
    </div>

    <div className="app-container">
    <FloatingTextManager />

{/* Base Panel */}

    <div className="base-panel">
      <h1>Valley View</h1>  
      <br />
      <h3>Logged in as:</h3>

      <button className="shared-button"
        onClick={() => {
          if (currentPlayer?.username) { 
            openPanel('ProfilePanel'); // Open Profile Panel if player is logged in
          } else { 
            openPanel('LoginPanel'); // Open Login Panel if player is not logged in
          }
        }}
      >
        {currentPlayer?.username || 'Sign In'}
      </button>

      {/* Add Account Status button if player is logged in */}
      {currentPlayer?.accountStatus && (
        <>
          <button className="shared-button account-status-button" onClick={() => openModal('Store')} >
            {currentPlayer.accountStatus} Account
          </button>
        </>
      )}

      {/* Add Role display if player has one */}
      {currentPlayer?.role === "Mayor" && (
        <>
          <h3 className="player-role"> You are the Mayor </h3>
          <br />
        </>
      )}

      <button className="shared-button" >AWSD to Move</button>
      <div className="zoom-controls">
        <button className="zoom-button" disabled={!currentPlayer} onClick={zoomOut}>−</button>
        <button className="zoom-button" disabled={!currentPlayer} onClick={zoomIn}>+</button>
        <span><h3>to Zoom</h3></span>
      </div>
      <button className="shared-button" onClick={() => openPanel('HowToPanel')}>🕹️ How to Play</button>
      <br/>

      <div>
        {/* Button to toggle stats visibility */}
        <h3>😀 Player Stats:
          <span 
            onClick={() => setShowStats(!showStats)} 
            style={{ cursor: "pointer", fontSize: "16px", marginLeft: "5px" }}
          >
            {showStats ? "▼" : "▶"}
          </span>
        </h3>

        {/* Collapsible Combat Stats Panel */}
        {showStats && (
          <div className="combat-stats-panel">
            <h4>❤️‍🩹 HP: {combatStats.hp || 0}</h4>
            <h4>❤️‍🩹 Max HP: {combatStats.maxhp || 0}</h4>
            <h4>🛡️ Armor Class: {combatStats.armorclass || 0}</h4>
            <h4>⚔️ Attack Bonus: {combatStats.attackbonus || 0}</h4>
            <h4>⚔️ Damage: {combatStats.damage || 0}</h4>
            <h4>🔭 Attack Range: {combatStats.attackrange || 0}</h4>
            <h4>🎯 Speed: {combatStats.speed || 0}</h4>
            <h4>⛺️ Is Camping: {combatStats.iscamping ? "Yes" : "No"}</h4> 
          </div>
        )}
      </div>
      <br />

      <h3>⏪ Happening Now in Town:
        <span 
          onClick={() => setShowTimers(!showTimers)} 
          style={{ cursor: "pointer", fontSize: "16px", marginLeft: "5px" }}
        >
          {showTimers ? "▼" : "▶"}
        </span>
      </h3>

      {showTimers && (
        <div className="timers-panel">

      <br />
      {timers.taxes.phase === "waiting" ? (
        <>
          <h4>Next Tax Collection:</h4> 
          <h2>{countdowns.taxes}</h2>
        </>
      ) : (
        <>
          <h4>Now collecting taxes...</h4>
        </>
      )}
      <br />
      {timers.seasons.phase === "onSeason" ? (
        <>
          <h4>📅 Season Ends in:</h4>
          <h2>{countdowns.seasons}</h2>
        </>
      ) : (
        <>
          <h4>📅 Next Season in:</h4>
          <h2>{countdowns.seasons}</h2>
        </>
      )}
      <br />

          <h4>🏛️ Elections: {timers.elections.phase}</h4>
          <p>Ends: {countdowns.elections}</p>
          <h4>🚂 Train: {timers.train.phase}</h4>
          <p>Ends: {countdowns.train}</p>
          <h4>🏦 Bank: {timers.bank.phase}</h4>
          <p>Ends: {countdowns.bank}</p>
          <button className="shared-button" onClick={() => openModal('TownNews')}> More </button>
        </div>
      )}

      <br />
      <h3>Who's here:</h3>
      <div>
      {playersInGrid?.[gridId]?.pcs && typeof playersInGrid[gridId].pcs === 'object' ? (
          Object.entries(playersInGrid[gridId].pcs).length === 0 ? (
            <h4 style={{ color: "white" }}>No PCs present in the grid.</h4>
          ) : (
            Object.entries(playersInGrid[gridId].pcs).map(([playerId, pc]) => (
              <p key={playerId} style={{ color: "white" }}>
                {connectedPlayers.has(playerId) && '📡 '}
                <strong>{pc.username}</strong>
              </p>
            ))
          )
        ) : (
          <h4 style={{ color: "white" }}>No PCs present in the grid.</h4>
        )}
        <h4 style={{ color: "white" }}>
          {controllerUsername 
            ? `🐮 ${controllerUsername}` 
            : "There is no NPCController"}
        </h4>
      </div>
      <br />

      <GridStateDebugPanel
        gridId={gridId}
        gridCoord={gridStats.gridCoord}
        gridType={gridStats.gridType}
        NPCsInGrid={NPCsInGrid}
        playersInGrid={playersInGrid}
      />

      <br />
      <button className="panel-button reset-button" onClick={handleResetTimers}>Reset All Timers</button>
    </div>

{/* Header */}

    <header className="app-header">
      <div className="money-display">
        <h3>💰  
          {Array.isArray(currentPlayer?.inventory) ? (
              <span className="money-value">
                  {currentPlayer.inventory.find((item) => item.type === "Money")?.quantity || 0}
              </span>
          ) : ( "..." )}
        </h3>
      </div>
      <div className="header-controls">
          <button className="shared-button" disabled={!currentPlayer} onClick={() => openPanel('InventoryPanel')}> 🎒 Inventory </button>
          <button className="shared-button" disabled={!currentPlayer} onClick={() => openModal('Store')}>🛒 Store</button>
          <button className="shared-button" disabled={!currentPlayer} onClick={() => openModal('Mailbox')}>📨 Inbox</button>
      </div>
      <div className="language-control">
          <button className="shared-button" disabled={!currentPlayer} onClick={() => openModal('Language')}>🌎 EN</button>
      </div>
    </header>
    <div className="status-bar-wrapper"> <StatusBar /> </div>


{/* //////////////////// Game Board //////////////////// */}

    <div className="homestead">
      {zoomLevel === 'far' || zoomLevel === 'close' ? (
        <>
          <DynamicRenderer
            TILE_SIZE={activeTileSize}
            setInventory={setInventory}
            setResources={setResources}
            currentPlayer={currentPlayer}
            openPanel={openPanel}
            onNPCClick={handleQuestNPCClick}  // Pass the callback
            onPCClick={handlePCClick}  // Pass the callback
            masterResources={masterResources}
            setHoverTooltip={setHoverTooltip} // ✅ NEW
            /> {/* Parallel rendering layer for PCs and NPCs */}

          <RenderGrid
            grid={memoizedGrid}
            tileTypes={memoizedTileTypes}
            resources={memoizedResources}
            handleTileClick={handleTileClick}
            TILE_SIZE={activeTileSize}
            setHoverTooltip={setHoverTooltip} // ✅ Add this line
          />
          {/* <RenderVFX 
            toggleVFX={currentPlayer?.settings?.toggleVFX}
            // Placeholder for VFX
            TILE_SIZE={activeTileSize}
          /> */}


        </>
      ) : null}

{/* //////////////////  ZOOM OUTS  ///////////////////*/}

    {zoomLevel === 'settlement' && (
      <SettlementView
        currentPlayer={currentPlayer}
        setZoomLevel={setZoomLevel} 
        setCurrentPlayer={setCurrentPlayer}
        setGridId={setGridId}            
        setGrid={setGrid}             
        setResources={setResources}   
        setTileTypes={setTileTypes}      
        TILE_SIZE={TILE_SIZES.far}
        masterResources={masterResources}  
        onClose={() => setZoomLevel('far')}
      />
    )}
    {zoomLevel === 'frontier' && (
      <FrontierView
        currentPlayer={currentPlayer}
        setZoomLevel={setZoomLevel} 
        setCurrentPlayer={setCurrentPlayer}
        setGridId={setGridId}              
        setGrid={setGrid}            
        setResources={setResources}  
        setTileTypes={setTileTypes}     
        TILE_SIZE={activeTileSize}
        onClose={() => setZoomLevel('settlement')}
        />
      )}
    </div>

{/* ///////////////////// MODALS ////////////////////// */}

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
      </Modal>

      {activeModal === 'Mailbox' && (
        <Mailbox
          onClose={closeModal}  // ✅ This sets activeModal = null
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          resources={masterResources}
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
      {activeModal === 'Store' && (
        <Store 
          onClose={closeModal} 
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          resources={masterResources}
          openMailbox={() => setActiveModal('Mailbox')}  
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
        />
      )}
      {activePanel === 'LoginPanel' && (
        <LoginPanel
          onClose={closePanel}
          setCurrentPlayer={(player) => {
            setCurrentPlayer(player);
            closePanel(); 
          }}
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
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          updateStatus={updateStatus}
        />
      )}
      {activePanel === 'BankPanel' && (
        <BankPanel
          onClose={closePanel} 
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          updateStatus={updateStatus}
        />
      )}
      {activePanel === 'TrainPanel' && (
        <TrainPanel
          onClose={closePanel} 
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          updateStatus={updateStatus}
        />
      )}
      {activePanel === 'HowToPanel' && (
        <HowToPanel 
          onOpen={openPanel}
          onClose={closePanel}
        />
      )}
      {activePanel === 'GovPanel' && (
        <GovPanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
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
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          stationType={activeStation?.type} 
          TILE_SIZE={activeTileSize}
        />
      )}
      {activePanel === 'CombatPanel' && (
        <CombatPanel
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          stationType={activeStation?.type} 
          masterResources={masterResources} 
          masterSkills={masterSkills} 
          TILE_SIZE={activeTileSize}
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
        />
      )}
      {activePanel === 'FarmingPanel' && (
        <FarmingPanel
          onClose={closePanel}
          username={currentPlayer.username}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          resources={resources}
          tiles={grid}
          tileTypes={tileTypes}
          setTileTypes={setTileTypes}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setIsMoving={setIsMoving}
          gridId={gridId}
          masterResources={masterResources} 
          masterSkills={masterSkills} 
        />
      )}
      {activePanel === 'BuildPanel' && (
        <BuildPanel
          onClose={closePanel}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          resources={resources}
          tiles={grid}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setIsMoving={setIsMoving}
          gridId={gridId}
          updateStatus={updateStatus}
          masterResources={masterResources} 
          masterSkills={masterSkills} 
        />
      )}
      {activePanel === 'BuyPanel' && (
        <BuyPanel
          onClose={closePanel}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          playerPosition={playerPosition}
          resources={resources}
          setResources={setResources}
          tiles={grid}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setIsMoving={setIsMoving}
          gridId={gridId}
          updateStatus={updateStatus}
          masterResources={masterResources} 
          masterSkills={masterSkills} 
        />
      )}
      {activePanel === 'QuestGiverPanel' && (
        <QuestGiverPanel
          onClose={closePanel}
          npcData={activeQuestGiver}
          inventory={inventory}
          setInventory={setInventory}
          setBackpack={setBackpack}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          TILE_SIZE={activeTileSize}
        />
      )}
      {activePanel === 'SocialPanel' && (
        <SocialPanel
          onClose={closePanel}
          pcData={activeSocialPC}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}  
          setBackpack={setBackpack}   
        />
      )}
      {activePanel === 'AnimalStall' && (
        <AnimalStall
          onClose={closePanel}
          inventory={inventory}
          setInventory={setInventory}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setResources={setResources}
          stationType={activeStation?.type} 
          currentStationPosition={activeStation?.position} 
          gridId={activeStation?.gridId} 
        />
      )}
      {activePanel === 'TradeStall' && (
        <TradeStall
            onClose={closePanel}
            inventory={inventory}
            setInventory={setInventory}
            currentPlayer={currentPlayer}
            setCurrentPlayer={setCurrentPlayer}
        />
      )}
      {activePanel === 'FarmHandsPanel' && (
        <FarmHandsPanel
            onClose={closePanel}
            currentPlayer={currentPlayer}
            setCurrentPlayer={setCurrentPlayer}
        />
      )}
      {activePanel === 'SeasonPanel' && (
        <SeasonPanel
          onClose={closePanel}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
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
    </>
  );
}

export default App;
