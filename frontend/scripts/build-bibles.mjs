#!/usr/bin/env node
/**
 * Bible ingest pipeline — USFM -> structured chapter records (format v2).
 *
 * WHY: the v1 assets were built from markup-less sources (api.getbible.net,
 * bereanbible.com plain text) or from USFM whose markup was discarded. Either
 * way a verse became a bare string, which permanently capped the reader: no
 * paragraphs, poetry, headings, red-letter, footnotes or Strong's. This script
 * re-ingests from the USFM sources of record so the structure survives.
 *
 * Source of record: eBible.org, which publishes a machine-readable catalogue
 * (translations.csv) with an explicit `Redistributable` + `Copyright` column.
 * We only ingest entries we have verified as redistributable, and we carry the
 * copyright/licence text through to the output so the app can render the
 * attribution that CC BY-SA actually requires.
 *
 * USAGE
 *   node scripts/build-bibles.mjs                 # build all configured
 *   node scripts/build-bibles.mjs bsb kjv         # build a subset
 *   node scripts/build-bibles.mjs --out <dir>     # default: .bible-build/
 *
 * Output per translation:
 *   <out>/<id>/manifest.json          TranslationManifest (incl. caps + copyright)
 *   <out>/<id>/chapters/<REF>.json    one Chapter record per chapter (JHN.3.json)
 *
 * Downstream (Phase 3) packs these into {id}-{build}.tar.br for CDN delivery;
 * Phase 0 just needs correct, structured data on disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const BS = '\\';

/* ------------------------------------------------------------------ config */

/**
 * Only redistributable sources. `ebible` ids verified against
 * https://ebible.org/Scriptures/translations.csv (Redistributable=True).
 * NOTE: te_ov (Telugu O.V.) is NOT here — it is not published by eBible.org;
 * it stays on its v1 asset until we locate a USFM source of record for it.
 */
const CATALOG = [
  {
    id: 'bsb',
    ebible: 'engbsb',
    name: 'Berean Standard Bible',
    shortName: 'BSB',
    lang: 'en',
    iso: 'eng',
    license: 'Public Domain (CC0)',
    licenseUrl: 'https://berean.bible/licensing.htm',
    publisher: 'Bible Hub / Berean Bible',
  },
  {
    id: 'kjv',
    ebible: 'eng-kjv2006',
    name: 'King James Version',
    shortName: 'KJV',
    lang: 'en',
    iso: 'eng',
    license: 'Public Domain',
    licenseUrl: 'https://ebible.org/eng-kjv2006/',
    publisher: 'Public Domain',
  },
  {
    id: 'asv',
    ebible: 'eng-asv',
    name: 'American Standard Version',
    shortName: 'ASV',
    lang: 'en',
    iso: 'eng',
    license: 'Public Domain',
    licenseUrl: 'https://ebible.org/eng-asv/',
    publisher: 'Public Domain',
  },
  {
    id: 'web',
    ebible: 'engwebp',
    name: 'World English Bible',
    shortName: 'WEB',
    lang: 'en',
    iso: 'eng',
    license: 'Public Domain',
    licenseUrl: 'https://ebible.org/engwebp/',
    publisher: 'eBible.org',
    // "World English Bible" is an eBible.org trademark: a MODIFIED text must be
    // renamed. We ingest verbatim, so the name stands.
    trademarkNote: 'World English Bible is a trademark of eBible.org; do not rename or modify the text.',
  },
  {
    id: 'hi_irv',
    ebible: 'hin2017',
    name: 'इंडियन रिवाइज्ड वर्जन (IRV) हिंदी',
    shortName: 'IRV',
    lang: 'hi',
    iso: 'hin',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    publisher: 'Bridge Connectivity Solutions',
  },
  {
    id: 'te_irv',
    ebible: 'tel2017',
    name: 'ఇండియన్ రివైజ్డ్ వెర్షన్ (IRV) తెలుగు',
    shortName: 'IRV',
    lang: 'te',
    iso: 'tel',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    publisher: 'Bridge Connectivity Solutions',
    // v1Name/v1License reproduce the ORIGINAL asset header byte-for-byte so the
    // regenerated legacy file is a faithful replacement for the corrupted one
    // (its header survived and was read back off disk).
    v1Name: 'ఇండియన్ రివైజ్డ్ వెర్షన్ (IRV) తెలుగు',
    v1License: 'CC BY-SA 4.0 (Bridge Connectivity Solutions)',
  },
];

/* ------------------------------------------------------------ canonical order */

/**
 * The 66-book Protestant canon in reading order, by USFM id.
 *
 * DO NOT order books by USFM FILENAME. eBible.org's numeric prefixes are not a
 * canonical sort and are not even consistent between translations: Acts ships as
 * "74-ACT" (sorting after Revelation), and John is "73-JHN" in engbsb but
 * "49-JHN" in tel2017. Sorting by filename put Acts at index 63 instead of 43.
 *
 * That matters because the app addresses books by INDEX (bookIndex), so a
 * mis-ordered array silently shows the wrong book for cross-references,
 * bookmarks and the book picker — with no error anywhere.
 */
const CANON = [
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH',
  'EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON',
  'MIC','NAM','HAB','ZEP','HAG','ZEC','MAL',
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI',
  'TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV',
];
const CANON_INDEX = new Map(CANON.map((id, i) => [id, i]));

/** Sort parsed books into canonical order and drop anything non-canonical. */
function toCanonical(books, label) {
  const seen = new Map();
  for (const b of books) {
    if (!CANON_INDEX.has(b.id)) continue; // front matter, glossary, deuterocanon
    if (seen.has(b.id)) throw new Error(`${label}: duplicate book ${b.id}`);
    seen.set(b.id, b);
  }
  const ordered = CANON.filter((id) => seen.has(id)).map((id) => seen.get(id));
  const missing = CANON.filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`${label}: missing ${missing.length} book(s): ${missing.join(',')}`);
  return ordered;
}

/* --------------------------------------------------------------- USFM sets */

// Paragraph-level markers that START a new unit (a line beginning with these).
const TEXT_BLOCKS = new Set(['p', 'm', 'pmo', 'pc', 'q1', 'q2', 'q3', 'qr', 'qa', 'li1', 'li2']);
const HEADING_BLOCKS = new Set(['s1', 's2', 's3', 'ms1', 'mr', 'r', 'd', 'sp', 'iot', 'io1', 'is1', 'ip']);
const STRUCTURAL = new Set(['c', 'v', 'b']);
// Book/΄front matter we read for metadata but do not render as scripture.
const META = new Set(['id', 'h', 'toc1', 'toc2', 'toc3', 'mt1', 'mt2', 'mt3', 'ide', 'rem', 'usfm']);
// Inline character markers -> span kind.
const CHAR_KINDS = new Set(['wj', 'nd', 'add', 'it', 'bdit', 'tl', 'qs', 'k', 'bd', 'em', 'sc']);
const CHAR_ALIAS = { bd: 'bdit', em: 'it', sc: 'nd' };

const PARA_STARTERS = new Set([...TEXT_BLOCKS, ...HEADING_BLOCKS, ...STRUCTURAL, ...META]);

/* ------------------------------------------------------------- USFM parser */

/**
 * Split a book's USFM into units. A unit = one paragraph-level marker plus its
 * content, which may continue across following unmarked lines (USFM wraps).
 */
function tokenize(usfm) {
  const units = [];
  let cur = null;
  for (const line of usfm.split(/\r?\n/)) {
    // Blank lines are pure formatting in USFM (real spacing is \b). Appending
    // them as continuations injected a whitespace-only span, which surfaced as
    // a bogus "verse 0" in sources that put a blank line after \p (hin2017).
    if (!line.trim()) continue;
    const m = /^\\([a-z0-9]+)\s?([\s\S]*)$/i.exec(line);
    if (m && PARA_STARTERS.has(m[1].toLowerCase())) {
      cur = { marker: m[1].toLowerCase(), content: m[2] ?? '' };
      units.push(cur);
    } else if (cur) {
      cur.content += (cur.content.endsWith(' ') ? '' : ' ') + line;
    }
  }
  return units;
}

/**
 * Parse inline character markers within a unit's content into Spans.
 * Handles: \wj..\wj*, \nd..\nd*, \add..\add*, \it..\it*, \bdit..\bdit*,
 *          \tl..\tl*, \qs..\qs*, \k..\k*, \w word|strong="H430"\w*,
 *          \f + \fr 3:16 \ft note \f*  (emits a `note` anchor span)
 * Unknown markers degrade to their plain text rather than being dropped.
 */
function parseSpans(content, ctx) {
  const spans = [];
  let plain = '';
  let i = 0;

  const pushPlain = () => {
    if (plain) {
      spans.push({ s: plain });
      plain = '';
    }
  };
  const pushSpan = (sp) => {
    pushPlain();
    spans.push(sp);
  };

  while (i < content.length) {
    const ch = content[i];
    if (ch !== BS) {
      plain += ch;
      i++;
      continue;
    }
    // read marker name
    let j = i + 1;
    let name = '';
    while (j < content.length && /[a-z0-9]/i.test(content[j])) name += content[j++];
    name = name.toLowerCase();
    const closing = content[j] === '*';
    if (closing) j++;
    if (!name) {
      plain += ch;
      i++;
      continue;
    }
    if (closing) {
      // stray close — skip
      i = j;
      continue;
    }

    // footnote: capture to \f*
    if (name === 'f' || name === 'fe') {
      const end = content.indexOf(`${BS}${name}*`, j);
      const body = end < 0 ? content.slice(j) : content.slice(j, end);
      const id = `f${++ctx.noteSeq}`;
      const { ref, spans: nspans } = parseNote(body, ctx);
      ctx.notes[id] = ref ? { r: ref, spans: nspans } : { spans: nspans };
      ctx.caps.notes = true;
      pushSpan({ s: '', k: 'note', id });
      i = end < 0 ? content.length : end + name.length + 2;
      continue;
    }

    // cross-reference apparatus: drop (we ship our own xref dataset)
    if (name === 'x') {
      const end = content.indexOf(`${BS}x*`, j);
      i = end < 0 ? content.length : end + 3;
      continue;
    }

    // \w word|strong="H430" \w*  -> plain text (+ Strong's)
    if (name === 'w') {
      const end = content.indexOf(`${BS}w*`, j);
      const body = end < 0 ? content.slice(j) : content.slice(j, end);
      const bar = body.indexOf('|');
      const text = (bar < 0 ? body : body.slice(0, bar)).trim();
      let st;
      if (bar >= 0) {
        const attr = body.slice(bar + 1);
        const sm = /strong="([^"]+)"/i.exec(attr);
        if (sm) st = sm[1];
        else if (!attr.includes('=')) st = attr.trim() || undefined;
      }
      if (st) {
        ctx.caps.strongs = true;
        pushSpan({ s: text, st });
      } else {
        plain += text;
      }
      i = end < 0 ? content.length : end + 3;
      continue;
    }

    if (CHAR_KINDS.has(name)) {
      const end = content.indexOf(`${BS}${name}*`, j);
      const body = end < 0 ? content.slice(j) : content.slice(j, end);
      const kind = CHAR_ALIAS[name] ?? name;
      if (kind === 'wj') ctx.caps.wj = true;
      // recurse: character markers nest (\wj ... \nd LORD\nd* ... \wj*)
      const inner = parseSpans(body, ctx);
      pushPlain();
      for (const sp of inner) spans.push({ ...sp, k: sp.k ?? kind });
      i = end < 0 ? content.length : end + name.length + 2;
      continue;
    }

    // unknown marker: skip the marker, keep following text
    i = j;
  }
  pushPlain();
  return spans.filter((sp) => sp.k === 'note' || sp.s !== '');
}

/** Parse a footnote body: `+ \fr 3:16 \ft text \fq quoted` */
function parseNote(body, ctx) {
  let ref;
  const rm = new RegExp(`${BS.repeat(2)}fr\\s+([^${BS.repeat(2)}]+)`).exec(body);
  if (rm) ref = rm[1].trim().replace(/[:.]$/, '');
  // strip \fr and caller, keep \ft/\fq/\fp content
  const cleaned = body
    .replace(new RegExp(`${BS.repeat(2)}fr\\s+[^${BS.repeat(2)}]*`, 'g'), '')
    .replace(new RegExp(`${BS.repeat(2)}f[tpqvk]\\*?`, 'g'), ' ')
    .replace(/^\s*[+\-?]\s*/, '');
  return { ref, spans: parseSpans(cleaned, { ...ctx, notes: {}, noteSeq: 0 }) };
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();

/** Parse one book's USFM into { id, name, chapters: Map<number, Block[]>, notes } */
function parseBook(usfm, caps) {
  const units = tokenize(usfm);
  let bookId = null;
  let bookName = null;
  const chapters = new Map(); // chapter -> { blocks, notes, noteSeq }

  let curChapter = null;
  let curVerse = 0;
  let curBlock = null;

  const ctxFor = (c) => c;
  const flush = () => {
    if (curBlock && curChapter) {
      const hasContent =
        (curBlock.verses && curBlock.verses.some((r) => r.spans.length)) ||
        (curBlock.spans && curBlock.spans.length) ||
        curBlock.t === 'b';
      if (hasContent) curChapter.blocks.push(curBlock);
    }
    curBlock = null;
  };
  const ensureChapter = (n) => {
    if (!chapters.has(n)) chapters.set(n, { blocks: [], notes: {}, noteSeq: 0, caps });
    return chapters.get(n);
  };
  const appendToVerse = (spans) => {
    // curVerse < 1 means we are before the chapter's first \v — any text here is
    // not verse text, so it must never open a run (that produced "verse 0").
    if (!curBlock || !spans.length || curVerse < 1) return;
    if (spans.every((sp) => sp.k !== 'note' && !sp.s.trim())) return;
    if (!curBlock.verses) curBlock.verses = [];
    let run = curBlock.verses[curBlock.verses.length - 1];
    if (!run || run.n !== curVerse) {
      run = { n: curVerse, spans: [] };
      curBlock.verses.push(run);
    }
    run.spans.push(...spans);
  };

  for (const u of units) {
    const { marker, content } = u;

    if (META.has(marker)) {
      if (marker === 'id') bookId = clean(content).split(/[\s-]+/)[0]?.toUpperCase() ?? null;
      if (marker === 'h' && !bookName) bookName = clean(content);
      if (marker === 'toc1' && content.trim()) bookName = clean(content);
      if (marker === 'toc2' && !bookName) bookName = clean(content);
      continue;
    }

    if (marker === 'c') {
      flush();
      const n = parseInt(clean(content), 10);
      if (!Number.isFinite(n)) continue;
      curChapter = ensureChapter(n);
      curVerse = 0;
      continue;
    }

    if (!curChapter) continue; // intro matter before \c 1 — skipped for now

    if (marker === 'b') {
      flush();
      curChapter.blocks.push({ t: 'b' });
      continue;
    }

    if (marker === 'v') {
      const m = /^\s*(\d+)([a-z]?(?:-\d+[a-z]?)?)\s*([\s\S]*)$/i.exec(content);
      if (!m) continue;
      curVerse = parseInt(m[1], 10);
      // A verse can appear with no open paragraph (rare) — open a default one.
      if (!curBlock || !curBlock.verses) {
        flush();
        curBlock = { t: 'p', verses: [] };
      }
      appendToVerse(parseSpans(m[3] ?? '', curChapter));
      continue;
    }

    if (HEADING_BLOCKS.has(marker)) {
      flush();
      if (marker === 's1' || marker === 's2' || marker === 's3') curChapter.caps.headings = true;
      const spans = parseSpans(content, curChapter);
      if (spans.length) curChapter.blocks.push({ t: marker, spans });
      continue;
    }

    if (TEXT_BLOCKS.has(marker)) {
      flush();
      curBlock = { t: marker, verses: [] };
      appendToVerse(parseSpans(content, curChapter));
      continue;
    }
  }
  flush();
  return { id: bookId, name: bookName ?? bookId, chapters };
}

/* ------------------------------------------------------------------ driver */

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'buffer', maxBuffer: 1 << 30 });
}

async function download(url, dest) {
  if (fs.existsSync(dest)) return dest;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Tefillah ingest)' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/** eBible.org catalogue row -> authoritative copyright + redistributable flag. */
async function catalogRow(ebibleId, cacheDir) {
  const csv = path.join(cacheDir, 'translations.csv');
  await download('https://ebible.org/Scriptures/translations.csv', csv);
  const text = fs.readFileSync(csv, 'utf8');
  const [head, ...lines] = text.split(/\r?\n/);
  const cols = head.split(',');
  const iId = cols.indexOf('translationId');
  const iRed = cols.indexOf('Redistributable');
  const iCopy = cols.indexOf('Copyright');
  for (const line of lines) {
    // naive split is unsafe for quoted commas; only read the leading id cheaply
    if (!line.startsWith(`${ebibleId},`) && !line.includes(`,${ebibleId},`)) continue;
    const f = splitCsv(line);
    if (f[iId] !== ebibleId) continue;
    return { redistributable: /true|yes|1/i.test(f[iRed] ?? ''), copyright: f[iCopy] ?? '' };
  }
  return null;
}

function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function buildOne(cfg, outRoot, cacheDir) {
  const zip = path.join(cacheDir, `${cfg.ebible}_usfm.zip`);
  await download(`https://ebible.org/Scriptures/${cfg.ebible}_usfm.zip`, zip);

  const work = path.join(cacheDir, cfg.ebible);
  if (!fs.existsSync(work)) {
    fs.mkdirSync(work, { recursive: true });
    sh('unzip', ['-o', '-q', zip, '-d', work]);
  }

  const row = await catalogRow(cfg.ebible, cacheDir);
  if (row && !row.redistributable) {
    throw new Error(`${cfg.id}: eBible marks ${cfg.ebible} NOT redistributable — refusing to ingest.`);
  }

  const caps = { wj: false, notes: false, strongs: false, headings: false };
  const files = fs
    .readdirSync(work)
    .filter((f) => f.toLowerCase().endsWith('.usfm'))
    .sort();

  const outDir = path.join(outRoot, cfg.id);
  const chDir = path.join(outDir, 'chapters');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(chDir, { recursive: true });

  const books = [];
  let chapterCount = 0;
  let verseCount = 0;
  let bytes = 0;

  for (const f of files) {
    const usfm = fs.readFileSync(path.join(work, f), 'utf8').replace(/^﻿/, '');
    const book = parseBook(usfm, caps);
    if (!book.id || book.chapters.size === 0) continue;

    const nums = [...book.chapters.keys()].sort((a, b) => a - b);
    for (const n of nums) {
      const { blocks, notes } = book.chapters.get(n);
      const rec = { ref: `${book.id}.${n}`, v: 1, blocks };
      if (Object.keys(notes).length) rec.notes = notes;
      const json = JSON.stringify(rec);
      bytes += json.length;
      fs.writeFileSync(path.join(chDir, `${book.id}.${n}.json`), json);
      chapterCount++;
      for (const b of blocks) for (const r of b.verses ?? []) if (r.spans.length) verseCount++;
    }
    books.push({ id: book.id, name: book.name, chapters: nums.length });
  }

  const manifest = {
    id: cfg.id,
    build: Math.floor(Date.now() / 1000),
    name: cfg.name,
    shortName: cfg.shortName,
    lang: cfg.lang,
    iso639_3: cfg.iso,
    dir: 'ltr',
    vrs: 'eng',
    license: cfg.license,
    licenseUrl: cfg.licenseUrl,
    copyright: row?.copyright || cfg.license,
    publisher: cfg.publisher,
    sourceUrl: `https://ebible.org/Scriptures/${cfg.ebible}_usfm.zip`,
    caps,
    books,
  };
  if (cfg.trademarkNote) manifest.trademarkNote = cfg.trademarkNote;
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { id: cfg.id, books: books.length, chapters: chapterCount, verses: verseCount, bytes, caps };
}

/**
 * LEGACY (v1) emitter — rebuilds assets/bibles/<id>.bible in the shape the
 * CURRENT app loader expects (BibleData with chapters[c][v] = verse string).
 *
 * Why this exists: te_irv.bible was found corrupted (≈800k chars of binary
 * garbage spliced into the middle, JSON.parse throws, so the translation could
 * never open). The original conversion script no longer exists in the repo, so
 * we regenerate from the USFM source of record using the parser above and then
 * FLATTEN the structured blocks back down to plain verse strings.
 *
 * Verse arrays are DENSE and 0-indexed by (verse - 1); a missing/merged verse
 * becomes "" so verse numbers stay aligned with the printed Bible, which is the
 * convention types.ts documents and the reader relies on.
 */
async function buildV1(cfg, cacheDir) {
  const zip = path.join(cacheDir, `${cfg.ebible}_usfm.zip`);
  await download(`https://ebible.org/Scriptures/${cfg.ebible}_usfm.zip`, zip);
  const work = path.join(cacheDir, cfg.ebible);
  if (!fs.existsSync(work)) {
    fs.mkdirSync(work, { recursive: true });
    sh('unzip', ['-o', '-q', zip, '-d', work]);
  }

  const row = await catalogRow(cfg.ebible, cacheDir);
  if (row && !row.redistributable) {
    throw new Error(`${cfg.id}: eBible marks ${cfg.ebible} NOT redistributable — refusing to ingest.`);
  }

  const caps = { wj: false, notes: false, strongs: false, headings: false };
  // Filename order is NOT canonical (see CANON) — read them all, order later.
  const files = fs.readdirSync(work).filter((f) => f.toLowerCase().endsWith('.usfm'));

  const parsed = [];
  for (const f of files) {
    const usfm = fs.readFileSync(path.join(work, f), 'utf8').replace(/^﻿/, '');
    const book = parseBook(usfm, caps);
    if (!book.id || book.chapters.size === 0) continue;

    const nums = [...book.chapters.keys()].sort((a, b) => a - b);
    const chapters = [];
    for (const n of nums) {
      const { blocks } = book.chapters.get(n);
      // chapter -> Map(verseNo -> text), concatenating runs split across blocks
      const acc = new Map();
      for (const b of blocks) {
        for (const run of b.verses ?? []) {
          const text = run.spans
            .filter((sp) => sp.k !== 'note')
            .map((sp) => sp.s)
            .join('');
          acc.set(run.n, (acc.get(run.n) ?? '') + text);
        }
      }
      const max = acc.size ? Math.max(...acc.keys()) : 0;
      const dense = [];
      for (let v = 1; v <= max; v++) {
        dense.push((acc.get(v) ?? '').replace(/\s+/g, ' ').trim());
      }
      chapters.push(dense);
    }
    parsed.push({ id: book.id, name: book.name, chapters });
  }

  const books = toCanonical(parsed, cfg.id);

  return {
    id: cfg.id,
    name: cfg.v1Name ?? cfg.name,
    shortName: cfg.shortName,
    lang: cfg.lang,
    license: cfg.v1License ?? cfg.license,
    source: `https://eBible.org/Scriptures/${cfg.ebible}_usfm.zip`,
    books,
  };
}

async function mainV1(ids) {
  const cacheDir = path.resolve('.bible-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  for (const id of ids) {
    const cfg = CATALOG.find((c) => c.id === id);
    if (!cfg) {
      console.error(`Unknown id "${id}". Known: ${CATALOG.map((c) => c.id).join(', ')}`);
      process.exitCode = 1;
      continue;
    }
    process.stdout.write(`==> [v1] ${cfg.id} (${cfg.ebible}) ... `);
    const data = await buildV1(cfg, cacheDir);
    const out = path.resolve('assets/bibles', `${cfg.id}.bible`);
    const json = JSON.stringify(data);

    // Hard gate: never write an asset the app cannot load. This is exactly the
    // failure mode that shipped a corrupt te_irv — invisible to tsc/expo-doctor.
    const check = JSON.parse(json);
    if (!Array.isArray(check.books) || check.books.length !== 66) {
      throw new Error(`${cfg.id}: expected 66 books, got ${check.books?.length}`);
    }
    let verses = 0;
    for (const b of check.books) for (const c of b.chapters) verses += c.filter((v) => v).length;

    fs.writeFileSync(out, json);
    console.log(`66 books, ${verses} verses, ${(json.length / 1e6).toFixed(1)} Mchars -> ${out}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Legacy mode: node scripts/build-bibles.mjs --v1 te_irv
  const vi = args.indexOf('--v1');
  if (vi >= 0) {
    args.splice(vi, 1);
    await mainV1(args.length ? args : CATALOG.map((c) => c.id));
    return;
  }

  let outRoot = path.resolve('.bible-build');
  const oi = args.indexOf('--out');
  if (oi >= 0) {
    outRoot = path.resolve(args[oi + 1]);
    args.splice(oi, 2);
  }
  const want = args.length ? CATALOG.filter((c) => args.includes(c.id)) : CATALOG;
  if (!want.length) {
    console.error('No matching translations. Known:', CATALOG.map((c) => c.id).join(', '));
    process.exit(1);
  }
  const cacheDir = path.resolve('.bible-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(outRoot, { recursive: true });

  const rows = [];
  for (const cfg of want) {
    process.stdout.write(`==> ${cfg.id} (${cfg.ebible}) ... `);
    try {
      const r = await buildOne(cfg, outRoot, cacheDir);
      rows.push(r);
      const caps = Object.entries(r.caps)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(',') || 'none';
      console.log(
        `${r.books} books, ${r.chapters} chapters, ${r.verses} verse-runs, ` +
          `${(r.bytes / 1e6).toFixed(1)} MB json | caps: ${caps}`,
      );
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\nOutput: ${outRoot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
