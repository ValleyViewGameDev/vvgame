import React, { createContext, useContext, useState } from 'react';

// Create a context
const ModalContext = createContext();

// Hook to use context
export const useModalContext = () => useContext(ModalContext);

// Provider to wrap the app
export const ModalProvider = ({ children }) => {
  const [activeModal, setActiveModal] = useState(null);

  const openModal = (modalName) => {
    console.log(`Opening modal: ${modalName}`);
    setActiveModal(modalName);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  return (
    <ModalContext.Provider value={{ activeModal, setActiveModal, openModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
};
