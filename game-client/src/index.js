import React from 'react';
import { StringsProvider } from './UI/StringsContext';
import ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { StatusBarProvider } from './UI/StatusBar';
import { PanelProvider } from './UI/PanelContext'; 
import { GridStateProvider } from './GridState/GridStateContext';
import { GridStatePCProvider } from './GridState/GridStatePCContext';
import { ModalProvider } from './UI/ModalContext';
import { UILockProvider } from './UI/UILockContext';
import { NPCOverlayProvider } from './UI/NPCOverlayContext';
import { BulkOperationProvider } from './UI/BulkOperationContext';

console.warn("🔥 index.js evaluated again — app may remount");

// Prevent HMR from creating multiple instances
if (window.__app_initialized__) {
  console.log("🛑 App already initialized, preventing HMR remount");
  // Don't execute the rest of the file
} else {
  window.__app_initialized__ = true;

// Cache the language to prevent provider recreation when player data changes
let cachedLanguage = 'en';
try {
  const savedPlayer = localStorage.getItem('player');
  if (savedPlayer) {
    const parsedPlayer = JSON.parse(savedPlayer);
    if (parsedPlayer?.language) {
      cachedLanguage = parsedPlayer.language;
    }
  }
} catch (e) {
  console.warn('Failed to parse player data for language:', e);
}
const savedLanguage = cachedLanguage;
const rootEl = document.getElementById('root');
console.log("🪵 root element:", rootEl);

if (!window.__root_created__) {
  console.warn("🧪 Creating React root");
  window.__root_created__ = true;
  window.__root = ReactDOM.createRoot(rootEl);
} else {
  console.error("❌ React root was already created!");
}

if (!window.__app_rendered__) {
  console.warn("🧪 Rendering App...");
  window.__app_rendered__ = true;
  window.__root.render(
    <UILockProvider>
      <NPCOverlayProvider>
        <BulkOperationProvider>
          <StringsProvider language={savedLanguage}>
            <GridStateProvider>
              <GridStatePCProvider>
                <StatusBarProvider>
                  <PanelProvider>
                    <ModalProvider>
                      <App />
                    </ModalProvider>
                  </PanelProvider>
                </StatusBarProvider>
              </GridStatePCProvider>
            </GridStateProvider>
          </StringsProvider>
        </BulkOperationProvider>
      </NPCOverlayProvider>
    </UILockProvider>
  );
} else {
  console.error("❌ App already rendered — something is wrong");
}

} // Close the main HMR prevention block

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
