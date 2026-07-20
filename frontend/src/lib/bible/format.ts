/**
 * Bible module — structured chapter format (v2).
 *
 * WHY THIS EXISTS
 * The v1 format (see types.ts, `BibleBook.chapters: string[][]`) stored a verse
 * as a bare string. That threw away every piece of markup the USFM sources
 * carry, which made paragraphs, poetry, section headings, red-letter and
 * footnotes impossible to render — a format ceiling, not a UI bug. It also
 * forced the whole translation (up to ~10 MB) through one JSON.parse on the JS
 * thread. v2 fixes both: the unit of storage is a CHAPTER, addressed as
 * `{USFM_BOOK}.{chapter}` (e.g. "JHN.3"), so we parse ~1-4 KB to render a page.
 *
 * The vocabulary below is USFM's, which is an open standard (see
 * https://docs.usfm.bible) — we implement the standard, we do not copy anyone's
 * implementation. Marker coverage was derived by inventorying our actual
 * sources: markers differ per translation (BSB has no \wj and uses \m instead
 * of \p; KJV has \wj/\nd/\add; Hindi IRV has \wj + book intros), which is why
 * capabilities are per-translation flags rather than global assumptions.
 */

/** Canonical chapter address: `GEN.1`, `JHN.3`, `1CH.29`. Book is USFM 3-char. */
export type ChapterRef = string;

/**
 * Paragraph-level block kinds (USFM paragraph markers we support).
 * - Text-bearing (carry numbered verses): p, m, pmo, pc, q1-q3, qr, qa, li1, li2
 * - Heading/annotation (carry loose spans, no verse numbers): s1-s3, ms1, mr, r,
 *   d (psalm descriptor), sp (speaker), and intro matter (iot, is1, ip, io1).
 * - b is a spacing break and carries nothing.
 */
export type BlockKind =
  | 'p' // paragraph
  | 'm' // margin paragraph (no first-line indent) — BSB's default
  | 'pmo' // embedded opening paragraph
  | 'pc' // centred paragraph
  | 'q1' // poetry, indent 1
  | 'q2' // poetry, indent 2
  | 'q3' // poetry, indent 3
  | 'qr' // poetry, right-aligned
  | 'qa' // acrostic heading
  | 'li1' // list item, level 1
  | 'li2' // list item, level 2
  | 's1' // section heading 1
  | 's2' // section heading 2
  | 's3' // section heading 3
  | 'ms1' // major section heading
  | 'mr' // major section reference range
  | 'r' // parallel passage reference
  | 'd' // psalm descriptor / superscription
  | 'sp' // speaker (Job)
  | 'iot' // intro outline title
  | 'io1' // intro outline entry
  | 'is1' // intro section heading
  | 'ip' // intro paragraph
  | 'b'; // blank line (spacing only)

/** Blocks that carry numbered verse text (vs headings/intro which carry spans). */
export const TEXT_BLOCKS: ReadonlySet<BlockKind> = new Set<BlockKind>([
  'p',
  'm',
  'pmo',
  'pc',
  'q1',
  'q2',
  'q3',
  'qr',
  'qa',
  'li1',
  'li2',
]);

/** Blocks rendered as headings/apparatus — never selectable as scripture. */
export const HEADING_BLOCKS: ReadonlySet<BlockKind> = new Set<BlockKind>([
  's1',
  's2',
  's3',
  'ms1',
  'mr',
  'r',
  'd',
  'sp',
  'iot',
  'io1',
  'is1',
  'ip',
]);

/**
 * Character-level span kinds (USFM character markers).
 * `undefined` kind = plain text, which is the overwhelming majority — omitting
 * the key keeps the on-disk JSON small.
 */
export type SpanKind =
  | 'wj' // words of Jesus (red letter) — NOT present in every translation
  | 'nd' // divine name (LORD, small caps)
  | 'add' // translator addition (italic in KJV tradition)
  | 'it' // italic
  | 'bdit' // bold italic
  | 'tl' // transliterated / foreign
  | 'qs' // Selah (right-aligned within poetry)
  | 'k' // keyword
  | 'note'; // footnote anchor — text is empty, body lives in Chapter.notes[id]

export interface Span {
  /** Text content. Empty for `note` anchors. */
  s: string;
  /** Omitted for plain text. */
  k?: SpanKind;
  /** For k==='note': key into Chapter.notes. */
  id?: string;
  /**
   * Strong's number(s) for this span, when the source tags them (\w ...|strong="H430").
   * Preserved rather than discarded — BSB tags ~630k words, KJV ~314k, which is
   * a study feature we get for free. Absent when the source has no \w markup.
   */
  st?: string;
}

/** A run of verse text inside a text block. A verse may span several blocks. */
export interface VerseRun {
  /** 1-based verse number. */
  n: number;
  spans: Span[];
}

export interface Block {
  t: BlockKind;
  /** Present on TEXT_BLOCKS. */
  verses?: VerseRun[];
  /** Present on HEADING_BLOCKS. */
  spans?: Span[];
}

export interface FootNote {
  /** Origin reference as printed, e.g. "3:16". */
  r?: string;
  spans: Span[];
}

/** One chapter — the unit of storage, fetch and render. */
export interface Chapter {
  /** `JHN.3` */
  ref: ChapterRef;
  /** Format version, for forward migrations. */
  v: 1;
  blocks: Block[];
  /** Footnote bodies keyed by the id used in `note` spans. Omitted when none. */
  notes?: Record<string, FootNote>;
}

/** Per-translation capabilities — derived at ingest from real marker presence. */
export interface TranslationCaps {
  /** Source marks words of Jesus. False for BSB — the red-letter toggle must hide. */
  wj: boolean;
  /** Source has footnotes. */
  notes: boolean;
  /** Source tags Strong's numbers. */
  strongs: boolean;
  /** Source has section headings. */
  headings: boolean;
}

/** Translation record as produced by the ingest pipeline. */
export interface TranslationManifest {
  id: string;
  /** Monotonic content build — bumped on re-ingest; drives update checks. */
  build: number;
  name: string;
  shortName: string;
  /** BCP-47-ish tag, e.g. 'en', 'hi', 'te'. */
  lang: string;
  /** ISO 639-3, e.g. 'eng', 'hin', 'tel'. */
  iso639_3?: string;
  dir: 'ltr' | 'rtl';
  /** Versification scheme id. Everything routes through mapRef() even when 'eng'. */
  vrs: string;
  license: string;
  licenseUrl?: string;
  /** Full copyright line — CC BY-SA REQUIRES this be shown to users. */
  copyright: string;
  publisher?: string;
  sourceUrl: string;
  caps: TranslationCaps;
  /** Books present, in canonical order, with chapter counts. */
  books: { id: string; name: string; chapters: number }[];
}

/** Build a chapter ref. */
export function chapterRef(bookId: string, chapter: number): ChapterRef {
  return `${bookId}.${chapter}`;
}

/** Parse a chapter ref. Returns null when malformed. */
export function parseChapterRef(ref: ChapterRef): { book: string; chapter: number } | null {
  const dot = ref.indexOf('.');
  if (dot <= 0) return null;
  const book = ref.slice(0, dot);
  const chapter = Number(ref.slice(dot + 1));
  if (!Number.isInteger(chapter) || chapter < 1) return null;
  return { book, chapter };
}

/** Flatten a chapter's verses to plain text — used to build the search index. */
export function chapterToVerses(ch: Chapter): { n: number; text: string }[] {
  const acc = new Map<number, string>();
  for (const b of ch.blocks) {
    if (!b.verses) continue;
    for (const run of b.verses) {
      const text = run.spans
        .filter((sp) => sp.k !== 'note')
        .map((sp) => sp.s)
        .join('');
      const prev = acc.get(run.n);
      acc.set(run.n, prev ? `${prev}${text}` : text);
    }
  }
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, text]) => ({ n, text: text.replace(/\s+/g, ' ').trim() }));
}
