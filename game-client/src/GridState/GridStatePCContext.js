import React, { createContext, useContext, useState } from 'react';

const GridStatePCContext = createContext();
const GridStatePCUpdateContext = createContext();

export const useGridStatePCs = () => useContext(GridStatePCContext);
export const useGridStatePCUpdate = () => useContext(GridStatePCUpdateContext);

export function GridStatePCProvider({ children }) {
  const [gridStatePCs, setGridStatePCs] = useState({});

  return (
    <GridStatePCContext.Provider value={gridStatePCs}>
      <GridStatePCUpdateContext.Provider value={setGridStatePCs}>
        {children}
      </GridStatePCUpdateContext.Provider>
    </GridStatePCContext.Provider>
  );
}
