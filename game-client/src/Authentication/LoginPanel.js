import API_BASE from '../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Panel from '../UI/Panels/Panel';
import CreateAccount from './CreateAccount';
import '../UI/Panels/Panel.css';
import '../UI/Buttons/SharedButtons.css';
import './Authentication.css';

import { useStrings } from '../UI/StringsContext';
import soundManager from '../Sound/SoundManager';

const LoginPanel = ({ onClose, setCurrentPlayer, zoomLevel, setZoomLevel, onLoginSuccess }) => {
  const strings = useStrings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showLoginExistingAccount, setShowLoginExistingAccount] = useState(false);

  // Play login screen music on mount, stop on unmount
  useEffect(() => {
    soundManager.playTrack('valley1_1.mp3', true);
    return () => {
      soundManager.stop();
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_BASE}/api/login`, { username, password });
      if (response.data.success) {
        const player = response.data.player;
        setCurrentPlayer(player);
        localStorage.setItem('player', JSON.stringify(player));
        onClose();

        if (onLoginSuccess) {
          onLoginSuccess(player);
        }
      } else {
        setError(response.data.error || 'Invalid username or password');
      }
    } catch (err) {
      console.error('Error during login:', err);
      setError('Login failed. Please try again.');
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
                placeholder={strings[4006] || "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="error-message">{error}</p>}

            <div className="shared-buttons">
              <button type="submit" className="btn-basic btn-neutral">
                {strings[4007]}
              </button>
            </div>
          </form>

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
