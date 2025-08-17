import React, { createContext, useContext, useState } from 'react';

const BulkOperationContext = createContext();

export const BulkOperationProvider = ({ children }) => {
  // Track active bulk operations by type
  const [activeBulkOperations, setActiveBulkOperations] = useState({});
  
  const startBulkOperation = (operationType, operationId) => {
    setActiveBulkOperations(prev => ({
      ...prev,
      [operationId]: {
        type: operationType,
        startTime: Date.now(),
        active: true
      }
    }));
  };
  
  const endBulkOperation = (operationId) => {
    setActiveBulkOperations(prev => {
      const newState = { ...prev };
      delete newState[operationId];
      return newState;
    });
  };
  
  const isAnyBulkOperationActive = () => {
    return Object.keys(activeBulkOperations).length > 0;
  };
  
  const getActiveBulkOperations = () => {
    return Object.entries(activeBulkOperations).map(([id, operation]) => ({
      id,
      ...operation
    }));
  };
  
  return (
    <BulkOperationContext.Provider value={{ 
      activeBulkOperations,
      startBulkOperation,
      endBulkOperation,
      isAnyBulkOperationActive,
      getActiveBulkOperations
    }}>
      {children}
    </BulkOperationContext.Provider>
  );
};

export const useBulkOperation = () => {
  const context = useContext(BulkOperationContext);
  if (!context) {
    throw new Error('useBulkOperation must be used within a BulkOperationProvider');
  }
  return context;
};