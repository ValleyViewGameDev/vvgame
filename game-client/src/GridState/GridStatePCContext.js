import React, { createContext, useContext, useState } from 'react';

const GridStatePCContext = createContext();
const GridStatePCUpdateContext = createContext();

export const usePlayersInGrid = () => useContext(GridStatePCContext);
export const useGridStatePCUpdate = () => useContext(GridStatePCUpdateContext);

export function GridStatePCProvider({ children }) {
  const [playersInGrid, setPlayersInGrid] = useState({});

  return (
    <GridStatePCContext.Provider value={playersInGrid}>
      <GridStatePCUpdateContext.Provider value={setPlayersInGrid}>
        {children}
      </GridStatePCUpdateContext.Provider>
    </GridStatePCContext.Provider>
  );
}
