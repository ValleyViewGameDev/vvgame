import './CombatPanel.css';
import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import { StatusBarContext } from '../../UI/StatusBar';
import playersInGridManager from '../../GridState/PlayersInGrid';
import '../../UI/ResourceButton.css'; // ✅ Ensure the correct path
import { useStrings } from '../../UI/StringsContext';

const CombatPanel = ({ onClose, currentPlayer, setCurrentPlayer, masterResources, masterSkills, TILE_SIZE }) => {
  const strings = useStrings();
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const { updateStatus } = useContext(StatusBarContext);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [playerStats, setPlayerStats] = useState({});


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
    const base = currentPlayer[`base${stat.charAt(0).toUpperCase() + stat.slice(1)}`] || 0;
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



  const handleRefreshCombatStats = () => {
    const gridId = currentPlayer.location.g;
    const playerId = currentPlayer._id;

    const baseStats = {
      maxhp: currentPlayer.baseMaxhp || 0,
      damage: currentPlayer.baseDamage || 0,
      armorclass: currentPlayer.baseArmorclass || 0,
      attackbonus: currentPlayer.baseAttackbonus || 0,
      attackrange: currentPlayer.baseAttackrange || 0,
      speed: currentPlayer.baseSpeed || 0,
    };

    const powers = currentPlayer.powers || [];
    const powerBonuses = {
      maxhp: 0, damage: 0, armorclass: 0, attackbonus: 0, attackrange: 0, speed: 0,
    };

    powers.forEach(power => {
      const res = masterResources.find(r => r.type === power.type);
      if (res && res.output && powerBonuses.hasOwnProperty(res.output)) {
        powerBonuses[res.output] += (power.quantity || 0) * (res.qtycollected || 1);
      }
    });

    const finalStats = {};
    Object.keys(baseStats).forEach(stat => {
      finalStats[stat] = baseStats[stat] + (powerBonuses[stat] || 0);
    });

    finalStats.playerId = playerId;
    finalStats.username = currentPlayer.username;
    finalStats.position = currentPlayer.position || {};
    finalStats.icon = currentPlayer.icon || "😀";
    finalStats.iscamping = currentPlayer.iscamping || false;
    finalStats.lastUpdated = new Date().toISOString();

    const pc = getPlayerStats();
    const pcPosition = pc?.position;
    finalStats.position = (pcPosition && typeof pcPosition.x === 'number' && typeof pcPosition.y === 'number')
      ? pcPosition : { x: 0, y: 0 }; // Fallback
      
    playersInGridManager.updatePC(gridId, playerId, finalStats);
    updateStatus("✅ Combat stats refreshed from base stats + powers.");
  };

  return (
    <Panel onClose={onClose} descriptionKey="1024" titleKey="1124" panelName="CombatPanel">
      <div className="standard-panel">
      {isContentLoading ? (
          <p>Loading...</p>
        ) : (
          <>
            <div className="combat-stats">
              <h3>Your Stats:</h3>
              <br />
              <h3>❤️‍🩹 Health: <span className="stat-total">{hp.total}</span></h3>
              <br />
              <h4>
                ❤️‍🩹 Max Health:<br></br> <span className="stat-total blue-text">{maxhp.modifier !== 0 ? maxhp.total : maxhp.base}</span>
                {"  ("} {maxhp.base} + <span className="stat-total blue-text">{maxhp.modifier}</span> {")"}
               
              </h4>
              <h4>
                🛡️ Armor Class: <br></br><span className="stat-total blue-text">{armorclass.modifier !== 0 ? armorclass.total : armorclass.base}</span>
                {"  ("} {armorclass.base} + <span className="stat-total blue-text">{armorclass.modifier}</span> {")"}
              </h4>
              <br />
              <h4>
                ⚔️ Attack Bonus: <br></br><span className="stat-total blue-text">{attackbonus.modifier !== 0 ? attackbonus.total : attackbonus.base}</span>
                {"  ("} {attackbonus.base} + <span className="stat-total blue-text">{attackbonus.modifier}</span> {")"}
              </h4>
              <h4>
                ⚔️ Damage: <br></br><span className="stat-total blue-text">{damage.modifier !== 0 ? damage.total : damage.base}</span>
                {"  ("} {damage.base} + <span className="stat-total blue-text">{damage.modifier}</span> {")"}
              </h4>
              <h4>
                🔭 Attack Range: <br></br><span className="stat-total blue-text">{attackrange.modifier !== 0 ? attackrange.total : attackrange.base}</span>
                {"  ("} {attackrange.base} + <span className="stat-total blue-text">{attackrange.modifier}</span> {")"}              
              </h4>
              <h4>
                🎯 Speed: <br></br><span className="stat-total blue-text">{speed.modifier !== 0 ? speed.total : speed.base}</span>
                {"  ("} {speed.base} + <span className="stat-total blue-text">{speed.modifier}</span> {")"}
              </h4>
              <br></br>

              <h4>⛺️ Is Camping: {currentPlayer.iscamping ? "Yes" : "No"}</h4>
            </div>

            <br></br>

            <div className="combat-powers">
              <h3>Weapons & Abilities:</h3>
              <br></br>
              {currentPlayer.powers?.length ? (
                currentPlayer.powers.map((power, index) => {
                  const resource = masterResources.find(r => r.type === power.type);
                  if (!resource) return null;

                  const value = (resource.qtycollected || 1) * (power.quantity || 0);
                  const outputLabel = resource.output ? (strings[resource.output] || resource.output) : 'Unknown';
                  return (
                    <h4 key={index}>
                      <span className="stat-total blue-text">
                      <strong>{resource.type}</strong> <br></br> ({value > 0 ? '+' : ''}{value} for {outputLabel})
                      </span>
                    </h4>
                  );
                })
              ) : (
                <p>No extra weapons or abilities.</p>
              )}
            </div>
          </>
        )}
      </div>
      <br />
      <br />
      <button className="resource-button" onClick={handleRefreshCombatStats}>
        🔄 Fix Combat Stats
      </button>
    </Panel>
  );
};

export default React.memo(CombatPanel);