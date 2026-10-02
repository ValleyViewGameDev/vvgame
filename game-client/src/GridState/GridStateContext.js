import React, { createContext, useContext, useState } from 'react';

const GridStateContext = createContext();
const GridStateUpdateContext = createContext();

export const useGridState = () => useContext(GridStateContext);
export const useGridStateUpdate = () => useContext(GridStateUpdateContext);

export function GridStateProvider({ children }) {
  const [NPCsInGrid, setGridState] = useState({});

  return (
    <GridStateContext.Provider value={NPCsInGrid}>
      <GridStateUpdateContext.Provider value={setGridState}>
        {children}
      </GridStateUpdateContext.Provider>
    </GridStateContext.Provider>
  );
}