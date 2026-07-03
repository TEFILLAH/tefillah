import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

// Dark Theme Colors - Pure black with gold accents
export const darkTheme = {
  // Primary backgrounds
  background: '#000000',
  backgroundSecondary: '#0a0a0a',
  surface: '#111111',
  surfaceElevated: '#1a1a1a',
  surfaceHover: '#222222',
  
  // Text colors
  text: '#ffffff',
  textSecondary: '#a0a0a0',
  textMuted: '#666666',
  textInverse: '#000000',
  
  // Accent - Sacred gold
  accent: '#d4af37',
  accentLight: '#e4c55d',
  accentDark: '#b8941f',
  accentMuted: 'rgba(212, 175, 55, 0.2)',
  
  // Status colors
  success: '#4ade80',
  successBg: 'rgba(74, 222, 128, 0.1)',
  error: '#f87171',
  errorBg: 'rgba(248, 113, 113, 0.1)',
  warning: '#fbbf24',
  warningBg: 'rgba(251, 191, 36, 0.1)',
  info: '#60a5fa',
  infoBg: 'rgba(96, 165, 250, 0.1)',
  
  // Border and dividers
  border: '#2a2a2a',
  borderLight: '#1a1a1a',
  borderFocus: '#d4af37',
  divider: '#222222',
  
  // Buttons
  buttonPrimary: '#d4af37',
  buttonPrimaryText: '#000000',
  buttonPrimaryHover: '#e4c55d',
  buttonSecondary: '#1a1a1a',
  buttonSecondaryText: '#ffffff',
  buttonSecondaryHover: '#2a2a2a',
  buttonDanger: '#dc2626',
  buttonDangerText: '#ffffff',
  buttonDisabled: '#333333',
  buttonDisabledText: '#666666',
  
  // Inputs
  inputBackground: '#111111',
  inputBorder: '#2a2a2a',
  inputFocusBorder: '#d4af37',
  inputText: '#ffffff',
  placeholder: '#666666',
  
  // Cards
  cardBackground: '#0a0a0a',
  cardBorder: '#1a1a1a',
  cardShadow: 'rgba(0, 0, 0, 0.5)',
  
  // Navigation
  navBackground: '#0a0a0a',
  navBorder: '#1a1a1a',
  navActive: '#d4af37',
  navInactive: '#666666',
  
  // Tables
  tableHeader: '#111111',
  tableRow: '#0a0a0a',
  tableRowAlt: '#111111',
  tableRowHover: '#1a1a1a',
  
  // Charts
  chartPrimary: '#d4af37',
  chartSecondary: '#60a5fa',
  chartTertiary: '#4ade80',
  chartGrid: '#222222',
  
  // Overlays
  overlay: 'rgba(0, 0, 0, 0.9)',
  overlayLight: 'rgba(0, 0, 0, 0.7)',
  modalBackground: '#111111',
  
  // Special
  shadowColor: '#000000',
  ripple: 'rgba(212, 175, 55, 0.2)',
  skeleton: '#1a1a1a',
  skeletonHighlight: '#2a2a2a',

  // Glass & Glow effects
  surfaceGlass: 'rgba(255, 255, 255, 0.03)',
  accentSoft: 'rgba(212, 175, 55, 0.06)',
  accentGlow: 'rgba(212, 175, 55, 0.12)',
  cardHighlight: '#141414',
  gradientFrom: '#0a0a0a',
  gradientTo: '#000000',
  shimmer: 'rgba(212, 175, 55, 0.04)',
};

// Light Theme Colors - Clean white with teal accents
export const lightTheme = {
  // Primary backgrounds
  background: '#f8f9fa',
  backgroundSecondary: '#f1f3f5',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  surfaceHover: '#f0f0f0',
  
  // Text colors
  text: '#1a1a1a',
  textSecondary: '#4a4a4a',
  textMuted: '#8a8a8a',
  textInverse: '#ffffff',
  
  // Accent - Teal
  accent: '#0d9488',
  accentLight: '#14b8a6',
  accentDark: '#0f766e',
  accentMuted: 'rgba(13, 148, 136, 0.1)',
  
  // Status colors
  success: '#22c55e',
  successBg: 'rgba(34, 197, 94, 0.1)',
  error: '#ef4444',
  errorBg: 'rgba(239, 68, 68, 0.1)',
  warning: '#f59e0b',
  warningBg: 'rgba(245, 158, 11, 0.1)',
  info: '#3b82f6',
  infoBg: 'rgba(59, 130, 246, 0.1)',
  
  // Border and dividers
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
  borderFocus: '#0d9488',
  divider: '#e5e7eb',
  
  // Buttons
  buttonPrimary: '#0d9488',
  buttonPrimaryText: '#ffffff',
  buttonPrimaryHover: '#0f766e',
  buttonSecondary: '#f3f4f6',
  buttonSecondaryText: '#1a1a1a',
  buttonSecondaryHover: '#e5e7eb',
  buttonDanger: '#dc2626',
  buttonDangerText: '#ffffff',
  buttonDisabled: '#e5e7eb',
  buttonDisabledText: '#9ca3af',
  
  // Inputs
  inputBackground: '#ffffff',
  inputBorder: '#d1d5db',
  inputFocusBorder: '#0d9488',
  inputText: '#1a1a1a',
  placeholder: '#9ca3af',
  
  // Cards
  cardBackground: '#ffffff',
  cardBorder: '#e5e7eb',
  cardShadow: 'rgba(0, 0, 0, 0.1)',
  
  // Navigation
  navBackground: '#ffffff',
  navBorder: '#e5e7eb',
  navActive: '#0d9488',
  navInactive: '#9ca3af',
  
  // Tables
  tableHeader: '#f8f9fa',
  tableRow: '#ffffff',
  tableRowAlt: '#f8f9fa',
  tableRowHover: '#f3f4f6',
  
  // Charts
  chartPrimary: '#0d9488',
  chartSecondary: '#3b82f6',
  chartTertiary: '#22c55e',
  chartGrid: '#e5e7eb',
  
  // Overlays
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  modalBackground: '#ffffff',
  
  // Special
  shadowColor: '#000000',
  ripple: 'rgba(13, 148, 136, 0.2)',
  skeleton: '#e5e7eb',
  skeletonHighlight: '#f3f4f6',

  // Glass & Glow effects
  surfaceGlass: 'rgba(0, 0, 0, 0.02)',
  accentSoft: 'rgba(13, 148, 136, 0.04)',
  accentGlow: 'rgba(13, 148, 136, 0.10)',
  cardHighlight: '#ffffff',
  gradientFrom: '#f8f9fa',
  gradientTo: '#f1f3f5',
  shimmer: 'rgba(13, 148, 136, 0.03)',
};

export type ThemeColors = typeof darkTheme;

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  isInitialized: boolean;
  isHydrated: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  toggleTheme: () => Promise<void>;
  setTheme: (mode: ThemeMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'dark',
  colors: darkTheme,
  isInitialized: false,
  isHydrated: false,
  
  initialize: async () => {
    try {
      const savedMode = await AsyncStorage.getItem('tefilah_theme_mode');
      const mode: ThemeMode = (savedMode === 'light' || savedMode === 'dark') ? savedMode : 'dark';
      const colors = mode === 'dark' ? darkTheme : lightTheme;
      set({ mode, colors, isInitialized: true, isHydrated: true });
    } catch (error) {
      if (__DEV__) console.error('Error initializing theme:', error);
      set({ mode: 'dark', colors: darkTheme, isInitialized: true, isHydrated: true });
    }
  },
  
  toggleTheme: async () => {
    const { mode } = get();
    const newMode: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    const colors = newMode === 'dark' ? darkTheme : lightTheme;
    try {
      await AsyncStorage.setItem('tefilah_theme_mode', newMode);
    } catch (error) {
      if (__DEV__) console.error('Error saving theme:', error);
    }
    set({ mode: newMode, colors });
  },
  
  setTheme: async (mode: ThemeMode) => {
    const colors = mode === 'dark' ? darkTheme : lightTheme;
    try {
      await AsyncStorage.setItem('tefilah_theme_mode', mode);
    } catch (error) {
      if (__DEV__) console.error('Error saving theme:', error);
    }
    set({ mode, colors });
  },
}));

// Helper hook for getting current theme
export const useTheme = () => {
  const { mode, colors, toggleTheme, setTheme, isInitialized, isHydrated } = useThemeStore();
  return { 
    mode, 
    colors, 
    toggleTheme, 
    setTheme, 
    isDark: mode === 'dark',
    isLight: mode === 'light',
    isInitialized,
    isHydrated,
  };
};
