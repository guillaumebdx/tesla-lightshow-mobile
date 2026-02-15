import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en.json';
import fr from './fr.json';
import es from './es.json';
import de from './de.json';

const LANG_STORAGE_KEY = '@lightstudio_language';

const SUPPORTED_LANGS = ['en', 'fr', 'es', 'de'];

// Detect device language, fallback to 'en'
function getDeviceLanguage() {
  try {
    const locales = getLocales();
    if (locales && locales.length > 0) {
      const code = locales[0].languageCode; // e.g. 'fr', 'en', 'es'
      if (SUPPORTED_LANGS.includes(code)) return code;
    }
  } catch (e) {
    // ignore
  }
  return 'en';
}

// Initialize with device language; will be overridden if user has a saved preference
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    es: { translation: es },
    de: { translation: de },
  },
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

// Load saved language preference (async, overrides device detection)
AsyncStorage.getItem(LANG_STORAGE_KEY).then((savedLang) => {
  if (savedLang && SUPPORTED_LANGS.includes(savedLang)) {
    i18n.changeLanguage(savedLang);
  }
});

// Helper to change language and persist the choice
export async function setAppLanguage(lang) {
  if (SUPPORTED_LANGS.includes(lang)) {
    await AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
    i18n.changeLanguage(lang);
  }
}

export { SUPPORTED_LANGS };
export default i18n;
