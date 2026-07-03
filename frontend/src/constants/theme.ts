// TEFILAH Sacred Design System

export const COLORS = {
  // Primary - Deep sacred navy
  primary: '#1a1a2e',
  primaryLight: '#2d2d44',
  primaryDark: '#0f0f1a',
  
  // Accent - Sacred gold
  gold: '#d4af37',
  goldLight: '#e4c55d',
  goldDark: '#b8941f',
  
  // Backgrounds
  background: '#0f0f1a',
  backgroundLight: '#1a1a2e',
  surface: '#242438',
  
  // Text
  text: '#fefefe',
  textSecondary: '#a0a0b0',
  textMuted: '#6a6a7a',
  
  // Accent colors
  cream: '#f5f5dc',
  softWhite: '#fefefe',
  
  // Status
  success: '#4ade80',
  error: '#f87171',
  warning: '#fbbf24',
  
  // Transparent overlays
  overlay: 'rgba(15, 15, 26, 0.9)',
  overlayLight: 'rgba(15, 15, 26, 0.7)',
};

export const FONTS = {
  // Use system fonts for best compatibility
  heading: 'System',
  body: 'System',
  
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display: 40,
  },
  
  weights: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const SHADOWS = {
  sm: {
    // iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    // Android
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  gold: {
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  glow: {
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
};

