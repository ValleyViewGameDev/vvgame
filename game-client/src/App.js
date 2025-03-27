import './App.css';
import './VFX/VFX.css';
import API_BASE from './config.js';  
import axios from 'axios';
import socket from './socketManager';
import NPC from './GameFeatures/NPCs/NPCs';
import React, { useContext, useState, useEffect, memo, useMemo, useCallback, useRef } from 'react';
import { initializeGrid, postLoginInitialization } from './AppInit';
import { loadMasterSkills, loadMasterResources } from './Utils/TuningManager';
import { RenderGrid, RenderVFX, RenderTooltip } from './Render';
import DynamicRenderer from './RenderDynamic';
import { handleResourceClick } from './ResourceClicking';
import { fetchHomesteadOwner } from './Utils/worldHelpers';

import farmState from './FarmState';
import gridStateManager from './GridState/GridState';
import GlobalGridState from './GridState/GlobalGridState'; // Adjust the path if needed
 
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
import AnimalStall from './GameFeatures/FarmAnimals/AnimalStall';
import TradeStall from './GameFeatures/Trading/TradeStall';
import Mailbox from './GameFeatures/Mailbox/Mailbox';
import Store from './Store/Store';

import SeasonPanel from './GameFeatures/Seasons/SeasonPanel';
import SocialPanel from './GameFeatures/Social/SocialPanel';

import { usePanelContext } from './UI/PanelContext';
import { useModalContext } from './UI/ModalContext';

import FloatingTextManager from './UI/FloatingText';
import StatusBar from './UI/StatusBar';
import { fetchGridData, changePlayerLocation } from './Utils/GridManagement'; // Adjust path as needed
import { StatusBarContext } from './UI/StatusBar';
import { handleKeyMovement } from './PlayerMovement';
import { useGridState, useGridStateUpdate } from './GridState/GridStateContext';
import { updateGridStatus } from './Utils/GridManagement';
import { formatCountdown } from './UI/Timers';
import { getLastGridStateTimestamp, updateLastGridStateTimestamp } from './GridState/GridState'; // near the top of App.js
import { mergeResources } from './Utils/ResourceHelpers.js';

function App() {

// Initialize gridId with localStorage (do not depend on currentPlayer here)

  const [gridId, setGridId] = useState(() => {
    const storedGridId = localStorage.getItem('gridId');
    return storedGridId || null;
  });
  
  const [resources, setResources] = useState([]);
  const [tileTypes, setTileTypes] = useState([]);
  const [grid, setGrid] = useState([]);
  const [masterResources, setMasterResources] = useState([]);
  const [masterSkills, setMasterSkills] = useState([]);
    
// Synchronize tiles with GlobalGridState -- i did this so NPCs have knowledge of tiles and resources as they change
useEffect(() => {
  if (tileTypes?.length) {
    GlobalGridState.setTiles(tileTypes);
    console.log('GlobalGridState tiles updated:', tileTypes);
  }
}, [tileTypes]);
// Synchronize resources with GlobalGridState -- i did this so NPCs have knowledge of tiles and resources as they change
useEffect(() => {
  if (resources?.length) {
    GlobalGridState.setResources(resources);
    console.log('GlobalGridState resources updated:', resources);
  }
}, [resources]);

const [currentPlayer, setCurrentPlayer] = useState(null); // Ensure this is defined
const [inventory, setInventory] = useState({});
const [backpack, setBackpack] = useState([]); 
const [skills, setSkills] = useState([]); 
const [playerPosition, setPlayerPosition] = useState(null);
const [isMoving, setIsMoving] = useState(false);

const gridState = useGridState();
const setGridState = useGridStateUpdate();
const [pcs, setPcs] = useState({});
const [npcs, setNpcs] = useState({});

const { updateStatus } = useContext(StatusBarContext); // Access the status bar updater
const [setStatusMessage] = useState(0); // Initial status message index
const [isLoginPanelOpen, setisLoginPanelOpen] = useState(false);
const { activeModal, setActiveModal, openModal, closeModal } = useModalContext();
const [isModalOpen, setIsModalOpen] = useState(false);
const [modalContent, setModalContent] = useState({ title: '', message: '', message2: '' });

const { activePanel, openPanel, closePanel } = usePanelContext();
const [activeQuestGiver, setActiveQuestGiver] = useState(null);
const [activeSocialPC, setActiveSocialPC] = useState(null);
const [isProfilePanelOpen] = useState(false);
const [isStationOpen, setIsStationOpen] = useState(false);
const [activeStation, setActiveStation] = useState(null);
//const [activeQuestGiver, setActiveQuestGiver] = useState(null);

const handleQuestNPCClick = (npc) => {
  console.log('App.js: Opening QuestGiverPanel for NPC:', npc);
  setActiveQuestGiver(npc);  // Set the active quest giver globally
  openPanel('QuestGiverPanel');  // Open the panel
};
const handlePCClick = (pc) => {
  console.log('App.js: Opening SocialPanel for PC:', pc);
  setActiveSocialPC(pc);  // Set the active quest giver globally
  openPanel('SocialPanel');  // Open the panel
};

const [hoveredResource, setHoveredResource] = useState(null);
const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
const [isTooltipVisible, setIsTooltipVisible] = useState(false);

const [zoomLevel, setZoomLevel] = useState('close'); // Default zoom level
const TILE_SIZES = { close: 30, far: 16 }; // Rename for clarity
const activeTileSize = TILE_SIZES[zoomLevel]; // Get the active TILE_SIZE


/////// TIMERS //////////////////////////////////////////////////////

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
  console.log("🔄 Fetching initial timers from the server...");
  
  if (!currentPlayer) {
    console.warn("⛔ No player loaded — skipping fetchTimersData.");
    return;
  }
  if (!currentPlayer?.settlementId || !currentPlayer?.frontierId) return;

  console.log("currentPlayer.frontierId = ",currentPlayer.frontierId);
  try {
    const [settlementResponse, frontierResponse] = await Promise.all([

      axios.get(`${API_BASE}/api/get-settlement/${currentPlayer.settlementId}`),
      axios.get(`${API_BASE}/api/get-frontier/${currentPlayer.frontierId}`)
    ]);

    console.log('frontierResponse = ',frontierResponse);

    const settlementData = settlementResponse.data;
    const frontierData = frontierResponse.data;

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

    console.log("✅ Timers updated and stored locally:", updatedTimers);
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
    const now = Date.now();
    let shouldFetchNewTimers = false;

    if (timers.seasons.endTime && now >= timers.seasons.endTime) {
      console.log("🌱 Season phase ended. Fetching new season data...");
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

  const interval = setInterval(checkPhaseTransitions, 5000); // ✅ Check every 5s
  return () => clearInterval(interval);
}, [timers]); // Runs when timers update

const handleResetTimers = async () => {
  try {
    // ✅ Step 1: Clear local storage timers
    localStorage.removeItem("timers");

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


/////// //// //////////////////////////////////////////////////////

//Forgot why we did this:
const memoizedGrid = useMemo(() => grid, [grid]);
const memoizedTileTypes = useMemo(() => tileTypes, [tileTypes]);
const memoizedResources = useMemo(() => resources, [resources]);


/////////// SOCKET LISTENER /////////////////////////

// 🔄 Real-time updates for GridState: PCS AND NPCS
useEffect(() => {
  if (!gridId || !currentPlayer) return;

  const handleGridStateSync = ({ updatedGridState }) => {
    // ✅ Skip own emitted updates
    // ✅ Skip stale updates
    if (updatedGridState.lastUpdated <= getLastGridStateTimestamp()) {
      console.log("⏳ Skipping socket update — older or same timestamp");
      return;
    }
    console.log("📡 Applying newer socket gridState:", updatedGridState);
    updateLastGridStateTimestamp(updatedGridState.lastUpdated);
  
    // 🧠 Rehydrate NPCs safely
    const hydratedNPCs = {};
    const rawNPCs = updatedGridState.npcs || {};
    for (const [npcId, npcData] of Object.entries(rawNPCs)) {
      hydratedNPCs[npcId] = new NPC(
        npcData.id,
        npcData.type,
        npcData.position,
        npcData,
        gridId
      );
    }
    const safeGridState = {
      ...updatedGridState,
      npcs: hydratedNPCs,
    };
  
    // ✅ Add this line to update in-memory state used by 1s loop
    gridStateManager.gridStates[gridId] = safeGridState;
    // ✅ Update React gridState
    setGridState(safeGridState);
  };
  console.log("🧲 Subscribing to real-time updates for grid:", gridId);
  socket.on('gridState-sync', handleGridStateSync);
  return () => {
    console.log("🧹 Unsubscribing from gridState-sync for grid:", gridId);
    socket.off('gridState-sync', handleGridStateSync);
  };
}, [gridId, currentPlayer]);



// 🔄 Real-time updates for tiles and resources
useEffect(() => {
  if (!gridId) return;

  console.log("🧲 Subscribing to tile-resource-sync for grid:", gridId);

  const handleTileResourceSync = ({ updatedTiles, updatedResources }) => {
    console.log("🌐 Real-time tile/resource update received!", {
      updatedTiles,
      updatedResources,
    });
  
    // ✅ TILE SYNC — merge into existing tileTypes
    if (updatedTiles) {
      setTileTypes(prev => {
        const merged = mergeTiles(prev, updatedTiles);
        GlobalGridState.setTiles(merged);  // update global reference
        return merged;
      });
    }
  
    // ✅ RESOURCE SYNC — merge into existing resources
    if (updatedResources) {
      const cleanedResources = updatedResources.filter(
        r => r && typeof r.x === 'number' && typeof r.y === 'number'
      );
  
      setResources(prev => {
        const merged = mergeResources(prev, cleanedResources);
        return merged.filter(r => r.type !== null); // ✅ Remove nulls
      });
  
      GlobalGridState.setResources(prev => {
        const merged = mergeResources(prev, cleanedResources);
        return merged.filter(r => r.type !== null); // ✅ Remove nulls
      });
    }
  };
  
  socket.on('tile-resource-sync', handleTileResourceSync);
  
  return () => {
    console.log("🧹 Unsubscribing from tile-resource-sync for grid:", gridId);
    socket.off('tile-resource-sync', handleTileResourceSync);
  };
}, [gridId]);




/////////// APP INITIALIZATION /////////////////////////

// Flags to track initialization
let isInitializing = false; // Declare inside useEffect to avoid global persistence
const [isAppInitialized, setIsAppInitialized] = useState(false);

// Central INITIALIZATION for player and grid data //////////////////////////////////////////////////////
useEffect(() => {

  const initializeAppWrapper = async () => {
    console.log('App initialization begun.');
    if (isInitializing) {
      console.log('Initialization is already in progress. Skipping.');
      return;
    }
    isInitializing = true;

    try {
      // 1. Fetch stored player from localStorage
      console.log('Initializing player...');
      const storedPlayer = localStorage.getItem('player');
      if (!storedPlayer) {
        console.log('No stored player found, opening login modal.');
        setisLoginPanelOpen(true);    
        openPanel("LoginPanel");  

        console.log('Got past openPanel.');

        setModalContent({
          title: strings["5005"],  // "Welcome"
          message: strings["5006"], 
          message2: strings["5007"], 
          size: "small"
        });
        setIsModalOpen(true);

        console.log('Got past welcome modal logic.');

        return;
      }
      const parsedPlayer = JSON.parse(storedPlayer);

      // 2. Fetch the full player data from the server
      const response = await axios.get(`${API_BASE}/api/player/${parsedPlayer.playerId}`);
      const fullPlayerData = response.data;
      if (!fullPlayerData || !fullPlayerData.playerId) {
        console.error('Invalid full player data from server:', fullPlayerData);
        setisLoginPanelOpen(true);
        return;
      }

      // 3. Merge player data and update inventory
      console.log('Merging player data and initializing inventory...');
      let updatedPlayerData = { ...parsedPlayer, ...fullPlayerData };
      setCurrentPlayer(updatedPlayerData);
      setInventory(fullPlayerData.inventory || []);  // Initialize inventory properly
      localStorage.setItem('player', JSON.stringify(updatedPlayerData));  // Save to local storage

      // 4. Determine initial gridId from player or storage
      console.log('Determining local gridId...');
      const initialGridId = parsedPlayer?.location?.g || localStorage.getItem('gridId');
      if (!initialGridId) {
        console.error('No gridId found. Unable to initialize grid.');
        return;
      }
      setGridId(initialGridId);
      localStorage.setItem('gridId', initialGridId); // Save to local storage

      socket.connect();
      socket.emit('join-grid', initialGridId);
      console.log("📡 Connected to socket and joined grid:", initialGridId);

      // 5. Initialize grid tiles, resources, and state
      console.log('Initializing grid tiles and resources...');
      await initializeGrid(
        activeTileSize,
        initialGridId,
        setGrid,
        setResources,
        setTileTypes,
        updateStatus
      );

      // 6. Check and initialize gridState
      console.log('Initializing gridState...');
      await gridStateManager.initializeGridState(initialGridId);
      const initializedState = gridStateManager.getGridState(initialGridId);
      setGridState(initializedState);
      console.log('initializedState',initializedState);

      // 7. Resolve player location and confirm in gridState
      console.log('Resolving player location...');
      const gridPlayer = initializedState?.pcs[fullPlayerData._id.toString()];
      console.log('gridPlayer = ',gridPlayer);
      console.log('fullPlayerData = ',fullPlayerData);
      if (gridPlayer) {
        console.log('✅ Player found in local gridState.');
      
        // Fetch the gridState from the DB
        const { data: gridStateResponse } = await axios.get(`${API_BASE}/api/load-grid-state/${fullPlayerData.location.g}`);
        const dbGridState = gridStateResponse?.gridState || { npcs: {}, pcs: {} };
      
        // ✅ If the player is missing from DB gridState, re-save gridState
        if (!dbGridState.pcs || !dbGridState.pcs[fullPlayerData._id]) {
          console.warn(`⚠️ Player ${fullPlayerData.username} is missing from DB gridState! Saving state to DB.`);
          await gridStateManager.saveGridState(fullPlayerData.location.g);
        } else {
          console.log('✅ Player exists in both local and DB gridState.');
        }
      } else {
        console.warn('Player not found in gridState. Adding player at (1,1).');
        gridStateManager.addPC(initialGridId, {
          playerId: fullPlayerData.playerId,
          username: fullPlayerData.username,
          position: { x: 1, y: 1 },
          icon: fullPlayerData.icon,
          hp: fullPlayerData.hp,
          maxhp: fullPlayerData.maxhp,
          armorclass: fullPlayerData.armorclass,
          attackbonus: fullPlayerData.attackbonus,
          damage: fullPlayerData.damage,
          attackrange: fullPlayerData.arrackrange,
          speed: fullPlayerData.speed,
          iscamping: fullPlayerData.iscamping,
        });
        await gridStateManager.saveGridState(initialGridId);
      }

      // ✅ Sync combat stats from gridState (if they exist)
      if (gridPlayer) {
        fullPlayerData.hp = gridPlayer.hp;
        fullPlayerData.maxhp = gridPlayer.maxhp;
        fullPlayerData.armorclass = gridPlayer.armorclass;
        fullPlayerData.attackbonus = gridPlayer.attackbonus;
        fullPlayerData.damage = gridPlayer.damage;
        fullPlayerData.speed = gridPlayer.speed;
        fullPlayerData.attackrange = gridPlayer.attackrange;
        fullPlayerData.iscamping = gridPlayer.iscamping;
      }

      // ✅ Backfill gridState stats into player document on DB
      await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: fullPlayerData.playerId,
        updates: {
          hp: fullPlayerData.hp,
          maxhp: fullPlayerData.maxhp,
          armorclass: fullPlayerData.armorclass,
          attackbonus: fullPlayerData.attackbonus,
          damage: fullPlayerData.damage,
          attackrange: fullPlayerData.attackrange,
          speed: fullPlayerData.speed,
          iscamping: fullPlayerData.iscamping,
        },
      });
      console.log(`✅ Backfilled combat stats to player document:`, fullPlayerData);

      // ✅ Now ensure local storage also gets these updated combat stats
      updatedPlayerData = {
        ...fullPlayerData, // ✅ Override with the latest player data from DB
        location: {
          ...updatedPlayerData.location,
          x: gridPlayer?.position.x || 1,
          y: gridPlayer?.position.y || 1,
          g: initialGridId,
        },
      };

      setCurrentPlayer(updatedPlayerData);
      localStorage.setItem('player', JSON.stringify(updatedPlayerData)); // ✅ Ensure Local Storage Matches DB
      console.log(`✅ LocalStorage updated with combat stats:`, updatedPlayerData);

      // 8. Load tuning data
      console.log('Loading tuning data...');
      const [skills, resources] = await Promise.all([loadMasterSkills(), loadMasterResources()]);
      setMasterResources(resources);
      setMasterSkills(skills);

      // 9. ✅ **Check if the player has died and show the death modal**
      if (updatedPlayerData.settings?.hasDied) {
        console.log("Player died last session. Showing death modal.");

        // Show the modal
        setModalContent({
          title: strings["5001"],  // "You have died."
          message: strings["5002"], 
          message2: strings["5003"], 
          size: "small"
        });
        setIsModalOpen(true);
        // ✅ **Reset hasDied = false in the database**
        await axios.post(`${API_BASE}/api/update-profile`, {
          playerId: updatedPlayerData.playerId,
          updates: { settings: { ...updatedPlayerData.settings, hasDied: false } },  // ✅ Reset inside settings
        });
        // ✅ **Also update local storage**
        updatedPlayerData.settings.hasDied = false;
        localStorage.setItem('player', JSON.stringify(updatedPlayerData));
      }


      console.log('App initialization complete.');
      setIsAppInitialized(true);  // ✅ Mark initialization complete
    } catch (error) {
      console.error('Error during app initialization:', error);
      updateStatus(error.code === 'ERR_NETWORK' ? 1 : 0);  // Handle errors
    }
  };

  initializeAppWrapper();
}, []);  // ✅ Only run once when the component mounts


// FETCH GRID  //////////////////////////////////////////////////////
// We need to come back to this; why fetchGrid and also fetchGridData ????
const fetchGrid = async (gridId) => {
  try {
    console.log('From App.js: calling fetchGridData for gridId:', gridId);
    const data = await fetchGridData(gridId, updateStatus);

    if (data.tiles && data.resources) {
      // Ensure only slimmed-down resources are set
      const slimmedResources = data.resources.map(({ type, x, y, growEnd }) => ({
        type,
        x,
        y,
        ...(growEnd && { growEnd }), // Include growEnd if it exists
      }));
      setGrid(data.tiles);
      setResources(slimmedResources);
      console.log('Slimmed-down resources set:', slimmedResources);
    } else {
      console.error('No tiles or resources found in response:', data);
    }
  } catch (error) {
    console.error('Error fetching grid:', error);
  }
};

// FARM STATE - Farming Seed Timer & Crafting Timer Management //////////////////////////////////////////////////////
useEffect(() => {
  if (gridId) {
    farmState.initializeFarmState(resources); // ✅ Works for seeds
    farmState.startSeedTimer({
      gridId,
      setResources,
      activeTileSize,
      currentPlayer,
      setCurrentPlayer,
    });
  }
  return () => {
    farmState.stopSeedTimer();
  };
}, [gridId, resources]);  


// GRID STATE:  Create new references for pcs and npcs to trigger re-renders  /////////////////////////
useEffect(() => {
  if (gridState) {
      console.log('🔄 Updating local state for PCs and NPCs from GridState:', gridState);
      setPcs({ ...gridState.pcs });
      setNpcs({ ...gridState.npcs });
  }
}, [gridState]);  // ✅ Trigger re-render when `gridState` updates


// GRID STATE:  NPC and PC Management Loop  /////////////////////////
useEffect(() => {
  if (!isAppInitialized) {
    console.warn('App is not fully initialized or no gridId/gridState available. Skipping NPC/PC management.');
    return;
  }
  console.log('Starting NPC/PC manager for gridId:', gridId);

  const interval = setInterval(async () => {
    if (!gridState) {
      console.warn(`Interval loop: No gridState available for gridId: ${gridId}`);
      return;
    }
    const { npcs = {}, pcs = {} } = gridState;
    
    // Ensure all NPCs have the latest state
    Object.values(npcs).forEach((npc) => {
      const currentTime = Date.now();
      npc.update(currentTime, gridState, gridId, activeTileSize);
    });
    // Check each PC's HP directly from gridState
    Object.values(pcs).forEach(async (pc) => {
      if (pc.hp <= 0 && currentPlayer && String(currentPlayer._id) === pc.playerId) {
        console.warn(`PC ${pc.username} has died.`);
        await handlePlayerDeath(currentPlayer);
      }
    });

  }, 1000); // Run every second

  // Cleanup interval on unmount or gridId change
  return () => clearInterval(interval);
}, [isAppInitialized, gridId, gridState, currentPlayer, activeTileSize]);


const handlePlayerDeath = async (player) => {
  console.log('Handling player death...');
  console.log('currentPlayer = ', player);

  try {
    const playerId = String(player._id);  // Ensure consistency
    const currentGridId = player.location.g;
    // Determine respawn grid and coordinates
    const targetLocation = {
      x: 1, 
      y: 1, 
      g: player.gridId !== currentGridId ? player.gridId : currentGridId,
      gtype: "homestead",
    };
    // Preserve other location fields (frontier, settlement, gtype)
    const updatedLocation = {
      ...player.location,
      ...targetLocation,
    };

    console.log(`Updating profile and clearing backpack for player ${player.username}`);
    
    // 1. **Update Player Data in the Database**
    await axios.post(`${API_BASE}/api/update-profile`, {
      playerId: player._id,
      updates: {
        backpack: [],  // Empty the backpack
        hp: 25,  // Reset HP
        location: updatedLocation,  // Update location
        settings: { ...player.settings, hasDied: true }  // ✅ Store inside settings
      },
    });

    // 2. **Remove Player from Current Grid’s gridState**
    console.log(`Removing player ${player.username} from gridState.pcs in grid ${currentGridId}`);
    const currentGridState = gridStateManager.getGridState(currentGridId);
    if (currentGridState?.pcs[playerId]) {
      delete currentGridState.pcs[playerId];
      await gridStateManager.saveGridState(currentGridId);
    }

    // 3. **Update Player's Location and State in React**
    const updatedPlayer = {
      ...player,
      hp: 5,
      location: updatedLocation,
      backpack: [],  // Ensure backpack clears in UI
      settings: { ...player.settings, hasDied: true },  // ✅ Ensure settings updates in local state
    };

    setCurrentPlayer(updatedPlayer);
    localStorage.setItem('player', JSON.stringify(updatedPlayer));

    console.log(`Player ${player.username} teleported to home grid with 5 HP.`);

    // 4. **Load New Grid & Add Player to GridState**
    await changePlayerLocation(
      updatedPlayer,
      player.location,   // fromLocation
      updatedLocation,        // toLocation
      setCurrentPlayer,
      fetchGrid,
      setGridId,                // ✅ Ensure this is passed
      setGrid,                  // ✅ Pass setGrid function
      setResources,             // ✅ Pass setResources function
      setTileTypes,             // ✅ Pass setTileTypes function
      setGridState,
      activeTileSize,
    );

  } catch (error) {
    console.error('Error during player death handling and teleportation:', error);
  }
};


/////////// HANDLE KEY MOVEMENT /////////////////////////

useEffect(() => {
    const handleKeyDown = (event) => {

      // ✅ Prevent movement if a modal is open
      if (activeModal) { console.log("🛑 Keyboard input disabled while modal is open."); return; }
      // ✅ Prevent movement if a text input is focused
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) { return; }
      // ✅ Prevent the browser from scrolling when using arrow keys
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); }

      handleKeyMovement(
        event,
        currentPlayer,
        activeTileSize,
        masterResources,
        isMoving,
        setIsMoving,
      );
    };
  
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPlayer, resources, activeTileSize, gridState, masterResources, activeModal]);


/////////// HANDLE ZOOMING & RESIZING /////////////////////////

const zoomIn = async () => {
  const gridId = currentPlayer?.location?.g;
  if (!gridId) {
    console.warn("No valid gridId found for currentPlayer."); return;
  }
  if (currentPlayer.iscamping) { 
    updateStatus(32); return;
  }
  if (zoomLevel === 'frontier') {
    setZoomLevel('settlement'); // Zoom into the settlement view
    updateStatus(12); // "Settlement view."
  } else if (zoomLevel === 'settlement') {
    setZoomLevel('far'); // Zoom into the grid view
    console.log('calling fetchHomesteadOwner from zoomIn');
    const { username, gridType } = await fetchHomesteadOwner(gridId);

    if (gridType === 'town') {
      updateStatus(14);
    } else if (['valley1', 'valley2', 'valley3'].includes(gridType)) {
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
  }
};
const zoomOut = () => {
  if (currentPlayer.iscamping) { 
    updateStatus(32); return;
  }
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


//////////// HANDLE CLICKING & HOVERING /////////////////////////

  let isProcessing = false; // Guard against duplicate clicks
  let tooltipDelayTimer = null;

  const handleTileClick = useCallback((rowIndex, colIndex) => {
    if (isProcessing) return; // Skip if still processing
    isProcessing = true;
  
    const resource = resources.find((res) => res.x === colIndex && res.y === rowIndex);
    console.log('handleTileClick invoked with:', { rowIndex, colIndex });
    console.log('Resource:', resource);
  
    // Validate `gridId` and `username`
    if (!gridId || typeof gridId !== 'string') { console.error('Invalid gridId:', gridId); return; }
    if (!currentPlayer?.username || typeof currentPlayer.username !== 'string') { console.error('Invalid username:', currentPlayer?.username); return; }


    // ✅ Get player position from gridState
    const playerData = gridState?.pcs?.[String(currentPlayer._id)];
    const playerPos = playerData?.position || { x: 1, y: 1 }; // Default to (1,1) if missing

    if (!playerPos || typeof playerPos.x === 'undefined' || typeof playerPos.y === 'undefined') {
        console.error("⚠️ Player position is invalid in gridState:", playerData);
        isProcessing = false;
        return;
    }

    const targetPos = { x: colIndex, y: rowIndex };

    // Inline function to calculate Manhattan distance safely
    const calculateDistance = (pos1, pos2) => {
        if (!pos1 || !pos2 || typeof pos1.x === 'undefined' || typeof pos1.y === 'undefined' || typeof pos2.x === 'undefined' || typeof pos2.y === 'undefined') {
            console.warn("Skipping distance calculation due to invalid position:", { pos1, pos2 });
            return Infinity; // Return a high value to trigger out-of-range logic
        }
        return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
    };
    
    // If clicking a resource, check range before interacting (except NPCs)
    if (resource && resource.category !== 'npc') {
      const distance = calculateDistance(playerPos, targetPos);
      const playerRange = currentPlayer.range || 1; // Default range if not set

      console.log(`Checking range: Player at ${playerPos.x},${playerPos.y} | Target at ${targetPos.x},${targetPos.y} | Distance = ${distance} | Range = ${playerRange}`);

      if (distance > playerRange) {
          FloatingTextManager.addFloatingText(24, targetPos.x * activeTileSize, targetPos.y * activeTileSize);
          console.log('Target out of range:', targetPos);
          isProcessing = false;
          return; // Stop further execution
      }
    }

    if (resource) {
 
      if (resource.category === 'npc') {
        // handled in RenderDynamic
      }
      else if (resource.category === 'training') {
        console.log(`App.js: Training station clicked - ${resource.type}`);
        setActiveStation({
          type: resource.type, // ✅ Store station type
          position: { x: colIndex, y: rowIndex }, // ✅ Store position
          gridId: gridId, // ✅ Store gridId
        });
        openPanel('SkillsAndUpgradesPanel'); // ✅ Open panel without passing entryPoint directly
      }
      else if (resource.category === 'crafting') {
        console.log('App.js: Crafting station clicked');
        setActiveStation({
          type: resource.type,
          position: { x: colIndex, y: rowIndex }, // Position of the resource
          gridId: gridId, // Current gridId
        });
        openPanel('CraftingStation');
      } 
      else if (resource.category === 'trading') {
        console.log('App.js: Trading station clicked');
        setActiveStation({
          type: resource.type,
          position: { x: colIndex, y: rowIndex }, // Position of the resource
          gridId: gridId, // Current gridId
        });
        openPanel('TradingStation');
      } 
      else if (resource.category === 'stall') {
        console.log('App.js: Animal Stall clicked');
        setActiveStation({
          type: resource.type, // The station type (e.g., "Cow in Stall")
          position: { x: colIndex, y: rowIndex }, // Position of the resource
          gridId: gridId, // Current gridId
        });
        openPanel('AnimalStall');
      } 
      else if (resource.category === 'station') {
        console.log('App.js: Station clicked; resource.type = ',resource.type);
        setActiveStation({
          type: resource.type, // The station type (e.g., "Trade Stall")
          position: { x: colIndex, y: rowIndex }, // Position of the resource
          gridId: gridId, // Current gridId
        });
        switch (resource.type) {
          case 'Courthouse':
            openPanel('Courthouse');
            break;
          case 'Trade Stall':
            openPanel('TradeStall');
            break;
          case 'Mailbox':
            openModal('Mailbox');
            break;
          case 'Train':
            openPanel('TrainPanel');
            break;
          case 'Bank':
            openPanel('BankPanel');
            break;
          case 'Farm Hand 1':
          case 'Farm Hand 2':
          case 'Farm Hand 3':
            openPanel('FarmHandsPanel');
            break;
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
          skills,
          setActiveStation,
          playerPosition,
          setPlayerPosition,
          setIsStationOpen,
          grid,
          FloatingTextManager.addFloatingText,
          gridId,
          activeTileSize,
          tileTypes,
          currentPlayer,
          setCurrentPlayer,
          fetchGrid,
          setGridId,
          setGrid,
          setTileTypes,
          setGridState,
          updateStatus,
          masterResources,
          masterSkills,
        ).finally(() => {
          isProcessing = false; // Reset flag after processing
        });
      }
    } else {
      console.log('isTeleportEnabled:',currentPlayer?.settings?.isTeleportEnabled);

      if (currentPlayer?.settings?.isTeleportEnabled) {  
        // Handle player movement if no resource is clicked
        const targetPosition = { x: colIndex, y: rowIndex }; // Grid coordinates
        setPlayerPosition({ x: targetPosition.x * activeTileSize, y: targetPosition.y * activeTileSize });
//        savePlayerPosition(targetPosition, currentPlayer, setCurrentPlayer, activeTileSize);
        console.log('Player teleported to:', targetPosition);
      }
    }
    isProcessing = false; // Reset flag here

  }, [resources, gridId, inventory, currentPlayer, playerPosition, activeTileSize]);
  
  const handleTileHover = useCallback(
    (rowIndex, colIndex, event) => {
      // Validate gridState
      // if (!gridState) {
      //   console.warn('GridState is not available; skipping tile hover processing.');
      //   return;
      // }

    const resource = resources.find((res) => res.x === colIndex && res.y === rowIndex);
    //const { npcs = {}, pcs = {} } = gridState;
  
    //console.log('handleTileHover; NPCs:', npcs);
    //console.log('handleTileHover; PCs:', pcs);
  
    // const npc = Object.values(npcs).find((npc) => {
    //   return npc.position.x === colIndex && npc.position.y === rowIndex;
    // });
    // //console.log('handleTileHover; npc:', npc);
    
    // const pc = Object.values(pcs).find((pc) => {
    //   return pc.position.x === colIndex && pc.position.y === rowIndex;
    // });
  
    // const entity = npc || pc || resource; // Prioritize NPC, then PC, then resource
    //console.log('handleTileHover; entity:', entity);
  
    if (!resource) {
      handleTileLeave(); // Clear tooltip when no entity is present
      setHoveredResource(null);
      // setHoveredNPC(null); // Clear NPC tooltip state
      // setHoveredPC(null); // Clear PC tooltip state
      setIsTooltipVisible(false);
      return;
    }
  
    const tileTop = rowIndex * activeTileSize + event.currentTarget.offsetParent.offsetTop;
    const tileLeft = colIndex * activeTileSize + event.currentTarget.offsetParent.offsetLeft;
  
    setTooltipPosition({
      x: tileLeft - 190, // Adjust tooltip horizontally
      y: tileTop - 120, // Adjust tooltip vertically above the tile
    });
  
    // Delay tooltip visibility
    tooltipDelayTimer = setTimeout(() => {
      // if (npc) setHoveredNPC(npc); // Set tooltip for NPC
      // if (pc) setHoveredPC(pc); // Set tooltip for PC
      if (resource) setHoveredResource(resource); // Set tooltip for resource
      setIsTooltipVisible(true); // Make tooltip visible
    }, 500); // Delay 
  }, [resources, activeTileSize, currentPlayer?.location?.g]);

  const handleTileLeave = () => {
    clearTimeout(tooltipDelayTimer); // Cancel pending tooltip render
    setHoveredResource(null);
    setIsTooltipVisible(false);
  };

  
  //////////// HANDLE LOGIN and LOGOUT /////////////////////////

  const handleLogout = () => {
    console.log('Logging out user...');
  
    // Clear all states
    gridStateManager.stopGridStateUpdates();

    setCurrentPlayer(null);
    setInventory({});
    setPlayerPosition({ x: 0, y: 0 });
    setGrid([]); // Clear the grid
    setResources([]); // Clear resources
    setTileTypes([]); // Clear tile types
    setGridId(null); // Clear gridId
    localStorage.removeItem('gridId'); // Remove gridId from local storage
    localStorage.removeItem('player');  // Remove player data from local storage
  
    // Force a state reset by triggering the login modal
    window.location.reload();

    console.log('Player has logged out, and state has been reset.');
  };

  const handleLoginSuccess = async (player) => {
    console.log('Handling login success for player:', player);
      
    // ✅ Store player data in localStorage
    localStorage.setItem('player', JSON.stringify(player));
    // ✅ Reload the app (triggers full initialization)
    window.location.reload();
  
    // // Call post-login initialization
    // await postLoginInitialization(
    //   player,
    //   activeTileSize,
    //   setCurrentPlayer,
    //   setGrid,
    //   setResources,
    //   setTileTypes,
    //   setGridId,
    //   setGridState,
    //   updateStatus
    // );
    // window.location.reload();
  };

  const [showStats, setShowStats] = useState(false); // Toggle for combat stats UI
  const combatStats = gridState?.pcs?.[String(currentPlayer?._id)] || {};
  const [showTimers, setShowTimers] = useState(false);

  // if (!currentPlayer) {
  //   // Note: this works
  //   return (
  //     <div className="app-container">
  //       <Modal
  //         isOpen={true}
  //         onClose={() => {}}
  //         title={strings["5030"]}
  //         message={strings["5031"]}
  //         message2={strings["5032"]}
  //         size="small"
  //       />
  //     </div>
  //   );
  // }
  
  
  return (
  
    <div className="app-container">
    <FloatingTextManager />

      {/* Base Panel */}
      <div className="base-panel">
        <h1>Valley View</h1>  
        <br />
        <p>Logged in as:</p>

        <button className="shared-button"
          onClick={() => {
            if (currentPlayer?.username) { 
              openPanel('ProfilePanel'); // Open Profile Panel if player is logged in
            } else { 
              <p>Logged in as:</p>
              openPanel('LoginPanel'); // Open Login Panel if player is not logged in
            }
          }}
        >
          {currentPlayer?.username || 'Sign In'}
        </button>
        <br/>
        <h3>💰 Money:{" "}
          {Array.isArray(currentPlayer?.inventory) ? (
            <>
              <span className="money-value">
                {currentPlayer.inventory.find((item) => item.type === "Money")?.quantity || 0}
              </span>
            </>
          ) : (
            "..."
          )}
        </h3>
            <br/>
            <h4>Next Tax Collection:</h4> 
            <h2>{countdowns.taxes}</h2>  
            <br/>
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

        <h4>📅 ({timers.seasons.phase})</h4>
        <h4>📅 {timers.seasons.type} Season Ends in:</h4>
          <h2>{countdowns.seasons}</h2>
        <br />

        <h3>⏳ Events:
          <span 
            onClick={() => setShowTimers(!showTimers)} 
            style={{ cursor: "pointer", fontSize: "16px", marginLeft: "5px" }}
          >
            {showTimers ? "▼" : "▶"}
          </span>
        </h3>

        {showTimers && (
          <div className="timers-panel">

            <h4>🏛️ Elections: {timers.elections.phase}</h4>
            <p>Ends: {countdowns.elections}</p>

            <h4>🚂 Train: {timers.train.phase}</h4>
            <p>Ends: {countdowns.train}</p>

            <h4>🏦 Bank: {timers.bank.phase}</h4>
            <p>Ends: {countdowns.bank}</p>

          </div>
        )}

          <br />
          <h3>Who's here:</h3>
          <div>
            {Object.entries(pcs).length === 0 ? (
              <h4 style={{ color: "white" }}>No PCs present in the grid.</h4>
            ) : (
              <h4 style={{ color: "white" }}>
                {Object.entries(pcs).map(([playerId, pc]) => (
                  <p key={playerId} style={{ color: "white" }}>
                    <strong>{pc.username}</strong> - HP: {pc.hp}, ({pc.position.x}, {pc.position.y})
                  </p>
                ))}
              </h4>
            )}
          </div>
          <br />
          <button className="shared-button" onClick={() => openPanel('HowToPanel')}>
            🕹️ How to Play
          </button>
          <br />

          <button className="panel-button reset-button" onClick={handleResetTimers}>
            Reset All Timers
          </button>

      </div>

    {/* Header */}
    <header className="app-header">
      <div className="header-controls">
        <button className="shared-button" onClick={() => openPanel('DebugPanel')}> 🐞 </button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openModal('Store')}>🛒 Store</button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openModal('Mailbox')}>📨 Inbox</button>
        <button className="shared-button" >AWSD to Move</button>
        <button className="shared-button" disabled={!currentPlayer} onClick={zoomOut}>-</button>
        <button className="shared-button" disabled={!currentPlayer} onClick={zoomIn}>+</button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openPanel('InventoryPanel')}> Inventory </button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openPanel('QuestPanel')}> ❓ Quests </button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openPanel('FarmingPanel')}> 🚜 Farm </button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openPanel('BuildPanel')}> ⚒️ Build </button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openPanel('BuyPanel')}> 🐮 Animals </button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => {
            setActiveStation(null); // ✅ Reset activeStation
            openPanel("SkillsAndUpgradesPanel"); // ✅ Open the panel normally
          }} > ⚙️ Skills </button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openPanel('GovPanel')}> 🏛️ Gov </button>
        <button className="shared-button" disabled={!currentPlayer} onClick={() => openPanel('SeasonPanel')}> 🌎 Season </button>

      </div>
    </header>

      <div className="status-bar-wrapper"> <StatusBar /> </div>

    <div className="homestead">

      {zoomLevel === 'far' || zoomLevel === 'close' ? (
        <>

    {/* Game Board */}

          <DynamicRenderer
            TILE_SIZE={activeTileSize}
            setInventory={setInventory}
            setResources={setResources}
            currentPlayer={currentPlayer}
            openPanel={openPanel}
            onNPCClick={handleQuestNPCClick}  // Pass the callback
            onPCClick={handlePCClick}  // Pass the callback
            masterResources={masterResources}
          /> {/* Parallel rendering layer for PCs and NPCs */}

          <RenderGrid
            grid={memoizedGrid}
            tileTypes={memoizedTileTypes}
            resources={memoizedResources}
            handleTileClick={handleTileClick}
            handleTileHover={handleTileHover}
            handleTileLeave={handleTileLeave}
            TILE_SIZE={activeTileSize}
          />
  {/* <RenderVFX 
    toggleVFX={currentPlayer?.settings?.toggleVFX}
    // Placeholder for VFX
    TILE_SIZE={activeTileSize}
  /> */}
          <RenderTooltip
            resource={hoveredResource}
            //npc={hoveredNPC} // New prop for NPCs
            //pc={hoveredPC} // New prop for PCs
            tooltipPosition={tooltipPosition}
            isTooltipVisible={isTooltipVisible}
          />
        </>
      ) : null}

    {/* ZOOM OUTS */}

      {zoomLevel === 'settlement' && (
        <SettlementView
          currentPlayer={currentPlayer}
          setZoomLevel={setZoomLevel} 
          setCurrentPlayer={setCurrentPlayer}
          fetchGrid={fetchGrid}
          setGridId={setGridId}            
          setGrid={setGrid}             
          setResources={setResources}   
          setTileTypes={setTileTypes}      
          setGridState={setGridState}
          TILE_SIZE={activeTileSize}
          onClose={() => setZoomLevel('far')}
        />
        )}
      {zoomLevel === 'frontier' && (
        <FrontierView
          currentPlayer={currentPlayer}
          setZoomLevel={setZoomLevel} 
          setCurrentPlayer={setCurrentPlayer}
          fetchGrid={fetchGrid}
          setGridId={setGridId}              
          setGrid={setGrid}            
          setResources={setResources}  
          setTileTypes={setTileTypes}     
          setGridState={setGridState}
          TILE_SIZE={activeTileSize}
          onClose={() => setZoomLevel('settlement')}
          />
        )}
      </div>

    {/* Modals & Panels */}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={modalContent.title} 
        message={modalContent.message} 
        message2={modalContent.message2} 
        size={modalContent.size || "standard"} // default to standard
      />

      {activeModal === 'Store' && <Store 
        onClose={closeModal} 
        currentPlayer={currentPlayer}
        setCurrentPlayer={setCurrentPlayer}
        resources={masterResources}
        openMailbox={() => setActiveModal('Mailbox')}  // ✅ Pass this
      />}

      {activeModal === 'Mailbox' && (
        <Mailbox
          onClose={closeModal}  // ✅ This sets activeModal = null
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          resources={masterResources}
        />
      )}

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
            closePanel(); // Close the panel after setting the player
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
          onClose={closePanel} // Close panel via context
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          updateStatus={updateStatus}
        />
      )}
      {activePanel === 'BankPanel' && (
        <BankPanel
          onClose={closePanel} // Close panel via context
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          updateStatus={updateStatus}
        />
      )}
      {activePanel === 'TrainPanel' && (
        <TrainPanel
          onClose={closePanel} // Close panel via context
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
      {activePanel === 'SeasonPanel' && (
        <SeasonPanel
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
          stationType={activeStation?.type} // ✅ Ensure stationType is passed
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
          stationType={activeStation?.type} // Ensure stationType is passed
          currentStationPosition={activeStation?.position} // Pass currentStationPosition
          gridId={activeStation?.gridId} // Pass gridId
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
          stationType={activeStation?.type} // Ensure stationType is passed
          currentStationPosition={activeStation?.position} // Pass currentStationPosition
          gridId={activeStation?.gridId} // Pass gridId
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
          setResources={setResources}
          tiles={grid}
          tileTypes={tileTypes}
          setTileTypes={setTileTypes}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setIsMoving={setIsMoving}
          gridId={gridId}
        />
      )}
      {activePanel === 'BuildPanel' && (
        <BuildPanel
          onClose={closePanel}
          TILE_SIZE={activeTileSize}
          inventory={inventory}
          setInventory={setInventory}
          resources={resources}
          setResources={setResources}
          tiles={grid}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setIsMoving={setIsMoving}
          gridId={gridId}
          updateStatus={updateStatus}
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
        />
      )}
      {activePanel === 'SocialPanel' && (
        <SocialPanel
          onClose={closePanel}
          pcData={activeSocialPC}
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}  // ✅ Add this line
          setBackpack={setBackpack}    // ✅ Add this line
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
          stationType={activeStation?.type} // Ensure stationType is passed
          currentStationPosition={activeStation?.position} // Pass currentStationPosition
          gridId={activeStation?.gridId} // Pass gridId
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

      </div>
    );
}

export default App;
