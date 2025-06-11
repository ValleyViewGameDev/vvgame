// src/FileContext.jsx
import React, { createContext, useContext, useState } from 'react';

const FileContext = createContext();

export const FileProvider = ({ children }) => {
  const [fileName, setFileName] = useState('');
  const [directory, setDirectory] = useState('');
  const [selectedCell, setSelectedCell] = useState(null);

  return (
    <FileContext.Provider value={{
      fileName,
      setFileName,
      directory,
      setDirectory,
      selectedCell,
      setSelectedCell
    }}>
      {children}
    </FileContext.Provider>
  );
};

export const useFileContext = () => useContext(FileContext);