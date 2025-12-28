import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import './Players.css';
import API_BASE from './config';
import '../../game-client/src/UI/Styles/theme.css';
import '../../game-client/src/UI/Buttons/SharedButtons.css';

const Players = ({ selectedFrontier, selectedSettlement, frontiers, settlements, activePanel }) => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [deletionModal, setDeletionModal] = useState({
    isOpen: false,
    type: null, // 'unstarted' or 'inactive'
    profiles: []
  });
  const [collapsedSections, setCollapsedSections] = useState({
    wallet: false,
    inventory: false,
    skills: false,
    powers: false
  });

  // State for pending edits
  const [pendingWalletEdits, setPendingWalletEdits] = useState({});
  const [pendingInventoryEdits, setPendingInventoryEdits] = useState({});
  const [pendingSkillDeletions, setPendingSkillDeletions] = useState(new Set());
  const [pendingPowerDeletions, setPendingPowerDeletions] = useState(new Set());
  const [editingItem, setEditingItem] = useState(null); // { section: 'wallet'/'inventory', type: 'itemType' }
  const [hoveredDiagnostics, setHoveredDiagnostics] = useState(null); // Player ID for diagnostics tooltip

  // Function to get settlement name by ID
  const getSettlementName = (settlementId) => {
    const settlement = settlements.find(s => s._id === settlementId);
    return settlement ? settlement.name : 'Unknown Settlement';
  };

  // Function to toggle collapsible sections
  const toggleSection = (sectionName) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  // Helper function to extract wallet items from inventory
  const getWalletItems = (inventory) => {
    if (!inventory || !Array.isArray(inventory)) return [];
    
    const walletTypes = ['Money', 'Gem', 'Green Heart', 'Yellow Heart', 'Purple Heart'];
    return inventory
      .filter(item => walletTypes.includes(item.type))
      .filter(item => item.quantity > 0)
      .sort((a, b) => a.type.localeCompare(b.type));
  };

  // Helper function to get non-wallet inventory items
  const getNonWalletInventory = (inventory) => {
    if (!inventory || !Array.isArray(inventory)) return [];
    
    const walletTypes = ['Money', 'Gem', 'Green Heart', 'Yellow Heart', 'Purple Heart'];
    return inventory
      .filter(item => !walletTypes.includes(item.type))
      .sort((a, b) => a.type.localeCompare(b.type));
  };

  // Helper function to sort skills alphabetically
  const getSortedSkills = (skills) => {
    if (!skills || !Array.isArray(skills)) return [];
    
    return [...skills].sort((a, b) => {
      const nameA = a.name || a.type || 'Unknown Skill';
      const nameB = b.name || b.type || 'Unknown Skill';
      return nameA.localeCompare(nameB);
    });
  };

  // Helper function to sort powers alphabetically
  const getSortedPowers = (powers) => {
    if (!powers || !Array.isArray(powers)) return [];
    
    return [...powers].sort((a, b) => {
      const nameA = a.name || a.type || 'Unknown Power';
      const nameB = b.name || b.type || 'Unknown Power';
      return nameA.localeCompare(nameB);
    });
  };

  // Helper function to calculate warehouse usage (excluding currencies)
  const getWarehouseUsage = (inventory) => {
    if (!inventory || !Array.isArray(inventory)) return 0;
    
    const currencyTypes = ['Money', 'Gem', 'Green Heart', 'Yellow Heart', 'Purple Heart'];
    return inventory
      .filter(item => !currencyTypes.includes(item.type))
      .reduce((total, item) => total + (item.quantity || 0), 0);
  };

  // Fetch players from the database
  const fetchPlayers = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔍 Fetching players from database...');
      const response = await axios.get(`${API_BASE}/api/players`);
      console.log('✅ Players fetched:', response.data);
      setPlayers(response.data || []);
    } catch (error) {
      console.error('❌ Failed to fetch players:', error);
      setError('Failed to fetch players from database');
    } finally {
      setLoading(false);
    }
  };

  // Fetch players when component mounts or when activePanel changes to 'players'
  useEffect(() => {
    if (activePanel === 'players') {
      fetchPlayers();
    }
  }, [activePanel]);

  // Memoized filtered players based on current frontier/settlement selection
  const filteredPlayers = useMemo(() => {
    let filtered = players;

    // Filter by frontier if one is selected
    if (selectedFrontier) {
      const frontierSettlements = settlements
        .filter(s => String(s.frontierId?._id || s.frontierId) === String(selectedFrontier))
        .map(s => s._id);

      filtered = filtered.filter(player => 
        frontierSettlements.includes(player.settlementId)
      );
    }

    // Further filter by settlement if one is selected
    if (selectedSettlement) {
      filtered = filtered.filter(player => 
        String(player.settlementId) === String(selectedSettlement)
      );
    }

    return filtered;
  }, [players, selectedFrontier, selectedSettlement, settlements]);

  // Handle player row selection
  const handlePlayerSelect = (player) => {
    console.log('🎯 Selected player:', player.username);
    console.log('📊 Player skills:', player.skills);
    console.log('⚡ Player powers:', player.powers);

    // Validate skills data
    if (player.skills && Array.isArray(player.skills)) {
      player.skills.forEach((skill, index) => {
        if (typeof skill === 'object' && skill !== null) {
          console.log(`🔧 Skill ${index}:`, skill);
        }
      });
    }

    // Validate powers data
    if (player.powers && Array.isArray(player.powers)) {
      player.powers.forEach((power, index) => {
        if (typeof power === 'object' && power !== null) {
          console.log(`⚡ Power ${index}:`, power);
        }
      });
    }

    // Clear pending changes when switching players
    setPendingWalletEdits({});
    setPendingInventoryEdits({});
    setPendingSkillDeletions(new Set());
    setPendingPowerDeletions(new Set());
    setEditingItem(null);

    setSelectedPlayer(player);
  };

  // Check if there are any pending changes
  const hasPendingChanges = () => {
    return Object.keys(pendingWalletEdits).length > 0 ||
           Object.keys(pendingInventoryEdits).length > 0 ||
           pendingSkillDeletions.size > 0 ||
           pendingPowerDeletions.size > 0;
  };

  // Handle saving all pending changes
  const handleSaveChanges = async () => {
    if (!selectedPlayer || !hasPendingChanges()) return;

    const confirmed = window.confirm(
      `Save all changes for "${selectedPlayer.username}"?\n\n` +
      `This will update:\n` +
      `• Wallet items: ${Object.keys(pendingWalletEdits).length} changes\n` +
      `• Inventory items: ${Object.keys(pendingInventoryEdits).length} changes\n` +
      `• Skills deletions: ${pendingSkillDeletions.size} deletions\n` +
      `• Powers deletions: ${pendingPowerDeletions.size} deletions\n\n` +
      `Continue?`
    );

    if (!confirmed) return;

    try {
      console.log(`💾 Saving changes for player: ${selectedPlayer.username}`);

      // Build the updates object
      const updates = {};

      // Update inventory (wallet + inventory items)
      if (Object.keys(pendingWalletEdits).length > 0 || Object.keys(pendingInventoryEdits).length > 0) {
        const updatedInventory = [...(selectedPlayer.inventory || [])];

        // Apply wallet edits
        Object.entries(pendingWalletEdits).forEach(([itemType, newQuantity]) => {
          const itemIndex = updatedInventory.findIndex(item => item.type === itemType);
          if (itemIndex >= 0) {
            updatedInventory[itemIndex] = { ...updatedInventory[itemIndex], quantity: Number(newQuantity) };
          }
        });

        // Apply inventory edits
        Object.entries(pendingInventoryEdits).forEach(([itemType, newQuantity]) => {
          const itemIndex = updatedInventory.findIndex(item => item.type === itemType);
          if (itemIndex >= 0) {
            updatedInventory[itemIndex] = { ...updatedInventory[itemIndex], quantity: Number(newQuantity) };
          }
        });

        updates.inventory = updatedInventory;
      }

      // Update skills (apply deletions)
      if (pendingSkillDeletions.size > 0) {
        const updatedSkills = (selectedPlayer.skills || []).filter((_, index) =>
          !pendingSkillDeletions.has(index)
        );
        updates.skills = updatedSkills;
      }

      // Update powers (apply deletions)
      if (pendingPowerDeletions.size > 0) {
        const updatedPowers = (selectedPlayer.powers || []).filter((_, index) =>
          !pendingPowerDeletions.has(index)
        );
        updates.powers = updatedPowers;
      }

      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: selectedPlayer._id,
        updates
      });

      if (response.data.success) {
        alert(`✅ Changes saved for "${selectedPlayer.username}".`);
        console.log(`✅ Changes saved for: ${selectedPlayer.username}`);

        // Update the local player data
        const updatedPlayer = { ...selectedPlayer, ...updates };
        setSelectedPlayer(updatedPlayer);

        // Update the player in the players list
        setPlayers(players.map(p => p._id === selectedPlayer._id ? updatedPlayer : p));

        // Clear pending changes
        setPendingWalletEdits({});
        setPendingInventoryEdits({});
        setPendingSkillDeletions(new Set());
        setPendingPowerDeletions(new Set());
        setEditingItem(null);
      } else {
        alert("❌ Failed to save changes. See console for details.");
        console.error("Save failed:", response.data);
      }
    } catch (error) {
      console.error("❌ Error saving changes:", error);
      alert(`❌ Error saving changes: ${error.message}`);
    }
  };

  // Handle edit button click for wallet/inventory items
  const handleEditItem = (section, itemType, currentQuantity) => {
    setEditingItem({ section, type: itemType, value: currentQuantity });
  };

  // Handle save edit for a specific item
  const handleSaveEdit = (section, itemType) => {
    if (!editingItem || editingItem.section !== section || editingItem.type !== itemType) return;

    const newQuantity = Number(editingItem.value);

    if (isNaN(newQuantity) || newQuantity < 0) {
      alert('Please enter a valid non-negative number');
      return;
    }

    if (section === 'wallet') {
      setPendingWalletEdits(prev => ({ ...prev, [itemType]: newQuantity }));
    } else if (section === 'inventory') {
      setPendingInventoryEdits(prev => ({ ...prev, [itemType]: newQuantity }));
    }

    setEditingItem(null);
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingItem(null);
  };

  // Handle delete skill
  const handleDeleteSkill = (skillIndex) => {
    setPendingSkillDeletions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(skillIndex)) {
        newSet.delete(skillIndex);
      } else {
        newSet.add(skillIndex);
      }
      return newSet;
    });
  };

  // Handle delete power
  const handleDeletePower = (powerIndex) => {
    setPendingPowerDeletions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(powerIndex)) {
        newSet.delete(powerIndex);
      } else {
        newSet.add(powerIndex);
      }
      return newSet;
    });
  };

  // Handle account deletion
  const handleDeleteAccount = async (player) => {
    if (!player) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete the account for "${player.username}"?\n\n` +
      `This will permanently delete:\n` +
      `• All player data\n` +
      `• All inventory items\n` +
      `• All progress and achievements\n\n` +
      `This action cannot be undone!`
    );
    
    if (!confirmed) return;
    
    try {
      console.log(`🗑️ Deleting account for player: ${player.username} (ID: ${player._id})`);
      
      const response = await axios.post(`${API_BASE}/api/delete-player`, {
        playerId: player._id,
      });
      
      if (response.data.success) {
        alert(`✅ Account for "${player.username}" deleted successfully.`);
        console.log(`✅ Account deleted for username: ${player.username}`);
        
        // Remove the deleted player from the list
        setPlayers(players.filter(p => p._id !== player._id));
        
        // Clear the selected player
        setSelectedPlayer(null);
      } else {
        alert("❌ Failed to delete account. See console for details.");
        console.error("Delete failed:", response.data);
      }
    } catch (error) {
      console.error("❌ Error deleting player:", error);
      alert(`❌ Error deleting account: ${error.message}`);
    }
  };

  // Handle sending player home
  const handleSendHome = async (player) => {
    if (!player) return;
    
    const confirmed = window.confirm(
      `Send "${player.username}" back to their home grid?\n\n` +
      `This will:\n` +
      `• Move them to their home grid\n` +
      `• Reset their position to the Signpost\n` +
      `• Restore their HP to full\n\n` +
      `Continue?`
    );
    
    if (!confirmed) return;
    
    try {
      console.log(`🏠 Sending player home: ${player.username} (ID: ${player._id})`);
      
      const response = await axios.post(`${API_BASE}/api/send-player-home`, {
        playerId: player._id,
      });
      
      if (response.data.success) {
        alert(`✅ "${player.username}" has been sent home successfully.`);
        console.log(`✅ Player sent home: ${player.username}`);
        
        // Optionally refresh the player data to show updated location
        if (player.location) {
          player.location.x = 0;
          player.location.y = 0;
          setSelectedPlayer({...player});
        }
      } else {
        alert("❌ Failed to send player home. See console for details.");
        console.error("Send home failed:", response.data);
      }
    } catch (error) {
      console.error("❌ Error sending player home:", error);
      alert(`❌ Error sending player home: ${error.message}`);
    }
  };

  // Handle password reset
  const handleResetPassword = async (player) => {
    if (!player) return;
    
    const confirmed = window.confirm(
      `Reset password for "${player.username}"?\n\n` +
      `This will:\n` +
      `• Reset their password to: temp\n` +
      `• They will need to login with this temporary password\n\n` +
      `Continue?`
    );
    
    if (!confirmed) return;
    
    try {
      console.log(`🔑 Resetting password for player: ${player.username} (ID: ${player._id})`);
      
      const response = await axios.post(`${API_BASE}/api/reset-password`, {
        playerId: player._id,
      });
      
      if (response.data.success) {
        alert(`✅ Password reset to "temp" for "${player.username}".`);
        console.log(`✅ Password reset for: ${player.username}`);
      } else {
        alert("❌ Failed to reset password. See console for details.");
        console.error("Reset password failed:", response.data);
      }
    } catch (error) {
      console.error("❌ Error resetting password:", error);
      alert(`❌ Error resetting password: ${error.message}`);
    }
  };

  // Handle FTUE migration
  const handleMigrateFTUE = async (player) => {
    if (!player) return;
    
    const currentStep = player.ftuestep;
    if (!currentStep || currentStep < 4) {
      alert(`"${player.username}" is at FTUE step ${currentStep || 'none'} - no migration needed (only steps 4 and 8 need migration).`);
      return;
    }
    
    let migrationPlan = '';
    let newStep = currentStep;
    
    if (currentStep === 4) {
      // Check if player has Grower skill/NPC - need to check both skills and inventory
      const hasGrowerSkill = player.skills?.some(skill => 
        skill.type === "Grower" || skill.name === "Grower"
      );
      
      const hasGrowerInInventory = player.inventory?.some(item => 
        item.type === "Grower"
      );
      
      const hasGrowerQuest = player.activeQuests?.some(quest => 
        quest.questId === "Grower" || 
        (quest.questId && quest.questId.includes("Grower"))
      );
      
      console.log(`🔍 Grower detection for ${player.username}:`, {
        hasGrowerSkill,
        hasGrowerInInventory, 
        hasGrowerQuest,
        skills: player.skills,
        inventory: player.inventory,
        activeQuests: player.activeQuests
      });
      
      const hasGrowerNPC = hasGrowerSkill || hasGrowerInInventory;
      
      if (hasGrowerNPC) {
        newStep = 5;
        migrationPlan = `Step 4 → 5 (has Grower NPC, can advance to feedback step)`;
      } else {
        migrationPlan = `Step 4 → no change (needs to get Grower NPC first)`;
        alert(`"${player.username}" is at step 4 but doesn't have Grower NPC - no migration needed.\n\nDebug info:\n• Grower skill: ${hasGrowerSkill}\n• Grower in inventory: ${hasGrowerInInventory}\n• Grower quest: ${hasGrowerQuest}`);
        return;
      }
    } else if (currentStep === 8) {
      newStep = 9;
      migrationPlan = `Step 8 → 9 (simple renumbering)`;
    } else {
      alert(`"${player.username}" is at step ${currentStep} - no migration rule defined for this step.`);
      return;
    }
    
    const confirmed = window.confirm(
      `Migrate FTUE for "${player.username}"?\n\n` +
      `Current Step: ${currentStep}\n` +
      `Migration: ${migrationPlan}\n\n` +
      `This will update their FTUE step in the database.\n\n` +
      `Continue?`
    );
    
    if (!confirmed) return;
    
    try {
      console.log(`🎓 Migrating FTUE for player: ${player.username} (ID: ${player._id})`);
      console.log(`Migration plan: ${migrationPlan}`);
      
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: player._id,
        updates: { ftuestep: newStep }
      });
      
      if (response.data.success) {
        alert(`✅ FTUE migrated for "${player.username}": ${migrationPlan}`);
        console.log(`✅ FTUE migrated: ${player.username} from step ${currentStep} to ${newStep}`);
        
        // Update the local player data
        const updatedPlayer = { ...player, ftuestep: newStep };
        setSelectedPlayer(updatedPlayer);
        
        // Update the player in the players list
        setPlayers(players.map(p => p._id === player._id ? updatedPlayer : p));
      } else {
        alert("❌ Failed to migrate FTUE. See console for details.");
        console.error("FTUE migration failed:", response.data);
      }
    } catch (error) {
      console.error("❌ Error migrating FTUE:", error);
      alert(`❌ Error migrating FTUE: ${error.message}`);
    }
  };

  // Handle bulk deletion of unstarted profiles
  const handleDeleteUnstartedProfiles = async () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - (10 * 24 * 60 * 60 * 1000));
    
    // Filter profiles that meet deletion criteria
    const profilesToDelete = players.filter(player => {
      const lastActive = player.lastActive ? new Date(player.lastActive) : null;
      const ftueStep = player.ftuestep || 0;
      const isFirstTimeUser = player.firsttimeuser === true;
      
      // Check if last active is 10+ days ago (or never active) AND ftue step is 3 or less AND still a first-time user
      return (!lastActive || lastActive <= tenDaysAgo) && ftueStep <= 3 && isFirstTimeUser;
    });
    
    if (profilesToDelete.length === 0) {
      alert("No profiles found matching the criteria for deletion.");
      return;
    }
    
    // Sort profiles by last active date (oldest first)
    profilesToDelete.sort((a, b) => {
      const aDate = a.lastActive ? new Date(a.lastActive) : new Date(0);
      const bDate = b.lastActive ? new Date(b.lastActive) : new Date(0);
      return aDate - bDate;
    });
    
    // Show preview modal
    setDeletionModal({
      isOpen: true,
      type: 'unstarted',
      profiles: profilesToDelete
    });
  };

  // Handle bulk deletion of inactive profiles
  const handleDeleteInactiveProfiles = async () => {
    const now = new Date();
    const twentyOneDaysAgo = new Date(now.getTime() - (21 * 24 * 60 * 60 * 1000));
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    // Filter profiles that meet deletion criteria
    const profilesToDelete = players.filter(player => {
      const lastActive = player.lastActive ? new Date(player.lastActive) : null;
      const ftueStep = player.ftuestep || 0;
      const isFirstTimeUser = player.firsttimeuser === true;
      
      // Condition 1: First-time users with 21+ days inactive AND FTUE step 6 or less
      const condition1 = (!lastActive || lastActive <= twentyOneDaysAgo) && ftueStep <= 6 && isFirstTimeUser;
      
      // Condition 2: ANY profile with 30+ days inactive, regardless of FTUE status
      const condition2 = !lastActive || lastActive <= thirtyDaysAgo;
      
      return condition1 || condition2;
    });
    
    if (profilesToDelete.length === 0) {
      alert("No profiles found matching the criteria for deletion.");
      return;
    }
    
    // Sort profiles by last active date (oldest first)
    profilesToDelete.sort((a, b) => {
      const aDate = a.lastActive ? new Date(a.lastActive) : new Date(0);
      const bDate = b.lastActive ? new Date(b.lastActive) : new Date(0);
      return aDate - bDate;
    });
    
    // Show preview modal
    setDeletionModal({
      isOpen: true,
      type: 'inactive',
      profiles: profilesToDelete
    });
  };

  // Confirm and execute bulk deletion
  const confirmBulkDeletion = async () => {
    const { profiles, type } = deletionModal;
    
    // Final confirmation
    const confirmed = window.confirm(
      `⚠️ FINAL CONFIRMATION ⚠️\n\n` +
      `You are about to permanently delete ${profiles.length} player accounts.\n\n` +
      `This action cannot be undone!\n\n` +
      `Are you absolutely sure?`
    );
    
    if (!confirmed) return;
    
    // Close modal
    setDeletionModal({ isOpen: false, type: null, profiles: [] });
    
    try {
      console.log(`🗑️ Starting bulk deletion of ${profiles.length} ${type} profiles...`);
      
      let successCount = 0;
      let failCount = 0;
      
      // Delete each profile using the existing delete endpoint
      for (const player of profiles) {
        try {
          const response = await axios.post(`${API_BASE}/api/delete-player`, {
            playerId: player._id,
          });
          
          if (response.data.success) {
            successCount++;
            console.log(`✅ Deleted: ${player.username}`);
          } else {
            failCount++;
            console.error(`❌ Failed to delete: ${player.username}`);
          }
        } catch (error) {
          failCount++;
          console.error(`❌ Error deleting ${player.username}:`, error);
        }
      }
      
      // Update the players list to remove deleted profiles
      const deletedIds = profiles.map(p => p._id);
      setPlayers(players.filter(p => !deletedIds.includes(p._id)));
      
      // Clear selected player if it was deleted
      if (selectedPlayer && deletedIds.includes(selectedPlayer._id)) {
        setSelectedPlayer(null);
      }
      
      alert(
        `Bulk deletion completed:\n\n` +
        `✅ Successfully deleted: ${successCount} profiles\n` +
        `❌ Failed to delete: ${failCount} profiles`
      );
      
    } catch (error) {
      console.error("❌ Error during bulk deletion:", error);
      alert(`Error during bulk deletion: ${error.message}`);
    }
  };

  // Handle column sorting
  const handleSort = (columnKey) => {
    let direction = 'asc';
    if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnKey, direction });
  };

  // Sort and filter players
  const sortedAndFilteredPlayers = useMemo(() => {
    let filtered = filteredPlayers;

    // Apply sorting if configured
    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle special cases for sorting
        if (sortConfig.key === 'created' || sortConfig.key === 'lastActive') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        } else if (sortConfig.key === 'netWorth' || sortConfig.key === 'ftuestep' || sortConfig.key === 'aspiration') {
          aValue = Number(aValue) || 0;
          bValue = Number(bValue) || 0;
        } else if (sortConfig.key === 'money') {
          // Extract money from inventory for sorting
          const aMoneyItem = a.inventory?.find(item => item.type === 'Money');
          const bMoneyItem = b.inventory?.find(item => item.type === 'Money');
          aValue = Number(aMoneyItem?.quantity) || 0;
          bValue = Number(bMoneyItem?.quantity) || 0;
        } else if (sortConfig.key === 'browser') {
          // Extract browser from ftueFeedback for sorting
          aValue = (a.ftueFeedback?.browser || '').toLowerCase();
          bValue = (b.ftueFeedback?.browser || '').toLowerCase();
        } else if (sortConfig.key === 'os') {
          // Extract OS from ftueFeedback for sorting
          aValue = (a.ftueFeedback?.os || '').toLowerCase();
          bValue = (b.ftueFeedback?.os || '').toLowerCase();
        } else if (sortConfig.key === 'latency') {
          // Extract latency from ftueFeedback for sorting
          aValue = a.ftueFeedback?.latency ?? 99999;
          bValue = b.ftueFeedback?.latency ?? 99999;
        } else if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = (bValue || '').toLowerCase();
        } else if (aValue === null || aValue === undefined) {
          aValue = '';
        }
        
        if (bValue === null || bValue === undefined) {
          bValue = '';
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [filteredPlayers, sortConfig]);

  return (
    <div className="players-layout">
      {/* BASE PANEL UI - Always visible */}
      <div className="players-base-panel">
        <h2>😀 Players</h2>
        
        <div className="players-stats">
          <p><strong>Total Players:</strong> {players.length}</p>
          {selectedFrontier && !selectedSettlement && (
            <p><strong>In Current Frontier:</strong> {sortedAndFilteredPlayers.length}</p>
          )}
          {selectedSettlement && (
            <p><strong>In Current Settlement:</strong> {sortedAndFilteredPlayers.length}</p>
          )}
        </div>

        <div className="shared-buttons">
          <button onClick={fetchPlayers} className="btn-basic btn-mini">
            🔄 Refresh Data
          </button>
        </div>

        {/* Bulk Deletion Buttons */}
        <div className="shared-buttons" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            onClick={handleDeleteUnstartedProfiles}
            className="btn-basic btn-mini btn-danger"
            title="Will delete first-time users where Last Active is 10 days or more, and FTUE Step is 3 or less"
          >
            🗑️ Delete Unstarted Profiles
          </button>

          <button
            onClick={handleDeleteInactiveProfiles}
            className="btn-basic btn-mini btn-danger"
            title="Will delete: (1) First-time users where Last Active is 21+ days and FTUE step is 6 or less, OR (2) ANY profile where Last Active is 30+ days, regardless of FTUE status"
          >
            🗑️ Delete Inactive Profiles
          </button>
        </div>

        {/* Selected Player Info */}
        {selectedPlayer && (
          <div className="selected-player-info">
            <h3>Selected Player:</h3>
            <div className="player-details">
              <h3><strong>{selectedPlayer.icon || '😀'} {selectedPlayer.username}</strong></h3>
            </div>
            
            {/* Player management buttons */}
            <div className="player-actions">
              <button
                className="action-btn"
                onClick={handleSaveChanges}
                disabled={!hasPendingChanges()}
                style={{
                  backgroundColor: hasPendingChanges() ? '#007bff' : '#ccc',
                  color: 'white',
                  cursor: hasPendingChanges() ? 'pointer' : 'not-allowed'
                }}
              >
                💾 Save Changes
              </button>
              <button className="action-btn" disabled>
                Send Message
              </button>
              <button
                className="action-btn"
                onClick={() => handleSendHome(selectedPlayer)}
                style={{ backgroundColor: '#28a745', color: 'white' }}
              >
                🏠 Send Home
              </button>
              <button
                className="action-btn"
                onClick={() => handleResetPassword(selectedPlayer)}
                style={{ backgroundColor: '#ff9800', color: 'white' }}
              >
                🔑 Reset Password
              </button>
              <button
                className="action-btn"
                onClick={() => handleMigrateFTUE(selectedPlayer)}
                style={{ backgroundColor: '#6f42c1', color: 'white' }}
              >
                🎓 Migrate FTUE
              </button>
              <button
                className="action-btn delete-btn"
                onClick={() => handleDeleteAccount(selectedPlayer)}
                style={{ backgroundColor: '#dc3545', color: 'white' }}
              >
                🗑️ Delete Account
              </button>
            </div>

            {/* Player Stats */}
            <div className="player-stats">
              <p><strong>First time user?:</strong> {selectedPlayer.firsttimeuser === true ? 'true' : 'false'}</p>
              <p><strong>Active Quests:</strong> {selectedPlayer.activeQuests?.length || 0}</p>
              <p><strong>Completed Quests:</strong> {selectedPlayer.completedQuests?.length || 0}</p>
              <p><strong>Warehouse Capacity:</strong> {
                selectedPlayer.warehouseCapacity 
                  ? `${selectedPlayer.warehouseCapacity.toLocaleString()} (${getWarehouseUsage(selectedPlayer.inventory).toLocaleString()} used)`
                  : 'N/A'
              }</p>
              <p><strong>Backpack Capacity:</strong> {selectedPlayer.backpackCapacity?.toLocaleString() || 'N/A'}</p>
              
              {/* Wallet Section */}
              {(() => {
                const walletItems = getWalletItems(selectedPlayer.inventory);
                return walletItems.length > 0 && (
                  <div className="wallet-section">
                    <p
                      style={{ cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => toggleSection('wallet')}
                    >
                      💰 Wallet: {collapsedSections.wallet ? '▶' : '▼'}
                    </p>
                    {!collapsedSections.wallet && (
                      <ul className="skills-list" style={{ marginLeft: '0px' }}>
                        {walletItems.map((item, index) => {
                          const isEditing = editingItem?.section === 'wallet' && editingItem?.type === item.type;
                          const displayQuantity = pendingWalletEdits[item.type] !== undefined
                            ? pendingWalletEdits[item.type]
                            : item.quantity;

                          return (
                            <li key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              {isEditing ? (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{item.type}:</span>
                                    <input
                                      type="number"
                                      value={editingItem.value}
                                      onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                                      style={{ width: '60px', padding: '2px 4px' }}
                                      autoFocus
                                    />
                                  </div>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      onClick={() => handleSaveEdit('wallet', item.type)}
                                      style={{ padding: '1px 6px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', fontSize: '11px' }}
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={handleCancelEdit}
                                      style={{ padding: '1px 6px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', fontSize: '11px' }}
                                    >
                                      ✗
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span style={{ color: pendingWalletEdits[item.type] !== undefined ? '#007bff' : 'inherit' }}>
                                    {item.type}: {displayQuantity.toLocaleString()}
                                  </span>
                                  <button
                                    onClick={() => handleEditItem('wallet', item.type, item.quantity)}
                                    style={{ padding: '1px 6px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '3px', fontSize: '10px' }}
                                  >
                                    ✏️
                                  </button>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })()}
              
              {/* Inventory Section */}
              {(() => {
                const inventoryItems = getNonWalletInventory(selectedPlayer.inventory);
                return inventoryItems.length > 0 && (
                  <div className="inventory-section">
                    <p
                      style={{ cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => toggleSection('inventory')}
                    >
                      📦 Inventory: {collapsedSections.inventory ? '▶' : '▼'}
                    </p>
                    {!collapsedSections.inventory && (
                      <ul className="skills-list" style={{ marginLeft: '0px' }}>
                        {inventoryItems.map((item, index) => {
                          if (item && typeof item === 'object' && item.type && item.quantity !== undefined) {
                            const isEditing = editingItem?.section === 'inventory' && editingItem?.type === item.type;
                            const displayQuantity = pendingInventoryEdits[item.type] !== undefined
                              ? pendingInventoryEdits[item.type]
                              : item.quantity;

                            return (
                              <li key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                {isEditing ? (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span>{item.type}:</span>
                                      <input
                                        type="number"
                                        value={editingItem.value}
                                        onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                                        style={{ width: '60px', padding: '2px 4px' }}
                                        autoFocus
                                      />
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <button
                                        onClick={() => handleSaveEdit('inventory', item.type)}
                                        style={{ padding: '1px 6px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', fontSize: '11px' }}
                                      >
                                        ✓
                                      </button>
                                      <button
                                        onClick={handleCancelEdit}
                                        style={{ padding: '1px 6px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', fontSize: '11px' }}
                                      >
                                        ✗
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <span style={{ color: pendingInventoryEdits[item.type] !== undefined ? '#007bff' : 'inherit' }}>
                                      {item.type}: {displayQuantity.toLocaleString()}
                                    </span>
                                    <button
                                      onClick={() => handleEditItem('inventory', item.type, item.quantity)}
                                      style={{ padding: '1px 6px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '3px', fontSize: '10px' }}
                                    >
                                      ✏️
                                    </button>
                                  </>
                                )}
                              </li>
                            );
                          }
                          return <li key={index}>Invalid inventory item</li>;
                        })}
                      </ul>
                    )}
                  </div>
                );
              })()}
              
              {/* Skills Section */}
              {(() => {
                const sortedSkills = getSortedSkills(selectedPlayer.skills);
                return sortedSkills.length > 0 && (
                  <div className="skills-section">
                    <p
                      style={{ cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => toggleSection('skills')}
                    >
                      🔧 Skills: {collapsedSections.skills ? '▶' : '▼'}
                    </p>
                    {!collapsedSections.skills && (
                      <ul className="skills-list" style={{ marginLeft: '0px' }}>
                        {sortedSkills.map((skill, index) => {
                          // Find the original index in the unsorted skills array
                          const originalIndex = selectedPlayer.skills?.findIndex(s => s === skill);
                          const isMarkedForDeletion = pendingSkillDeletions.has(originalIndex);

                          // Handle different skill data formats
                          let displayText = '';
                          if (typeof skill === 'string') {
                            displayText = skill;
                          } else if (skill && typeof skill === 'object') {
                            const name = skill.name || skill.type || 'Unknown Skill';
                            const level = skill.level || skill.quantity || '';
                            displayText = `${name}${level ? `: ${level}` : ''}`;
                          } else {
                            displayText = 'Invalid skill data';
                          }

                          return (
                            <li key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{
                                textDecoration: isMarkedForDeletion ? 'line-through' : 'none',
                                color: isMarkedForDeletion ? '#dc3545' : 'inherit'
                              }}>
                                {displayText}
                              </span>
                              <button
                                onClick={() => handleDeleteSkill(originalIndex)}
                                style={{
                                  padding: '1px 6px',
                                  cursor: 'pointer',
                                  backgroundColor: isMarkedForDeletion ? '#6c757d' : '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  fontSize: '10px'
                                }}
                                title={isMarkedForDeletion ? 'Undo deletion' : 'Mark for deletion'}
                              >
                                {isMarkedForDeletion ? '↶' : '🗑️'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })()}
              
              {/* Powers Section */}
              {(() => {
                const sortedPowers = getSortedPowers(selectedPlayer.powers);
                return sortedPowers.length > 0 && (
                  <div className="powers-section">
                    <p
                      style={{ cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => toggleSection('powers')}
                    >
                      ⚡ Powers: {collapsedSections.powers ? '▶' : '▼'}
                    </p>
                    {!collapsedSections.powers && (
                      <ul className="powers-list" style={{ marginLeft: '0px' }}>
                        {sortedPowers.map((power, index) => {
                          // Find the original index in the unsorted powers array
                          const originalIndex = selectedPlayer.powers?.findIndex(p => p === power);
                          const isMarkedForDeletion = pendingPowerDeletions.has(originalIndex);

                          // Handle different power data formats
                          let displayText = '';
                          if (typeof power === 'string') {
                            displayText = power;
                          } else if (power && typeof power === 'object') {
                            const name = power.name || power.type || 'Unknown Power';
                            displayText = name;
                          } else {
                            displayText = 'Invalid power data';
                          }

                          return (
                            <li key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{
                                textDecoration: isMarkedForDeletion ? 'line-through' : 'none',
                                color: isMarkedForDeletion ? '#dc3545' : 'inherit'
                              }}>
                                {displayText}
                              </span>
                              <button
                                onClick={() => handleDeletePower(originalIndex)}
                                style={{
                                  padding: '1px 6px',
                                  cursor: 'pointer',
                                  backgroundColor: isMarkedForDeletion ? '#6c757d' : '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  fontSize: '10px'
                                }}
                                title={isMarkedForDeletion ? 'Undo deletion' : 'Mark for deletion'}
                              >
                                {isMarkedForDeletion ? '↶' : '🗑️'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="players-main-container">
        {loading ? (
          <div className="loading">Loading players...</div>
        ) : error ? (
          <div className="error">
            <p>{error}</p>
            <button onClick={fetchPlayers}>Retry</button>
          </div>
        ) : (
          <div className="players-table-container">
            <table className="players-table">
              <thead>
                <tr>
                  <th 
                    onClick={() => handleSort('username')}
                    className={`sortable ${sortConfig.key === 'username' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Username {sortConfig.key === 'username' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('language')}
                    className={`sortable ${sortConfig.key === 'language' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Language {sortConfig.key === 'language' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('netWorth')}
                    className={`sortable ${sortConfig.key === 'netWorth' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Net Worth {sortConfig.key === 'netWorth' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('money')}
                    className={`sortable ${sortConfig.key === 'money' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Money {sortConfig.key === 'money' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('accountStatus')}
                    className={`sortable ${sortConfig.key === 'accountStatus' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Account Status {sortConfig.key === 'accountStatus' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('role')}
                    className={`sortable ${sortConfig.key === 'role' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Role {sortConfig.key === 'role' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('browser')}
                    className={`sortable ${sortConfig.key === 'browser' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Browser {sortConfig.key === 'browser' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('os')}
                    className={`sortable ${sortConfig.key === 'os' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    OS {sortConfig.key === 'os' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('latency')}
                    className={`sortable ${sortConfig.key === 'latency' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Latency {sortConfig.key === 'latency' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('created')}
                    className={`sortable ${sortConfig.key === 'created' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Created {sortConfig.key === 'created' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    onClick={() => handleSort('lastActive')}
                    className={`sortable ${sortConfig.key === 'lastActive' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Last Active {sortConfig.key === 'lastActive' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Last Location</th>
                  <th 
                    onClick={() => handleSort('ftuestep')}
                    className={`sortable ${sortConfig.key === 'ftuestep' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    FTUE Step {sortConfig.key === 'ftuestep' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('aspiration')}
                    className={`sortable ${sortConfig.key === 'aspiration' ? `sort-${sortConfig.direction}` : ''}`}
                  >
                    Aspiration {sortConfig.key === 'aspiration' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Diagnostics</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredPlayers.map((player) => (
                  <tr 
                    key={player._id}
                    className={selectedPlayer?._id === player._id ? 'selected' : ''}
                    onClick={() => handlePlayerSelect(player)}
                  >
                    <td className="username">
                      {player.icon || '😀'} {player.username}
                    </td>
                    <td>{player.language || 'Unknown'}</td>
                    <td>{player.netWorth || 0}</td>
                    <td>{(() => {
                      const moneyItem = player.inventory?.find(item => item.type === 'Money');
                      return moneyItem?.quantity || 0;
                    })()}</td>
                    <td>
                      <span className={`status ${player.accountStatus?.toLowerCase() || 'free'}`}>
                        {player.accountStatus || 'Free'}
                      </span>
                    </td>
                    <td>
                      <span className={`role ${player.role?.toLowerCase() || 'citizen'}`}>
                        {player.role || 'Citizen'}
                      </span>
                    </td>
                    <td>{player.ftueFeedback?.browser || ''}</td>
                    <td>{player.ftueFeedback?.os || ''}</td>
                    <td>{player.ftueFeedback?.latency != null ? `${player.ftueFeedback.latency}ms` : ''}</td>
                    <td>{player.created ? new Date(player.created).toLocaleDateString() : 'Unknown'}</td>
                    <td>
                      {player.lastActive ? (
                        <span title={new Date(player.lastActive).toLocaleString()}>
                          {(() => {
                            const now = new Date();
                            const lastActive = new Date(player.lastActive);
                            const diffMs = now - lastActive;
                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                            const diffMinutes = Math.floor(diffMs / (1000 * 60));
                            
                            if (diffDays > 0) return `${diffDays}d ago`;
                            if (diffHours > 0) return `${diffHours}h ago`;
                            if (diffMinutes > 0) return `${diffMinutes}m ago`;
                            return 'Just now';
                          })()}
                        </span>
                      ) : (
                        'Never'
                      )}
                    </td>
                    <td>
                      {player.location?.gtype ? (
                        <span>
                          {player.location.gtype} ({player.location.x}, {player.location.y})
                        </span>
                      ) : (
                        'Unknown'
                      )}
                    </td>
                    <td>{player.ftuestep || ''}</td>
                    <td>
                      {player.aspiration === 1 ? '🌱' :
                       player.aspiration === 2 ? '⚔️' :
                       player.aspiration === 3 ? '🏛️' :
                       ''}
                    </td>
                    <td className="diagnostics-cell">
                      <button
                        className="diagnostics-info-btn"
                        onMouseEnter={() => setHoveredDiagnostics(player._id)}
                        onMouseLeave={() => setHoveredDiagnostics(null)}
                      >
                        i
                      </button>
                      {hoveredDiagnostics === player._id && player.ftueFeedback && (
                        <div className="diagnostics-tooltip">
                          <table>
                            <tbody>
                              <tr><td>Browser</td><td>{player.ftueFeedback.browser || '-'}</td></tr>
                              <tr><td>OS</td><td>{player.ftueFeedback.os || '-'}</td></tr>
                              <tr><td>Latency</td><td>{player.ftueFeedback.latency != null ? `${player.ftueFeedback.latency}ms` : '-'}</td></tr>
                              <tr><td>Connection</td><td>{player.ftueFeedback.connectionType || '-'}</td></tr>
                              <tr><td>Downlink</td><td>{player.ftueFeedback.downlink != null ? `${player.ftueFeedback.downlink} Mbps` : '-'}</td></tr>
                              <tr><td>Screen</td><td>{player.ftueFeedback.screenWidth && player.ftueFeedback.screenHeight ? `${player.ftueFeedback.screenWidth}x${player.ftueFeedback.screenHeight}` : '-'}</td></tr>
                              <tr><td>Viewport</td><td>{player.ftueFeedback.viewportWidth && player.ftueFeedback.viewportHeight ? `${player.ftueFeedback.viewportWidth}x${player.ftueFeedback.viewportHeight}` : '-'}</td></tr>
                              <tr><td>Pixel Ratio</td><td>{player.ftueFeedback.devicePixelRatio || '-'}</td></tr>
                              <tr><td>Memory</td><td>{player.ftueFeedback.deviceMemory != null ? `${player.ftueFeedback.deviceMemory} GB` : '-'}</td></tr>
                              <tr><td>CPU Cores</td><td>{player.ftueFeedback.hardwareConcurrency || '-'}</td></tr>
                              <tr><td>Mobile</td><td>{player.ftueFeedback.isMobile != null ? (player.ftueFeedback.isMobile ? 'Yes' : 'No') : '-'}</td></tr>
                              <tr><td>Touch</td><td>{player.ftueFeedback.isTouchDevice != null ? (player.ftueFeedback.isTouchDevice ? 'Yes' : 'No') : '-'}</td></tr>
                              <tr><td>WebGL</td><td>{player.ftueFeedback.webglSupported != null ? (player.ftueFeedback.webglSupported ? 'Yes' : 'No') : '-'}</td></tr>
                              <tr><td>Timezone</td><td>{player.ftueFeedback.timezone || '-'}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {sortedAndFilteredPlayers.length === 0 && !loading && !error && (
              <div className="no-players">
                {selectedSettlement ? 
                  'No players found in the selected settlement.' :
                  selectedFrontier ? 
                    'No players found in the selected frontier.' :
                    'No players found.'
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deletion Preview Modal */}
      {deletionModal.isOpen && (
        <div className="modal-overlay" onClick={() => setDeletionModal({ isOpen: false, type: null, profiles: [] })}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>
              🗑️ {deletionModal.type === 'unstarted' ? 'Delete Unstarted Profiles' : 'Delete Inactive Profiles'}
            </h2>
            
            <div className="modal-info">
              <p><strong>Total profiles to delete:</strong> {deletionModal.profiles.length}</p>
              <p className="criteria">
                {deletionModal.type === 'unstarted' ? 
                  '(First-time users only: Last Active ≥ 10 days, FTUE Step ≤ 3)' : 
                  '(First-time users: Last Active ≥ 21 days + FTUE Step ≤ 6) OR (Any profile: Last Active ≥ 30 days)'
                }
              </p>
            </div>

            <div className="profiles-preview">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Last Active</th>
                    <th>FTUE Step</th>
                    <th>Created</th>
                    <th>Settlement</th>
                  </tr>
                </thead>
                <tbody>
                  {deletionModal.profiles.slice(0, 50).map((player) => (
                    <tr key={player._id}>
                      <td>{player.icon || '😀'} {player.username}</td>
                      <td>
                        {player.lastActive ? (
                          <span style={{ color: '#dc3545' }}>
                            {(() => {
                              const now = new Date();
                              const lastActive = new Date(player.lastActive);
                              const diffDays = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));
                              return `${diffDays} days ago`;
                            })()}
                          </span>
                        ) : (
                          <span style={{ color: '#dc3545' }}>Never</span>
                        )}
                      </td>
                      <td>{player.ftuestep || '0'}</td>
                      <td>{player.created ? new Date(player.created).toLocaleDateString() : 'Unknown'}</td>
                      <td>{getSettlementName(player.settlementId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {deletionModal.profiles.length > 50 && (
                <p className="more-profiles">...and {deletionModal.profiles.length - 50} more profiles</p>
              )}
            </div>

            <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
              <button
                className="btn-basic btn-modal btn-neutral"
                onClick={() => setDeletionModal({ isOpen: false, type: null, profiles: [] })}
              >
                Cancel
              </button>
              <button
                className="btn-basic btn-modal btn-danger"
                onClick={() => confirmBulkDeletion()}
              >
                🗑️ Delete {deletionModal.profiles.length} Profiles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Players;