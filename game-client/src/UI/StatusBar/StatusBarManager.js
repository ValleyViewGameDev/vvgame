import { useContext } from 'react';
import { StatusBarContext } from '../StatusBar/StatusBar';

let updateStatusGlobal; // Define a global variable to store updateStatus

export const useStatusBarManager = () => {
  const { updateStatus } = useContext(StatusBarContext);
  updateStatusGlobal = updateStatus; // Set the global updateStatus function
};

export const setStatusMessage = (index) => {
  if (updateStatusGlobal) {
    updateStatusGlobal(index); // Use the global function to update the status
  } else {
    console.warn('StatusBarManager: Status bar context not initialized.');
  }
};
