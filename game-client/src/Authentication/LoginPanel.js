import API_BASE from '../config';
import React, { useState } from 'react';
import axios from 'axios';
import Panel from '../UI/Panels/Panel';
import CreateAccount from './CreateAccount';
import '../UI/Panels/Panel.css'; 
import '../UI/Buttons/SharedButtons.css'; 

import { useStrings } from '../UI/StringsContext';

const LoginPanel = ({ onClose, setCurrentPlayer, zoomLevel, setZoomLevel, onLoginSuccess }) => {
  const strings = useStrings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      console.log('Login attempt:', { username, password });

      const response = await axios.post(`${API_BASE}/api/login`, { username, password });
      if (response.data.success) {
        const player = response.data.player;
        console.log('Login successful:', player);

        setCurrentPlayer(player); // Set player data
        localStorage.setItem('player', JSON.stringify(player)); // Store in local storage
        onClose(); // Close panel

        if (onLoginSuccess) {
          onLoginSuccess(player); // Notify parent component
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
      {showCreateAccount ? (
        <CreateAccount
          setCurrentPlayer={setCurrentPlayer}
          zoomLevel={zoomLevel}
          setZoomLevel={setZoomLevel}
          setIsLoggedIn={() => {
            setShowCreateAccount(false);
            onClose();
          }}
        />
      ) : (
        <div className="standard-panel">
          <form onSubmit={handleLogin} className="panel-form">
            <div className="form-group">

            <div className="shared-buttons">
            <h3>{strings[4001]}</h3>
              <button
                type="button"
                className="btn-basic btn-success"
                onClick={() => setShowCreateAccount(true)}
              >
                {strings[4002]}
              </button>
            </div>  
            <h4>{strings[4004]}</h4>
            <h4>{strings[4005]}</h4>

            <h3>{strings[5033]}</h3>

            <h3>{strings[4010]}</h3>

              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">{strings[4006]}</label>
              <input
                id="password"
                type="password"
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
          <div className="panel-buffer-space" />

          <div className="shared-buttons">
            <button
              className="btn-basic btn-success"
              onClick={() => window.location.href = 'mailto:valleyviewgamedev@gmail.com'}
            >
              {strings[97]}
            </button>
          </div>

        </div>
        
      )}
    </Panel>
  );
};

export default LoginPanel;
