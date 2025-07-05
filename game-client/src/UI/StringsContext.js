import React, { createContext, useContext } from 'react';
import stringsEN from './Strings/stringsEN.json';
import stringsFR from './Strings/stringsFR.json';
// Add more as needed...

const STRINGS_MAP = {
  en: stringsEN,
  fr: stringsFR,
  // Add more as needed...
};

const StringsContext = createContext(stringsEN); // Default to English

export const StringsProvider = ({ language = 'en', children }) => {
  const selectedStrings = STRINGS_MAP[language?.toLowerCase()] || stringsEN;

  console.log('🧬 StringsProvider:', {
    rawLanguage: language,
    normalized: language?.toLowerCase(),
    resolvedFile: selectedStrings,
  });

  return (
    <StringsContext.Provider value={selectedStrings}>
      {children}
    </StringsContext.Provider>
  );
};

export const useStrings = () => {
  const ctx = useContext(StringsContext);
  //console.log("📘 useStrings hook called, returning:", ctx);
  return ctx;
};