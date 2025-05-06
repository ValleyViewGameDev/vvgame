import React, { createContext, useContext, useState } from 'react';

const GridStatePCContext = createContext();
const GridStatePCUpdateContext = createContext();

export const useGridStatePCs = () => useContext(GridStatePCContext);
export const useGridStatePCUpdate = () => useContext(GridStatePCUpdateContext);

let externalSetGridStatePCs = null;
export const setGridStatePCsExternally = (stateOrUpdater) => {
  if (externalSetGridStatePCs) {
    console.log("🛰️ setGridStatePCsExternally called:", stateOrUpdater);
    externalSetGridStatePCs(stateOrUpdater);
  }
};

export function GridStatePCProvider({ children }) {
  const [gridStatePCs, setGridStatePCs] = useState({});
  externalSetGridStatePCs = setGridStatePCs;

  return (
    <GridStatePCContext.Provider value={gridStatePCs}>
      <GridStatePCUpdateContext.Provider value={setGridStatePCs}>
        {children}
      </GridStatePCUpdateContext.Provider>
    </GridStatePCContext.Provider>
  );
}
