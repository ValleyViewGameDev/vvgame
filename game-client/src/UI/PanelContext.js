import React, { createContext, useContext, useState } from 'react';

const PanelContext = createContext();

export const PanelProvider = ({ children }) => {
  const [activePanel, setActivePanel] = useState(null);

  React.useEffect(() => {
    const id = Math.floor(Math.random() * 10000);
    console.log(`🧩 PanelProvider mounted. ID: ${id}`);
    return () => console.warn(`🧨 PanelProvider unmounted. ID: ${id}`);
  }, []);

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
