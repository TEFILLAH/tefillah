/**
 * Bible module — reading-position + preferences store (persisted).
 *
 * Remembers the last version, book, chapter and text size across launches so
 * the reader always reopens where the user left off.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'tefillah:bible:prefs';

export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.6;
const FONT_STEP = 0.15;

interface PersistedPrefs {
  versionId: string | null;
  bookIndex: number;
  /** 1-based chapter. */
  chapter: number;
  fontScale: number;
}

interface BibleStore extends PersistedPrefs {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setVersion: (versionId: string) => void;
  setPosition: (bookIndex: number, chapter: number) => void;
  adjustFontScale: (dir: 1 | -1) => void;
}

const DEFAULTS: PersistedPrefs = {
  versionId: null,
  bookIndex: 0,
  chapter: 1,
  fontScale: 1,
};

function persist(state: PersistedPrefs) {
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      versionId: state.versionId,
      bookIndex: state.bookIndex,
      chapter: state.chapter,
      fontScale: state.fontScale,
    }),
  ).catch(() => {});
}

export const useBibleStore = create<BibleStore>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedPrefs>;
        set({
          versionId: typeof saved.versionId === 'string' ? saved.versionId : null,
          bookIndex:
            typeof saved.bookIndex === 'number' && saved.bookIndex >= 0 && saved.bookIndex < 66
              ? saved.bookIndex
              : 0,
          chapter: typeof saved.chapter === 'number' && saved.chapter >= 1 ? saved.chapter : 1,
          fontScale:
            typeof saved.fontScale === 'number'
              ? Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, saved.fontScale))
              : 1,
        });
      }
    } catch {
      // corrupted prefs → fall back to defaults
    } finally {
      set({ hydrated: true });
    }
  },

  setVersion: (versionId) => {
    set({ versionId });
    persist({ ...get(), versionId });
  },

  setPosition: (bookIndex, chapter) => {
    set({ bookIndex, chapter });
    persist({ ...get(), bookIndex, chapter });
  },

  adjustFontScale: (dir) => {
    const next = Math.min(
      MAX_FONT_SCALE,
      Math.max(MIN_FONT_SCALE, Math.round((get().fontScale + dir * FONT_STEP) * 100) / 100),
    );
    set({ fontScale: next });
    persist({ ...get(), fontScale: next });
  },
}));
