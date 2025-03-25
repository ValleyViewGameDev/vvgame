import React, { useState } from 'react';
import axios from 'axios';
import Panel from '../UI/Panel';
import CreateAccount from './CreateAccount';
import '../UI/Panel.css'; // Use the standardized styles

const LoginPanel = ({ onClose, setCurrentPlayer, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      console.log('Login attempt:', { username, password });

      const response = await axios.post('http://localhost:3001/api/login', { username, password });
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
          setIsLoggedIn={() => {
            setShowCreateAccount(false);
            onClose();
          }}
        />
      ) : (
        <div className="panel-content">
          <form onSubmit={handleLogin} className="panel-form">
            <div className="form-group">

            <div className="panel-buttons">
            <h3>Don't have an account yet? Create a free account to start playing:</h3>
              <button
                type="button"
                className="btn-success"
                onClick={() => setShowCreateAccount(true)}
              >
                Create Account
              </button>
            </div>  
            <h4>With a new account, you'll be granted your own homestead to cultivate in a Settlement with other players, in a Frontier full of Settlements. Adventure awits you in the Valley.</h4>

            <h3>Have an existing account?</h3>

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
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="error-message">{error}</p>}

            <div className="panel-buttons">
              <button type="submit" className="btn-success">
                Login
              </button>
            </div>
          </form>
        </div>
      )}
    </Panel>
  );
};

export default LoginPanel;
