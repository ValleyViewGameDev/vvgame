import './CombatPanel.css';
import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import playersInGridManager from '../../GridState/PlayersInGrid';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import '../../UI/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';

const CombatPanel = ({ onClose, currentPlayer, setCurrentPlayer, masterResources, masterSkills, TILE_SIZE }) => {
  const strings = useStrings();
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const { updateStatus } = useContext(StatusBarContext);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [playerStats, setPlayerStats] = useState({});
  
  // Equipment state
  const getEquippedWeapon = () => currentPlayer.settings?.equippedWeapon || null;
  const getEquippedArmor = () => currentPlayer.settings?.equippedArmor || null;
  
  // Helper functions to categorize powers
  const isWeapon = (resource) => resource.passable === true && typeof resource.damage === 'number' && resource.damage > 0;
  const isArmor = (resource) => resource.passable === true && typeof resource.armorclass === 'number' && resource.armorclass > 0;
  const isMagicEnhancement = (resource) => !isWeapon(resource) && !isArmor(resource);
  
  // Check if player is in a valid location for equipment changes
  const canChangeEquipment = () => {
//    const gridType = currentPlayer.location.gtype;
//    return gridType === 'homestead' || gridType === 'town';
    return true; // CHANGED: Allow equipment changes anywhere
  };

  // Equipment change handlers
  const handleEquipWeapon = async (weaponType) => {
    if (!canChangeEquipment()) {
      updateStatus(strings[520] || 'Cannot change equipment in this location');
      return;
    }

    try {
      const updatedSettings = {
        ...currentPlayer.settings,
        equippedWeapon: weaponType
      };
      
      await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { settings: updatedSettings }
      });
      
      // Update player state first
      const updatedPlayer = {
        ...currentPlayer,
        settings: updatedSettings
      };
      setCurrentPlayer(updatedPlayer);
      
      // Wait a moment for state to settle, then refresh with updated player data
      setTimeout(() => {
        refreshCombatStatsWithPlayer(updatedPlayer);
        // Also force immediate update of displayed stats
        const stats = playersInGridManager.getAllPCs(currentPlayer.location.g)?.[currentPlayer._id];
        if (stats) {
          setPlayerStats(stats);
        }
      }, 100);
      
      updateStatus(weaponType ? `Equipped ${weaponType}` : 'Unequipped weapon');
    } catch (error) {
      console.error('Error equipping weapon:', error);
      updateStatus('Failed to equip weapon');
    }
  };
  
  const handleEquipArmor = async (armorType) => {
    if (!canChangeEquipment()) {
      updateStatus(strings[520] || 'Cannot change equipment in this location');
      return;
    }

    try {
      const updatedSettings = {
        ...currentPlayer.settings,
        equippedArmor: armorType
      };
      
      await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { settings: updatedSettings }
      });
      
      // Update player state first
      const updatedPlayer = {
        ...currentPlayer,
        settings: updatedSettings
      };
      setCurrentPlayer(updatedPlayer);
      
      // Wait a moment for state to settle, then refresh with updated player data
      setTimeout(() => {
        refreshCombatStatsWithPlayer(updatedPlayer);
        // Also force immediate update of displayed stats
        const stats = playersInGridManager.getAllPCs(currentPlayer.location.g)?.[currentPlayer._id];
        if (stats) {
          setPlayerStats(stats);
        }
      }, 100);
      
      updateStatus(armorType ? `Equipped ${armorType}` : 'Unequipped armor');
    } catch (error) {
      console.error('Error equipping armor:', error);
      updateStatus('Failed to equip armor');
    }
  };


  useEffect(() => {
    const interval = setInterval(() => {
      const stats = playersInGridManager.getAllPCs(currentPlayer.location.g)?.[currentPlayer._id];
      if (stats) {
        setPlayerStats(stats);
      }
    }, 500); // Poll every 500ms

    return () => clearInterval(interval);
  }, [currentPlayer._id, currentPlayer.location.g]);

  // --- Stat helpers ---

  const getPlayerStats = () => {
    return playersInGridManager.getAllPCs(currentPlayer.location.g)?.[currentPlayer._id] || {};
  };
  const getStatBreakdown = (stat) => {
    const total = playerStats?.[stat] || 0;
    // Handle special case for maxhp -> baseMaxhp (capital M)
    let basePropertyName;
    if (stat === 'maxhp') {
      basePropertyName = 'baseMaxhp';
    } else if (stat === 'hp') {
      basePropertyName = 'baseHp';
    } else {
      // For other stats: damage -> baseDamage, attackrange -> baseAttackrange, etc.
      basePropertyName = `base${stat.charAt(0).toUpperCase() + stat.slice(1)}`;
    }
    const base = currentPlayer[basePropertyName] || 0;
    const modifier = total - base;
    return { base, modifier, total };
  };

  const hp = getStatBreakdown('hp');
  const maxhp = getStatBreakdown('maxhp');
  const damage = getStatBreakdown('damage');
  const armorclass = getStatBreakdown('armorclass');
  const attackbonus = getStatBreakdown('attackbonus');
  const attackrange = getStatBreakdown('attackrange');
  const speed = getStatBreakdown('speed');



  // Refresh function that uses current player data (for button)
  const handleRefreshCombatStats = () => {
    refreshCombatStatsWithPlayer(currentPlayer);
  };

  // Core refresh function that accepts player data parameter (to avoid race conditions)
  const refreshCombatStatsWithPlayer = (playerData) => {
    const gridId = playerData.location.g;
    const playerId = playerData._id;

    const baseStats = {
      hp: playerData.baseHp || 0,  // Add hp calculation
      maxhp: playerData.baseMaxhp || 0,
      damage: playerData.baseDamage || 0,
      armorclass: playerData.baseArmorclass || 0,
      attackbonus: playerData.baseAttackbonus || 0,
      attackrange: playerData.baseAttackrange || 0,
      speed: playerData.baseSpeed || 0,
    };

    const powers = playerData.powers || [];
    const powerBonuses = {
      hp: 0, maxhp: 0, damage: 0, armorclass: 0, attackbonus: 0, attackrange: 0, speed: 0,
    };

    const equippedWeapon = playerData.settings?.equippedWeapon || null;
    const equippedArmor = playerData.settings?.equippedArmor || null;

    powers.forEach(power => {
      const res = masterResources.find(r => r.type === power.type);
      if (res && res.category === 'power') {
        const powerQty = power.quantity || 0;
        
        // Only count equipped weapons and armor, or all magic enhancements
        const shouldCount = isMagicEnhancement(res) || 
                           (isWeapon(res) && power.type === equippedWeapon) ||
                           (isArmor(res) && power.type === equippedArmor);
        
        if (shouldCount) {
          // Check for multiple combat attributes on the power
          Object.keys(powerBonuses).forEach(stat => {
            if (typeof res[stat] === 'number') {
              powerBonuses[stat] += powerQty * res[stat];
            }
          });
        }
      }
    });

    const finalStats = {};
    Object.keys(baseStats).forEach(stat => {
      finalStats[stat] = baseStats[stat] + (powerBonuses[stat] || 0);
    });

    // Special handling for HP - use current HP if available, otherwise use max HP
    const currentPCStats = getPlayerStats();
    if (currentPCStats?.hp !== undefined) {
      finalStats.hp = currentPCStats.hp; // Keep current HP value
    } else if (!finalStats.hp || finalStats.hp === 0) {
      finalStats.hp = finalStats.maxhp; // Set HP to max if not already set
    }

    finalStats.playerId = playerId;
    finalStats.username = playerData.username;
    finalStats.position = playerData.position || {};
    finalStats.icon = playerData.icon || "😀";
    finalStats.iscamping = playerData.iscamping || false;
    finalStats.isinboat = playerData.isinboat || false;
    finalStats.lastUpdated = new Date().toISOString();

    const pc = getPlayerStats();
    const pcPosition = pc?.position;
    finalStats.position = (pcPosition && typeof pcPosition.x === 'number' && typeof pcPosition.y === 'number')
      ? pcPosition : { x: 0, y: 0 }; // Fallback
      
    playersInGridManager.updatePC(gridId, playerId, finalStats);
  };

  return (
    <Panel onClose={onClose} titleKey="1124" panelName="CombatPanel">
      <div className="standard-panel">
      {isContentLoading ? (
          <p>Loading...</p>
        ) : (
          <>
            <div className="combat-stats">
              <h3>{strings[10112]} <span className="stat-total">{hp.total}</span></h3><br/>
              <table className="stats-table">
                <tbody>
                  <tr>
                    <td>{strings[550]}: <span className="stat-total blue-text">{maxhp.modifier !== 0 ? maxhp.total : maxhp.base}</span></td>
                    <td className="stat-breakdown">({maxhp.base} <span className="stat-total blue-text">+ {maxhp.modifier}</span>)</td>
                  </tr>
                  <tr>
                    <td>{strings[551]}: <span className="stat-total blue-text">{armorclass.modifier !== 0 ? armorclass.total : armorclass.base}</span></td>
                    <td className="stat-breakdown">({armorclass.base} <span className="stat-total blue-text">+ {armorclass.modifier}</span>)</td>
                  </tr>
                  <tr>
                    <td>{strings[552]}: <span className="stat-total blue-text">{attackbonus.modifier !== 0 ? attackbonus.total : attackbonus.base}</span></td>
                    <td className="stat-breakdown">({attackbonus.base} <span className="stat-total blue-text">+ {attackbonus.modifier}</span>)</td>
                  </tr>
                  <tr>
                    <td>{strings[553]}: <span className="stat-total blue-text">{damage.modifier !== 0 ? damage.total : damage.base}</span></td>
                    <td className="stat-breakdown">({damage.base} <span className="stat-total blue-text">+ {damage.modifier}</span>)</td>
                  </tr>
                  <tr>
                    <td>{strings[555]}: <span className="stat-total blue-text">{attackrange.modifier !== 0 ? attackrange.total : attackrange.base}</span></td>
                    <td className="stat-breakdown">({attackrange.base} <span className="stat-total blue-text">+ {attackrange.modifier}</span>)</td>
                  </tr>
                  <tr>
                    <td>{strings[554]}: <span className="stat-total blue-text">{speed.modifier !== 0 ? speed.total : speed.base}</span></td>
                    <td className="stat-breakdown">({speed.base} <span className="stat-total blue-text">+ {speed.modifier}</span>)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="shared-buttons">
              <button className="btn-basic btn-success" onClick={handleRefreshCombatStats}>🔄 Fix Combat Stats</button>
            </div>
            <br></br>

            <div className="combat-equip">
              <h3>{strings[522]}</h3>
              <br></br>
              {currentPlayer.powers?.filter(power => {
                const resource = masterResources.find(r => r.type === power.type);
                return resource && isArmor(resource);
              }).length > 0 ? (
                currentPlayer.powers
                  .filter(power => {
                    const resource = masterResources.find(r => r.type === power.type);
                    return resource && isArmor(resource);
                  })
                  .map((power, index) => {
                    const resource = masterResources.find(r => r.type === power.type);
                    const isEquipped = power.type === getEquippedArmor();
                    const stats = [];
                    
                    const combatAttributes = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
                    combatAttributes.forEach(attr => {
                      if (typeof resource[attr] === 'number') {
                        const value = (power.quantity || 0) * resource[attr];
                        const label = strings[attr] || attr;
                        stats.push(`${value > 0 ? '+' : ''}${value} ${label}`);
                      }
                    });
                    
                    return (
                      <div key={`armor-${index}`} className="equipment-item">
                        <input
                          type="checkbox"
                          checked={isEquipped}
                          onChange={() => handleEquipArmor(isEquipped ? null : power.type)}
                          onMouseDown={(e) => {
                            // Prevent focus from being taken away from game board
                            setTimeout(() => e.target.blur(), 0);
                          }}
                          className="equipment-checkbox"
                          disabled={!canChangeEquipment()}
                        />
                        <div className="equipment-content">
                          <strong>{resource.type}</strong><br/>
                          {stats.map((stat, statIndex) => (
                            <div key={statIndex} className="equipment-stat">
                              {stat}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p>{strings[523]}</p>
              )}
              
              <br></br>
              <h3>{strings[524]}</h3>
              <br></br>
              {currentPlayer.powers?.filter(power => {
                const resource = masterResources.find(r => r.type === power.type);
                return resource && isWeapon(resource);
              }).length > 0 ? (
                currentPlayer.powers
                  .filter(power => {
                    const resource = masterResources.find(r => r.type === power.type);
                    return resource && isWeapon(resource);
                  })
                  .map((power, index) => {
                    const resource = masterResources.find(r => r.type === power.type);
                    const isEquipped = power.type === getEquippedWeapon();
                    const stats = [];
                    
                    const combatAttributes = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
                    combatAttributes.forEach(attr => {
                      if (typeof resource[attr] === 'number') {
                        const value = (power.quantity || 0) * resource[attr];
                        const label = strings[attr] || attr;
                        stats.push(`${value > 0 ? '+' : ''}${value} ${label}`);
                      }
                    });
                    
                    return (
                      <div key={`weapon-${index}`} className="equipment-item">
                        <input
                          type="checkbox"
                          checked={isEquipped}
                          onChange={() => handleEquipWeapon(isEquipped ? null : power.type)}
                          onMouseDown={(e) => {
                            // Prevent focus from being taken away from game board
                            setTimeout(() => e.target.blur(), 0);
                          }}
                          className="equipment-checkbox"
                          disabled={!canChangeEquipment()}
                        />
                        <div className="equipment-content">
                          <strong>{resource.type}</strong><br/>
                          {stats.map((stat, statIndex) => (
                            <div key={statIndex} className="equipment-stat">
                              {stat}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p>{strings[525]}</p>
              )}
            </div>

            <div className="combat-powers">
              <h3>{strings[526]}</h3>
              <br></br>
              {currentPlayer.powers?.filter(power => {
                const resource = masterResources.find(r => r.type === power.type);
                return resource && isMagicEnhancement(resource);
              }).length > 0 ? (
                currentPlayer.powers
                  .filter(power => {
                    const resource = masterResources.find(r => r.type === power.type);
                    return resource && isMagicEnhancement(resource);
                  })
                  .map((power, index) => {
                    const resource = masterResources.find(r => r.type === power.type);
                    if (!resource) return null;

                    const powerQty = power.quantity || 0;
                    const combatAttributes = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
                    
                    // Collect all combat stats this power provides
                    const stats = [];
                    combatAttributes.forEach(attr => {
                      if (typeof resource[attr] === 'number') {
                        const value = powerQty * resource[attr];
                        const label = strings[attr] || attr;
                        stats.push(`${value > 0 ? '+' : ''}${value} ${label}`);
                      }
                    });
                    
                    
                    return (
                      <div key={`magic-${index}`} className="magic-enhancement-item">
                        <div className="equipment-content">
                          <strong>{resource.type}</strong><br />
                          {stats.length > 0 ? (
                            stats.map((stat, statIndex) => (
                              <div key={statIndex} className="equipment-stat">
                                {stat}
                              </div>
                            ))
                          ) : (
                            <div className="no-combat-effects">
                              (No combat effects)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p>{strings[527]}</p>
              )}
            </div>
          </>
        )}
      </div>
      <br />
    </Panel>
  );
};

export default React.memo(CombatPanel);