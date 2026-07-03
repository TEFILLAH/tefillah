import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import type { LanguageCode } from '../i18n';

interface LanguageState {
  language: LanguageCode;
  isInitialized: boolean;
  hasSelectedLanguage: boolean;

  // Actions
  initialize: () => Promise<void>;
  setLanguage: (lang: LanguageCode) => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: 'en',
  isInitialized: false,
  hasSelectedLanguage: false,

  initialize: async () => {
    try {
      const savedLang = await AsyncStorage.getItem('tefilah_language');
      const hasSelected = await AsyncStorage.getItem('tefilah_language_selected');

      if (savedLang && ['en', 'hi', 'te'].includes(savedLang)) {
        await i18n.changeLanguage(savedLang);
        set({
          language: savedLang as LanguageCode,
          isInitialized: true,
          hasSelectedLanguage: hasSelected === 'true',
        });
      } else {
        set({
          isInitialized: true,
          hasSelectedLanguage: false,
        });
      }
    } catch (error) {
      if (__DEV__) console.error('Error initializing language:', error);
      set({ isInitialized: true, hasSelectedLanguage: false });
    }
  },

  setLanguage: async (lang: LanguageCode) => {
    try {
      await i18n.changeLanguage(lang);
      await AsyncStorage.setItem('tefilah_language', lang);
      await AsyncStorage.setItem('tefilah_language_selected', 'true');
      set({ language: lang, hasSelectedLanguage: true });
    } catch (error) {
      if (__DEV__) console.error('Error saving language:', error);
    }
  },
}));

export const useLanguage = () => {
  const { language, isInitialized, hasSelectedLanguage, setLanguage } = useLanguageStore();
  return { language, isInitialized, hasSelectedLanguage, setLanguage };
};
