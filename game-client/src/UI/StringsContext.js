import React, { createContext, useContext, useMemo } from 'react';
import stringsEN from './Strings/stringsEN.json';
import { withTouchVariants } from '../Utils/inputMode';

// Only English ships in the main bundle. The other nine files (~310 KB gzip together) are split
// into one chunk each and fetched on demand: the language is fixed for the page's life (every
// language change reloads the page), so index.js awaits loadStrings(savedLanguage) once before
// the first render and the provider reads the loaded file synchronously from then on. A brand-new
// visitor has no stored player, is English, and downloads none of them.
const LOADERS = {
  fr: () => import(/* webpackChunkName: "strings-fr" */ './Strings/stringsFR.json'),
  es: () => import(/* webpackChunkName: "strings-es" */ './Strings/stringsES.json'),
  de: () => import(/* webpackChunkName: "strings-de" */ './Strings/stringsDE.json'),
  it: () => import(/* webpackChunkName: "strings-it" */ './Strings/stringsIT.json'),
  pt: () => import(/* webpackChunkName: "strings-pt" */ './Strings/stringsPT.json'),
  ru: () => import(/* webpackChunkName: "strings-ru" */ './Strings/stringsRU.json'),
  no: () => import(/* webpackChunkName: "strings-no" */ './Strings/stringsNO.json'),
  sv: () => import(/* webpackChunkName: "strings-sv" */ './Strings/stringsSV.json'),
  fi: () => import(/* webpackChunkName: "strings-fi" */ './Strings/stringsFI.json'),
  // Add more languages here as needed
};

const STRINGS_MAP = { en: stringsEN };

/** Fetch a language's strings file (no-op for English or one already loaded). Never rejects:
 *  a failed fetch leaves that language on the English fallback. */
export function loadStrings(language) {
  const code = language?.toLowerCase();
  if (!code || STRINGS_MAP[code] || !LOADERS[code]) return Promise.resolve();
  return LOADERS[code]()
    .then((mod) => { STRINGS_MAP[code] = mod.default || mod; })
    .catch((e) => console.warn(`Strings for "${code}" failed to load; using English`, e));
}

const StringsContext = createContext(stringsEN); // Default to English

export const StringsProvider = ({ language = 'en', children }) => {
  const selectedFile = STRINGS_MAP[language?.toLowerCase()] || stringsEN;
  // On a touch-first device every lookup prefers the "<key>_touch" sibling when the file has
  // one ("tap" wording, no keyboard hints), so no call site needs to know (Utils/inputMode.js).
  const selectedStrings = useMemo(() => withTouchVariants(selectedFile), [selectedFile]);

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
