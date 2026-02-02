import API_BASE from '../config';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import { useStrings } from '../UI/StringsContext';
import LANGUAGE_OPTIONS from '../UI/Languages.json';
import { enabledLanguages } from '../UI/Modals/LanguagePickerModal';
import PlayerIcons from './PlayerIcons.json';
import '../UI/Buttons/SharedButtons.css';
import './Authentication.css';
import '../GameFeatures/FTUE/FTUE.css';
import { trackAccountCreation } from '../Utils/conversionTracking';

// Detect browser type from userAgent
const getBrowserType = () => {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  return 'Unknown';
};

// Detect OS type and version from userAgent
const getOSType = () => {
  const userAgent = navigator.userAgent;

  // Windows: "Windows NT 10.0" -> "Windows 10" (NT 10.0 = Win 10/11, 6.3 = 8.1, 6.1 = 7)
  const windowsMatch = userAgent.match(/Windows NT (\d+\.\d+)/);
  if (windowsMatch) {
    const ntVersion = windowsMatch[1];
    const versionMap = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' };
    return `Windows ${versionMap[ntVersion] || ntVersion}`;
  }

  // macOS: "Mac OS X 10_15_7" or "Mac OS X 10.15.7"
  const macMatch = userAgent.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
  if (macMatch) {
    return `MacOS ${macMatch[1].replace(/_/g, '.')}`;
  }

  // iOS: "iPhone OS 15_0" or "CPU OS 15_0"
  const iosMatch = userAgent.match(/(?:iPhone|iPad|iPod).*?OS (\d+[._]\d+)/);
  if (iosMatch) {
    return `iOS ${iosMatch[1].replace(/_/g, '.')}`;
  }

  // Android: "Android 12"
  const androidMatch = userAgent.match(/Android (\d+(?:\.\d+)?)/);
  if (androidMatch) {
    return `Android ${androidMatch[1]}`;
  }

  // Linux (no version typically available)
  if (userAgent.includes('Linux')) return 'Linux';

  return 'Unknown';
};

// Gather device and network diagnostics for analytics
const getDiagnostics = async () => {
  // Measure latency with a ping
  let latency = null;
  try {
    const pingStart = performance.now();
    await axios.get(`${API_BASE}/api/ping`);
    latency = Math.round(performance.now() - pingStart);
  } catch {
    latency = -1; // Failed to measure
  }

  // Check WebGL support
  let webglSupported = false;
  try {
    const canvas = document.createElement('canvas');
    webglSupported = !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    webglSupported = false;
  }

  return {
    // Network
    latency,
    connectionType: navigator.connection?.effectiveType || null, // '4g', '3g', '2g', 'slow-2g'
    downlink: navigator.connection?.downlink || null, // Mbps

    // Screen and viewport
    screenWidth: window.screen?.width || null,
    screenHeight: window.screen?.height || null,
    viewportWidth: window.innerWidth || null,
    viewportHeight: window.innerHeight || null,
    devicePixelRatio: window.devicePixelRatio || null,

    // Device capabilities
    deviceMemory: navigator.deviceMemory || null, // GB (Chrome only)
    hardwareConcurrency: navigator.hardwareConcurrency || null, // CPU cores

    // Platform detection
    isMobile: /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,

    // Rendering capability
    webglSupported,

    // Timezone
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
  };
};

const CreateAccount = ({ setCurrentPlayer, zoomLevel, setZoomLevel, setIsLoggedIn, closeModal }) => {
  const strings = useStrings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('en');
  const [selectedIcon, setSelectedIcon] = useState(PlayerIcons.free[0].value);
  const [iconScrollIndex, setIconScrollIndex] = useState(0);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [headerPosition, setHeaderPosition] = useState(null);

  // Track the position of the "Create a New Profile" header for the doinker
  useEffect(() => {
    const findHeader = () => {
      const header = document.querySelector('#create-account-form h2');
      if (!header) return null;
      const rect = header.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top,
      };
    };

    const position = findHeader();
    if (position) setHeaderPosition(position);

    const interval = setInterval(() => {
      const newPosition = findHeader();
      setHeaderPosition(newPosition);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Number of icons visible in the carousel at once
  const visibleIconCount = 3;
  const freeIcons = PlayerIcons.free;
  const maxScrollIndex = Math.max(0, freeIcons.length - visibleIconCount);

  const scrollIconsLeft = () => {
    setIconScrollIndex(prev => Math.max(0, prev - 1));
  };

  const scrollIconsRight = () => {
    setIconScrollIndex(prev => Math.min(maxScrollIndex, prev + 1));
  };

const handleCreateAccount = async (e) => {
  e.preventDefault();
  if (isSubmitting) return;

  // Validate required fields
  if (!username.trim()) {
    setError('Enter a username');
    return;
  }
  if (!password.trim()) {
    setError('Enter a password');
    return;
  }

  setError(''); // Clear any previous errors
  setIsSubmitting(true);

  try {
    const frontierName = 'Valley View 1';

    // 1. Fetch the Frontier by Name
    const frontierResponse = await axios.get(`${API_BASE}/api/frontiers-by-name`, { params: { name: frontierName } });
    if (!frontierResponse.data || frontierResponse.data.length === 0) throw new Error('Frontier not found');
    const frontier = frontierResponse.data[0];

    // Note: We no longer search for available homesteads at registration time.
    // Homestead is created when player buys Home Deed from Constable Elbow.
    // Player starts in the Cave dungeon for FTUE.

    // 2. Gather diagnostics (includes latency ping)
    const diagnostics = await getDiagnostics();

    // 3. Register player - server handles starting location (Cave dungeon)
    const registerPayload = {
      username,
      password,
      language,
      icon: selectedIcon,
      frontierId: frontier._id,
      // Browser and OS detection for analytics
      browser: getBrowserType(),
      os: getOSType(),
      // Device and network diagnostics
      diagnostics,
    };

    console.log('Calling /api/register-new-player with payload:', registerPayload);
    const response = await axios.post(`${API_BASE}/api/register-new-player`, registerPayload);
    if (!response.data.success || !response.data.player) {
      throw new Error('Player registration failed');
    }

    const player = response.data.player;

    // FTUE: Use the server-assigned location (Cave dungeon for first-time users)
    // The server sets the correct starting location in auth.js
    console.log('✅ Player registered with location:', player.location);

    // Track the successful account creation for ad platforms
    trackAccountCreation(player.username, player._id || player.playerId);

    // 4. Finalize account setup
    setCurrentPlayer(player);
    localStorage.removeItem('player');
    localStorage.setItem('player', JSON.stringify(player));

    // 5. Save PC to the starting grid (server-assigned location)
    const startingGridId = player.location.g;
    const now = Date.now();
    const newPC = {
      playerId: player._id,
      type: 'pc',
      username: player.username,
      position: { x: player.location.x, y: player.location.y },
      icon: player.icon || '😀',
      hp: player.baseHp || 25,
      maxhp: player.baseMaxhp || 25,
      attackbonus: player.baseAttackbonus || 1,
      armorclass: player.baseArmorclass || 1,
      damage: player.baseDamage || 1,
      attackrange: player.baseAttackrange || 1,
      speed: player.baseSpeed || 1,
      iscamping: false,
      isinboat: false,
      lastUpdated: now,
    };

    const payload = {
      gridId: startingGridId,
      playerId: player._id,
      pc: newPC,
      lastUpdated: now,
    };

    await axios.post(`${API_BASE}/api/save-single-pc`, payload);

    // Note: Server already set the correct location, no need to update it

    // 7. Send welcome message
    try {
      await axios.post(`${API_BASE}/api/send-mailbox-message`, {
        playerId: player._id,
        messageId: 1,
      });
    } catch (mailError) {
      console.error("❌ Failed to send welcome message:", mailError);
    }

    // 8. Close modal and reload
    if (closeModal) closeModal();
    localStorage.setItem("initialZoomLevel", "close");
    window.location.reload();

  } catch (err) {
    console.error('Error during account creation:', err);
    setError(err.response?.data?.error || 'Account creation failed. Please try again.');
    setIsSubmitting(false);
  }
};

return (
  <>
  <div id="create-account-form">

    <div className="panel-buffer-space" />

    <h2>{strings[4002]}</h2>
    <form onSubmit={handleCreateAccount}>
      <input
        type="text"
        placeholder={strings[4069] || "Choose Username"}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder={strings[4070] || "Select a Password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      >
        <option value="">{strings[4067]}</option>
        {LANGUAGE_OPTIONS
          .filter(({ code }) => enabledLanguages.includes(code))
          .map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
      </select>

      {/* Avatar Selection */}
      <div className="avatar-carousel">
        <button
          type="button"
          className="avatar-scroll-btn"
          onClick={scrollIconsLeft}
          disabled={iconScrollIndex === 0}
        >
          ◀
        </button>
        <div className="avatar-icons-viewport">
          <div
            className="avatar-icons-container"
            style={{ transform: `translateX(-${iconScrollIndex * 45}px)` }}
          >
            {freeIcons.map((icon) => (
              <button
                key={icon.value}
                type="button"
                className={`avatar-icon-btn ${selectedIcon === icon.value ? 'selected' : ''}`}
                onClick={() => setSelectedIcon(icon.value)}
                title={icon.label}
              >
                {icon.value}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="avatar-scroll-btn"
          onClick={scrollIconsRight}
          disabled={iconScrollIndex >= maxScrollIndex}
        >
          ▶
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="shared-buttons">
        <button className="btn-basic btn-success" type="submit" disabled={isSubmitting} style={{ fontSize: '18px' }}>
          {strings[4068] || "Begin!"}
        </button>
      </div>


    </form>

    </div>

    {/* Doinker arrow pointing to "Create a New Profile" header */}
    {headerPosition && createPortal(
      <div
        className="ftue-doinker-button"
        style={{
          left: `${headerPosition.x - 15}px`,
          top: `${headerPosition.y - 50}px`,
          width: '30px',
          height: '40px',
        }}
      >
        <svg
          width={30}
          height={40}
          viewBox="0 0 40 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="ftue-doinker-arrow"
        >
          <path
            d="M15 0 L15 35 L5 35 L20 60 L35 35 L25 35 L25 0 Z"
            fill="#e53935"
            stroke="#b71c1c"
            strokeWidth="2"
          />
          <path
            d="M17 2 L17 33 L20 33 L20 2 Z"
            fill="#ff6f60"
            opacity="0.6"
          />
        </svg>
      </div>,
      document.body
    )}
    </>
  );
};

export default CreateAccount;