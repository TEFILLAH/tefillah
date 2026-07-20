/**
 * Bible module — reference parsing for the search box.
 *
 * Turns queries like "John 3:16", "jn 3 16", "1 cor 13", "psalm 23:1",
 * "यूहन्ना 3:16" or "యోహాను 3:16" into a concrete book/chapter/verse target.
 * Matching runs against (a) a static English alias table (works in every
 * version) and (b) the loaded version's own localized book names, so Hindi
 * and Telugu references work exactly like other Bible apps.
 */
import type { BibleBook } from './types';

export interface ParsedRef {
  bookIndex: number;
  /** 1-based, validated against the book. */
  chapter: number;
  /** 1-based, validated; undefined = whole chapter. */
  verse?: number;
}

/** English names + common abbreviations for the 66 canonical books, in order. */
const EN_ALIASES: string[][] = [
  ['genesis', 'gen', 'ge', 'gn'],
  ['exodus', 'exod', 'exo', 'ex'],
  ['leviticus', 'lev', 'le', 'lv'],
  ['numbers', 'num', 'nu', 'nm', 'nb'],
  ['deuteronomy', 'deut', 'deu', 'dt'],
  ['joshua', 'josh', 'jos', 'jsh'],
  ['judges', 'judg', 'jdg', 'jg', 'jdgs'],
  ['ruth', 'rut', 'ru', 'rth'],
  ['1 samuel', '1samuel', '1 sam', '1sam', '1sa', 'i samuel', 'first samuel'],
  ['2 samuel', '2samuel', '2 sam', '2sam', '2sa', 'ii samuel', 'second samuel'],
  ['1 kings', '1kings', '1 kgs', '1kgs', '1ki', 'i kings', 'first kings'],
  ['2 kings', '2kings', '2 kgs', '2kgs', '2ki', 'ii kings', 'second kings'],
  ['1 chronicles', '1chronicles', '1 chr', '1chr', '1ch', 'i chronicles', 'first chronicles'],
  ['2 chronicles', '2chronicles', '2 chr', '2chr', '2ch', 'ii chronicles', 'second chronicles'],
  ['ezra', 'ezr'],
  ['nehemiah', 'neh', 'ne'],
  ['esther', 'esth', 'est', 'es'],
  ['job', 'jb'],
  ['psalms', 'psalm', 'psa', 'pss', 'ps', 'psm'],
  ['proverbs', 'prov', 'pro', 'prv', 'pr'],
  ['ecclesiastes', 'eccl', 'ecc', 'ec', 'qoheleth'],
  ['song of solomon', 'song of songs', 'song', 'sos', 'sng', 'canticles'],
  ['isaiah', 'isa', 'is'],
  ['jeremiah', 'jer', 'je'],
  ['lamentations', 'lam', 'la'],
  ['ezekiel', 'ezek', 'eze', 'ezk'],
  ['daniel', 'dan', 'da', 'dn'],
  ['hosea', 'hos', 'ho'],
  ['joel', 'jol', 'jl'],
  ['amos', 'amo', 'am'],
  ['obadiah', 'obad', 'oba', 'ob'],
  ['jonah', 'jon', 'jnh'],
  ['micah', 'mic', 'mi'],
  ['nahum', 'nah', 'nam', 'na'],
  ['habakkuk', 'hab', 'hb'],
  ['zephaniah', 'zeph', 'zep', 'zp'],
  ['haggai', 'hag', 'hg'],
  ['zechariah', 'zech', 'zec', 'zc'],
  ['malachi', 'mal', 'ml'],
  ['matthew', 'matt', 'mat', 'mt'],
  ['mark', 'mrk', 'mk', 'mr'],
  ['luke', 'luk', 'lk'],
  ['john', 'jhn', 'joh', 'jn'],
  ['acts', 'act', 'ac'],
  ['romans', 'rom', 'ro', 'rm'],
  ['1 corinthians', '1corinthians', '1 cor', '1cor', '1co', 'i corinthians', 'first corinthians'],
  ['2 corinthians', '2corinthians', '2 cor', '2cor', '2co', 'ii corinthians', 'second corinthians'],
  ['galatians', 'gal', 'ga'],
  ['ephesians', 'eph', 'ep'],
  ['philippians', 'phil', 'php', 'pp'],
  ['colossians', 'col', 'co'],
  ['1 thessalonians', '1thessalonians', '1 thess', '1thess', '1th', 'i thessalonians'],
  ['2 thessalonians', '2thessalonians', '2 thess', '2thess', '2th', 'ii thessalonians'],
  ['1 timothy', '1timothy', '1 tim', '1tim', '1ti', 'i timothy', 'first timothy'],
  ['2 timothy', '2timothy', '2 tim', '2tim', '2ti', 'ii timothy', 'second timothy'],
  ['titus', 'tit', 'ti'],
  ['philemon', 'phlm', 'phm', 'pm'],
  ['hebrews', 'heb', 'he'],
  ['james', 'jas', 'jm', 'ja'],
  ['1 peter', '1peter', '1 pet', '1pet', '1pe', 'i peter', 'first peter'],
  ['2 peter', '2peter', '2 pet', '2pet', '2pe', 'ii peter', 'second peter'],
  ['1 john', '1john', '1 jn', '1jn', '1jo', 'i john', 'first john'],
  ['2 john', '2john', '2 jn', '2jn', '2jo', 'ii john', 'second john'],
  ['3 john', '3john', '3 jn', '3jn', '3jo', 'iii john', 'third john'],
  ['jude', 'jud', 'jd'],
  ['revelation', 'revelations', 'rev', 're', 'apocalypse'],
];

/**
 * Lowercase, turn punctuation into spaces, collapse whitespace. Punctuation
 * becomes a SPACE (not deleted) so "John 3.16" stays "john 3 16" — deleting
 * the dot would glue the numbers into "316". Keeps Unicode letters.
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;'’"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a query into (book part, chapter, verse). The book part may itself
 * start with a digit ("1 john 4 7"), so we take the TRAILING 1-2 numbers as
 * chapter[/verse] and everything before them as the book.
 */
function splitQuery(q: string): { book: string; chapter: number; verse?: number } | null {
  const m = q.match(/^(.*?)\s+(\d{1,3})(?:\s*[:.\s]\s*(\d{1,3}))?$/);
  if (!m) return null;
  const book = m[1].trim();
  if (!book) return null;
  return { book, chapter: parseInt(m[2], 10), verse: m[3] ? parseInt(m[3], 10) : undefined };
}

/**
 * Match a normalized book query against the alias table + the version's own
 * (localized) book names. Exact match wins; otherwise a unique prefix match
 * (>= 2 chars) is accepted so partial typing works in any script.
 */
function matchBook(bookQuery: string, books: BibleBook[]): number | null {
  const bq = norm(bookQuery);
  if (bq.length < 2) return null;

  const candidates: string[][] = books.map((b, i) => {
    const own = norm(b.name);
    return i < EN_ALIASES.length ? [own, ...EN_ALIASES[i]] : [own];
  });

  // exact alias match
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].some((a) => a === bq)) return i;
  }
  // prefix match — on ambiguity the FIRST book in canonical order wins
  // (deterministic; e.g. "jud" → Judges rather than Jude, "jude" exact-matches Jude above)
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].some((a) => a.startsWith(bq))) return i;
  }
  return null;
}

export interface BookSuggestion {
  bookIndex: number;
  /** Display name in the loaded version's own language/script. */
  name: string;
  chapters: number;
  /** Chapter the user already typed ("mat 5" → 5), when valid for this book. */
  chapter?: number;
  /** Verse the user already typed ("mat 5:3" → 3), when valid. */
  verse?: number;
}

/**
 * Autocomplete for the search box: every book whose localized name or English
 * alias starts with what the user typed ("mat" → Matthew, "j" → Joshua, Judges,
 * Job, John, James, Jude …).
 *
 * Ranking is deterministic and canonical-order-stable:
 *   1. exact name/alias match      ("john"  → John before 1/2/3 John)
 *   2. localized-name prefix       (what the reader actually sees)
 *   3. English-alias prefix        (so "mt"/"jhn" still work in hi/te)
 * A trailing chapter/verse is preserved so "mat 5" suggests Matthew AT 5 and
 * one tap lands on the passage instead of re-typing.
 */
export function suggestBooks(query: string, books: BibleBook[], limit = 8): BookSuggestion[] {
  const q = norm(query);
  if (!q) return [];

  // Peel off a trailing chapter[:verse] so "mat 5:3" still suggests Matthew.
  const split = splitQuery(q);
  const bookPart = split ? norm(split.book) : q;
  if (!bookPart) return [];

  type Scored = { i: number; rank: number };
  const scored: Scored[] = [];

  for (let i = 0; i < books.length; i++) {
    const own = norm(books[i].name);
    const aliases = i < EN_ALIASES.length ? EN_ALIASES[i] : [];

    let rank = -1;
    if (own === bookPart || aliases.some((a) => a === bookPart)) rank = 0;
    else if (own.startsWith(bookPart)) rank = 1;
    else if (aliases.some((a) => a.startsWith(bookPart))) rank = 2;
    // Last resort: the query appears inside the localized name (handles scripts
    // where a leading honorific/prefix would otherwise block a prefix match).
    else if (bookPart.length >= 3 && own.includes(bookPart)) rank = 3;

    if (rank >= 0) scored.push({ i, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || a.i - b.i);

  return scored.slice(0, limit).map(({ i }) => {
    const book = books[i];
    const out: BookSuggestion = { bookIndex: i, name: book.name, chapters: book.chapters.length };
    if (split && split.chapter >= 1 && split.chapter <= book.chapters.length) {
      out.chapter = split.chapter;
      const verseCount = book.chapters[split.chapter - 1]?.length ?? 0;
      if (split.verse != null && split.verse >= 1 && split.verse <= verseCount) out.verse = split.verse;
    }
    return out;
  });
}

export function parseReference(query: string, books: BibleBook[]): ParsedRef | null {
  const q = norm(query);
  const parts = splitQuery(q);
  if (!parts) return null;

  const bookIndex = matchBook(parts.book, books);
  if (bookIndex == null) return null;

  const book = books[bookIndex];
  if (parts.chapter < 1 || parts.chapter > book.chapters.length) return null;

  if (parts.verse != null) {
    const verseCount = book.chapters[parts.chapter - 1].length;
    if (parts.verse >= 1 && parts.verse <= verseCount) {
      return { bookIndex, chapter: parts.chapter, verse: parts.verse };
    }
    // verse out of range → still navigate to the chapter
    return { bookIndex, chapter: parts.chapter };
  }
  return { bookIndex, chapter: parts.chapter };
}
