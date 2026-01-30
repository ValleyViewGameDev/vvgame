import React, { createContext, useContext, useState } from 'react';

const GridStateContext = createContext();
const GridStateUpdateContext = createContext();

export const useGridState = () => useContext(GridStateContext);
export const useGridStateUpdate = () => useContext(GridStateUpdateContext);

let externalSetGridState = null;
export const setGridStateExternally = (state) => {
  if (externalSetGridState) {
    externalSetGridState(state);
  }
};

export function GridStateProvider({ children }) {
  const [NPCsInGrid, setGridState] = useState({});
  externalSetGridState = setGridState;

  return (
    <GridStateContext.Provider value={NPCsInGrid}>
      <GridStateUpdateContext.Provider value={setGridState}>
        {children}
      </GridStateUpdateContext.Provider>
    </GridStateContext.Provider>
  );
}