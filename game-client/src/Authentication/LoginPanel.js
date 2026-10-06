import API_BASE from '../config';
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Panel from '../UI/Panels/Panel';
import CreateAccount from './CreateAccount';
import '../UI/Panels/Panel.css';
import '../UI/Buttons/SharedButtons.css';
import './Authentication.css';

import { useStrings } from '../UI/StringsContext';
import soundManager from '../Sound/SoundManager';
import { sendPageviewBeacon } from '../Utils/pageviewBeacon';
import { authErrorText } from './authErrors';
import { isGoogleAvailable, renderGoogleButton, loginWithGoogle } from './googleSignIn';

// initialUsername / initialView come from a `?signin=1&u=<name>` link (App.js): the sign-in form
// opens prefilled so a returning player never creates a second profile by mistake.
const LoginPanel = ({ onClose, setCurrentPlayer, zoomLevel, setZoomLevel, onLoginSuccess, initialUsername = '', initialView = 'signin' }) => {
  const strings = useStrings();
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showLoginExistingAccount, setShowLoginExistingAccount] = useState(initialView === 'signin');
  const googleRef = useRef(null);

  // Google button (sign in, or a new account with the Google email on file). Hidden when no
  // client id is configured or inside an in-app browser.
  useEffect(() => {
    if (!showLoginExistingAccount) return;
    const tryRender = () => renderGoogleButton(googleRef.current, async (credential) => {
      try {
        const data = await loginWithGoogle(credential);
        if (data?.success && data.player) {
          localStorage.setItem('player', JSON.stringify(data.player));
          localStorage.setItem('initialZoomLevel', 'close');
          window.location.reload();
        } else setError(authErrorText(data, strings, strings[4119]));
      } catch (err) { setError(authErrorText(err, strings, strings[4119])); }
    });
    if (!tryRender()) { const t = setTimeout(tryRender, 1500); return () => clearTimeout(t); } // GIS script may still be loading
  }, [showLoginExistingAccount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play login screen music on mount, stop on unmount
  useEffect(() => {
    sendPageviewBeacon();   // anonymous landing beacon, once per day (docs/analytics.md); silentAccount.js sends it for new visitors
    soundManager.playTrack('valley1_1.mp3', true);
    return () => {
      soundManager.stop();
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      // A passwordless profile signs in with the name alone; the field stays optional.
      const response = await axios.post(`${API_BASE}/api/login`, { username: username.trim(), password: password || '' });
      if (response.data.success) {
        const player = response.data.player;
        setCurrentPlayer(player);
        localStorage.setItem('player', JSON.stringify(player));
        onClose();

        if (onLoginSuccess) {
          onLoginSuccess(player);
        }
      } else {
        setError(authErrorText(response.data, strings, 'Invalid username or password'));
      }
    } catch (err) {
      console.error('Error during login:', err);
      setError(authErrorText(err, strings, 'Login failed. Please try again.'));
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1021" titleKey="1121" panelName="LoginPanel">
      {showLoginExistingAccount ? (

// Existing account login form
        <div className="standard-panel">
          <h3>{strings[4010]}</h3>

          <form onSubmit={handleLogin} className="panel-form login-panel-form">
            <div className="form-group">
              <input
                id="username"
                type="text"
                className="login-form-input"
                placeholder={strings[4003] || "Username"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <input
                id="password"
                type="password"
                className="login-form-input"
                placeholder={strings[4072]}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="error-message">{error}</p>}

            <div className="shared-buttons">
              <button type="submit" className="btn-basic btn-neutral">
                {strings[4007]}
              </button>
            </div>
          </form>

          {isGoogleAvailable() && (
            <div className="login-google">
              <p className="login-divider">{strings[4117]}</p>
              <div ref={googleRef} className="login-google-button" />
            </div>
          )}

          <div className="panel-buffer-space" />

          <p className="login-link-text">
            <a href="#" onClick={(e) => { e.preventDefault(); setShowLoginExistingAccount(false); }}>
              {strings[4001]}
            </a>
          </p>
        </div>
      ) : (
        // New account creation (default view)
        <div className="standard-panel">

          <CreateAccount
            setCurrentPlayer={setCurrentPlayer}
            zoomLevel={zoomLevel}
            setZoomLevel={setZoomLevel}
            setIsLoggedIn={() => {
              onClose();
            }}
          />

          <p className="login-link-text">
            <a href="#" onClick={(e) => { e.preventDefault(); setShowLoginExistingAccount(true); }}>
              {strings[4010]}
            </a>
          </p>

          <div className="panel-buffer-space" />

          <p className="login-link-text">
            <a href="mailto:valleyviewgamedev@gmail.com">
              {strings[97]}
            </a>
          </p>
        </div>
      )}
    </Panel>
  );
};

export default LoginPanel;
