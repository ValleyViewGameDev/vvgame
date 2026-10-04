import React, { createContext, useContext, useState, useRef } from 'react';

const PanelContext = createContext();

// Same media list as UI/Styles/mobile.css: on phones a closing panel slides out before it
// unmounts. The animation is CSS (`body.panel-closing .panel-container`); this only delays
// the unmount for its duration. Desktop closes instantly as before.
const PHONE_MEDIA = '(max-width: 767px), (max-height: 500px) and (orientation: landscape)';
const CLOSE_ANIMATION_MS = 240;
const isPhone = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia(PHONE_MEDIA).matches;

export const PanelProvider = ({ children }) => {
  const [activePanel, setActivePanel] = useState(null);
  const closingTimerRef = useRef(null);

  const cancelClosing = () => {
    if (closingTimerRef.current) { clearTimeout(closingTimerRef.current); closingTimerRef.current = null; }
    document.body.classList.remove('panel-closing');
  };

  const openPanel = (panelName) => {
    cancelClosing();
    setActivePanel(panelName);
  };
  const closePanel = () => {
    if (!isPhone() || closingTimerRef.current) { cancelClosing(); setActivePanel(null); return; }
    document.body.classList.add('panel-closing');
    closingTimerRef.current = setTimeout(() => {
      closingTimerRef.current = null;
      document.body.classList.remove('panel-closing');
      setActivePanel(null);
    }, CLOSE_ANIMATION_MS);
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
