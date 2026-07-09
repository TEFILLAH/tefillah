/**
 * Bible module — shared types.
 *
 * Translations ship as bundled raw assets (assets/bibles/<id>.bible, JSON) and
 * are parsed on demand. Verse numbering is index-based: chapters[c][v] is
 * chapter c+1, verse v+1; a merged/absent verse is an empty string so verse
 * numbers always stay aligned with the printed Bible.
 */

export type BibleLang = 'en' | 'hi' | 'te';

export interface BibleBook {
  /** Canonical 3-char id (GEN … REV), stable across versions/languages. */
  id: string;
  /** Display name in the version's own language/script. */
  name: string;
  /** chapters[c][v] = text of chapter c+1, verse v+1 ("" if absent). */
  chapters: string[][];
}

export interface BibleData {
  id: string;
  name: string;
  shortName: string;
  lang: BibleLang;
  license: string;
  source: string;
  books: BibleBook[];
}

export interface BibleVersionMeta {
  id: string;
  /** Full version name shown in the picker. */
  name: string;
  /** Short badge label, e.g. KJV / IRV. */
  shortName: string;
  lang: BibleLang;
  license: string;
  /**
   * Metro asset module for the bundled .bible file. Wrapped in a thunk so the
   * (large) asset is only resolved when the version is actually opened.
   */
  module: () => number;
}

/** A licensed version we show greyed-out until publisher licensing is secured. */
export interface UpcomingVersionMeta {
  id: string;
  name: string;
  shortName: string;
  lang: BibleLang;
}

export interface SearchHit {
  bookIndex: number;
  bookName: string;
  /** 1-based chapter. */
  chapter: number;
  /** 1-based verse. */
  verse: number;
  text: string;
}
