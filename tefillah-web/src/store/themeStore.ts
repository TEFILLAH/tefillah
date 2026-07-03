import { create } from 'zustand';
import { storage } from '../lib/storage';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  initialize: () => void;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',
  setTheme: (t) => {
    storage.setTheme(t);
    applyTheme(t);
    set({ theme: t });
  },
  toggle: () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light';
    storage.setTheme(next);
    applyTheme(next);
    set({ theme: next });
  },
  initialize: () => {
    const saved = storage.getTheme();
    if (saved) {
      applyTheme(saved);
      set({ theme: saved });
      return;
    }
    // Respect OS preference on first visit
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial: Theme = prefersDark ? 'dark' : 'light';
    applyTheme(initial);
    set({ theme: initial });
  },
}));
