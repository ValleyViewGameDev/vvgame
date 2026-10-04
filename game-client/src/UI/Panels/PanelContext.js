import React, { createContext, useContext, useState } from 'react';

const PanelContext = createContext();

// Closing is immediate. On phones the slide-out is played by a static clone of the removed
// panel node (UI/Panels/panelExitGhost.js, installed by App.js), so every close path
// animates, including the ones that unmount a panel through other state.
export const PanelProvider = ({ children }) => {
  const [activePanel, setActivePanel] = useState(null);

  const openPanel = (panelName) => {
    setActivePanel(panelName);
  };
  const closePanel = () => {
    setActivePanel(null);
  };
  return (
    <PanelContext.Provider value={{ activePanel, openPanel, closePanel, closeAllPanels: closePanel }}>
      {children}
    </PanelContext.Provider>
  );
};
export const usePanelContext = () => {
  return useContext(PanelContext);
};
