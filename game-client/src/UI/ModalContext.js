import React, { createContext, useContext, useState } from 'react';

// Create a context
const ModalContext = createContext();

// Hook to use context
export const useModalContext = () => useContext(ModalContext);

// Provider to wrap the app
export const ModalProvider = ({ children, custom }) => {
  const [activeModal, setActiveModal] = useState(null);
  React.useEffect(() => {
    const id = Math.floor(Math.random() * 10000);
    console.log(`🧩 ModalProvider mounted. ID: ${id}`);
    return () => console.warn(`🧨 ModalProvider unmounted. ID: ${id}`);
  }, []);

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
      {custom}
    </ModalContext.Provider>
  );
};
