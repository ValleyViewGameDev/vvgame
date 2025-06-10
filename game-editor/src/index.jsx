// game-editor/src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { FileProvider } from './FileContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FileProvider>
      <App />
    </FileProvider>
  </React.StrictMode>
);