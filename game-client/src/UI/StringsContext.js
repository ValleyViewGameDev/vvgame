import React, { createContext, useContext } from 'react';
import stringsEN from './Strings/stringsEN.json';
import stringsFR from './Strings/stringsFR.json';
import stringsES from './Strings/stringsES.json';
import stringsIT from './Strings/stringsIT.json';
import stringsDE from './Strings/stringsDE.json';
import stringsPT from './Strings/stringsPT.json';
import stringsRU from './Strings/stringsRU.json';
import stringsNO from './Strings/stringsNO.json';
import stringsSV from './Strings/stringsSV.json';
import stringsFI from './Strings/stringsFI.json';

const STRINGS_MAP = {
  en: stringsEN,
  fr: stringsFR,
  es: stringsES,
  de: stringsDE,
  it: stringsIT,
  pt: stringsPT,
  ru: stringsRU,
  no: stringsNO,
  sv: stringsSV,
  fi: stringsFI,
  // Add more languages here as needed
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