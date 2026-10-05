import API_BASE from '../config';
import { authErrorText } from './authErrors';
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
import { gatherClientInfo } from '../Utils/pageviewBeacon';
import { getBrowserType, getOSType, getDiagnostics } from '../Utils/clientDiagnostics';

// Normalize emoji by removing variation selectors (U+FE0F) for consistent matching
const normalizeEmoji = (emoji) => {
  if (!emoji) return emoji;
  return emoji.replace(/\uFE0F/g, '');
};

// Build a static lookup map from emoji value to SVG filename (created once at module load)
const iconToSvgMap = new Map();
['free', 'paid', 'platinum'].forEach(tier => {
  (PlayerIcons[tier] || []).forEach(icon => {
    if (icon.filename) {
      iconToSvgMap.set(normalizeEmoji(icon.value), icon.filename);
    }
  });
});

const CreateAccount = ({ setCurrentPlayer, zoomLevel, setZoomLevel, setIsLoggedIn, closeModal }) => {
  const strings = useStrings();
  const [username, setUsername] = useState('');
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
    setError(strings[4081]);
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
    // No password at signup (docs/onboarding-plan.md phase A): the profile signs in with the
    // name alone; a password can be added later from Profile.
    const registerPayload = {
      username: username.trim(),
      language,
      icon: selectedIcon,
      frontierId: frontier._id,
      // Browser and OS detection for analytics
      browser: getBrowserType(),
      os: getOSType(),
      // Device and network diagnostics
      diagnostics,
      // Acquisition context (utm_*, referrer, surface, visitor_id) for analytics
      clientInfo: gatherClientInfo(),
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

    // 5. The server seeds hp/maxhp and location at registration; the PC record
    //    is built from the Player on boot (no per-grid PC save).

    // The welcome mailbox message is sent by the server at registration.

    // 8. Close modal and reload
    if (closeModal) closeModal();
    localStorage.setItem("initialZoomLevel", "close");
    window.location.reload();

  } catch (err) {
    console.error('Error during account creation:', err);
    setError(authErrorText(err, strings, 'Account creation failed. Please try again.'));
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
            {freeIcons.map((icon) => {
              const svgFilename = iconToSvgMap.get(normalizeEmoji(icon.value));
              return (
                <button
                  key={icon.value}
                  type="button"
                  className={`avatar-icon-btn ${selectedIcon === icon.value ? 'selected' : ''}`}
                  onClick={() => setSelectedIcon(icon.value)}
                  title={icon.label}
                >
                  {svgFilename ? (
                    <img
                      src={`/assets/playerIcons/${svgFilename}`}
                      alt={icon.label}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    icon.value
                  )}
                </button>
              );
            })}
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