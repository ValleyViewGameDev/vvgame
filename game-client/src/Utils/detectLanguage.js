import { enabledLanguages } from '../UI/Modals/LanguagePickerModal';

// The browser's preferred language, narrowed to the ones the game ships; English otherwise.
export function detectLanguage() {
  const prefs = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
  for (const tag of prefs) {
    const code = String(tag || '').toLowerCase().split('-')[0];
    if (enabledLanguages.includes(code)) return code;
  }
  return 'en';
}
