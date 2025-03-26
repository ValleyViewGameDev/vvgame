import React, { createContext, useContext, useState } from 'react';

const PanelContext = createContext();

export const PanelProvider = ({ children }) => {
  const [activePanel, setActivePanel] = useState(null);

  const openPanel = (panelName) => {
    setActivePanel(panelName);
  };
  const closePanel = () => {
    setActivePanel(null);
  };
  return (
    <PanelContext.Provider value={{ activePanel, openPanel, closePanel }}>
      {children}
    </PanelContext.Provider>
  );
};
export const usePanelContext = () => {
  return useContext(PanelContext);
};
