/**
 * Bible module — keyword search.
 *
 * The reader previously did a bare `text.toLowerCase().includes(needle)` scan
 * and rendered hits in canonical order, which had three problems:
 *   1. No relevance. Searching "faith" put Genesis before Hebrews 11 simply
 *      because Genesis is first, and an exact word match ranked no higher than
 *      an incidental substring.
 *   2. No word awareness. "art" matched "heart"/"earth" with equal weight.
 *   3. Unicode. Hindi/Telugu text was compared without normalization, so the
 *      same word encoded differently (NFC vs NFD) silently failed to match.
 *
 * This module keeps the same linear scan (a real inverted/FTS index is the next
 * phase of the Bible rebuild) but makes the RESULTS correct and ranked, which is
 * what a reader actually notices.
 *
 * Substring matching is deliberately retained: it is what makes "faith" also
 * surface "faithful" / "faithfulness", i.e. the related hits you want — those
 * simply rank below exact word matches now.
 */
import type { BibleData, SearchHit } from './types';

export interface RankedHit extends SearchHit {
  /** Higher is better. Exposed so the UI can group/label if it wants. */
  score: number;
  /** Character offset of the best match within `text`, for highlighting. */
  matchAt: number;
  /** Length of the matched span, for highlighting. */
  matchLen: number;
}

/**
 * Case-fold + normalize. NFC keeps Devanagari/Telugu clusters intact — we do
 * NOT strip combining marks, because in Indic scripts a matra is part of the
 * letter, not an accent; removing them would change the word.
 */
export function normalizeForSearch(s: string): string {
  return s.normalize('NFC').toLowerCase();
}

/** Unicode-aware "is this character part of a word?" — \b is ASCII-only. */
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

function isWordChar(ch: string | undefined): boolean {
  return !!ch && WORD_CHAR.test(ch);
}

/**
 * Score one verse against the needle.
 *   3 = whole-word hit      ("faith" in "by faith we")
 *   2 = word-initial hit    ("faith" in "faithful")
 *   1 = interior substring  ("art" in "heart")
 *   0 = no hit
 * Ties break on earlier position, then on more occurrences.
 */
function scoreVerse(haystack: string, needle: string): { score: number; at: number } | null {
  let at = haystack.indexOf(needle);
  if (at < 0) return null;

  let best = 0;
  let bestAt = at;
  let occurrences = 0;

  while (at >= 0) {
    occurrences++;
    const before = at > 0 ? haystack[at - 1] : undefined;
    const after = at + needle.length < haystack.length ? haystack[at + needle.length] : undefined;
    const startsWord = !isWordChar(before);
    const endsWord = !isWordChar(after);
    const s = startsWord && endsWord ? 3 : startsWord ? 2 : 1;
    if (s > best) {
      best = s;
      bestAt = at;
    }
    // NOTE: do not break early on best===3. `occurrences` must be a true count
    // of how often the term appears; breaking as soon as the best class was
    // found made it "matches scanned until the best hit", which is
    // position-dependent noise: "heartfaith ... faith" scored 32 (interior hit,
    // then whole-word => occ=2) while a clean single "faith" scored 31. The scan
    // is a handful of indexOf calls over a ~150-char verse — not worth the bug.
    at = haystack.indexOf(needle, at + needle.length);
  }
  // Class dominates; occurrence count only breaks ties WITHIN a class (a class-2
  // verse maxes at 23, still below a class-3 verse's minimum of 31).
  return { score: best * 10 + Math.min(occurrences, 3), at: bestAt };
}

/**
 * Search every verse of the loaded translation.
 *
 * @param max hard cap on returned hits. We rank the FULL result set before
 *   truncating, so the cap keeps the best hits rather than the first ones
 *   encountered (the old code truncated mid-scan and dropped Hebrews 11).
 */
export function searchVerses(bible: BibleData, query: string, max: number): RankedHit[] {
  const needle = normalizeForSearch(query).trim();
  if (!needle) return [];

  const hits: RankedHit[] = [];
  for (let b = 0; b < bible.books.length; b++) {
    const bk = bible.books[b];
    for (let c = 0; c < bk.chapters.length; c++) {
      const ch = bk.chapters[c];
      for (let v = 0; v < ch.length; v++) {
        const text = ch[v];
        if (!text) continue;
        const scored = scoreVerse(normalizeForSearch(text), needle);
        if (!scored) continue;
        hits.push({
          bookIndex: b,
          bookName: bk.name,
          chapter: c + 1,
          verse: v + 1,
          text,
          score: scored.score,
          matchAt: scored.at,
          matchLen: needle.length,
        });
      }
    }
  }

  hits.sort(
    (x, y) =>
      y.score - x.score ||
      x.bookIndex - y.bookIndex ||
      x.chapter - y.chapter ||
      x.verse - y.verse,
  );
  return hits.length > max ? hits.slice(0, max) : hits;
}

/** Per-book hit counts for the full result set — powers a "filter by book" row. */
export function countByBook(hits: RankedHit[]): { bookIndex: number; bookName: string; count: number }[] {
  const acc = new Map<number, { bookIndex: number; bookName: string; count: number }>();
  for (const h of hits) {
    const cur = acc.get(h.bookIndex);
    if (cur) cur.count++;
    else acc.set(h.bookIndex, { bookIndex: h.bookIndex, bookName: h.bookName, count: 1 });
  }
  return [...acc.values()].sort((a, b) => b.count - a.count || a.bookIndex - b.bookIndex);
}
