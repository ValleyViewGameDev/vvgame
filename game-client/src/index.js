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

const savedPlayer = localStorage.getItem('player');
const savedLanguage = savedPlayer ? JSON.parse(savedPlayer)?.language : 'en';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <UILockProvider>
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
    </UILockProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
