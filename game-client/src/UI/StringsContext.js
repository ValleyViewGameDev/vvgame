import React, { createContext, useContext, useMemo } from 'react';
import stringsEN from './Strings/stringsEN.json';
import { withTouchVariants } from '../Utils/inputMode';
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
  const selectedFile = STRINGS_MAP[language?.toLowerCase()] || stringsEN;
  // On a touch-first device every lookup prefers the "<key>_touch" sibling when the file has
  // one ("tap" wording, no keyboard hints), so no call site needs to know (Utils/inputMode.js).
  const selectedStrings = useMemo(() => withTouchVariants(selectedFile), [selectedFile]);

  console.log('🧬 StringsProvider:', {
    rawLanguage: language,
    normalized: language?.toLowerCase(),
    resolvedFile: selectedFile,
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