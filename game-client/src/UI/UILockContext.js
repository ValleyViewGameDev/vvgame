import React, { createContext, useContext, useState } from 'react';

const UILockContext = createContext();

export const UILockProvider = ({ children }) => {
  const [uiLocked, setUILocked] = useState(false);
  return (
    <UILockContext.Provider value={{ uiLocked, setUILocked }}>
      {children}
    </UILockContext.Provider>
  );
};

export const useUILock = () => useContext(UILockContext);