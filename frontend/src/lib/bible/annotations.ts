/**
 * Bible module — bookmarks & highlights (persisted).
 *
 * Keys are canonical, version-independent refs "BID.C.V" (e.g. "JHN.3.16"),
 * so a highlight made while reading KJV shows in the Hindi IRV too — the
 * same behavior as the major Bible apps.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'tefillah:bible:annotations';

export interface BookmarkEntry {
  /** canonical ref key "BID.C.V" */
  key: string;
  /** created-at timestamp (ms) */
  ts: number;
}

/** Highlight palette — soft washes that keep text readable in dark AND light themes. */
export const HIGHLIGHT_COLORS: { id: string; bg: string }[] = [
  { id: 'gold', bg: 'rgba(212,175,55,0.30)' },
  { id: 'green', bg: 'rgba(74,222,128,0.28)' },
  { id: 'blue', bg: 'rgba(96,165,250,0.28)' },
  { id: 'rose', bg: 'rgba(244,114,182,0.28)' },
];

export function highlightBg(colorId: string | undefined): string | undefined {
  return HIGHLIGHT_COLORS.find((c) => c.id === colorId)?.bg;
}

export function makeVerseKey(bookId: string, chapter: number, verse: number): string {
  return `${bookId}.${chapter}.${verse}`;
}

export function parseVerseKey(key: string): { bookId: string; chapter: number; verse: number } | null {
  const m = key.match(/^([A-Z0-9]{3})\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { bookId: m[1], chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
}

interface AnnotationsStore {
  hydrated: boolean;
  bookmarks: BookmarkEntry[];
  /** verseKey -> highlight color id */
  highlights: Record<string, string>;
  hydrate: () => Promise<void>;
  toggleBookmark: (key: string) => void;
  removeBookmark: (key: string) => void;
  setHighlight: (key: string, colorId: string | null) => void;
}

function persist(bookmarks: BookmarkEntry[], highlights: Record<string, string>) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ bookmarks, highlights })).catch(() => {});
}

export const useAnnotations = create<AnnotationsStore>((set, get) => ({
  hydrated: false,
  bookmarks: [],
  highlights: {},

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{ bookmarks: BookmarkEntry[]; highlights: Record<string, string> }>;
        set({
          bookmarks: Array.isArray(saved.bookmarks)
            ? saved.bookmarks.filter((b) => b && typeof b.key === 'string')
            : [],
          highlights: saved.highlights && typeof saved.highlights === 'object' ? saved.highlights : {},
        });
      }
    } catch {
      // corrupted store → start fresh
    } finally {
      set({ hydrated: true });
    }
  },

  toggleBookmark: (key) => {
    const { bookmarks, highlights } = get();
    const next = bookmarks.some((b) => b.key === key)
      ? bookmarks.filter((b) => b.key !== key)
      : [{ key, ts: Date.now() }, ...bookmarks];
    set({ bookmarks: next });
    persist(next, highlights);
  },

  removeBookmark: (key) => {
    const { bookmarks, highlights } = get();
    const next = bookmarks.filter((b) => b.key !== key);
    set({ bookmarks: next });
    persist(next, highlights);
  },

  setHighlight: (key, colorId) => {
    const { bookmarks, highlights } = get();
    const next = { ...highlights };
    if (colorId) next[key] = colorId;
    else delete next[key];
    set({ highlights: next });
    persist(bookmarks, next);
  },
}));
