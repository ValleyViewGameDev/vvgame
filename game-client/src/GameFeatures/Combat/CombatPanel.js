import './CombatPanel.css';
import API_BASE from '../../config';
import React, { useState, useEffect, useContext, useRef } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import playersInGridManager from '../../GridState/PlayersInGrid';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import soundManager from '../../Sound/SoundManager';
import { gameConfirm, gameAlert } from '../../UI/Modals/GameDialog';
import { loadGlobalTuning } from '../../Utils/TuningManager';
import {
  isWeapon, isShield, isArmor, isMagic, handsOf, handsIcon, shieldUsable, gearStatLines,
  magicSlotCount, nextMagicSlotCost, equippedMagicTypes,
} from './combatGear';

const COLLAPSE_KEY = 'combatPanelCollapsed';

const readCollapsed = () => {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}') || {}; } catch (e) { return {}; }
};

// A blue stat number that pulses when it changes: green when the player got better, berry when
// worse (`lowerIsBetter` for speed, where a smaller number is a faster swing). The first real
// reading after the panel opens sets the baseline without a pulse.
const PulseNumber = ({ value, ready, lowerIsBetter = false, children }) => {
  const prev = useRef(null);
  const [fx, setFx] = useState(null);
  useEffect(() => {
    if (!ready) return;
    if (prev.current !== null && prev.current !== value) {
      const up = value > prev.current;
      setFx({ key: Date.now(), good: lowerIsBetter ? !up : up });
    }
    prev.current = value;
  }, [value, ready, lowerIsBetter]);
  return (
    <span key={fx?.key || 0} className={`stat-total blue-text${fx ? (fx.good ? ' stat-pulse-up' : ' stat-pulse-down') : ''}`}>
      {children ?? value}
    </span>
  );
};

// A collapsible block of the panel; its open / closed state is remembered per viewer
const Section = ({ id, title, sub, collapsed, onToggle, children }) => (
  <div className={`combat-section combat-section-${id}`}>
    <button type="button" className="combat-section-header" aria-expanded={!collapsed} onClick={() => onToggle(id)}>
      <h3>{title}</h3>
      <span className="combat-section-arrow">{collapsed ? '▸' : '▾'}</span>
    </button>
    {!collapsed && (
      <div className="combat-section-body">
        {sub && <div className="combat-section-sub">{sub}</div>}
        {children}
      </div>
    )}
  </div>
);

const CombatPanel = ({ onClose, currentPlayer, setCurrentPlayer, setInventory, masterResources }) => {
  const strings = useStrings();
  const { updateStatus } = useContext(StatusBarContext);
  const [playerStats, setPlayerStats] = useState({});
  const [globalTuning, setGlobalTuning] = useState(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [buyingSlot, setBuyingSlot] = useState(false);

  useEffect(() => { loadGlobalTuning().then(setGlobalTuning); }, []);

  const toggleSection = (id) => setCollapsed((prev) => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch (e) { /* per-viewer nicety only */ }
    return next;
  });

  const defOf = (type) => masterResources.find((r) => r.type === type);
  const settings = currentPlayer.settings || {};
  const magicSlots = magicSlotCount(currentPlayer, globalTuning);
  const equippedMagic = equippedMagicTypes(currentPlayer, masterResources, globalTuning);
  const shieldOk = shieldUsable(currentPlayer, masterResources);

  // Every gear change is optimistic (house rule): the player record and the live stats change on
  // the tap, the server is told in parallel, and a failure puts the old record back.
  const applyGearChange = async ({ settings: nextSettings, powers: nextPowers }, failMessage) => {
    const before = currentPlayer;
    const updatedPlayer = {
      ...currentPlayer,
      ...(nextSettings ? { settings: nextSettings } : {}),
      ...(nextPowers ? { powers: nextPowers } : {}),
    };
    setCurrentPlayer(updatedPlayer);
    playersInGridManager.refreshCombatStats(updatedPlayer).then(readStats);
    try {
      await Promise.all([
        nextSettings && axios.post(`${API_BASE}/api/update-profile`, { playerId: currentPlayer.playerId, updates: { settings: nextSettings } }),
        nextPowers && axios.post(`${API_BASE}/api/update-powers`, { playerId: currentPlayer.playerId, powers: nextPowers }),
      ]);
      return true;
    } catch (error) {
      console.error(failMessage, error);
      setCurrentPlayer(before);
      playersInGridManager.refreshCombatStats(before);
      updateStatus(failMessage);
      return false;
    }
  };

  const equipSingle = (slotKey, type) => {
    const next = { ...settings, [slotKey]: type };
    // a two-handed weapon takes the shield hand
    if (slotKey === 'equippedWeapon' && handsOf(defOf(type)) === 2) next.equippedShield = null;
    soundManager.playSFX('equip');
    applyGearChange({ settings: next }, 'Failed to change equipment');
  };

  const toggleMagic = (type) => {
    const on = equippedMagic.includes(type);
    if (!on && equippedMagic.length >= magicSlots) return;
    const next = { ...settings, equippedMagic: on ? equippedMagic.filter((t) => t !== type) : [...equippedMagic, type] };
    soundManager.playSFX('equip');
    applyGearChange({ settings: next }, 'Failed to change enhancements');
  };

  // Discard: drop a piece of gear for good (old gear the player will never wear again)
  const handleDiscard = async (powerType) => {
    const ok = await gameConfirm({
      title: strings[10203] || 'Discard?',
      message: strings[10204] || 'You will lose this item permanently.',
      confirmLabel: strings[2028] || 'Yes',
      danger: true,
    });
    if (!ok) return;
    const next = { ...settings };
    for (const key of ['equippedWeapon', 'equippedArmor', 'equippedShield']) if (next[key] === powerType) next[key] = null;
    if (Array.isArray(next.equippedMagic)) next.equippedMagic = next.equippedMagic.filter((t) => t !== powerType);
    soundManager.playSFX('equip');
    applyGearChange({ settings: next, powers: (currentPlayer.powers || []).filter((p) => p.type !== powerType) }, 'Failed to discard item');
  };

  // Upgrade: buy the next magic slot for gems (globalTuning.combat.magicSlotGemCosts). The
  // server holds the gems, so this one waits for its answer.
  const handleUpgradeSlots = async () => {
    const gems = nextMagicSlotCost(currentPlayer, globalTuning);
    if (gems === null) { gameAlert({ message: strings[10216] || 'You have every enhancement slot.' }); return; }
    const ok = await gameConfirm({
      title: strings[10213] || 'More Enhancements',
      message: (strings[10214] || 'Equip {next} enhancements instead of {count}.').replace('{next}', magicSlots + 1).replace('{count}', magicSlots),
      confirmLabel: (strings[10215] || 'Buy for 💎 {gems}').replace('{gems}', gems.toLocaleString()),
    });
    if (!ok || buyingSlot) return;
    setBuyingSlot(true);
    try {
      const { data } = await axios.post(`${API_BASE}/api/player/buy-magic-slot`, { playerId: currentPlayer.playerId, currentSlots: magicSlots });
      setCurrentPlayer((prev) => ({ ...prev, magicSlots: data.magicSlots, inventory: data.inventory, backpack: data.backpack }));
      if (setInventory && data.inventory) setInventory(data.inventory);
      soundManager.playSFX('skill_earned');
    } catch (error) {
      const code = error.response?.data?.code;
      if (code === 'not-enough-gems') gameAlert({ message: strings[10217] || 'Not enough Gems.' });
      else if (code === 'stale' && Number.isFinite(error.response.data.magicSlots)) setCurrentPlayer((prev) => ({ ...prev, magicSlots: error.response.data.magicSlots }));
      else { console.error('Error buying a magic slot:', error); updateStatus('Failed to buy a slot'); }
    } finally {
      setBuyingSlot(false);
    }
  };

  function readStats() {
    const stats = playersInGridManager.getAllPCs(currentPlayer.location.g)?.[currentPlayer._id];
    if (stats) setPlayerStats({ ...stats });
  }

  useEffect(() => {
    const interval = setInterval(() => {
      const stats = playersInGridManager.getAllPCs(currentPlayer.location.g)?.[currentPlayer._id];
      if (stats) setPlayerStats(stats);
    }, 500);
    return () => clearInterval(interval);
  }, [currentPlayer._id, currentPlayer.location.g]);

  const getStatBreakdown = (stat) => {
    const total = playerStats?.[stat] || 0;
    const basePropertyName = stat === 'maxhp' ? 'baseMaxhp' : stat === 'hp' ? 'baseHp' : `base${stat.charAt(0).toUpperCase() + stat.slice(1)}`;
    const base = currentPlayer[basePropertyName] || 0;
    return { base, modifier: total - base, total };
  };

  // the lists follow the progression: lowest level first, ties by name
  const levelOf = (type) => defOf(type)?.level || 0;
  const powersByLevel = [...(currentPlayer.powers || [])]
    .sort((a, b) => (levelOf(a.type) - levelOf(b.type)) || a.type.localeCompare(b.type));
  const ownedOf = (kindTest) => powersByLevel.filter((p) => kindTest(defOf(p.type)));

  const statLines = (power, resource) => gearStatLines(resource, strings, power.quantity || 0);

  const gearRow = ({ power, checked, disabled, onToggle }) => {
    const resource = defOf(power.type);
    const stats = statLines(power, resource);
    return (
      <div key={power.type} className={`equipment-item${disabled && !checked ? ' equipment-unavailable' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onMouseDown={(e) => { setTimeout(() => e.target.blur(), 0); }} // keep focus on the board
          className="equipment-checkbox"
          disabled={disabled && !checked}
        />
        <div className="equipment-content">
          <strong>{resource.type}</strong>
          {isWeapon(resource) && (
            <span className="equipment-hands" title={handsOf(resource) === 2 ? (strings[10219] || 'Two-handed') : (strings[10218] || 'One-handed')}> {handsIcon(resource)}</span>
          )}
          <br />
          {stats.length > 0
            ? stats.map((stat, i) => <div key={i} className="equipment-stat">{stat}</div>)
            : <div className="no-combat-effects text-empty">(No combat effects)</div>}
        </div>
        <div className="shared-buttons equipment-discard">
          <button className="btn-basic btn-mini btn-success" onClick={() => handleDiscard(power.type)}>
            {strings[188] || 'Discard'}
          </button>
        </div>
      </div>
    );
  };

  const hp = getStatBreakdown('hp');
  const statsReady = Object.keys(playerStats || {}).length > 0;
  const statRow = (labelKey, stat) => {
    const s = getStatBreakdown(stat);
    const lowerIsBetter = stat === 'speed';
    return (
      <tr key={stat}>
        <td>{strings[labelKey]}: <PulseNumber value={s.modifier !== 0 ? s.total : s.base} ready={statsReady} lowerIsBetter={lowerIsBetter} /></td>
        <td className="stat-breakdown">({s.base} <PulseNumber value={s.modifier} ready={statsReady} lowerIsBetter={lowerIsBetter}>+ {s.modifier}</PulseNumber>)</td>
      </tr>
    );
  };

  const armor = ownedOf(isArmor);
  const weapons = ownedOf(isWeapon);
  const shields = ownedOf(isShield);
  const magic = ownedOf(isMagic);

  return (
    <Panel onClose={onClose} titleKey="1124" panelName="CombatPanel">
      <div className="standard-panel">
        <div className="combat-section combat-stats">
          <h3>{strings[10112]} <span className="stat-total">{hp.total}</span></h3>
          <table className="stats-table">
            <tbody>
              {statRow(550, 'maxhp')}
              {statRow(551, 'armorclass')}
              {statRow(552, 'attackbonus')}
              {statRow(553, 'damage')}
              {statRow(555, 'attackrange')}
              {statRow(554, 'speed')}
            </tbody>
          </table>
        </div>

        <Section id="armor" collapsed={!!collapsed.armor} onToggle={toggleSection} title={strings[522]} sub={strings[10205] || 'Equip 1 armor.'}>
          {armor.length > 0
            ? armor.map((power) => gearRow({
              power,
              checked: power.type === settings.equippedArmor,
              onToggle: () => equipSingle('equippedArmor', power.type === settings.equippedArmor ? null : power.type),
            }))
            : <p>{strings[523]}</p>}
        </Section>

        <Section id="weapons" collapsed={!!collapsed.weapons} onToggle={toggleSection} title={strings[524]} sub={strings[10206] || 'Equip 1 weapon.'}>
          {weapons.length > 0
            ? weapons.map((power) => gearRow({
              power,
              checked: power.type === settings.equippedWeapon,
              onToggle: () => equipSingle('equippedWeapon', power.type === settings.equippedWeapon ? null : power.type),
            }))
            : <p>{strings[525]}</p>}
        </Section>

        <Section id="shields" collapsed={!!collapsed.shields} onToggle={toggleSection} title={strings[10209] || '🛡️ Shields'} sub={shieldOk ? (strings[10210] || 'Equip 1 shield.') : (strings[10212] || 'Shields need a one-handed weapon.')}>
          {shields.length > 0
            ? shields.map((power) => gearRow({
              power,
              checked: shieldOk && power.type === settings.equippedShield,
              disabled: !shieldOk,
              onToggle: () => equipSingle('equippedShield', power.type === settings.equippedShield ? null : power.type),
            }))
            : <p>{strings[10211] || 'No shields available'}</p>}
        </Section>


        <Section
          id="magic"
          collapsed={!!collapsed.magic}
          onToggle={toggleSection}
          title={strings[526]}
          sub={(
            <div className="combat-slots">
              <span>{(strings[10207] || 'Equip {count} enhancements.').replace('{count}', magicSlots)}</span>
              <span className="shared-buttons">
                <button className="btn-basic btn-mini btn-gold" disabled={buyingSlot} onClick={handleUpgradeSlots}>
                  {strings[10208] || 'Upgrade'}
                </button>
              </span>
            </div>
          )}
        >
          {magic.length > 0
            ? magic.map((power) => {
              const on = equippedMagic.includes(power.type);
              return gearRow({ power, checked: on, disabled: equippedMagic.length >= magicSlots, onToggle: () => toggleMagic(power.type) });
            })
            : <p className="text-empty">{strings[527]}</p>}
        </Section>
      </div>
      <br />
    </Panel>
  );
};

export default React.memo(CombatPanel);
