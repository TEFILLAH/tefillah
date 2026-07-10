/**
 * Bible module — cross-references.
 *
 * Bundled dataset built from OpenBible.info's cross-reference corpus
 * (Creative Commons Attribution) — ~29k source verses, ~155k links, trimmed
 * to the top 6 most-voted targets per verse. Loaded lazily on first use and
 * kept in memory (~2 MB raw JSON).
 *
 * Target encoding: "BID.C.V" for a single verse, "BID.C.V-W" for a
 * same-chapter range (e.g. "PSA.33.6-9").
 */
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import type { BibleBook } from './types';

interface XrefData {
  license: string;
  source: string;
  refs: Record<string, Record<string, Record<string, string[]>>>;
}

export interface XrefTarget {
  raw: string;
  bookId: string;
  chapter: number;
  verse: number;
  /** inclusive range end (same chapter), if the target is a range */
  verseEnd?: number;
}

let cache: XrefData | null = null;
let loading: Promise<XrefData> | null = null;

export function loadXrefs(): Promise<XrefData> {
  if (cache) return Promise.resolve(cache);
  if (loading) return loading;
  loading = (async () => {
    const asset = Asset.fromModule(require('../../../assets/bibles/xrefs.bible'));
    await asset.downloadAsync();
    const raw = await FileSystem.readAsStringAsync(asset.localUri ?? asset.uri);
    const data = JSON.parse(raw) as XrefData;
    if (!data || typeof data.refs !== 'object') throw new Error('xrefs asset malformed');
    cache = data;
    loading = null;
    return data;
  })();
  return loading;
}

export function getXrefTargets(data: XrefData, bookId: string, chapter: number, verse: number): XrefTarget[] {
  const raw = data.refs[bookId]?.[String(chapter)]?.[String(verse)] ?? [];
  const out: XrefTarget[] = [];
  for (const r of raw) {
    const t = parseXrefTarget(r);
    if (t) out.push(t);
  }
  return out;
}

export function parseXrefTarget(raw: string): XrefTarget | null {
  const m = raw.match(/^([A-Z0-9]{3})\.(\d+)\.(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return {
    raw,
    bookId: m[1],
    chapter: parseInt(m[2], 10),
    verse: parseInt(m[3], 10),
    verseEnd: m[4] ? parseInt(m[4], 10) : undefined,
  };
}

/** "JHN.1.1-3" -> "John 1:1-3" using the loaded version's localized book names. */
export function formatXrefTarget(t: XrefTarget, books: BibleBook[]): string {
  const book = books.find((b) => b.id === t.bookId);
  const name = book?.name ?? t.bookId;
  return `${name} ${t.chapter}:${t.verse}${t.verseEnd ? `-${t.verseEnd}` : ''}`;
}

/** First verse's text as a preview snippet, or "" when absent in this version. */
export function xrefPreview(t: XrefTarget, books: BibleBook[]): string {
  const book = books.find((b) => b.id === t.bookId);
  return book?.chapters[t.chapter - 1]?.[t.verse - 1] ?? '';
}

/** Book index of the target within the version's canonical 66-book array. */
export function xrefBookIndex(t: XrefTarget, books: BibleBook[]): number {
  return books.findIndex((b) => b.id === t.bookId);
}
